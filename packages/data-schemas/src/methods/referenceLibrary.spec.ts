import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { ReferenceLibraryMethods } from '~/types/referenceLibrary';
import { createModels } from '~/models';
import { createReferenceLibraryMethods } from './referenceLibrary';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

let mongoServer: MongoMemoryReplSet;
let methods: ReferenceLibraryMethods;

const assetInput = (exactHash: string, fileId = `file-${exactHash}`) => ({
  fileId,
  title: `Asset ${exactHash}`,
  notes: '',
  altText: '',
  tags: ['Blue'],
  favorite: false,
  rating: null,
  colorLabel: null,
  width: 1200,
  height: 800,
  orientation: 'landscape' as const,
  mimeType: 'image/webp',
  bytes: 1024,
  source: { kind: 'upload' as const, rightsState: 'known' as const },
  exactHash,
  perceptualHash: '0123456789abcdef',
  sanitizationVersion: 1,
});

beforeAll(async () => {
  mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  Object.assign(mongoose.models, createModels(mongoose));
  methods = createReferenceLibraryMethods(mongoose);
  await mongoose.connect(mongoServer.getUri());
  await Promise.all(
    [
      'ReferenceAsset',
      'ReferenceCollection',
      'ReferenceCollectionItem',
      'ReferenceTag',
      'ReferenceSavedFilter',
      'ReferenceImport',
    ].map((name) => mongoose.models[name].syncIndexes()),
  );
});

afterEach(async () => {
  await Promise.all(
    [
      'ReferenceAsset',
      'ReferenceCollection',
      'ReferenceCollectionItem',
      'ReferenceTag',
      'ReferenceSavedFilter',
      'ReferenceImport',
    ].map((name) => mongoose.models[name].deleteMany({})),
  );
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('reference library persistence', () => {
  it('deduplicates exact image bytes per owner but not across owners', async () => {
    const first = await methods.createAsset('owner-a', assetInput('same'));
    const repeated = await methods.createAsset('owner-a', assetInput('same', 'other-file'));
    const otherOwner = await methods.createAsset('owner-b', assetInput('same'));

    expect(first.created).toBe(true);
    expect(repeated).toMatchObject({ created: false, asset: { fileId: first.asset.fileId } });
    expect(otherOwner.created).toBe(true);
  });

  it('finds exact duplicates only inside the authenticated owner scope', async () => {
    const asset = (await methods.createAsset('owner-a', assetInput('lookup'))).asset;
    await expect(methods.findAssetByExactHash('owner-a', 'lookup')).resolves.toEqual(asset);
    await expect(methods.findAssetByExactHash('owner-b', 'lookup')).resolves.toBeNull();
  });

  it('never returns another owner asset', async () => {
    const { asset } = await methods.createAsset('owner-a', assetInput('private'));
    await expect(methods.getAsset('owner-b', asset.id)).resolves.toBeNull();
    await expect(methods.updateAsset('owner-b', asset.id, { title: 'stolen' })).resolves.toBeNull();
  });

  it('omits persistence ownership fields from public asset and collection views', async () => {
    const asset = (await methods.createAsset('owner-a', assetInput('public-view'))).asset;
    const collection = await methods.createCollection('owner-a', {
      name: 'Public view',
      description: '',
    });

    expect(asset).not.toHaveProperty('ownerId');
    expect(collection).not.toHaveProperty('ownerId');
    await expect(methods.getAsset('owner-a', asset.id)).resolves.not.toHaveProperty('ownerId');
    await expect(methods.listReferenceCollections('owner-a')).resolves.toEqual([
      expect.not.objectContaining({ ownerId: expect.anything() }),
    ]);
  });

  it('filters and bulk-updates only visible owner assets', async () => {
    const first = (await methods.createAsset('owner-a', assetInput('filter-one'))).asset;
    await methods.createAsset('owner-a', {
      ...assetInput('filter-two'),
      tags: ['Red'],
      favorite: true,
    });
    await methods.createAsset('owner-b', assetInput('filter-other'));

    const page = await methods.listReferenceAssets('owner-a', {
      tags: ['Blue'],
      limit: 20,
    });
    expect(page.items.map((asset) => asset.id)).toEqual([first.id]);

    const updated = await methods.bulkUpdateReferenceAssets('owner-a', [first.id], {
      favorite: true,
      rating: 4,
    });
    expect(updated).toEqual([expect.objectContaining({ id: first.id, favorite: true, rating: 4 })]);
  });

  it('rejects a bulk edit before changing any asset when one identifier is not owned', async () => {
    const owned = (await methods.createAsset('owner-a', assetInput('bulk-owned'))).asset;
    const foreign = (await methods.createAsset('owner-b', assetInput('bulk-foreign'))).asset;

    await expect(
      methods.bulkUpdateReferenceAssets('owner-a', [owned.id, foreign.id], { rating: 5 }),
    ).rejects.toThrow('not found');
    await expect(methods.getAsset('owner-a', owned.id)).resolves.toMatchObject({ rating: null });
  });

  it('does not return unchanged assets when a bulk update loses its mutation predicate', async () => {
    const asset = (await methods.createAsset('owner-a', assetInput('bulk-race'))).asset;
    const update = jest.spyOn(mongoose.models.ReferenceAsset, 'updateMany').mockResolvedValueOnce({
      acknowledged: true,
      matchedCount: 0,
      modifiedCount: 0,
      upsertedCount: 0,
      upsertedId: null,
    } as never);

    await expect(
      methods.bulkUpdateReferenceAssets('owner-a', [asset.id], { rating: 5 }),
    ).rejects.toThrow('not found');
    update.mockRestore();
    await expect(methods.getAsset('owner-a', asset.id)).resolves.toMatchObject({ rating: null });
  });

  it.each([
    {
      sort: 'updated-desc' as const,
      field: 'updatedAt',
      values: [
        new Date('2026-03-03T00:00:00.000Z'),
        new Date('2026-03-03T00:00:00.000Z'),
        new Date('2026-03-03T00:00:00.000Z'),
        new Date('2026-03-02T00:00:00.000Z'),
        new Date('2026-03-02T00:00:00.000Z'),
      ],
      groups: [
        [0, 1, 2],
        [3, 4],
      ],
    },
    {
      sort: 'title-asc' as const,
      field: 'title',
      values: ['Alpha', 'Alpha', 'Alpha', 'Beta', 'Beta'],
      groups: [
        [0, 1, 2],
        [3, 4],
      ],
    },
    {
      sort: 'rating-desc' as const,
      field: 'rating',
      values: [5, 5, 5, 4, null],
      groups: [[0, 1, 2], [3], [4]],
    },
  ])(
    'paginates $sort without duplicates or skips across tied values',
    async ({ sort, field, values, groups }) => {
      const assets = await Promise.all(
        values.map((_, index) =>
          methods
            .createAsset('owner-a', assetInput(`cursor-${sort}-${index}`))
            .then(({ asset }) => asset),
        ),
      );
      await Promise.all(
        assets.map((asset, index) =>
          mongoose.models.ReferenceAsset.updateOne(
            { _id: asset.id },
            { $set: { [field]: values[index] } },
            { timestamps: false },
          ),
        ),
      );
      const expected = groups.flatMap((group) =>
        group.map((index) => assets[index].id).sort((left, right) => right.localeCompare(left)),
      );

      const seen: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await methods.listReferenceAssets('owner-a', { sort, cursor, limit: 2 });
        seen.push(...page.items.map(({ id }) => id));
        cursor = page.nextCursor ?? undefined;
        if (cursor) {
          expect(cursor).not.toMatch(/^[a-f\d]{24}$/i);
        }
      } while (cursor);

      expect(seen).toEqual(expected);
      expect(new Set(seen).size).toBe(seen.length);
    },
  );

  it('safely accepts legacy object-id cursors and ignores invalid cursors', async () => {
    const assets = await Promise.all(
      ['legacy-one', 'legacy-two', 'legacy-three'].map((hash) =>
        methods.createAsset('owner-a', { ...assetInput(hash), title: 'Same title' }),
      ),
    );
    const orderedIds = assets
      .map(({ asset }) => asset.id)
      .sort((left, right) => right.localeCompare(left));

    await expect(
      methods.listReferenceAssets('owner-a', {
        sort: 'title-asc',
        cursor: orderedIds[1],
        limit: 10,
      }),
    ).resolves.toMatchObject({ items: [{ id: orderedIds[2] }] });
    await expect(
      methods.listReferenceAssets('owner-a', {
        sort: 'title-asc',
        cursor: 'not-a-cursor',
        limit: 10,
      }),
    ).resolves.toMatchObject({
      items: orderedIds.map((id) => expect.objectContaining({ id })),
    });
  });

  it('filters asset metadata stored at its canonical schema paths', async () => {
    const known = await methods.createAsset('owner-a', {
      ...assetInput('known'),
      rating: 5,
      colorLabel: 'blue',
    });
    await methods.createAsset('owner-a', {
      ...assetInput('unknown'),
      source: {
        kind: 'provider' as const,
        provider: 'google' as const,
        rightsState: 'unknown' as const,
      },
      rating: 2,
      colorLabel: 'red',
    });

    const page = await methods.listReferenceAssets('owner-a', {
      rightsState: 'known',
      rating: 5,
      colorLabel: 'blue',
    });

    expect(page.items.map((asset) => asset.id)).toEqual([known.asset.id]);
  });

  it('summarizes collections, tags, saved filters, and perceptual duplicates', async () => {
    const first = (await methods.createAsset('owner-a', assetInput('summary-one'))).asset;
    const second = (await methods.createAsset('owner-a', assetInput('summary-two'))).asset;
    const collection = await methods.createCollection('owner-a', {
      name: 'Board',
      description: '',
    });
    await methods.setCollectionAssets('owner-a', collection.id, [first.id, second.id]);
    await methods.createReferenceSavedFilter('owner-a', 'Blue references', { tags: ['Blue'] });

    await expect(methods.listReferenceCollections('owner-a')).resolves.toEqual([
      expect.objectContaining({ id: collection.id, assetCount: 2 }),
    ]);
    await expect(methods.listReferenceTags('owner-a')).resolves.toEqual([
      expect.objectContaining({ name: 'Blue', assetCount: 2 }),
    ]);
    await expect(methods.listReferenceSavedFilters('owner-a')).resolves.toEqual([
      expect.objectContaining({ name: 'Blue references', version: 1 }),
    ]);
    await expect(methods.findReferenceDuplicates('owner-a')).resolves.toEqual([
      expect.objectContaining({ exact: false, assetIds: [first.id, second.id], distance: 0 }),
    ]);
  });

  it('keeps collection membership idempotent and ordered', async () => {
    const first = (await methods.createAsset('owner-a', assetInput('one'))).asset;
    const second = (await methods.createAsset('owner-a', assetInput('two'))).asset;
    const collection = await methods.createCollection('owner-a', {
      name: 'Mood board',
      description: '',
    });

    await methods.setCollectionAssets('owner-a', collection.id, [second.id, first.id, second.id]);
    const assets = await methods.getCollectionAssets('owner-a', collection.id);

    expect(assets.map((asset) => asset.id)).toEqual([second.id, first.id]);
  });

  it('rolls back collection replacement when inserting the new order fails', async () => {
    const first = (await methods.createAsset('owner-a', assetInput('atomic-one'))).asset;
    const second = (await methods.createAsset('owner-a', assetInput('atomic-two'))).asset;
    const collection = await methods.createCollection('owner-a', {
      name: 'Atomic board',
      description: '',
    });
    await methods.setCollectionAssets('owner-a', collection.id, [first.id]);
    const failure = jest
      .spyOn(mongoose.models.ReferenceCollectionItem, 'insertMany')
      .mockRejectedValueOnce(new Error('replacement failed'));

    await expect(
      methods.setCollectionAssets('owner-a', collection.id, [second.id]),
    ).rejects.toThrow('replacement failed');
    failure.mockRestore();
    await expect(methods.getCollectionAssets('owner-a', collection.id)).resolves.toEqual([
      expect.objectContaining({ id: first.id }),
    ]);
  });

  it('rejects foreign and trashed collection covers without changing the current cover', async () => {
    const active = (await methods.createAsset('owner-a', assetInput('cover-active'))).asset;
    const trashed = (await methods.createAsset('owner-a', assetInput('cover-trashed'))).asset;
    const foreign = (await methods.createAsset('owner-b', assetInput('cover-foreign'))).asset;
    const collection = await methods.createCollection('owner-a', {
      name: 'Covered board',
      description: '',
    });
    await methods.updateReferenceCollection('owner-a', collection.id, {
      coverAssetId: active.id,
    });
    await methods.trashAssets('owner-a', [trashed.id]);

    await expect(
      methods.updateReferenceCollection('owner-a', collection.id, {
        coverAssetId: foreign.id,
      }),
    ).rejects.toThrow('Cover asset not found');
    await expect(
      methods.updateReferenceCollection('owner-a', collection.id, {
        coverAssetId: trashed.id,
      }),
    ).rejects.toThrow('Cover asset not found');
    await expect(
      methods.updateReferenceCollection('owner-a', collection.id, {
        coverAssetId: 'invalid',
      }),
    ).rejects.toThrow('Cover asset not found');
    await expect(methods.listReferenceCollections('owner-a')).resolves.toEqual([
      expect.objectContaining({ id: collection.id, coverAssetId: active.id }),
    ]);
  });

  it('supports reversible trash and owner-scoped purge candidates', async () => {
    const asset = (await methods.createAsset('owner-a', assetInput('trash'))).asset;
    await methods.trashAssets('owner-a', [asset.id]);
    expect((await methods.getAsset('owner-a', asset.id, true))?.trashedAt).toBeInstanceOf(Date);

    await methods.restoreAssets('owner-a', [asset.id]);
    expect((await methods.getAsset('owner-a', asset.id, true))?.trashedAt).toBeNull();

    await methods.trashAssets('owner-a', [asset.id], new Date('2026-01-01T00:00:00.000Z'));
    const candidates = await methods.getPurgeCandidates(
      'owner-a',
      new Date('2026-01-31T00:00:00.000Z'),
    );
    expect(candidates.map((item) => item.id)).toEqual([asset.id]);
  });

  it('deletes only requested trash that satisfies the retention cutoff', async () => {
    const oldAsset = (await methods.createAsset('owner-a', assetInput('trash-old'))).asset;
    const recentAsset = (await methods.createAsset('owner-a', assetInput('trash-recent'))).asset;
    const collection = await methods.createCollection('owner-a', {
      name: 'Retention board',
      description: '',
    });
    await methods.setCollectionAssets('owner-a', collection.id, [oldAsset.id, recentAsset.id]);
    await methods.trashAssets('owner-a', [oldAsset.id], new Date('2026-01-01T00:00:00.000Z'));
    await methods.trashAssets('owner-a', [recentAsset.id], new Date('2026-02-01T00:00:00.000Z'));

    await expect(
      methods.deleteTrashedReferenceAssets(
        'owner-a',
        [oldAsset.id, recentAsset.id],
        new Date('2026-01-15T00:00:00.000Z'),
      ),
    ).resolves.toEqual([expect.objectContaining({ id: oldAsset.id })]);
    await expect(methods.getAsset('owner-a', oldAsset.id, true)).resolves.toBeNull();
    await expect(methods.getAsset('owner-a', recentAsset.id, true)).resolves.toMatchObject({
      id: recentAsset.id,
    });
    await expect(
      methods.getReferenceAssetCollectionIds('owner-a', [oldAsset.id, recentAsset.id]),
    ).resolves.toEqual({ [recentAsset.id]: [collection.id] });
  });

  it('rolls back membership deletion when trashed asset deletion fails', async () => {
    const asset = (await methods.createAsset('owner-a', assetInput('trash-atomic'))).asset;
    const collection = await methods.createCollection('owner-a', {
      name: 'Trash rollback',
      description: '',
    });
    await methods.setCollectionAssets('owner-a', collection.id, [asset.id]);
    await methods.trashAssets('owner-a', [asset.id], new Date('2026-01-01T00:00:00.000Z'));
    const failure = jest
      .spyOn(mongoose.models.ReferenceAsset, 'deleteMany')
      .mockRejectedValueOnce(new Error('asset deletion failed'));

    await expect(
      methods.deleteTrashedReferenceAssets(
        'owner-a',
        [asset.id],
        new Date('2026-01-15T00:00:00.000Z'),
      ),
    ).rejects.toThrow('asset deletion failed');
    failure.mockRestore();
    await expect(methods.getAsset('owner-a', asset.id, true)).resolves.toMatchObject({
      id: asset.id,
    });
    await expect(methods.getReferenceAssetCollectionIds('owner-a', [asset.id])).resolves.toEqual({
      [asset.id]: [collection.id],
    });
  });
  it('persists idempotent import results per owner', async () => {
    await expect(methods.beginReferenceImport('owner-a', 'request-1')).resolves.toEqual({
      claimed: true,
      results: [],
      completed: false,
    });
    await methods.saveReferenceImportResults(
      'owner-a',
      'request-1',
      [{ importToken: 'token-1', ok: true }],
      true,
    );

    await expect(methods.beginReferenceImport('owner-a', 'request-1')).resolves.toEqual({
      claimed: false,
      results: [{ importToken: 'token-1', ok: true }],
      completed: true,
    });
    await expect(methods.beginReferenceImport('owner-b', 'request-1')).resolves.toMatchObject({
      claimed: true,
    });
  });

  it('creates and restores assets with only owner-owned collection memberships', async () => {
    const own = await methods.createCollection('owner-a', {
      name: 'Owned',
      description: '',
    });
    const foreign = await methods.createCollection('owner-b', {
      name: 'Foreign',
      description: '',
    });

    await expect(
      methods.createAssetInCollections('owner-a', assetInput('foreign-target'), [
        own.id,
        foreign.id,
      ]),
    ).rejects.toThrow('collections were not found');
    await expect(methods.findAssetByExactHash('owner-a', 'foreign-target')).resolves.toBeNull();

    const created = await methods.createAssetInCollections('owner-a', assetInput('owned-target'), [
      own.id,
    ]);
    await expect(
      methods.getReferenceAssetCollectionIds('owner-a', [created.asset.id]),
    ).resolves.toEqual({ [created.asset.id]: [own.id] });

    await methods.trashAssets('owner-a', [created.asset.id]);
    await expect(
      methods.placeAssetInCollections('owner-a', created.asset.id, [own.id], {
        restoreTrashed: true,
      }),
    ).resolves.toMatchObject({ id: created.asset.id, trashedAt: null });
  });

  it('deduplicates concurrent imports while preserving collection membership', async () => {
    const collection = await methods.createCollection('owner-a', {
      name: 'Concurrent imports',
      description: '',
    });

    const results = await Promise.all([
      methods.createAssetInCollections('owner-a', assetInput('concurrent-import', 'file-one'), [
        collection.id,
      ]),
      methods.createAssetInCollections('owner-a', assetInput('concurrent-import', 'file-two'), [
        collection.id,
      ]),
    ]);

    expect(results.map(({ created }) => created).sort()).toEqual([false, true]);
    expect(results[0].asset.id).toBe(results[1].asset.id);
    await expect(
      methods.getReferenceAssetCollectionIds('owner-a', [results[0].asset.id]),
    ).resolves.toEqual({ [results[0].asset.id]: [collection.id] });
  });
});
