const { Agent } = require('undici');
const { createSSRFSafeUndiciConnect, validateEndpointURL } = require('@librechat/api');
const db = require('~/models');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { getFileStrategy } = require('~/server/utils/getFileStrategy');
const { createImportToken, verifyImportToken } = require('./importTokens');
const { searchProviders } = require('./providers');
const { importReferenceImage, sanitizeImage, sanitizeImageBuffer } = require('./imageImport');

function effectivePort(value) {
  const url = new URL(value);
  return url.port || (url.protocol === 'https:' ? '443' : '80');
}

function importSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is required for reference imports');
  }
  return `${secret}:reference-library`;
}

function capabilities(config) {
  const providers = config?.providers || {};
  return {
    enabled: config?.enabled === true,
    providers: {
      google: Boolean(providers.google?.apiKey),
      wikimedia: Boolean(providers.wikimedia),
      pexels: Boolean(providers.pexels?.apiKey),
    },
    maxBatchSize: config?.import?.maxBatchSize ?? 25,
    trashRetentionDays: config?.trashRetentionDays ?? 30,
  };
}

async function search(config, payload, fetch = global.fetch) {
  return searchProviders({
    ...payload,
    config: config.providers,
    fetch,
    sign: (item) => createImportToken(item, importSecret(), config.import.tokenTtlSeconds),
  });
}

function importerDependencies(req, config) {
  const source = getFileStrategy(req.config, { isImage: true });
  const strategy = getStrategyFunctions(source);
  if (!strategy.saveBuffer || !strategy.deleteFile) {
    throw new Error(`File strategy ${source} cannot store reference images`);
  }
  return {
    sanitize: async (url) => {
      const dispatcher = new Agent({
        connect: createSSRFSafeUndiciConnect([], effectivePort(url)),
      });
      return sanitizeImage({
        url,
        ...config.import,
        outputType: req.config.imageOutputType || 'webp',
        validateURL: (candidate) => validateEndpointURL(candidate, 'ReferenceLibrary'),
        fetch: (candidate, options) => fetch(candidate, { ...options, dispatcher }),
      });
    },
    findAssetByExactHash: db.findAssetByExactHash,
    saveBuffer: strategy.saveBuffer,
    createFile: (file) => db.createFile({ ...file, source }, true),
    createAsset: db.createAsset,
    deleteStoredFile: ({ filepath }) => strategy.deleteFile(req, { filepath, source }),
    deleteFileRecord: (ownerId, fileId) =>
      db.deleteFileByFilter({ user: ownerId, file_id: fileId }),
  };
}
function publicAsset(asset) {
  if (!asset) {
    return asset;
  }
  const { ownerId: _ownerId, ...view } = asset;
  return view;
}

async function importItems(req, config, payload) {
  const claim = await db.beginReferenceImport(req.user.id, payload.idempotencyKey);
  if (!claim.claimed) {
    return { results: claim.results };
  }

  const deps = importerDependencies(req, config);
  const results = [];
  for (let index = 0; index < payload.items.length; index += 1) {
    const item = payload.items[index];
    const collectionIds = [...new Set(item.collectionIds || [])];
    try {
      await db.validateReferenceCollections(req.user.id, collectionIds);
      const token = verifyImportToken(item.importToken, importSecret());
      if (token.rightsState === 'unknown' && item.acknowledgeUnknownRights !== true) {
        throw new Error('Unknown image rights must be acknowledged before import');
      }
      const result = await importReferenceImage(
        {
          ownerId: req.user.id,
          token,
          title: item.title,
          tags: item.tags,
          sanitizationVersion: config.sanitizationVersion,
        },
        {
          ...deps,
          createAsset: (ownerId, input) =>
            db.createAssetInCollections(ownerId, input, collectionIds),
        },
      );
      let asset = result.asset;
      if (result.reused && (collectionIds.length > 0 || asset.trashedAt)) {
        asset = await db.placeAssetInCollections(req.user.id, asset.id, collectionIds, {
          restoreTrashed: Boolean(asset.trashedAt),
        });
      }
      results.push({
        importToken: item.importToken,
        ok: true,
        ...result,
        asset: publicAsset(asset),
      });
    } catch (error) {
      results.push({
        importToken: item.importToken,
        ok: false,
        error: {
          code: 'import_failed',
          message: error instanceof Error ? error.message : 'Import failed',
        },
      });
    }
    if (index < payload.items.length - 1) {
      await db.saveReferenceImportResults(req.user.id, payload.idempotencyKey, [...results], false);
    }
  }
  await db.saveReferenceImportResults(req.user.id, payload.idempotencyKey, results, true);
  return { results };
}

async function readStoredImage(req, file, maxBytes) {
  if (file.bytes > maxBytes) {
    throw new Error(`Image exceeds the ${maxBytes} byte limit`);
  }
  const strategy = getStrategyFunctions(file.source);
  if (!strategy.getDownloadStream) {
    throw new Error(`File strategy ${file.source} cannot read reference images`);
  }
  const stream = await strategy.getDownloadStream(req, file.filepath);
  const chunks = [];
  let bytes = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > maxBytes) {
      throw new Error(`Image exceeds the ${maxBytes} byte limit`);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, bytes);
}

async function saveExistingImage(req, config, payload) {
  const file = await db.findFileById(payload.fileId, { user: req.user.id });
  if (!file || !file.type?.startsWith('image/')) {
    throw new Error('Owned image file not found');
  }
  const buffer = await readStoredImage(req, file, config.import.maxBytes);
  const result = await importReferenceImage(
    {
      ownerId: req.user.id,
      title: payload.title?.trim() || file.filename || 'Saved image',
      token: {},
      source: {
        kind: 'librechat-file',
        rightsState: 'unknown',
      },
      sanitizationVersion: config.sanitizationVersion,
    },
    {
      ...importerDependencies(req, config),
      sanitize: () =>
        sanitizeImageBuffer(buffer, {
          maxBytes: config.import.maxBytes,
          maxPixels: config.import.maxPixels,
          outputType: req.config.imageOutputType || 'webp',
        }),
    },
  );
  return { ...result, asset: publicAsset(result.asset) };
}

async function purgeItems(req, config, assetIds, now = new Date()) {
  const cutoff = new Date(now.getTime() - config.trashRetentionDays * 24 * 60 * 60 * 1000);
  const candidates = (
    await Promise.all(assetIds.map((assetId) => db.getAsset(req.user.id, assetId, true)))
  ).filter((asset) => asset?.trashedAt);
  const blocked = candidates.some((asset) => new Date(asset.trashedAt) > cutoff);
  if (blocked) {
    const error = new Error('Reference image trash retention period is still active');
    error.code = 'trash_retention_active';
    error.status = 409;
    throw error;
  }

  const deleted = await db.deleteTrashedReferenceAssets(
    req.user.id,
    candidates.map((asset) => asset.id),
    cutoff,
  );
  for (const asset of deleted) {
    const file = await db.findFileById(asset.fileId, { user: req.user.id });
    if (file?.context !== 'reference-library' || file.usage > 0) {
      continue;
    }
    const strategy = getStrategyFunctions(file.source);
    if (!strategy.deleteFile) {
      throw new Error(`File strategy ${file.source} cannot delete reference images`);
    }
    await strategy.deleteFile(req, { filepath: file.filepath, source: file.source });
    await db.deleteFileByFilter({ user: req.user.id, file_id: file.file_id });
  }
  return deleted.length;
}

module.exports = { capabilities, search, importItems, saveExistingImage, purgeItems };
