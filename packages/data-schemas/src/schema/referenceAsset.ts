import { Schema } from 'mongoose';
import type { IReferenceAsset } from '~/types/referenceLibrary';

const sourceSchema = new Schema(
  {
    kind: { type: String, enum: ['provider', 'upload', 'librechat-file'], required: true },
    provider: { type: String, enum: ['google', 'wikimedia', 'pexels'] },
    providerAssetId: { type: String, maxlength: 512 },
    sourcePageUrl: { type: String, maxlength: 4096 },
    originalUrl: { type: String, maxlength: 4096 },
    creator: { type: String, maxlength: 512 },
    creatorUrl: { type: String, maxlength: 4096 },
    licenseName: { type: String, maxlength: 512 },
    licenseUrl: { type: String, maxlength: 4096 },
    rightsState: { type: String, enum: ['known', 'unknown'], required: true },
  },
  { _id: false },
);

const referenceAssetSchema: Schema<IReferenceAsset> = new Schema<IReferenceAsset>(
  {
    ownerId: { type: String, required: true, index: true },
    fileId: { type: String, required: true },
    title: { type: String, required: true, trim: true, maxlength: 512 },
    notes: { type: String, default: '', maxlength: 20_000 },
    altText: { type: String, default: '', maxlength: 2_000 },
    tags: { type: [String], default: [] },
    favorite: { type: Boolean, default: false },
    rating: { type: Number, min: 1, max: 5, default: null },
    colorLabel: { type: String, maxlength: 64, default: null },
    width: { type: Number, required: true, min: 1 },
    height: { type: Number, required: true, min: 1 },
    orientation: { type: String, enum: ['square', 'landscape', 'portrait'], required: true },
    mimeType: { type: String, required: true, maxlength: 128 },
    bytes: { type: Number, required: true, min: 1 },
    source: { type: sourceSchema, required: true },
    exactHash: { type: String, required: true, minlength: 3, maxlength: 128 },
    perceptualHash: { type: String, required: true, minlength: 16, maxlength: 128 },
    sanitizationVersion: { type: Number, required: true, min: 1 },
    trashedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

referenceAssetSchema.index({ ownerId: 1, exactHash: 1 }, { unique: true });
referenceAssetSchema.index({ ownerId: 1, updatedAt: -1, _id: -1 });
referenceAssetSchema.index({ ownerId: 1, trashedAt: 1 });
referenceAssetSchema.index({ ownerId: 1, perceptualHash: 1 });
referenceAssetSchema.index({ title: 'text', notes: 'text', altText: 'text', tags: 'text' });

export default referenceAssetSchema;
