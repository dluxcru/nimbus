import { Schema } from 'mongoose';
import type { IReferenceSavedFilter, IReferenceTag } from '~/types/referenceLibrary';

export const referenceTagSchema: Schema<IReferenceTag> = new Schema<IReferenceTag>(
  {
    ownerId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 128 },
    normalizedName: { type: String, required: true, maxlength: 128 },
  },
  { timestamps: true },
);
referenceTagSchema.index({ ownerId: 1, normalizedName: 1 }, { unique: true });

export const referenceSavedFilterSchema: Schema<IReferenceSavedFilter> =
  new Schema<IReferenceSavedFilter>(
  {
    ownerId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 256 },
    version: { type: Number, required: true, min: 1, default: 1 },
    filter: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);
referenceSavedFilterSchema.index({ ownerId: 1, name: 1 });
