const { searchProviders } = require('./providers');

const makeResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers(),
  json: async () => body,
});

describe('reference image providers', () => {
  it('normalizes Pexels and preserves license attribution', async () => {
    const fetch = jest.fn().mockResolvedValue(
      makeResponse({
        page: 1,
        next_page: 'https://api.pexels.com/v1/search?page=2',
        photos: [
          {
            id: 42,
            width: 1200,
            height: 800,
            url: 'https://www.pexels.com/photo/moon-42/',
            photographer: 'Ada',
            photographer_url: 'https://www.pexels.com/@ada',
            alt: 'Moon over a lake',
            src: {
              tiny: 'https://images.pexels.com/tiny.jpeg',
              original: 'https://images.pexels.com/original.jpeg',
            },
          },
        ],
      }),
    );

    const result = await searchProviders({
      query: 'moon',
      providers: ['pexels'],
      config: { pexels: { apiKey: 'pexels-key' } },
      fetch,
      sign: (item) => `signed:${item.providerAssetId}`,
    });

    expect(result.results[0]).toEqual({
      provider: 'pexels',
      nextCursor: '2',
      items: [
        expect.objectContaining({
          provider: 'pexels',
          providerAssetId: '42',
          title: 'Moon over a lake',
          rightsState: 'known',
          licenseName: 'Pexels License',
          imageUrl: 'https://images.pexels.com/original.jpeg',
          importToken: 'signed:42',
        }),
      ],
    });
  });

  it('returns one provider error without discarding another provider result', async () => {
    const fetch = jest.fn(async (url) => {
      if (String(url).includes('serper')) {
        return makeResponse({ message: 'limited' }, 429);
      }
      return makeResponse({ query: { pages: {} }, continue: { gsroffset: 10 } });
    });

    const result = await searchProviders({
      query: 'castle',
      providers: ['google', 'wikimedia'],
      config: {
        google: { apiKey: 'google-key' },
        wikimedia: { userAgent: 'Nimbus/1.0' },
      },
      fetch,
      sign: () => 'signed',
    });

    expect(result.results).toEqual([
      expect.objectContaining({
        provider: 'google',
        error: expect.objectContaining({ code: 'rate_limited' }),
      }),
      expect.objectContaining({ provider: 'wikimedia', items: [] }),
    ]);
  });
});
