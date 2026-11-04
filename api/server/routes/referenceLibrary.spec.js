const express = require('express');
const request = require('supertest');
const { createReferenceLibraryRouter } = require('./referenceLibrary');

const config = {
  enabled: true,
  providers: { pexels: { apiKey: 'secret' }, wikimedia: {} },
  import: {
    maxBytes: 1024,
    maxPixels: 1000,
    timeoutMs: 1000,
    tokenTtlSeconds: 300,
    maxBatchSize: 2,
  },
  trashRetentionDays: 30,
};

function buildApp(overrides = {}) {
  const service = {
    capabilities: jest.fn(() => ({
      enabled: true,
      providers: { google: false, wikimedia: true, pexels: true },
      maxBatchSize: 2,
      trashRetentionDays: 30,
    })),
    search: jest.fn().mockResolvedValue({ results: [] }),
    importItems: jest.fn().mockResolvedValue({ results: [] }),
    saveExistingImage: jest.fn().mockResolvedValue({
      asset: { id: 'asset-saved', fileId: 'file-saved' },
      reused: false,
    }),
    purgeItems: jest.fn().mockResolvedValue(0),
    ...overrides.service,
  };
  const db = {
    getAsset: jest.fn().mockResolvedValue(null),
    updateAsset: jest.fn().mockResolvedValue(null),
    trashAssets: jest.fn().mockResolvedValue(0),
    bulkUpdateReferenceAssets: jest.fn().mockResolvedValue([]),
    restoreAssets: jest.fn().mockResolvedValue(0),
    getFiles: jest.fn(async (filter) =>
      (filter.file_id.$in || []).map((fileId) => ({
        file_id: fileId,
        filepath: `/images/${fileId}`,
      })),
    ),
    getReferenceAssetCollectionIds: jest.fn().mockResolvedValue({}),
    ...overrides.db,
  };
  const router = createReferenceLibraryRouter({
    auth: (req, _res, next) => {
      req.user = { id: 'owner-a' };
      next();
    },
    loadConfig: (req, _res, next) => {
      req.config = { referenceLibrary: overrides.config || config };
      next();
    },
    service,
    db,
  });
  const app = express();
  app.use(express.json());
  app.use('/api/reference-library', router);
  return { app, service, db };
}

describe('reference library routes', () => {
  it('projects capabilities without provider secrets', async () => {
    const { app } = buildApp();
    const response = await request(app).get('/api/reference-library/capabilities');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      enabled: true,
      providers: { google: false, wikimedia: true, pexels: true },
      maxBatchSize: 2,
      trashRetentionDays: 30,
    });
    expect(JSON.stringify(response.body)).not.toContain('secret');
  });

  it('passes only the authenticated owner to asset lookups', async () => {
    const { app, db } = buildApp({
      db: { getAsset: jest.fn().mockResolvedValue({ id: 'asset-1', fileId: 'file-1' }) },
    });
    const response = await request(app).get('/api/reference-library/assets/asset-1');

    expect(response.status).toBe(200);
    expect(db.getAsset).toHaveBeenCalledWith('owner-a', 'asset-1', false);
    expect(response.body.file.file_id).toBe('file-1');
  });

  it('rejects invalid searches before calling a provider', async () => {
    const { app, service } = buildApp();
    const response = await request(app)
      .post('/api/reference-library/search')
      .send({ query: '', providers: ['unknown'] });

    expect(response.status).toBe(400);
    expect(service.search).not.toHaveBeenCalled();
  });

  const protectedAssetFields = [
    'ownerId',
    'fileId',
    'source',
    'exactHash',
    'perceptualHash',
    'trashedAt',
  ];

  it.each(protectedAssetFields)('rejects %s in a single-asset metadata patch', async (field) => {
    const { app, db } = buildApp();
    const response = await request(app)
      .patch('/api/reference-library/assets/asset-1')
      .send({ title: 'Allowed', [field]: 'forbidden' });

    expect(response.status).toBe(400);
    expect(db.updateAsset).not.toHaveBeenCalled();
  });

  it.each(protectedAssetFields)('rejects %s in a bulk metadata patch', async (field) => {
    const { app, db } = buildApp();
    const response = await request(app)
      .patch('/api/reference-library/assets')
      .send({ assetIds: ['asset-1'], patch: { favorite: true, [field]: 'forbidden' } });

    expect(response.status).toBe(400);
    expect(db.bulkUpdateReferenceAssets).not.toHaveBeenCalled();
  });

  it('passes only allowlisted metadata fields to persistence', async () => {
    const patch = {
      title: 'Study',
      notes: 'Moonlit',
      altText: 'Moon above a lake',
      favorite: true,
      rating: 4,
      colorLabel: 'blue',
      tags: ['night'],
    };
    const { app, db } = buildApp({
      db: {
        updateAsset: jest.fn().mockResolvedValue({ id: 'asset-1', fileId: 'file-1', ...patch }),
        bulkUpdateReferenceAssets: jest.fn().mockResolvedValue([]),
      },
    });

    expect(
      (await request(app).patch('/api/reference-library/assets/asset-1').send(patch)).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .patch('/api/reference-library/assets')
          .send({ assetIds: ['asset-1'], patch })
      ).status,
    ).toBe(200);
    expect(db.updateAsset).toHaveBeenCalledWith('owner-a', 'asset-1', patch);
    expect(db.bulkUpdateReferenceAssets).toHaveBeenCalledWith('owner-a', ['asset-1'], patch);
  });

  it('saves an existing image inside the authenticated owner scope', async () => {
    const { app, service } = buildApp();
    const response = await request(app)
      .post('/api/reference-library/assets')
      .send({ fileId: 'file-saved', title: 'Moon study' });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      reused: false,
      asset: {
        id: 'asset-saved',
        fileId: 'file-saved',
        file: { file_id: 'file-saved' },
      },
    });
    expect(service.saveExistingImage.mock.calls[0][0].user.id).toBe('owner-a');
  });

  it('enforces the configured import batch bound', async () => {
    const { app, service } = buildApp();
    const response = await request(app)
      .post('/api/reference-library/imports')
      .send({
        idempotencyKey: 'request-1',
        items: [{ importToken: 'a' }, { importToken: 'b' }, { importToken: 'c' }],
      });

    expect(response.status).toBe(400);
    expect(service.importItems).not.toHaveBeenCalled();
  });

  it('hides disabled library endpoints while reporting disabled capabilities', async () => {
    const { app } = buildApp({ config: { ...config, enabled: false } });
    const capabilities = await request(app).get('/api/reference-library/capabilities');
    const assets = await request(app).get('/api/reference-library/assets/asset-1');

    expect(capabilities.status).toBe(200);
    expect(assets.status).toBe(404);
  });
});
