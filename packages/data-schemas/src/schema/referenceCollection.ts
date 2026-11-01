import { Schema } from 'mongoose';
import type {
  IReferenceCollection,
  IReferenceCollectionItem,
} from '~/types/referenceLibrary';

export const referenceCollectionSchema: Schema<IReferenceCollection> =
  new Schema<IReferenceCollection>(
  {
    ownerId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 256 },
    description: { type: String, default: '', maxlength: 4_000 },
    coverAssetId: { type: Schema.Types.ObjectId, ref: 'ReferenceAsset', default: null },
  },
  { timestamps: true },
);
referenceCollectionSchema.index({ ownerId: 1, name: 1 });

export const referenceCollectionItemSchema: Schema<IReferenceCollectionItem> =
  new Schema<IReferenceCollectionItem>(
  {
    ownerId: { type: String, required: true, index: true },
    collectionId: { type: Schema.Types.ObjectId, ref: 'ReferenceCollection', required: true },
    assetId: { type: Schema.Types.ObjectId, ref: 'ReferenceAsset', required: true },
    position: { type: Number, required: true, min: 0 },
    note: { type: String, default: '', maxlength: 2_000 },
  },
  { timestamps: true },
);
referenceCollectionItemSchema.index(
  { ownerId: 1, collectionId: 1, assetId: 1 },
  { unique: true },
);
referenceCollectionItemSchema.index({ ownerId: 1, collectionId: 1, position: 1 });
