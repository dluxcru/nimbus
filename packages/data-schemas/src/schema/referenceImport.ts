import { Schema } from 'mongoose';
import type { IReferenceImport } from '~/types/referenceLibrary';

const referenceImportSchema: Schema<IReferenceImport> = new Schema<IReferenceImport>(
  {
    ownerId: { type: String, required: true, index: true },
    idempotencyKey: { type: String, required: true, maxlength: 256 },
    results: { type: [Schema.Types.Mixed], required: true, default: [] },
    completed: { type: Boolean, required: true, default: false },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

referenceImportSchema.index({ ownerId: 1, idempotencyKey: 1 }, { unique: true });
referenceImportSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default referenceImportSchema;
