import type { Document, Types } from 'mongoose';
import type {
  ReferenceAssetFilters,
  ReferenceAssetPatch,
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
  ownerId: string;
  source: IReferenceSource;
  trashedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReferenceCollectionView {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  coverAssetId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReferenceLibraryMethods {
  createAsset(
    ownerId: string,
    input: CreateReferenceAssetInput,
  ): Promise<{ asset: ReferenceAssetView; created: boolean }>;
  getAsset(ownerId: string, assetId: string, includeTrashed?: boolean): Promise<ReferenceAssetView | null>;
  updateAsset(
    ownerId: string,
    assetId: string,
    patch: ReferenceAssetPatch,
  ): Promise<ReferenceAssetView | null>;
  createCollection(
    ownerId: string,
    input: { name: string; description: string },
  ): Promise<ReferenceCollectionView>;
  setCollectionAssets(ownerId: string, collectionId: string, assetIds: string[]): Promise<void>;
  getCollectionAssets(ownerId: string, collectionId: string): Promise<ReferenceAssetView[]>;
  trashAssets(ownerId: string, assetIds: string[], now?: Date): Promise<number>;
  restoreAssets(ownerId: string, assetIds: string[]): Promise<number>;
  getPurgeCandidates(ownerId: string, cutoff: Date): Promise<ReferenceAssetView[]>;
}
