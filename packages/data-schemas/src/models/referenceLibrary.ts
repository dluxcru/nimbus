import { Model } from 'mongoose';
import type {
  IReferenceAsset,
  IReferenceCollection,
  IReferenceCollectionItem,
  IReferenceSavedFilter,
  IReferenceTag,
  IReferenceImport,
} from '~/types/referenceLibrary';
import referenceAssetSchema from '~/schema/referenceAsset';
import {
  referenceCollectionItemSchema,
  referenceCollectionSchema,
} from '~/schema/referenceCollection';
import { referenceSavedFilterSchema, referenceTagSchema } from '~/schema/referenceTag';
import referenceImportSchema from '~/schema/referenceImport';

export function createReferenceAssetModel(
  mongoose: typeof import('mongoose'),
): Model<IReferenceAsset> {
  return (
    mongoose.models.ReferenceAsset ||
    mongoose.model<IReferenceAsset>('ReferenceAsset', referenceAssetSchema)
  );
}

export function createReferenceCollectionModel(
  mongoose: typeof import('mongoose'),
): Model<IReferenceCollection> {
  return (
    mongoose.models.ReferenceCollection ||
    mongoose.model<IReferenceCollection>('ReferenceCollection', referenceCollectionSchema)
  );
}

export function createReferenceCollectionItemModel(
  mongoose: typeof import('mongoose'),
): Model<IReferenceCollectionItem> {
  return (
    mongoose.models.ReferenceCollectionItem ||
    mongoose.model<IReferenceCollectionItem>(
      'ReferenceCollectionItem',
      referenceCollectionItemSchema,
    )
  );
}

export function createReferenceTagModel(mongoose: typeof import('mongoose')): Model<IReferenceTag> {
  return (
    mongoose.models.ReferenceTag ||
    mongoose.model<IReferenceTag>('ReferenceTag', referenceTagSchema)
  );
}

export function createReferenceSavedFilterModel(
  mongoose: typeof import('mongoose'),
): Model<IReferenceSavedFilter> {
  return (
    mongoose.models.ReferenceSavedFilter ||
    mongoose.model<IReferenceSavedFilter>('ReferenceSavedFilter', referenceSavedFilterSchema)
  );
}
export function createReferenceImportModel(
  mongoose: typeof import('mongoose'),
): Model<IReferenceImport> {
  return (
    mongoose.models.ReferenceImport ||
    mongoose.model<IReferenceImport>('ReferenceImport', referenceImportSchema)
  );
}
