const crypto = require('crypto');
const sharp = require('sharp');

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const ALLOWED_INPUT_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'avif', 'tiff']);
const OUTPUTS = {
  jpeg: { mimeType: 'image/jpeg', extension: 'jpg' },
  png: { mimeType: 'image/png', extension: 'png' },
  webp: { mimeType: 'image/webp', extension: 'webp' },
};

async function readBoundedBody(response, maxBytes) {
  const declaredLength = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error(`Image exceeds the ${maxBytes} byte limit`);
  }
  if (!response.body) {
    throw new Error('Image response was empty');
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > maxBytes) {
      throw new Error(`Image exceeds the ${maxBytes} byte limit`);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, bytes);
}

async function fetchImage({ url, maxBytes, timeoutMs, fetch, validateURL }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let current = url;
  try {
    for (let redirect = 0; redirect <= 5; redirect += 1) {
      await validateURL(current);
      const response = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { accept: 'image/*' },
      });
      if (REDIRECT_STATUSES.has(response.status)) {
        const location = response.headers?.get?.('location');
        if (!location || redirect === 5) {
          throw new Error('Image redirect limit exceeded');
        }
        current = new URL(location, current).toString();
        continue;
      }
      if (!response.ok) {
        throw new Error(`Image download failed with status ${response.status}`);
      }
      return await readBoundedBody(response, maxBytes);
    }
    throw new Error('Image redirect limit exceeded');
  } finally {
    clearTimeout(timeout);
  }
}

async function differenceHash(buffer) {
  const pixels = await sharp(buffer).greyscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer();
  let hash = 0n;
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      hash = (hash << 1n) | BigInt(pixels[row * 9 + column] > pixels[row * 9 + column + 1]);
    }
  }
  return hash.toString(16).padStart(16, '0');
}

function imageOrientation(width, height) {
  if (width === height) {
    return 'square';
  }
  return width > height ? 'landscape' : 'portrait';
}

async function sanitizeImageBuffer(input, { maxBytes, maxPixels, outputType = 'webp' }) {
  const inputMetadata = await sharp(input, {
    limitInputPixels: maxPixels,
    failOn: 'error',
  }).metadata();
  if (!inputMetadata.format || !ALLOWED_INPUT_FORMATS.has(inputMetadata.format)) {
    throw new Error('Image content is not a supported image');
  }
  const output = OUTPUTS[outputType] || OUTPUTS.webp;
  let pipeline = sharp(input, { limitInputPixels: maxPixels, failOn: 'error' }).rotate();
  if (outputType === 'jpeg') {
    pipeline = pipeline.jpeg({ quality: 92 });
  } else if (outputType === 'png') {
    pipeline = pipeline.png({ compressionLevel: 9 });
  } else {
    pipeline = pipeline.webp({ quality: 92 });
  }
  const buffer = await pipeline.toBuffer();
  if (buffer.length > maxBytes) {
    throw new Error(`Image exceeds the ${maxBytes} byte limit`);
  }
  const metadata = await sharp(buffer).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error('Image dimensions are unavailable');
  }
  const orientation = imageOrientation(metadata.width, metadata.height);
  return {
    buffer,
    width: metadata.width,
    height: metadata.height,
    orientation,
    mimeType: output.mimeType,
    extension: output.extension,
    bytes: buffer.length,
    exactHash: crypto.createHash('sha256').update(buffer).digest('hex'),
    perceptualHash: await differenceHash(buffer),
  };
}

async function sanitizeImage({
  url,
  maxBytes,
  maxPixels,
  timeoutMs,
  outputType = 'webp',
  fetch = global.fetch,
  validateURL,
}) {
  const input = await fetchImage({ url, maxBytes, timeoutMs, fetch, validateURL });
  return sanitizeImageBuffer(input, { maxBytes, maxPixels, outputType });
}

async function inspectImageBuffer(buffer, maxPixels) {
  const metadata = await sharp(buffer, {
    limitInputPixels: maxPixels,
    failOn: 'error',
  }).metadata();
  if (
    !metadata.format ||
    !ALLOWED_INPUT_FORMATS.has(metadata.format) ||
    !metadata.width ||
    !metadata.height
  ) {
    throw new Error('Stored file is not a supported image');
  }
  const mimeType = metadata.format === 'jpeg' ? 'image/jpeg' : `image/${metadata.format}`;
  return {
    width: metadata.width,
    height: metadata.height,
    orientation: imageOrientation(metadata.width, metadata.height),
    mimeType,
    bytes: buffer.length,
    exactHash: crypto.createHash('sha256').update(buffer).digest('hex'),
    perceptualHash: await differenceHash(buffer),
  };
}

async function importReferenceImage(input, deps) {
  const sanitized = await deps.sanitize(input.token.imageUrl);
  const existing = await deps.findAssetByExactHash(input.ownerId, sanitized.exactHash);
  if (existing) {
    return { asset: existing, reused: true };
  }

  const id = deps.createId ? deps.createId() : crypto.randomUUID();
  const extension = sanitized.extension || 'webp';
  const fileName = `${id}.${extension}`;
  let filepath;
  let file;
  try {
    filepath = await deps.saveBuffer({
      userId: input.ownerId,
      buffer: sanitized.buffer,
      fileName,
      basePath: 'images',
    });
    file = await deps.createFile({
      user: input.ownerId,
      file_id: id,
      filename: input.title || input.token.title || fileName,
      filepath,
      type: sanitized.mimeType,
      bytes: sanitized.bytes,
      width: sanitized.width,
      height: sanitized.height,
      source: 'local',
      context: 'reference-library',
    });
    const result = await deps.createAsset(input.ownerId, {
      fileId: file.file_id,
      title: input.title || input.token.title || 'Reference image',
      notes: '',
      altText: input.token.title || '',
      tags: input.tags || [],
      favorite: false,
      rating: null,
      colorLabel: null,
      width: sanitized.width,
      height: sanitized.height,
      orientation: sanitized.orientation,
      mimeType: sanitized.mimeType,
      bytes: sanitized.bytes,
      source: input.source || {
        kind: 'provider',
        provider: input.token.provider,
        providerAssetId: input.token.providerAssetId,
        sourcePageUrl: input.token.sourcePageUrl,
        originalUrl: input.token.imageUrl,
        creator: input.token.creator,
        creatorUrl: input.token.creatorUrl,
        licenseName: input.token.licenseName,
        licenseUrl: input.token.licenseUrl,
        rightsState: input.token.rightsState,
      },
      exactHash: sanitized.exactHash,
      perceptualHash: sanitized.perceptualHash,
      sanitizationVersion: input.sanitizationVersion,
    });
    if (!result.created) {
      await deps.deleteStoredFile({ filepath, ownerId: input.ownerId });
      await deps.deleteFileRecord(input.ownerId, file.file_id);
      return { asset: result.asset, reused: true };
    }
    return { asset: result.asset, reused: false };
  } catch (error) {
    if (filepath) {
      await deps.deleteStoredFile({ filepath, ownerId: input.ownerId }).catch(() => undefined);
    }
    if (file?.file_id) {
      await deps.deleteFileRecord(input.ownerId, file.file_id).catch(() => undefined);
    }
    throw error;
  }
}

module.exports = { sanitizeImage, sanitizeImageBuffer, inspectImageBuffer, importReferenceImage };
