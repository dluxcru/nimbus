const db = require('~/models');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { getFileStrategy } = require('~/server/utils/getFileStrategy');
const { verifyImportToken } = require('./importTokens');
const { importReferenceImage, sanitizeImageBuffer } = require('./imageImport');
const { importItems, saveExistingImage, purgeItems } = require('./index');

jest.mock('~/models', () => ({
  beginReferenceImport: jest.fn(),
  saveReferenceImportResults: jest.fn(),
  validateReferenceCollections: jest.fn(),
  createAssetInCollections: jest.fn(),
  placeAssetInCollections: jest.fn(),
  getAsset: jest.fn(),
  findFileById: jest.fn(),
  deleteTrashedReferenceAssets: jest.fn(),
  deleteFileByFilter: jest.fn(),
}));
jest.mock('~/server/services/Files/strategies', () => ({ getStrategyFunctions: jest.fn() }));
jest.mock('~/server/utils/getFileStrategy', () => ({ getFileStrategy: jest.fn() }));
jest.mock('./importTokens', () => ({
  createImportToken: jest.fn(),
  verifyImportToken: jest.fn(),
}));
jest.mock('./providers', () => ({ searchProviders: jest.fn() }));
jest.mock('./imageImport', () => ({
  importReferenceImage: jest.fn(),
  sanitizeImage: jest.fn(),
  sanitizeImageBuffer: jest.fn(),
}));

const config = {
  sanitizationVersion: 2,
  import: { maxBytes: 1024, maxPixels: 1000, timeoutMs: 1000 },
  trashRetentionDays: 30,
};
const req = {
  user: { id: 'owner-a' },
  config: { fileStrategy: 'local', imageOutputType: 'png' },
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.JWT_SECRET = 'test-secret';
  getFileStrategy.mockReturnValue('local');
  getStrategyFunctions.mockReturnValue({
    saveBuffer: jest.fn(),
    deleteFile: jest.fn(),
  });
  db.beginReferenceImport.mockResolvedValue({ claimed: true, results: [] });
  db.saveReferenceImportResults.mockResolvedValue(undefined);
  db.validateReferenceCollections.mockResolvedValue(undefined);
  db.placeAssetInCollections.mockImplementation(async (_ownerId, _assetId, _collectionIds) => ({
    id: 'asset-1',
    fileId: 'file-1',
    trashedAt: null,
  }));
  verifyImportToken.mockReturnValue({
    imageUrl: 'https://images.example/reference.png',
    rightsState: 'known',
  });
});

afterAll(() => {
  delete process.env.JWT_SECRET;
});

describe('reference import request contracts', () => {
  it('returns the persisted per-item response for a replay without touching storage', async () => {
    const cached = [
      { importToken: 'signed-a', ok: true, asset: { id: 'asset-a' }, reused: false },
      {
        importToken: 'signed-b',
        ok: false,
        error: { code: 'import_failed', message: 'bad image' },
      },
    ];
    db.beginReferenceImport.mockResolvedValue({ claimed: false, results: cached });

    await expect(
      importItems(req, config, {
        idempotencyKey: 'request-1',
        items: [{ importToken: 'signed-a' }, { importToken: 'signed-b' }],
      }),
    ).resolves.toEqual({ results: cached });

    expect(getFileStrategy).not.toHaveBeenCalled();
    expect(verifyImportToken).not.toHaveBeenCalled();
    expect(importReferenceImage).not.toHaveBeenCalled();
  });

  it('persists partial results and atomically creates a new asset in every requested collection', async () => {
    db.createAssetInCollections.mockResolvedValue({
      asset: { id: 'asset-new', fileId: 'file-new', ownerId: 'owner-a', trashedAt: null },
      created: true,
    });
    importReferenceImage
      .mockImplementationOnce(async (input, deps) => {
        const created = await deps.createAsset(input.ownerId, { exactHash: 'hash-a' });
        return { asset: created.asset, reused: false };
      })
      .mockRejectedValueOnce(new Error('malformed image'));

    const result = await importItems(req, config, {
      idempotencyKey: 'request-partial',
      items: [
        {
          importToken: 'signed-a',
          collectionIds: ['collection-1', 'collection-2', 'collection-1'],
        },
        { importToken: 'signed-b' },
      ],
    });

    expect(db.validateReferenceCollections).toHaveBeenNthCalledWith(1, 'owner-a', [
      'collection-1',
      'collection-2',
    ]);
    expect(db.createAssetInCollections).toHaveBeenCalledWith('owner-a', { exactHash: 'hash-a' }, [
      'collection-1',
      'collection-2',
    ]);
    expect(result.results).toEqual([
      {
        importToken: 'signed-a',
        ok: true,
        asset: { id: 'asset-new', fileId: 'file-new', trashedAt: null },
        reused: false,
      },
      {
        importToken: 'signed-b',
        ok: false,
        error: { code: 'import_failed', message: 'malformed image' },
      },
    ]);
    expect(db.saveReferenceImportResults).toHaveBeenNthCalledWith(
      1,
      'owner-a',
      'request-partial',
      [result.results[0]],
      false,
    );
    expect(db.saveReferenceImportResults).toHaveBeenNthCalledWith(
      2,
      'owner-a',
      'request-partial',
      result.results,
      true,
    );
  });

  it('fails an item before download when any target collection is not owner-owned', async () => {
    db.validateReferenceCollections.mockRejectedValue(
      new Error('One or more collections were not found'),
    );

    const result = await importItems(req, config, {
      idempotencyKey: 'request-foreign-collection',
      items: [{ importToken: 'signed-a', collectionIds: ['foreign-collection'] }],
    });

    expect(result.results[0]).toMatchObject({
      ok: false,
      error: { code: 'import_failed', message: 'One or more collections were not found' },
    });
    expect(verifyImportToken).not.toHaveBeenCalled();
    expect(importReferenceImage).not.toHaveBeenCalled();
    expect(db.saveReferenceImportResults).toHaveBeenCalledWith(
      'owner-a',
      'request-foreign-collection',
      result.results,
      true,
    );
  });

  it('restores an exact-hash trashed duplicate and applies requested memberships', async () => {
    importReferenceImage.mockResolvedValue({
      asset: { id: 'asset-trashed', fileId: 'file-1', ownerId: 'owner-a', trashedAt: new Date() },
      reused: true,
    });
    db.placeAssetInCollections.mockResolvedValue({
      id: 'asset-trashed',
      fileId: 'file-1',
      ownerId: 'owner-a',
      trashedAt: null,
    });

    const result = await importItems(req, config, {
      idempotencyKey: 'request-restore',
      items: [{ importToken: 'signed-a', collectionIds: ['collection-1'] }],
    });

    expect(db.placeAssetInCollections).toHaveBeenCalledWith(
      'owner-a',
      'asset-trashed',
      ['collection-1'],
      { restoreTrashed: true },
    );
    expect(result.results[0]).toMatchObject({
      ok: true,
      reused: true,
      asset: { id: 'asset-trashed', trashedAt: null },
    });
    expect(result.results[0].asset).not.toHaveProperty('ownerId');
  });
});

describe('reference image output configuration', () => {
  it('uses the top-level imageOutputType when sanitizing an existing image', async () => {
    const getDownloadStream = jest.fn().mockResolvedValue(
      (async function* () {
        yield Buffer.from('image');
      })(),
    );
    getStrategyFunctions.mockReturnValue({
      saveBuffer: jest.fn(),
      deleteFile: jest.fn(),
      getDownloadStream,
    });
    db.findFileById.mockResolvedValue({
      file_id: 'file-1',
      filename: 'source.png',
      filepath: '/images/source.png',
      source: 'local',
      type: 'image/png',
      bytes: 5,
    });
    sanitizeImageBuffer.mockResolvedValue({ exactHash: 'hash' });
    importReferenceImage.mockImplementation(async (_input, deps) => {
      await deps.sanitize();
      return { asset: { id: 'asset-1' }, reused: false };
    });

    await saveExistingImage(req, config, { fileId: 'file-1' });

    expect(sanitizeImageBuffer).toHaveBeenCalledWith(Buffer.from('image'), {
      maxBytes: 1024,
      maxPixels: 1000,
      outputType: 'png',
    });
  });
});

describe('reference trash retention', () => {
  it('rejects permanent deletion before the configured retention period elapses', async () => {
    db.getAsset.mockResolvedValue({
      id: 'asset-early',
      fileId: 'file-1',
      trashedAt: new Date('2026-10-15T00:00:00.000Z'),
    });

    await expect(
      purgeItems(req, config, ['asset-early'], new Date('2026-11-01T00:00:00.000Z')),
    ).rejects.toMatchObject({ code: 'trash_retention_active', status: 409 });
    expect(db.deleteTrashedReferenceAssets).not.toHaveBeenCalled();
  });

  it('deletes metadata before storage and only for retention-eligible records actually deleted', async () => {
    const deleteFile = jest.fn().mockResolvedValue(undefined);
    getStrategyFunctions.mockReturnValue({ deleteFile });
    db.getAsset.mockResolvedValue({
      id: 'asset-due',
      fileId: 'file-1',
      trashedAt: new Date('2026-09-01T00:00:00.000Z'),
    });
    db.deleteTrashedReferenceAssets.mockResolvedValue([
      { id: 'asset-due', fileId: 'file-1', trashedAt: new Date('2026-09-01T00:00:00.000Z') },
    ]);
    db.findFileById.mockResolvedValue({
      file_id: 'file-1',
      filepath: '/images/file-1',
      source: 'local',
      context: 'reference-library',
      usage: 0,
    });

    await expect(
      purgeItems(req, config, ['asset-due'], new Date('2026-11-01T00:00:00.000Z')),
    ).resolves.toBe(1);

    const cutoff = new Date('2026-10-02T00:00:00.000Z');
    expect(db.deleteTrashedReferenceAssets).toHaveBeenCalledWith('owner-a', ['asset-due'], cutoff);
    expect(db.deleteTrashedReferenceAssets.mock.invocationCallOrder[0]).toBeLessThan(
      deleteFile.mock.invocationCallOrder[0],
    );
    expect(deleteFile).toHaveBeenCalledWith(req, {
      filepath: '/images/file-1',
      source: 'local',
    });
    expect(db.deleteFileByFilter).toHaveBeenCalledWith({ user: 'owner-a', file_id: 'file-1' });
  });
});
