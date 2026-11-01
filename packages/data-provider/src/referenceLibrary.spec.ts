import {
  referenceLibraryAsset,
  referenceLibraryAssets,
  referenceLibraryCollections,
  referenceLibraryImports,
  referenceLibrarySearch,
} from './api-endpoints';
import { referenceLibrarySchema } from './config';
import { DynamicQueryKeys, QueryKeys } from './keys';

describe('reference library contract', () => {
  it('defaults an explicitly configured library to safe bounded settings', () => {
    expect(referenceLibrarySchema.parse({ enabled: true })).toEqual({
      enabled: true,
      providers: {},
      import: {
        maxBytes: 20 * 1024 * 1024,
        maxPixels: 40_000_000,
        timeoutMs: 15_000,
        tokenTtlSeconds: 300,
        maxBatchSize: 25,
      },
      trashRetentionDays: 30,
    });
  });

  it('rejects unbounded import limits and unknown provider fields', () => {
    expect(referenceLibrarySchema).toBeDefined();
    expect(() =>
      referenceLibrarySchema.parse({
        enabled: true,
        import: { maxBytes: 0 },
        providers: { google: { apiKey: 'x', unknown: true } },
      }),
    ).toThrow();
  });

  it('builds endpoints under one authenticated route family', () => {
    expect(referenceLibraryAssets()).toBe('/api/reference-library/assets');
    expect(referenceLibraryAsset('a/b?#')).toBe('/api/reference-library/assets/a%2Fb%3F%23');
    expect(referenceLibrarySearch()).toBe('/api/reference-library/search');
    expect(referenceLibraryImports()).toBe('/api/reference-library/imports');
    expect(referenceLibraryCollections()).toBe('/api/reference-library/collections');
  });

  it('provides stable list and entity query keys', () => {
    expect(QueryKeys.referenceLibrary).toBe('referenceLibrary');
    expect(DynamicQueryKeys.referenceLibraryAssets({ query: 'moon', tags: ['blue'] })).toEqual([
      QueryKeys.referenceLibrary,
      'assets',
      { query: 'moon', tags: ['blue'] },
    ]);
    expect(DynamicQueryKeys.referenceLibraryAsset('asset-1')).toEqual([
      QueryKeys.referenceLibrary,
      'asset',
      'asset-1',
    ]);
  });
});
