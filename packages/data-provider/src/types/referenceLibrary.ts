import type { TFile } from './files';

export const REFERENCE_PROVIDERS = ['google', 'wikimedia', 'pexels'] as const;
export type ReferenceProvider = (typeof REFERENCE_PROVIDERS)[number];
export type ReferenceRightsState = 'known' | 'unknown';
export type ReferenceSort = 'updated-desc' | 'created-desc' | 'title-asc' | 'rating-desc';

export interface ReferenceSource {
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

export interface ReferenceAsset {
  id: string;
  fileId: string;
  file: TFile;
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
  source: ReferenceSource;
  collectionIds: string[];
  exactHash: string;
  perceptualHash: string;
  sanitizationVersion: number;
  createdAt: string;
  updatedAt: string;
  trashedAt: string | null;
}

export interface ReferenceCollection {
  id: string;
  name: string;
  description: string;
  coverAssetId: string | null;
  assetCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ReferenceTag {
  id: string;
  name: string;
  assetCount: number;
}

export interface ReferenceAssetFilters {
  query?: string;
  tags?: string[];
  collectionId?: string;
  favorite?: boolean;
  rating?: number;
  colorLabel?: string;
  provider?: ReferenceProvider;
  rightsState?: ReferenceRightsState;
  orientation?: ReferenceAsset['orientation'];
  createdAfter?: string;
  createdBefore?: string;
  trashed?: boolean;
  sort?: ReferenceSort;
  cursor?: string;
  limit?: number;
}

export interface ReferenceAssetPage {
  items: ReferenceAsset[];
  nextCursor: string | null;
  total: number;
}

export interface ReferenceProviderResult {
  provider: ReferenceProvider;
  providerAssetId: string;
  title: string;
  thumbnailUrl: string;
  width?: number;
  height?: number;
  sourcePageUrl: string;
  creator?: string;
  creatorUrl?: string;
  licenseName?: string;
  licenseUrl?: string;
  rightsState: ReferenceRightsState;
  importToken: string;
}

export interface ReferenceProviderSearchResult {
  provider: ReferenceProvider;
  items: ReferenceProviderResult[];
  nextCursor: string | null;
  error?: { code: string; message: string; retryAfter?: number };
}

export interface ReferenceSearchResponse {
  results: ReferenceProviderSearchResult[];
}

export interface ReferenceSearchRequest {
  query: string;
  providers?: ReferenceProvider[];
  cursor?: Partial<Record<ReferenceProvider, string>>;
}

export interface ReferenceImportItem {
  importToken: string;
  title?: string;
  collectionIds?: string[];
  tags?: string[];
  acknowledgeUnknownRights?: boolean;
}

export interface ReferenceImportRequest {
  items: ReferenceImportItem[];
  idempotencyKey: string;
}

export interface ReferenceImportResult {
  importToken: string;
  ok: boolean;
  asset?: ReferenceAsset;
  reused?: boolean;
  error?: { code: string; message: string };
}

export interface ReferenceImportResponse {
  results: ReferenceImportResult[];
}

export interface ReferenceAssetPatch {
  title?: string;
  notes?: string;
  altText?: string;
  favorite?: boolean;
  rating?: number | null;
  colorLabel?: string | null;
  tags?: string[];
  collectionIds?: string[];
}

export interface ReferenceBulkPatchRequest {
  assetIds: string[];
  patch: ReferenceAssetPatch;
}

export interface ReferenceDuplicateGroup {
  exact: boolean;
  assetIds: string[];
  distance?: number;
}

export interface ReferenceSavedFilter {
  id: string;
  name: string;
  version: number;
  filter: ReferenceAssetFilters;
  createdAt: string;
  updatedAt: string;
}

export interface ReferenceComposerItem {
  assetId: string;
  fileId: string;
  title: string;
  purpose?: string;
  position: number;
}

export interface ReferenceLibraryCapabilities {
  enabled: boolean;
  providers: Record<ReferenceProvider, boolean>;
  maxBatchSize: number;
  trashRetentionDays: number;
}
