import type { ClientSession, FilterQuery, Model, Types } from 'mongoose';
import type {
  ReferenceAssetFilters,
  ReferenceAssetPatch,
  ReferenceDuplicateGroup,
} from 'librechat-data-provider';
import type {
  CreateReferenceAssetInput,
  IReferenceAsset,
  IReferenceCollection,
  IReferenceImport,
  ReferenceAssetRecord,
  ReferenceAssetRecordPage,
  ReferenceAssetView,
  ReferenceCollectionSummary,
  ReferenceCollectionView,
  ReferenceLibraryMethods,
  ReferenceSavedFilterView,
  ReferenceTagSummary,
} from '~/types/referenceLibrary';
import { getTransactionSupport } from '~/utils/transactions';

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
  return [
    ...new Map(
      tags
        .map((tag) => tag.trim())
        .filter(Boolean)
        .map((tag) => [tag.toLowerCase(), tag]),
    ).values(),
  ];
}
type ReferenceSort = NonNullable<ReferenceAssetFilters['sort']>;

interface ReferenceCursor {
  sort: ReferenceSort | 'created-desc';
  value: string | number | null;
  id: string;
}

function decodeCursor(cursor: string | undefined): ReferenceCursor | { id: string } | null {
  if (!cursor) {
    return null;
  }
  if (/^[a-f\d]{24}$/i.test(cursor)) {
    return { id: cursor };
  }
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as ReferenceCursor;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !mongooseObjectIdPattern.test(parsed.id) ||
      !['created-desc', 'updated-desc', 'title-asc', 'rating-desc'].includes(parsed.sort)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function encodeCursor(sort: ReferenceAssetFilters['sort'], asset: ReferenceAssetRecord): string {
  const normalizedSort = sort ?? 'created-desc';
  let value: string | number | null = null;
  if (normalizedSort === 'updated-desc') {
    value = asset.updatedAt.toISOString();
  } else if (normalizedSort === 'title-asc') {
    value = asset.title;
  } else if (normalizedSort === 'rating-desc') {
    value = asset.rating;
  }
  return Buffer.from(
    JSON.stringify({ sort: normalizedSort, value, id: asset._id.toString() }),
    'utf8',
  ).toString('base64url');
}

const mongooseObjectIdPattern = /^[a-f\d]{24}$/i;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hammingDistance(left: string, right: string): number {
  const length = Math.max(left.length, right.length);
  let distance = 0;
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) {
      distance += 1;
    }
  }
  return distance;
}

function assetView(asset: ReferenceAssetRecord): ReferenceAssetView {
  return {
    id: asset._id.toString(),
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
  const getImportModel = (): Model<IReferenceImport> => mongoose.models.ReferenceImport;
  let transactionSupport: boolean | null = null;

  async function inTransaction<T>(
    operation: (session: ClientSession | null) => Promise<T>,
  ): Promise<T> {
    transactionSupport = await getTransactionSupport(mongoose, transactionSupport);
    if (!transactionSupport) {
      return operation(null);
    }
    const session = await mongoose.startSession();
    try {
      let result: T | undefined;
      await session.withTransaction(async () => {
        result = await operation(session);
      });
      return result as T;
    } finally {
      await session.endSession();
    }
  }

  async function createAsset(
    ownerId: string,
    input: CreateReferenceAssetInput,
  ): Promise<{ asset: ReferenceAssetView; created: boolean }> {
    const ReferenceAsset = getAssetModel();
    const existing = await ReferenceAsset.findOne({
      ownerId,
      exactHash: input.exactHash,
    }).lean<ReferenceAssetRecord>();
    if (existing) {
      return { asset: assetView(existing), created: false };
    }

    try {
      const created = await ReferenceAsset.create({
        ...input,
        ownerId,
        tags: cleanTags(input.tags),
      });
      return { asset: assetView(created.toObject() as ReferenceAssetRecord), created: true };
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
      const raced = await ReferenceAsset.findOne({
        ownerId,
        exactHash: input.exactHash,
      }).lean<ReferenceAssetRecord>();
      if (!raced) {
        throw error;
      }
      return { asset: assetView(raced), created: false };
    }
  }
  async function validateReferenceCollections(
    ownerId: string,
    collectionIds: string[],
  ): Promise<void> {
    const uniqueIds = [...new Set(collectionIds)];
    if (uniqueIds.some((id) => !mongoose.isValidObjectId(id))) {
      throw new Error('One or more reference collections were not found');
    }
    const count = await getCollectionModel().countDocuments({
      _id: { $in: uniqueIds },
      ownerId,
    });
    if (count !== uniqueIds.length) {
      throw new Error('One or more reference collections were not found');
    }
  }

  async function addAssetToCollections(
    ownerId: string,
    assetId: string,
    collectionIds: string[],
    session: ClientSession | null,
  ): Promise<void> {
    const ReferenceCollectionItem = mongoose.models.ReferenceCollectionItem;
    for (const collectionId of [...new Set(collectionIds)]) {
      const exists = await ReferenceCollectionItem.exists({
        ownerId,
        collectionId,
        assetId,
      }).session(session);
      if (exists) {
        continue;
      }
      const last = await ReferenceCollectionItem.findOne({ ownerId, collectionId })
        .sort({ position: -1 })
        .select('position')
        .session(session)
        .lean<{ position: number }>();
      try {
        await ReferenceCollectionItem.create(
          [
            {
              ownerId,
              collectionId,
              assetId,
              position: (last?.position ?? -1) + 1,
              note: '',
            },
          ],
          { session },
        );
      } catch (error) {
        if (
          !isDuplicateKeyError(error) ||
          !(await ReferenceCollectionItem.exists({ ownerId, collectionId, assetId }).session(
            session,
          ))
        ) {
          throw error;
        }
      }
    }
  }

  async function createAssetInCollections(
    ownerId: string,
    input: CreateReferenceAssetInput,
    collectionIds: string[],
  ): Promise<{ asset: ReferenceAssetView; created: boolean }> {
    await validateReferenceCollections(ownerId, collectionIds);
    try {
      return await inTransaction(async (session) => {
        const ReferenceAsset = getAssetModel();
        let record = await ReferenceAsset.findOne({ ownerId, exactHash: input.exactHash })
          .session(session)
          .lean<ReferenceAssetRecord>();
        let created = false;
        if (!record) {
          const [asset] = await ReferenceAsset.create(
            [{ ...input, ownerId, tags: cleanTags(input.tags) }],
            { session },
          );
          record = asset.toObject() as ReferenceAssetRecord;
          created = true;
        }
        await addAssetToCollections(ownerId, record._id.toString(), collectionIds, session);
        return { asset: assetView(record), created };
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
      const raced = await getAssetModel()
        .findOne({ ownerId, exactHash: input.exactHash })
        .lean<ReferenceAssetRecord>();
      if (!raced) {
        throw error;
      }
      await placeAssetInCollections(ownerId, raced._id.toString(), collectionIds, {
        restoreTrashed: true,
      });
      return { asset: assetView(raced), created: false };
    }
  }

  async function placeAssetInCollections(
    ownerId: string,
    assetId: string,
    collectionIds: string[],
    options: { restoreTrashed?: boolean } = {},
  ): Promise<ReferenceAssetView> {
    if (!mongoose.isValidObjectId(assetId)) {
      throw new Error('Reference asset not found');
    }
    await validateReferenceCollections(ownerId, collectionIds);
    return inTransaction(async (session) => {
      const query: FilterQuery<IReferenceAsset> = { _id: assetId, ownerId };
      if (!options.restoreTrashed) {
        query.trashedAt = null;
      }
      const asset = await getAssetModel()
        .findOneAndUpdate(query, options.restoreTrashed ? { $set: { trashedAt: null } } : {}, {
          new: true,
          session,
          runValidators: true,
        })
        .lean<ReferenceAssetRecord>();
      if (!asset) {
        throw new Error('Reference asset not found');
      }
      await addAssetToCollections(ownerId, assetId, collectionIds, session);
      return assetView(asset);
    });
  }

  async function beginReferenceImport(
    ownerId: string,
    idempotencyKey: string,
  ): Promise<{ claimed: boolean; results: unknown[]; completed: boolean }> {
    const ReferenceImport = getImportModel();
    try {
      await ReferenceImport.create({
        ownerId,
        idempotencyKey,
        results: [],
        completed: false,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      return { claimed: true, results: [], completed: false };
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
      const existing = await ReferenceImport.findOne({ ownerId, idempotencyKey }).lean<{
        results: unknown[];
        completed: boolean;
      }>();
      if (!existing) {
        throw error;
      }
      return {
        claimed: false,
        results: existing.results,
        completed: existing.completed,
      };
    }
  }

  async function saveReferenceImportResults(
    ownerId: string,
    idempotencyKey: string,
    results: unknown[],
    completed: boolean,
  ): Promise<void> {
    const updated = await getImportModel().updateOne(
      { ownerId, idempotencyKey },
      {
        $set: {
          results,
          completed,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      },
    );
    if (updated.matchedCount !== 1) {
      throw new Error('Reference import request not found');
    }
  }

  async function findAssetByExactHash(
    ownerId: string,
    exactHash: string,
  ): Promise<ReferenceAssetView | null> {
    const asset = await getAssetModel()
      .findOne({ ownerId, exactHash, trashedAt: null })
      .lean<ReferenceAssetRecord>();
    return asset ? assetView(asset) : null;
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
      .findOneAndUpdate(
        { _id: assetId, ownerId, trashedAt: null },
        { $set: update },
        { new: true, runValidators: true },
      )
      .lean<ReferenceAssetRecord>();
    return asset ? assetView(asset) : null;
  }

  async function listReferenceAssets(
    ownerId: string,
    filters: ReferenceAssetFilters,
  ): Promise<ReferenceAssetRecordPage> {
    const query: FilterQuery<IReferenceAsset> = {
      ownerId,
      trashedAt: filters.trashed ? { $ne: null } : null,
    };
    if (filters.query) {
      const pattern = new RegExp(escapeRegex(filters.query), 'i');
      query.$or = [
        { title: pattern },
        { notes: pattern },
        { altText: pattern },
        { creator: pattern },
        { tags: pattern },
      ];
    }
    if (filters.tags?.length) {
      query.tags = { [filters.tagMatch === 'any' ? '$in' : '$all']: filters.tags };
    }
    if (filters.favorite !== undefined) {
      query.favorite = filters.favorite;
    }
    if (filters.provider) {
      query['source.provider'] = filters.provider;
    }
    if (filters.rightsState) {
      query['source.rightsState'] = filters.rightsState;
    }
    if (filters.orientation) {
      query.orientation = filters.orientation;
    }
    if (filters.rating !== undefined) {
      query.rating = { $gte: filters.rating };
    }
    if (filters.colorLabel) {
      query.colorLabel = filters.colorLabel;
    }
    if (filters.minWidth !== undefined || filters.maxWidth !== undefined) {
      query.width = {
        ...(filters.minWidth !== undefined ? { $gte: filters.minWidth } : {}),
        ...(filters.maxWidth !== undefined ? { $lte: filters.maxWidth } : {}),
      };
    }
    if (filters.minHeight !== undefined || filters.maxHeight !== undefined) {
      query.height = {
        ...(filters.minHeight !== undefined ? { $gte: filters.minHeight } : {}),
        ...(filters.maxHeight !== undefined ? { $lte: filters.maxHeight } : {}),
      };
    }
    if (filters.createdAfter || filters.createdBefore) {
      query.createdAt = {
        ...(filters.createdAfter ? { $gte: new Date(filters.createdAfter) } : {}),
        ...(filters.createdBefore ? { $lte: new Date(filters.createdBefore) } : {}),
      };
    }
    const idFilter: Record<string, unknown> = {};
    if (filters.collectionId && mongoose.isValidObjectId(filters.collectionId)) {
      const memberships = await mongoose.models.ReferenceCollectionItem.find({
        ownerId,
        collectionId: filters.collectionId,
      })
        .select('assetId')
        .lean<Array<{ assetId: Types.ObjectId }>>();
      idFilter.$in = memberships.map(({ assetId }) => assetId);
    }

    const totalFilter: FilterQuery<IReferenceAsset> = { ...query };
    if (Object.keys(idFilter).length > 0) {
      totalFilter._id = { ...idFilter };
    }

    const cursor = decodeCursor(filters.cursor);
    if (cursor && !('sort' in cursor)) {
      idFilter.$lt = cursor.id;
    } else if (cursor && cursor.sort === (filters.sort ?? 'created-desc')) {
      if (cursor.sort === 'created-desc') {
        idFilter.$lt = cursor.id;
      } else {
        let cursorClause: FilterQuery<IReferenceAsset> | null = null;
        if (cursor.sort === 'updated-desc' && typeof cursor.value === 'string') {
          const updatedAt = new Date(cursor.value);
          if (!Number.isNaN(updatedAt.getTime())) {
            cursorClause = {
              $or: [{ updatedAt: { $lt: updatedAt } }, { updatedAt, _id: { $lt: cursor.id } }],
            };
          }
        } else if (cursor.sort === 'title-asc' && typeof cursor.value === 'string') {
          cursorClause = {
            $or: [
              { title: { $gt: cursor.value } },
              { title: cursor.value, _id: { $lt: cursor.id } },
            ],
          };
        } else if (
          cursor.sort === 'rating-desc' &&
          (typeof cursor.value === 'number' || cursor.value === null)
        ) {
          cursorClause =
            cursor.value === null
              ? { rating: null, _id: { $lt: cursor.id } }
              : {
                  $or: [
                    { rating: { $lt: cursor.value } },
                    { rating: null },
                    { rating: cursor.value, _id: { $lt: cursor.id } },
                  ],
                };
        }
        if (cursorClause) {
          query.$and = [...(query.$and ?? []), cursorClause];
        }
      }
    }
    if (Object.keys(idFilter).length > 0) {
      query._id = idFilter;
    }

    const limit = Math.min(100, Math.max(1, filters.limit || 50));
    let sort: Record<string, 1 | -1> = { _id: -1 };
    if (filters.sort === 'updated-desc') {
      sort = { updatedAt: -1, _id: -1 };
    } else if (filters.sort === 'title-asc') {
      sort = { title: 1, _id: -1 };
    } else if (filters.sort === 'rating-desc') {
      sort = { rating: -1, _id: -1 };
    }
    const [records, total] = await Promise.all([
      getAssetModel()
        .find(query)
        .sort(sort)
        .limit(limit + 1)
        .lean<ReferenceAssetRecord[]>(),
      getAssetModel().countDocuments(totalFilter),
    ]);
    const hasMore = records.length > limit;
    const pageRecords = records.slice(0, limit);
    return {
      items: pageRecords.map(assetView),
      nextCursor:
        hasMore && pageRecords.length > 0
          ? encodeCursor(filters.sort, pageRecords[pageRecords.length - 1])
          : null,
      total,
    };
  }

  async function bulkUpdateReferenceAssets(
    ownerId: string,
    assetIds: string[],
    patch: ReferenceAssetPatch,
  ): Promise<ReferenceAssetView[]> {
    const uniqueIds = [...new Set(assetIds)];
    const ids = uniqueIds.filter((assetId) => mongoose.isValidObjectId(assetId));
    if (ids.length !== uniqueIds.length) {
      throw new Error('One or more reference assets are invalid');
    }
    const ReferenceAsset = getAssetModel();
    const ownedCount = await ReferenceAsset.countDocuments({
      _id: { $in: ids },
      ownerId,
      trashedAt: null,
    });
    if (ownedCount !== ids.length) {
      throw new Error('One or more reference assets were not found');
    }
    const update: ReferenceAssetPatch = {
      ...patch,
      ...(patch.tags ? { tags: cleanTags(patch.tags) } : {}),
    };
    const result = await ReferenceAsset.updateMany(
      { _id: { $in: ids }, ownerId, trashedAt: null },
      { $set: update },
      { runValidators: true },
    );
    if (result.matchedCount !== ids.length) {
      throw new Error('One or more reference assets were not found');
    }
    const records = await ReferenceAsset.find({
      _id: { $in: ids },
      ownerId,
      trashedAt: null,
    }).lean<ReferenceAssetRecord[]>();
    const byId = new Map(records.map((record) => [record._id.toString(), assetView(record)]));
    return ids
      .map((id) => byId.get(id))
      .filter((asset): asset is ReferenceAssetView => asset !== undefined);
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
    const uniqueIds = [...new Set(assetIds)];
    if (uniqueIds.some((id) => !mongoose.isValidObjectId(id))) {
      throw new Error('One or more collection assets are invalid');
    }
    const owned = await getAssetModel()
      .find({ _id: { $in: uniqueIds }, ownerId, trashedAt: null })
      .select('_id')
      .lean<Array<{ _id: Types.ObjectId }>>();
    if (owned.length !== uniqueIds.length) {
      throw new Error('One or more collection assets were not found');
    }
    const ReferenceCollectionItem = mongoose.models.ReferenceCollectionItem;
    await inTransaction(async (session) => {
      await ReferenceCollectionItem.deleteMany({ ownerId, collectionId }, { session });
      if (uniqueIds.length > 0) {
        await ReferenceCollectionItem.insertMany(
          uniqueIds.map((assetId, position) => ({
            ownerId,
            collectionId,
            assetId,
            position,
            note: '',
          })),
          { session },
        );
      }
    });
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

  async function getReferenceAssetCollectionIds(
    ownerId: string,
    assetIds: string[],
  ): Promise<Record<string, string[]>> {
    const ids = assetIds.filter((assetId) => mongoose.isValidObjectId(assetId));
    const memberships = await mongoose.models.ReferenceCollectionItem.find({
      ownerId,
      assetId: { $in: ids },
    })
      .sort({ position: 1 })
      .select('assetId collectionId')
      .lean<Array<{ assetId: Types.ObjectId; collectionId: Types.ObjectId }>>();
    const result: Record<string, string[]> = {};
    for (const { assetId, collectionId } of memberships) {
      (result[assetId.toString()] ??= []).push(collectionId.toString());
    }
    return result;
  }

  async function listReferenceCollections(ownerId: string): Promise<ReferenceCollectionSummary[]> {
    const [collections, counts] = await Promise.all([
      getCollectionModel().find({ ownerId }).sort({ updatedAt: -1 }).lean<CollectionRecord[]>(),
      mongoose.models.ReferenceCollectionItem.aggregate<{
        _id: Types.ObjectId;
        assetCount: number;
      }>([{ $match: { ownerId } }, { $group: { _id: '$collectionId', assetCount: { $sum: 1 } } }]),
    ]);
    const countById = new Map(counts.map(({ _id, assetCount }) => [_id.toString(), assetCount]));
    return collections.map((collection) => ({
      ...collectionView(collection),
      assetCount: countById.get(collection._id.toString()) || 0,
    }));
  }

  async function updateReferenceCollection(
    ownerId: string,
    collectionId: string,
    patch: Partial<{ name: string; description: string; coverAssetId: string | null }>,
  ): Promise<ReferenceCollectionView | null> {
    if (!mongoose.isValidObjectId(collectionId)) {
      return null;
    }
    const update: Record<string, string | null> = {};
    if (typeof patch.name === 'string') {
      update.name = patch.name;
    }
    if (typeof patch.description === 'string') {
      update.description = patch.description;
    }
    if (patch.coverAssetId === null) {
      update.coverAssetId = null;
    } else if (typeof patch.coverAssetId === 'string') {
      if (
        !mongoose.isValidObjectId(patch.coverAssetId) ||
        !(await getAssetModel().exists({
          _id: patch.coverAssetId,
          ownerId,
          trashedAt: null,
        }))
      ) {
        throw new Error('Cover asset not found');
      }
      update.coverAssetId = patch.coverAssetId;
    }
    const collection = await getCollectionModel()
      .findOneAndUpdate(
        { _id: collectionId, ownerId },
        { $set: update },
        { new: true, runValidators: true },
      )
      .lean<CollectionRecord>();
    return collection ? collectionView(collection) : null;
  }

  async function listReferenceTags(ownerId: string): Promise<ReferenceTagSummary[]> {
    const tags = await getAssetModel().aggregate<{ _id: string; assetCount: number }>([
      { $match: { ownerId, trashedAt: null } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', assetCount: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);
    return tags.map(({ _id, assetCount }) => ({ name: _id, assetCount }));
  }

  async function createReferenceSavedFilter(
    ownerId: string,
    name: string,
    filter: ReferenceAssetFilters,
  ): Promise<ReferenceSavedFilterView> {
    const supportedFields = new Set([
      'query',
      'tags',
      'tagMatch',
      'collectionId',
      'favorite',
      'rating',
      'minWidth',
      'maxWidth',
      'minHeight',
      'maxHeight',
      'colorLabel',
      'provider',
      'rightsState',
      'orientation',
      'createdAfter',
      'createdBefore',
      'trashed',
      'sort',
      'limit',
    ]);
    const unsupported = Object.keys(filter).filter((field) => !supportedFields.has(field));
    if (unsupported.length > 0) {
      throw new Error(`Unsupported saved filter fields: ${unsupported.join(', ')}`);
    }
    const saved = await mongoose.models.ReferenceSavedFilter.create({
      ownerId,
      name,
      version: 1,
      filter,
    });
    const record = saved.toObject() as {
      _id: Types.ObjectId;
      name: string;
      version: number;
      filter: ReferenceAssetFilters;
      createdAt: Date;
      updatedAt: Date;
    };
    return {
      id: record._id.toString(),
      name: record.name,
      version: record.version,
      filter: record.filter,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  async function listReferenceSavedFilters(ownerId: string): Promise<ReferenceSavedFilterView[]> {
    const records = await mongoose.models.ReferenceSavedFilter.find({ ownerId })
      .sort({ name: 1 })
      .lean<
        Array<{
          _id: Types.ObjectId;
          name: string;
          version: number;
          filter: ReferenceAssetFilters;
          createdAt: Date;
          updatedAt: Date;
        }>
      >();
    return records.map((record) => ({
      id: record._id.toString(),
      name: record.name,
      version: record.version,
      filter: record.filter,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    }));
  }

  async function findReferenceDuplicates(ownerId: string): Promise<ReferenceDuplicateGroup[]> {
    const assets = await getAssetModel()
      .find({ ownerId, trashedAt: null, perceptualHash: { $ne: '' } })
      .sort({ _id: 1 })
      .lean<ReferenceAssetRecord[]>();
    const claimed = new Set<string>();
    const groups: ReferenceDuplicateGroup[] = [];
    for (let leftIndex = 0; leftIndex < assets.length; leftIndex += 1) {
      const left = assets[leftIndex];
      const leftId = left._id.toString();
      if (claimed.has(leftId)) {
        continue;
      }
      const assetIds = [leftId];
      let shortestDistance = Number.POSITIVE_INFINITY;
      for (let rightIndex = leftIndex + 1; rightIndex < assets.length; rightIndex += 1) {
        const right = assets[rightIndex];
        const rightId = right._id.toString();
        if (claimed.has(rightId)) {
          continue;
        }
        const distance = hammingDistance(left.perceptualHash, right.perceptualHash);
        if (distance <= 4) {
          assetIds.push(rightId);
          claimed.add(rightId);
          shortestDistance = Math.min(shortestDistance, distance);
        }
      }
      if (assetIds.length > 1) {
        claimed.add(leftId);
        groups.push({
          exact: false,
          distance: shortestDistance,
          assetIds,
        });
      }
    }
    return groups;
  }

  async function trashAssets(
    ownerId: string,
    assetIds: string[],
    now = new Date(),
  ): Promise<number> {
    const ids = assetIds.filter((id) => mongoose.isValidObjectId(id));
    const result = await getAssetModel().updateMany(
      { _id: { $in: ids }, ownerId, trashedAt: null },
      { $set: { trashedAt: now } },
    );
    return result.modifiedCount;
  }

  async function deleteTrashedReferenceAssets(
    ownerId: string,
    assetIds: string[],
    cutoff = new Date(),
  ): Promise<ReferenceAssetView[]> {
    const ids = assetIds.filter((assetId) => mongoose.isValidObjectId(assetId));
    return inTransaction(async (session) => {
      const records = await getAssetModel()
        .find({ _id: { $in: ids }, ownerId, trashedAt: { $ne: null, $lte: cutoff } })
        .session(session)
        .lean<ReferenceAssetRecord[]>();
      if (records.length === 0) {
        return [];
      }
      const recordIds = records.map(({ _id }) => _id);
      await mongoose.models.ReferenceCollectionItem.deleteMany(
        { ownerId, assetId: { $in: recordIds } },
        { session },
      );
      const deleted = await getAssetModel().deleteMany(
        { _id: { $in: recordIds }, ownerId, trashedAt: { $ne: null, $lte: cutoff } },
        { session },
      );
      if (deleted.deletedCount !== records.length) {
        throw new Error('One or more reference assets are no longer purgeable');
      }
      return records.map(assetView);
    });
  }
  async function deleteReferenceLibrary(ownerId: string): Promise<void> {
    await inTransaction(async (session) => {
      await mongoose.models.ReferenceCollectionItem.deleteMany({ ownerId }, { session });
      await Promise.all([
        mongoose.models.ReferenceTag.deleteMany({ ownerId }, { session }),
        mongoose.models.ReferenceSavedFilter.deleteMany({ ownerId }, { session }),
        mongoose.models.ReferenceImport.deleteMany({ ownerId }, { session }),
        getCollectionModel().deleteMany({ ownerId }, { session }),
        getAssetModel().deleteMany({ ownerId }, { session }),
      ]);
    });
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
    createAssetInCollections,
    placeAssetInCollections,
    validateReferenceCollections,
    beginReferenceImport,
    saveReferenceImportResults,
    findAssetByExactHash,
    getAsset,
    updateAsset,
    listReferenceAssets,
    bulkUpdateReferenceAssets,
    createCollection,
    setCollectionAssets,
    getCollectionAssets,
    listReferenceCollections,
    updateReferenceCollection,
    listReferenceTags,
    createReferenceSavedFilter,
    listReferenceSavedFilters,
    findReferenceDuplicates,
    trashAssets,
    getReferenceAssetCollectionIds,
    restoreAssets,
    getPurgeCandidates,
    deleteTrashedReferenceAssets,
    deleteReferenceLibrary,
  };
}
