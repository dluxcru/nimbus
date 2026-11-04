import type { Document, Types } from 'mongoose';
import type {
  ReferenceAssetFilters,
  ReferenceAssetPatch,
  ReferenceDuplicateGroup,
  ReferenceRightsState,
  ReferenceProvider,
} from 'librechat-data-provider';

export interface IReferenceSource {
  kind: 'provider' | 'upload' | 'librechat-file';
  provider?: ReferenceProvider;
  providerAssetId?: string;
  sourcePageUrl?: string;
  originalUrl?: string;
  creator?: string;
  creatorUrl?: string;
  licenseName?: string;
  licenseUrl?: string;
  rightsState: ReferenceRightsState;
}

export interface IReferenceAsset extends Document {
  ownerId: string;
  fileId: string;
  title: string;
  notes: string;
  altText: string;
  tags: string[];
  favorite: boolean;
  rating: number | null;
  colorLabel: string | null;
  width: number;
  height: number;
  orientation: 'square' | 'landscape' | 'portrait';
  mimeType: string;
  bytes: number;
  source: IReferenceSource;
  exactHash: string;
  perceptualHash: string;
  sanitizationVersion: number;
  trashedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ReferenceAssetRecord = Omit<IReferenceAsset, keyof Document | '_id'> & {
  _id: Types.ObjectId;
};

export interface IReferenceCollection extends Document {
  ownerId: string;
  name: string;
  description: string;
  coverAssetId: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IReferenceCollectionItem extends Document {
  ownerId: string;
  collectionId: Types.ObjectId;
  assetId: Types.ObjectId;
  position: number;
  note: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IReferenceTag extends Document {
  ownerId: string;
  name: string;
  normalizedName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IReferenceSavedFilter extends Document {
  ownerId: string;
  name: string;
  version: number;
  filter: ReferenceAssetFilters;
  createdAt: Date;
  updatedAt: Date;
}
export interface IReferenceImport extends Document {
  ownerId: string;
  idempotencyKey: string;
  results: unknown[];
  completed: boolean;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateReferenceAssetInput {
  fileId: string;
  title: string;
  notes: string;
  altText: string;
  tags: string[];
  favorite: boolean;
  rating: number | null;
  colorLabel: string | null;
  width: number;
  height: number;
  orientation: IReferenceAsset['orientation'];
  mimeType: string;
  bytes: number;
  source: IReferenceSource;
  exactHash: string;
  perceptualHash: string;
  sanitizationVersion: number;
}

export interface ReferenceAssetView extends Omit<CreateReferenceAssetInput, 'source'> {
  id: string;
  source: IReferenceSource;
  trashedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReferenceCollectionView {
  id: string;
  name: string;
  description: string;
  coverAssetId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReferenceAssetRecordPage {
  items: ReferenceAssetView[];
  nextCursor: string | null;
  total: number;
}

export interface ReferenceCollectionSummary extends ReferenceCollectionView {
  assetCount: number;
}

export interface ReferenceTagSummary {
  name: string;
  assetCount: number;
}

export interface ReferenceSavedFilterView {
  id: string;
  name: string;
  version: number;
  filter: ReferenceAssetFilters;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReferenceLibraryMethods {
  createAsset(
    ownerId: string,
    input: CreateReferenceAssetInput,
  ): Promise<{ asset: ReferenceAssetView; created: boolean }>;
  createAssetInCollections(
    ownerId: string,
    input: CreateReferenceAssetInput,
    collectionIds: string[],
  ): Promise<{ asset: ReferenceAssetView; created: boolean }>;
  placeAssetInCollections(
    ownerId: string,
    assetId: string,
    collectionIds: string[],
    options?: { restoreTrashed?: boolean },
  ): Promise<ReferenceAssetView>;
  validateReferenceCollections(ownerId: string, collectionIds: string[]): Promise<void>;
  beginReferenceImport(
    ownerId: string,
    idempotencyKey: string,
  ): Promise<{ claimed: boolean; results: unknown[]; completed: boolean }>;
  saveReferenceImportResults(
    ownerId: string,
    idempotencyKey: string,
    results: unknown[],
    completed: boolean,
  ): Promise<void>;
  findAssetByExactHash(ownerId: string, exactHash: string): Promise<ReferenceAssetView | null>;
  getAsset(
    ownerId: string,
    assetId: string,
    includeTrashed?: boolean,
  ): Promise<ReferenceAssetView | null>;
  updateAsset(
    ownerId: string,
    assetId: string,
    patch: ReferenceAssetPatch,
  ): Promise<ReferenceAssetView | null>;
  listReferenceAssets(
    ownerId: string,
    filters: ReferenceAssetFilters,
  ): Promise<ReferenceAssetRecordPage>;
  bulkUpdateReferenceAssets(
    ownerId: string,
    assetIds: string[],
    patch: ReferenceAssetPatch,
  ): Promise<ReferenceAssetView[]>;
  createCollection(
    ownerId: string,
    input: { name: string; description: string },
  ): Promise<ReferenceCollectionView>;
  setCollectionAssets(ownerId: string, collectionId: string, assetIds: string[]): Promise<void>;
  getCollectionAssets(ownerId: string, collectionId: string): Promise<ReferenceAssetView[]>;
  trashAssets(ownerId: string, assetIds: string[], now?: Date): Promise<number>;
  restoreAssets(ownerId: string, assetIds: string[]): Promise<number>;
  getPurgeCandidates(ownerId: string, cutoff: Date): Promise<ReferenceAssetView[]>;
  listReferenceCollections(ownerId: string): Promise<ReferenceCollectionSummary[]>;
  updateReferenceCollection(
    ownerId: string,
    collectionId: string,
    patch: Partial<{ name: string; description: string; coverAssetId: string | null }>,
  ): Promise<ReferenceCollectionView | null>;
  listReferenceTags(ownerId: string): Promise<ReferenceTagSummary[]>;
  createReferenceSavedFilter(
    ownerId: string,
    name: string,
    filter: ReferenceAssetFilters,
  ): Promise<ReferenceSavedFilterView>;
  listReferenceSavedFilters(ownerId: string): Promise<ReferenceSavedFilterView[]>;
  findReferenceDuplicates(ownerId: string): Promise<ReferenceDuplicateGroup[]>;
  getReferenceAssetCollectionIds(
    ownerId: string,
    assetIds: string[],
  ): Promise<Record<string, string[]>>;
  deleteTrashedReferenceAssets(
    ownerId: string,
    assetIds: string[],
    cutoff?: Date,
  ): Promise<ReferenceAssetView[]>;
  deleteReferenceLibrary(ownerId: string): Promise<void>;
}
