import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type {
  ReferenceAsset,
  ReferenceCollection,
  ReferenceSavedFilter,
  ReferenceAssetPatch,
  ReferenceImportRequest,
  ReferenceImportResponse,
  ReferenceSearchRequest,
  ReferenceSearchResponse,
  ReferenceSaveResponse,
} from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';

function useInvalidateLibrary() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries([QueryKeys.referenceLibrary]);
}

export function useSearchReferenceImages(): UseMutationResult<
  ReferenceSearchResponse,
  unknown,
  ReferenceSearchRequest
> {
  return useMutation([QueryKeys.referenceLibrary, 'search'], {
    mutationFn: dataService.searchReferenceProviders,
  });
}

export function useImportReferenceImages(): UseMutationResult<
  ReferenceImportResponse,
  unknown,
  ReferenceImportRequest
> {
  const invalidate = useInvalidateLibrary();
  return useMutation([QueryKeys.referenceLibrary, 'imports'], {
    mutationFn: dataService.importReferenceAssets,
    onSuccess: invalidate,
  });
}

export function useUpdateReferenceAsset(): UseMutationResult<
  ReferenceAsset,
  unknown,
  { assetId: string; patch: ReferenceAssetPatch }
> {
  const invalidate = useInvalidateLibrary();
  return useMutation([QueryKeys.referenceLibrary, 'update'], {
    mutationFn: ({ assetId, patch }) => dataService.updateReferenceAsset(assetId, patch),
    onSuccess: invalidate,
  });
}

export function useBulkUpdateReferenceAssets(): UseMutationResult<
  ReferenceAsset[],
  unknown,
  { assetIds: string[]; patch: ReferenceAssetPatch }
> {
  const invalidate = useInvalidateLibrary();
  return useMutation([QueryKeys.referenceLibrary, 'bulk-update'], {
    mutationFn: ({ assetIds, patch }) =>
      dataService.bulkUpdateReferenceAssets({ assetIds, patch }).then(({ items }) => items),
    onSuccess: invalidate,
  });
}

export function useTrashReferenceAssets(): UseMutationResult<
  { modified: number },
  unknown,
  string[]
> {
  const invalidate = useInvalidateLibrary();
  return useMutation([QueryKeys.referenceLibrary, 'trash'], {
    mutationFn: dataService.trashReferenceAssets,
    onSuccess: invalidate,
  });
}

export function useRestoreReferenceAssets(): UseMutationResult<
  { modified: number },
  unknown,
  string[]
> {
  const invalidate = useInvalidateLibrary();
  return useMutation([QueryKeys.referenceLibrary, 'restore'], {
    mutationFn: dataService.restoreReferenceAssets,
    onSuccess: invalidate,
  });
}

export function useSaveReferenceImage(): UseMutationResult<
  ReferenceSaveResponse,
  unknown,
  { fileId: string; title?: string }
> {
  const invalidate = useInvalidateLibrary();
  return useMutation([QueryKeys.referenceLibrary, 'save-existing'], {
    mutationFn: dataService.saveExistingReferenceImage,
    onSuccess: invalidate,
  });
}

export function useCreateReferenceCollection(): UseMutationResult<
  ReferenceCollection,
  unknown,
  Pick<ReferenceCollection, 'name' | 'description'>
> {
  const invalidate = useInvalidateLibrary();
  return useMutation([QueryKeys.referenceLibrary, 'create-collection'], {
    mutationFn: dataService.createReferenceCollection,
    onSuccess: invalidate,
  });
}

export function useUpdateReferenceCollection(): UseMutationResult<
  ReferenceCollection,
  unknown,
  {
    collectionId: string;
    patch: Partial<Pick<ReferenceCollection, 'name' | 'description' | 'coverAssetId'>>;
  }
> {
  const invalidate = useInvalidateLibrary();
  return useMutation([QueryKeys.referenceLibrary, 'update-collection'], {
    mutationFn: ({ collectionId, patch }) =>
      dataService.updateReferenceCollection(collectionId, patch),
    onSuccess: invalidate,
  });
}

export function useSetReferenceCollectionAssets(): UseMutationResult<
  { ok: boolean },
  unknown,
  { collectionId: string; assetIds: string[] }
> {
  const invalidate = useInvalidateLibrary();
  return useMutation([QueryKeys.referenceLibrary, 'set-collection-assets'], {
    mutationFn: ({ collectionId, assetIds }) =>
      dataService.setReferenceCollectionAssets(collectionId, assetIds),
    onSuccess: invalidate,
  });
}

export function useCreateReferenceSavedFilter(): UseMutationResult<
  ReferenceSavedFilter,
  unknown,
  Pick<ReferenceSavedFilter, 'name' | 'filter'>
> {
  const invalidate = useInvalidateLibrary();
  return useMutation([QueryKeys.referenceLibrary, 'create-saved-filter'], {
    mutationFn: dataService.createReferenceSavedFilter,
    onSuccess: invalidate,
  });
}
