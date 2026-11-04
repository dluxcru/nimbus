import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { DynamicQueryKeys, QueryKeys, dataService } from 'librechat-data-provider';
import type {
  ReferenceAsset,
  ReferenceAssetFilters,
  ReferenceAssetPage,
  ReferenceCollection,
  ReferenceDuplicateGroup,
  ReferenceLibraryCapabilities,
  ReferenceSavedFilter,
  ReferenceTag,
} from 'librechat-data-provider';
import type {
  QueryObserverResult,
  UseInfiniteQueryOptions,
  UseQueryOptions,
} from '@tanstack/react-query';

export function useReferenceLibraryCapabilities(
  config?: UseQueryOptions<ReferenceLibraryCapabilities>,
): QueryObserverResult<ReferenceLibraryCapabilities> {
  return useQuery<ReferenceLibraryCapabilities>(
    [QueryKeys.referenceLibrary, 'capabilities'],
    () => dataService.getReferenceLibraryCapabilities(),
    { refetchOnWindowFocus: false, ...config },
  );
}

export function useReferenceLibraryAssets(
  filters: ReferenceAssetFilters,
  config?: UseQueryOptions<ReferenceAssetPage>,
): QueryObserverResult<ReferenceAssetPage> {
  return useQuery<ReferenceAssetPage>(
    DynamicQueryKeys.referenceLibraryAssets(filters),
    () => dataService.getReferenceAssets(filters),
    { keepPreviousData: true, refetchOnWindowFocus: false, ...config },
  );
}

export function useInfiniteReferenceLibraryAssets(
  filters: ReferenceAssetFilters,
  config?: UseInfiniteQueryOptions<ReferenceAssetPage, unknown>,
) {
  const { cursor: _cursor, ...baseFilters } = filters;

  return useInfiniteQuery<ReferenceAssetPage, unknown>({
    queryKey: [QueryKeys.referenceLibrary, 'assets', 'infinite', baseFilters],
    queryFn: ({ pageParam }) =>
      dataService.getReferenceAssets({
        ...baseFilters,
        cursor: pageParam?.toString(),
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    refetchOnWindowFocus: false,
    ...config,
  });
}

export function useReferenceLibraryCollections(
  enabled = true,
): QueryObserverResult<ReferenceCollection[]> {
  return useQuery<ReferenceCollection[]>(
    [QueryKeys.referenceLibrary, 'collections'],
    () => dataService.getReferenceCollections(),
    { enabled, refetchOnWindowFocus: false },
  );
}

export function useReferenceCollectionAssets(
  collectionId: string | undefined,
): QueryObserverResult<{ items: ReferenceAsset[] }> {
  return useQuery<{ items: ReferenceAsset[] }>(
    [QueryKeys.referenceLibrary, 'collection', collectionId, 'assets'],
    () => dataService.getReferenceCollectionAssets(collectionId as string),
    { enabled: Boolean(collectionId), refetchOnWindowFocus: false },
  );
}

export function useReferenceLibraryTags(enabled = true): QueryObserverResult<ReferenceTag[]> {
  return useQuery<ReferenceTag[]>(
    [QueryKeys.referenceLibrary, 'tags'],
    () => dataService.getReferenceTags(),
    { enabled, refetchOnWindowFocus: false },
  );
}

export function useReferenceLibrarySavedFilters(
  enabled = true,
): QueryObserverResult<ReferenceSavedFilter[]> {
  return useQuery<ReferenceSavedFilter[]>(
    [QueryKeys.referenceLibrary, 'saved-filters'],
    () => dataService.getReferenceSavedFilters(),
    { enabled, refetchOnWindowFocus: false },
  );
}

export function useReferenceLibraryDuplicates(
  enabled = true,
): QueryObserverResult<ReferenceDuplicateGroup[]> {
  return useQuery<ReferenceDuplicateGroup[]>(
    [QueryKeys.referenceLibrary, 'duplicates'],
    () => dataService.getReferenceDuplicates(),
    { enabled, refetchOnWindowFocus: false },
  );
}
