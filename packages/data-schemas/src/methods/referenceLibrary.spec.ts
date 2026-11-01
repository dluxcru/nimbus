import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { ReferenceLibraryMethods } from '~/types/referenceLibrary';
import { createModels } from '~/models';
import { createReferenceLibraryMethods } from './referenceLibrary';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

let mongoServer: InstanceType<typeof MongoMemoryServer>;
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
  mongoServer = await MongoMemoryServer.create();
  Object.assign(mongoose.models, createModels(mongoose));
  methods = createReferenceLibraryMethods(mongoose);
  await mongoose.connect(mongoServer.getUri());
  await Promise.all(
    ['ReferenceAsset', 'ReferenceCollection', 'ReferenceCollectionItem', 'ReferenceTag', 'ReferenceSavedFilter'].map(
      (name) => mongoose.models[name].syncIndexes(),
    ),
  );
});

afterEach(async () => {
  await Promise.all(
    ['ReferenceAsset', 'ReferenceCollection', 'ReferenceCollectionItem', 'ReferenceTag', 'ReferenceSavedFilter'].map(
      (name) => mongoose.models[name].deleteMany({}),
    ),
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

  it('never returns another owner asset', async () => {
    const { asset } = await methods.createAsset('owner-a', assetInput('private'));
    await expect(methods.getAsset('owner-b', asset.id)).resolves.toBeNull();
    await expect(methods.updateAsset('owner-b', asset.id, { title: 'stolen' })).resolves.toBeNull();
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

  it('supports reversible trash and owner-scoped purge candidates', async () => {
    const asset = (await methods.createAsset('owner-a', assetInput('trash'))).asset;
    await methods.trashAssets('owner-a', [asset.id]);
    expect((await methods.getAsset('owner-a', asset.id, true))?.trashedAt).toBeInstanceOf(Date);

    await methods.restoreAssets('owner-a', [asset.id]);
    expect((await methods.getAsset('owner-a', asset.id, true))?.trashedAt).toBeNull();

    await methods.trashAssets('owner-a', [asset.id], new Date('2026-01-01T00:00:00.000Z'));
    const candidates = await methods.getPurgeCandidates('owner-a', new Date('2026-01-31T00:00:00.000Z'));
    expect(candidates.map((item) => item.id)).toEqual([asset.id]);
  });
});
