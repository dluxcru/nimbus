const crypto = require('crypto');

class ProviderError extends Error {
  constructor(code, message, retryAfter) {
    super(message);
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

function providerId(value) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 32);
}

async function readJson(response, provider) {
  if (!response.ok) {
    const retryHeader = response.headers?.get?.('retry-after');
    const retryAfter = retryHeader == null ? undefined : Number(retryHeader);
    const code = response.status === 429 ? 'rate_limited' : 'provider_error';
    throw new ProviderError(
      code,
      `${provider} search failed with status ${response.status}`,
      retryAfter,
    );
  }
  return response.json();
}

async function searchGoogle({ query, cursor, config, fetch }) {
  if (!config?.apiKey) {
    throw new ProviderError('not_configured', 'Google Images is not configured');
  }
  const page = Math.max(1, Number(cursor) || 1);
  const response = await fetch('https://google.serper.dev/images', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': config.apiKey },
    body: JSON.stringify({ q: query, page }),
  });
  const body = await readJson(response, 'Google Images');
  const images = Array.isArray(body.images) ? body.images : [];
  return {
    provider: 'google',
    items: images.flatMap((image) => {
      if (!image || typeof image.imageUrl !== 'string' || typeof image.link !== 'string') {
        return [];
      }
      return [
        {
          provider: 'google',
          providerAssetId: providerId(image.imageUrl),
          title:
            typeof image.title === 'string' && image.title ? image.title : 'Google image result',
          thumbnailUrl:
            typeof image.thumbnailUrl === 'string' ? image.thumbnailUrl : image.imageUrl,
          imageUrl: image.imageUrl,
          width: Number.isFinite(image.imageWidth) ? image.imageWidth : undefined,
          height: Number.isFinite(image.imageHeight) ? image.imageHeight : undefined,
          sourcePageUrl: image.link,
          creator: typeof image.source === 'string' ? image.source : undefined,
          rightsState: 'unknown',
        },
      ];
    }),
    nextCursor: images.length > 0 ? String(page + 1) : null,
  };
}

function metadataValue(metadata, key) {
  const value = metadata?.[key]?.value;
  return typeof value === 'string' && value ? value : undefined;
}

async function searchWikimedia({ query, cursor, config, fetch }) {
  const offset = Math.max(0, Number(cursor) || 0);
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrsearch: query,
    gsrnamespace: '6',
    gsrlimit: '30',
    gsroffset: String(offset),
    prop: 'imageinfo',
    iiprop: 'url|extmetadata|size',
  });
  const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
    headers: { 'user-agent': config?.userAgent || 'LibreChat reference library' },
  });
  const body = await readJson(response, 'Wikimedia Commons');
  const pages =
    body?.query?.pages && typeof body.query.pages === 'object'
      ? Object.values(body.query.pages)
      : [];
  const items = pages.flatMap((page) => {
    const info = Array.isArray(page?.imageinfo) ? page.imageinfo[0] : undefined;
    if (!info || typeof info.url !== 'string' || typeof info.descriptionurl !== 'string') {
      return [];
    }
    const licenseName = metadataValue(info.extmetadata, 'LicenseShortName');
    const licenseUrl = metadataValue(info.extmetadata, 'LicenseUrl');
    return [
      {
        provider: 'wikimedia',
        providerAssetId: String(page.pageid),
        title:
          typeof page.title === 'string' ? page.title.replace(/^File:/, '') : 'Wikimedia image',
        thumbnailUrl: typeof info.thumburl === 'string' ? info.thumburl : info.url,
        imageUrl: info.url,
        width: Number.isFinite(info.width) ? info.width : undefined,
        height: Number.isFinite(info.height) ? info.height : undefined,
        sourcePageUrl: info.descriptionurl,
        creator: metadataValue(info.extmetadata, 'Artist'),
        licenseName,
        licenseUrl,
        rightsState: licenseName || licenseUrl ? 'known' : 'unknown',
      },
    ];
  });
  const next = body?.continue?.gsroffset;
  return {
    provider: 'wikimedia',
    items,
    nextCursor: Number.isFinite(next) ? String(next) : null,
  };
}

async function searchPexels({ query, cursor, config, fetch }) {
  if (!config?.apiKey) {
    throw new ProviderError('not_configured', 'Pexels is not configured');
  }
  const page = Math.max(1, Number(cursor) || 1);
  const params = new URLSearchParams({ query, per_page: '30', page: String(page) });
  const response = await fetch(`https://api.pexels.com/v1/search?${params}`, {
    headers: { authorization: config.apiKey },
  });
  const body = await readJson(response, 'Pexels');
  const photos = Array.isArray(body.photos) ? body.photos : [];
  return {
    provider: 'pexels',
    items: photos.flatMap((photo) => {
      if (
        photo?.id == null ||
        typeof photo.url !== 'string' ||
        typeof photo.src?.original !== 'string'
      ) {
        return [];
      }
      return [
        {
          provider: 'pexels',
          providerAssetId: String(photo.id),
          title:
            typeof photo.alt === 'string' && photo.alt ? photo.alt : `Pexels photo ${photo.id}`,
          thumbnailUrl: typeof photo.src.tiny === 'string' ? photo.src.tiny : photo.src.original,
          imageUrl: photo.src.original,
          width: Number.isFinite(photo.width) ? photo.width : undefined,
          height: Number.isFinite(photo.height) ? photo.height : undefined,
          sourcePageUrl: photo.url,
          creator: typeof photo.photographer === 'string' ? photo.photographer : undefined,
          creatorUrl:
            typeof photo.photographer_url === 'string' ? photo.photographer_url : undefined,
          licenseName: 'Pexels License',
          licenseUrl: 'https://www.pexels.com/license/',
          rightsState: 'known',
        },
      ];
    }),
    nextCursor: typeof body.next_page === 'string' ? String(page + 1) : null,
  };
}

const SEARCHERS = {
  google: searchGoogle,
  wikimedia: searchWikimedia,
  pexels: searchPexels,
};

async function searchProviders({ query, providers, cursor = {}, config = {}, fetch, sign }) {
  const results = await Promise.all(
    providers.map(async (provider) => {
      const search = SEARCHERS[provider];
      if (!search) {
        return {
          provider,
          items: [],
          nextCursor: null,
          error: { code: 'invalid_provider', message: 'Unknown provider' },
        };
      }
      try {
        const result = await search({
          query,
          cursor: cursor[provider],
          config: config[provider],
          fetch,
        });
        return {
          ...result,
          items: result.items.map((item) => ({ ...item, importToken: sign(item) })),
        };
      } catch (error) {
        return {
          provider,
          items: [],
          nextCursor: null,
          error: {
            code: error instanceof ProviderError ? error.code : 'provider_error',
            message: error instanceof Error ? error.message : 'Provider search failed',
            ...(error instanceof ProviderError && Number.isFinite(error.retryAfter)
              ? { retryAfter: error.retryAfter }
              : {}),
          },
        };
      }
    }),
  );
  return { results };
}

module.exports = { searchProviders, ProviderError };
