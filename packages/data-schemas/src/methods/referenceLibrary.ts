import type { FilterQuery, Model, Types } from 'mongoose';
import type { ReferenceAssetPatch } from 'librechat-data-provider';
import type {
  CreateReferenceAssetInput,
  IReferenceAsset,
  IReferenceCollection,
  ReferenceAssetRecord,
  ReferenceAssetView,
  ReferenceCollectionView,
  ReferenceLibraryMethods,
} from '~/types/referenceLibrary';

const DUPLICATE_KEY_ERROR = 11000;

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === DUPLICATE_KEY_ERROR
  );
}

function cleanTags(tags: string[]): string[] {
  return [...new Map(tags.map((tag) => tag.trim()).filter(Boolean).map((tag) => [tag.toLowerCase(), tag])).values()];
}

function assetView(asset: ReferenceAssetRecord): ReferenceAssetView {
  return {
    id: asset._id.toString(),
    ownerId: asset.ownerId,
    fileId: asset.fileId,
    title: asset.title,
    notes: asset.notes,
    altText: asset.altText,
    tags: asset.tags,
    favorite: asset.favorite,
    rating: asset.rating,
    colorLabel: asset.colorLabel,
    width: asset.width,
    height: asset.height,
    orientation: asset.orientation,
    mimeType: asset.mimeType,
    bytes: asset.bytes,
    source: asset.source,
    exactHash: asset.exactHash,
    perceptualHash: asset.perceptualHash,
    sanitizationVersion: asset.sanitizationVersion,
    trashedAt: asset.trashedAt,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
  };
}

interface CollectionRecord {
  _id: Types.ObjectId;
  ownerId: string;
  name: string;
  description: string;
  coverAssetId: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

function collectionView(collection: CollectionRecord): ReferenceCollectionView {
  return {
    id: collection._id.toString(),
    ownerId: collection.ownerId,
    name: collection.name,
    description: collection.description,
    coverAssetId: collection.coverAssetId?.toString() ?? null,
    createdAt: collection.createdAt,
    updatedAt: collection.updatedAt,
  };
}

export function createReferenceLibraryMethods(
  mongoose: typeof import('mongoose'),
): ReferenceLibraryMethods {
  const getAssetModel = (): Model<IReferenceAsset> => mongoose.models.ReferenceAsset;
  const getCollectionModel = (): Model<IReferenceCollection> => mongoose.models.ReferenceCollection;

  async function createAsset(
    ownerId: string,
    input: CreateReferenceAssetInput,
  ): Promise<{ asset: ReferenceAssetView; created: boolean }> {
    const ReferenceAsset = getAssetModel();
    const existing = await ReferenceAsset.findOne({ ownerId, exactHash: input.exactHash }).lean<ReferenceAssetRecord>();
    if (existing) {
      return { asset: assetView(existing), created: false };
    }

    try {
      const created = await ReferenceAsset.create({ ...input, ownerId, tags: cleanTags(input.tags) });
      return { asset: assetView(created.toObject() as ReferenceAssetRecord), created: true };
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
      const raced = await ReferenceAsset.findOne({ ownerId, exactHash: input.exactHash }).lean<ReferenceAssetRecord>();
      if (!raced) {
        throw error;
      }
      return { asset: assetView(raced), created: false };
    }
  }

  async function getAsset(
    ownerId: string,
    assetId: string,
    includeTrashed = false,
  ): Promise<ReferenceAssetView | null> {
    if (!mongoose.isValidObjectId(assetId)) {
      return null;
    }
    const filter: FilterQuery<IReferenceAsset> = { _id: assetId, ownerId };
    if (!includeTrashed) {
      filter.trashedAt = null;
    }
    const asset = await getAssetModel().findOne(filter).lean<ReferenceAssetRecord>();
    return asset ? assetView(asset) : null;
  }

  async function updateAsset(
    ownerId: string,
    assetId: string,
    patch: ReferenceAssetPatch,
  ): Promise<ReferenceAssetView | null> {
    if (!mongoose.isValidObjectId(assetId)) {
      return null;
    }
    const update: ReferenceAssetPatch = { ...patch };
    if (patch.tags) {
      update.tags = cleanTags(patch.tags);
    }
    const asset = await getAssetModel()
      .findOneAndUpdate({ _id: assetId, ownerId, trashedAt: null }, { $set: update }, { new: true, runValidators: true })
      .lean<ReferenceAssetRecord>();
    return asset ? assetView(asset) : null;
  }

  async function createCollection(
    ownerId: string,
    input: { name: string; description: string },
  ): Promise<ReferenceCollectionView> {
    const collection = await getCollectionModel().create({ ownerId, ...input });
    return collectionView(collection.toObject() as CollectionRecord);
  }

  async function setCollectionAssets(
    ownerId: string,
    collectionId: string,
    assetIds: string[],
  ): Promise<void> {
    if (!mongoose.isValidObjectId(collectionId)) {
      throw new Error('Collection not found');
    }
    const collectionExists = await getCollectionModel().exists({ _id: collectionId, ownerId });
    if (!collectionExists) {
      throw new Error('Collection not found');
    }
    const uniqueIds = [...new Set(assetIds)].filter((id) => mongoose.isValidObjectId(id));
    const owned = await getAssetModel()
      .find({ _id: { $in: uniqueIds }, ownerId, trashedAt: null })
      .select('_id')
      .lean<Array<{ _id: Types.ObjectId }>>();
    const ownedIds = new Set(owned.map(({ _id }) => _id.toString()));
    const ordered = uniqueIds.filter((id) => ownedIds.has(id));
    const ReferenceCollectionItem = mongoose.models.ReferenceCollectionItem;
    await ReferenceCollectionItem.deleteMany({ ownerId, collectionId });
    if (ordered.length > 0) {
      await ReferenceCollectionItem.insertMany(
        ordered.map((assetId, position) => ({ ownerId, collectionId, assetId, position, note: '' })),
      );
    }
  }

  async function getCollectionAssets(
    ownerId: string,
    collectionId: string,
  ): Promise<ReferenceAssetView[]> {
    if (!mongoose.isValidObjectId(collectionId)) {
      return [];
    }
    const collectionExists = await getCollectionModel().exists({ _id: collectionId, ownerId });
    if (!collectionExists) {
      return [];
    }
    const items = await mongoose.models.ReferenceCollectionItem.find({ ownerId, collectionId })
      .sort({ position: 1 })
      .select('assetId')
      .lean<Array<{ assetId: Types.ObjectId }>>();
    const assets = await getAssetModel()
      .find({ ownerId, _id: { $in: items.map(({ assetId }) => assetId) }, trashedAt: null })
      .lean<ReferenceAssetRecord[]>();
    const byId = new Map(assets.map((asset) => [asset._id.toString(), asset]));
    return items.flatMap(({ assetId }) => {
      const asset = byId.get(assetId.toString());
      return asset ? [assetView(asset)] : [];
    });
  }

  async function trashAssets(ownerId: string, assetIds: string[], now = new Date()): Promise<number> {
    const ids = assetIds.filter((id) => mongoose.isValidObjectId(id));
    const result = await getAssetModel().updateMany(
      { _id: { $in: ids }, ownerId, trashedAt: null },
      { $set: { trashedAt: now } },
    );
    return result.modifiedCount;
  }

  async function restoreAssets(ownerId: string, assetIds: string[]): Promise<number> {
    const ids = assetIds.filter((id) => mongoose.isValidObjectId(id));
    const result = await getAssetModel().updateMany(
      { _id: { $in: ids }, ownerId, trashedAt: { $ne: null } },
      { $set: { trashedAt: null } },
    );
    return result.modifiedCount;
  }

  async function getPurgeCandidates(ownerId: string, cutoff: Date): Promise<ReferenceAssetView[]> {
    const assets = await getAssetModel()
      .find({ ownerId, trashedAt: { $ne: null, $lte: cutoff } })
      .sort({ trashedAt: 1 })
      .lean<ReferenceAssetRecord[]>();
    return assets.map(assetView);
  }

  return {
    createAsset,
    getAsset,
    updateAsset,
    createCollection,
    setCollectionAssets,
    getCollectionAssets,
    trashAssets,
    restoreAssets,
    getPurgeCandidates,
  };
}
