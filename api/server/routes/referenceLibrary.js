const express = require('express');
const { logger } = require('@librechat/data-schemas');
const dbDefault = require('~/models');
const serviceDefault = require('~/server/services/ReferenceLibrary');
const { requireJwtAuth, configMiddleware } = require('~/server/middleware');

const PROVIDERS = new Set(['google', 'wikimedia', 'pexels']);
const MAX_QUERY_LENGTH = 500;
const MAX_BULK_SIZE = 100;
const ASSET_PATCH_FIELDS = new Set([
  'title',
  'notes',
  'altText',
  'favorite',
  'rating',
  'colorLabel',
  'tags',
]);

function invalid(res, message) {
  return res.status(400).json({ error: { code: 'invalid_request', message } });
}

function assetIds(body) {
  return Array.isArray(body?.assetIds) &&
    body.assetIds.length > 0 &&
    body.assetIds.length <= MAX_BULK_SIZE &&
    body.assetIds.every((id) => typeof id === 'string' && id.length > 0)
    ? [...new Set(body.assetIds)]
    : null;
}

function optionalNumber(value) {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : undefined;
  return Number.isFinite(number) ? number : undefined;
}
function assetPatch(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const keys = Object.keys(value);
  if (keys.length === 0 || keys.some((key) => !ASSET_PATCH_FIELDS.has(key))) {
    return null;
  }
  return Object.fromEntries(keys.map((key) => [key, value[key]]));
}

async function hydrateAssets(ownerId, assets, db) {
  if (assets.length === 0) {
    return [];
  }
  const assetIds = assets.map((asset) => asset.id);
  const fileIds = assets.map((asset) => asset.fileId);
  const [files, collectionIds] = await Promise.all([
    db.getFiles({ user: ownerId, file_id: { $in: fileIds } }),
    db.getReferenceAssetCollectionIds(ownerId, assetIds),
  ]);
  const filesById = new Map(files.map((file) => [file.file_id, file]));
  return assets.map((asset) => {
    const file = filesById.get(asset.fileId);
    if (!file) {
      throw new Error(`Reference asset ${asset.id} has no stored file`);
    }
    return { ...asset, file, collectionIds: collectionIds[asset.id] || [] };
  });
}
function createReferenceLibraryRouter({
  auth = requireJwtAuth,
  loadConfig = configMiddleware,
  service = serviceDefault,
  db = dbDefault,
} = {}) {
  const router = express.Router();
  router.use(auth, loadConfig);

  router.get('/capabilities', (req, res) => {
    const config = req.config?.referenceLibrary;
    res.status(200).json(service.capabilities(config));
  });

  router.use((req, res, next) => {
    if (req.config?.referenceLibrary?.enabled !== true) {
      res
        .status(404)
        .json({ error: { code: 'not_found', message: 'Reference library is disabled' } });
      return;
    }
    next();
  });

  router.post('/search', async (req, res) => {
    const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
    const providers = Array.isArray(req.body?.providers)
      ? [...new Set(req.body.providers)]
      : Object.keys(req.config.referenceLibrary.providers || {});
    if (
      query.length === 0 ||
      query.length > MAX_QUERY_LENGTH ||
      providers.length === 0 ||
      providers.some((provider) => !PROVIDERS.has(provider))
    ) {
      invalid(res, 'A query and valid image providers are required');
      return;
    }
    try {
      const result = await service.search(req.config.referenceLibrary, {
        query,
        providers,
        cursor: req.body?.cursor || {},
      });
      res.status(200).json(result);
    } catch (error) {
      logger.error('[reference-library/search] failed', error);
      res.status(502).json({ error: { code: 'search_failed', message: 'Image search failed' } });
    }
  });

  router.post('/imports', async (req, res) => {
    const items = req.body?.items;
    const idempotencyKey = req.body?.idempotencyKey;
    const maxBatchSize = req.config.referenceLibrary.import.maxBatchSize;
    if (
      !Array.isArray(items) ||
      items.length === 0 ||
      items.length > maxBatchSize ||
      items.some((item) => !item || typeof item.importToken !== 'string') ||
      typeof idempotencyKey !== 'string' ||
      idempotencyKey.length < 1 ||
      idempotencyKey.length > 256
    ) {
      invalid(res, `Imports require 1-${maxBatchSize} signed items and an idempotency key`);
      return;
    }
    const result = await service.importItems(req, req.config.referenceLibrary, {
      items,
      idempotencyKey,
    });
    res.status(207).json(result);
  });

  router.post('/assets', async (req, res) => {
    const fileId = typeof req.body?.fileId === 'string' ? req.body.fileId : '';
    if (!fileId) {
      invalid(res, 'An owned image file is required');
      return;
    }
    try {
      const result = await service.saveExistingImage(req, req.config.referenceLibrary, {
        fileId,
        title: typeof req.body.title === 'string' ? req.body.title : undefined,
      });
      const [asset] = await hydrateAssets(req.user.id, [result.asset], db);
      res.status(201).json({ asset, reused: result.reused });
    } catch (error) {
      logger.error('[reference-library/save-existing] failed', error);
      res.status(400).json({
        error: {
          code: 'save_failed',
          message: error instanceof Error ? error.message : 'Image could not be saved',
        },
      });
    }
  });

  router.get('/assets', async (req, res) => {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const result = await db.listReferenceAssets(req.user.id, {
      query:
        typeof req.query.query === 'string'
          ? req.query.query.slice(0, MAX_QUERY_LENGTH)
          : undefined,
      tags:
        typeof req.query.tags === 'string' ? req.query.tags.split(',').filter(Boolean) : undefined,
      tagMatch: req.query.tagMatch === 'any' ? 'any' : 'all',
      collectionId: typeof req.query.collectionId === 'string' ? req.query.collectionId : undefined,
      favorite: req.query.favorite === 'true' ? true : undefined,
      rating: optionalNumber(req.query.rating),
      minWidth: optionalNumber(req.query.minWidth),
      maxWidth: optionalNumber(req.query.maxWidth),
      minHeight: optionalNumber(req.query.minHeight),
      maxHeight: optionalNumber(req.query.maxHeight),
      colorLabel: typeof req.query.colorLabel === 'string' ? req.query.colorLabel : undefined,
      provider: typeof req.query.provider === 'string' ? req.query.provider : undefined,
      rightsState: typeof req.query.rightsState === 'string' ? req.query.rightsState : undefined,
      orientation: typeof req.query.orientation === 'string' ? req.query.orientation : undefined,
      createdAfter: typeof req.query.createdAfter === 'string' ? req.query.createdAfter : undefined,
      createdBefore:
        typeof req.query.createdBefore === 'string' ? req.query.createdBefore : undefined,
      trashed: req.query.trashed === 'true',
      sort: typeof req.query.sort === 'string' ? req.query.sort : undefined,
      cursor: typeof req.query.cursor === 'string' ? req.query.cursor : undefined,
      limit,
    });
    const items = await hydrateAssets(req.user.id, result.items, db);
    res.status(200).json({ ...result, items });
  });

  router.patch('/assets', async (req, res) => {
    const ids = assetIds(req.body);
    const patch = assetPatch(req.body?.patch);
    if (!ids || !patch) {
      invalid(res, 'Asset identifiers and an allowlisted metadata patch are required');
      return;
    }
    const records = await db.bulkUpdateReferenceAssets(req.user.id, ids, patch);
    const items = await hydrateAssets(req.user.id, records, db);
    res.status(200).json({ items });
  });

  router.get('/assets/:assetId', async (req, res) => {
    const record = await db.getAsset(req.user.id, req.params.assetId, false);
    if (!record) {
      res.status(404).json({ error: { code: 'not_found', message: 'Asset not found' } });
      return;
    }
    const [asset] = await hydrateAssets(req.user.id, [record], db);
    res.status(200).json(asset);
  });

  router.patch('/assets/:assetId', async (req, res) => {
    const patch = assetPatch(req.body);
    if (!patch) {
      invalid(res, 'An allowlisted metadata patch is required');
      return;
    }
    const record = await db.updateAsset(req.user.id, req.params.assetId, patch);
    if (!record) {
      res.status(404).json({ error: { code: 'not_found', message: 'Asset not found' } });
      return;
    }
    const [asset] = await hydrateAssets(req.user.id, [record], db);
    res.status(200).json(asset);
  });

  router.get('/collections', async (req, res) => {
    res.status(200).json(await db.listReferenceCollections(req.user.id));
  });

  router.post('/collections', async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name || name.length > 256) {
      invalid(res, 'Collection name is required');
      return;
    }
    const collection = await db.createCollection(req.user.id, {
      name,
      description: typeof req.body.description === 'string' ? req.body.description : '',
    });
    res.status(201).json(collection);
  });

  router.patch('/collections/:collectionId', async (req, res) => {
    const collection = await db.updateReferenceCollection(
      req.user.id,
      req.params.collectionId,
      req.body || {},
    );
    if (!collection) {
      res.status(404).json({ error: { code: 'not_found', message: 'Collection not found' } });
      return;
    }
    res.status(200).json(collection);
  });

  router.get('/collections/:collectionId/assets', async (req, res) => {
    const records = await db.getCollectionAssets(req.user.id, req.params.collectionId);
    const items = await hydrateAssets(req.user.id, records, db);
    res.status(200).json({ items });
  });

  router.put('/collections/:collectionId/assets', async (req, res) => {
    const ids =
      Array.isArray(req.body?.assetIds) &&
      req.body.assetIds.length <= MAX_BULK_SIZE &&
      req.body.assetIds.every((id) => typeof id === 'string' && id.length > 0)
        ? [...new Set(req.body.assetIds)]
        : null;
    if (!ids) {
      invalid(res, 'Collection asset identifiers are required');
      return;
    }
    await db.setCollectionAssets(req.user.id, req.params.collectionId, ids);
    res.status(200).json({ ok: true });
  });

  router.get('/tags', async (req, res) => {
    const tags = await db.listReferenceTags(req.user.id);
    res.status(200).json(tags.map((tag) => ({ ...tag, id: tag.name.toLocaleLowerCase() })));
  });

  router.get('/saved-filters', async (req, res) => {
    res.status(200).json(await db.listReferenceSavedFilters(req.user.id));
  });

  router.post('/saved-filters', async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name || !req.body?.filter || typeof req.body.filter !== 'object') {
      invalid(res, 'Saved filter name and filter are required');
      return;
    }
    res.status(201).json(await db.createReferenceSavedFilter(req.user.id, name, req.body.filter));
  });

  router.get('/duplicates', async (req, res) => {
    res.status(200).json(await db.findReferenceDuplicates(req.user.id));
  });

  router.post('/trash', async (req, res) => {
    const ids = assetIds(req.body);
    if (!ids) {
      invalid(res, 'Asset identifiers are required');
      return;
    }
    res.status(200).json({ modified: await db.trashAssets(req.user.id, ids) });
  });

  router.post('/trash/restore', async (req, res) => {
    const ids = assetIds(req.body);
    if (!ids) {
      invalid(res, 'Asset identifiers are required');
      return;
    }
    res.status(200).json({ modified: await db.restoreAssets(req.user.id, ids) });
  });

  router.post('/trash/purge', async (req, res) => {
    const ids = assetIds(req.body);
    if (!ids) {
      invalid(res, 'Asset identifiers are required');
      return;
    }
    res
      .status(200)
      .json({ purged: await service.purgeItems(req, req.config.referenceLibrary, ids) });
  });

  return router;
}

const router = createReferenceLibraryRouter();
module.exports = router;
module.exports.createReferenceLibraryRouter = createReferenceLibraryRouter;
