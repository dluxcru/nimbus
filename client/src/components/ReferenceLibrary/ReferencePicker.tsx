import { useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Check, Images, Search, X } from 'lucide-react';
import {
  Button,
  disabledFillClasses,
  OGDialog,
  OGDialogClose,
  OGDialogContent,
  OGDialogDescription,
  OGDialogTitle,
} from '@librechat/client';
import type { ReferenceAsset, TFile } from 'librechat-data-provider';
import { useInfiniteReferenceLibraryAssets, useReferenceLibraryCollections } from '~/data-provider';
import { useDebounce, useLocalize } from '~/hooks';
import { cn } from '~/utils';
import ReferenceImage from './ReferenceImage';

interface ReferencePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAttach: (files: TFile[]) => void;
  maxSelectionCount?: number;
  startingPosition?: number;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

export default function ReferencePicker({
  open,
  onOpenChange,
  onAttach,
  maxSelectionCount,
  startingPosition = 0,
  returnFocusRef,
}: ReferencePickerProps) {
  const localize = useLocalize();
  const searchRef = useRef<HTMLInputElement>(null);
  const [collectionId, setCollectionId] = useState<string>();
  const [purposes, setPurposes] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [selectedAssets, setSelectedAssets] = useState<ReferenceAsset[]>([]);
  const debouncedQuery = useDebounce(query, 250);
  const filters = useMemo(
    () => ({
      query: debouncedQuery || undefined,
      collectionId,
      limit: 100,
    }),
    [collectionId, debouncedQuery],
  );
  const assets = useInfiniteReferenceLibraryAssets(filters, { enabled: open });
  const collections = useReferenceLibraryCollections(open);
  const visibleAssets = useMemo(
    () => assets.data?.pages.flatMap((page) => page.items) ?? [],
    [assets.data?.pages],
  );
  const selectedIds = useMemo(
    () => new Set(selectedAssets.map((asset) => asset.id)),
    [selectedAssets],
  );
  const isLoading = assets.isLoading || collections.isLoading;
  const isError = assets.isError || collections.isError;
  const isBusy = assets.isFetching || assets.isFetchingNextPage;
  const selectionIsValid =
    selectedAssets.length > 0 &&
    (maxSelectionCount == null || selectedAssets.length <= maxSelectionCount);

  const close = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSelectedAssets([]);
      setPurposes({});
    }
    onOpenChange(nextOpen);
  };

  const choose = (asset: ReferenceAsset) => {
    setSelectedAssets((current) => {
      const index = current.findIndex((selected) => selected.id === asset.id);
      if (index >= 0) {
        return current.filter((selected) => selected.id !== asset.id);
      }
      if (maxSelectionCount != null && current.length >= maxSelectionCount) {
        return current;
      }
      return [...current, asset];
    });
  };

  const attach = () => {
    if (!selectionIsValid) {
      return;
    }
    onAttach(
      selectedAssets.map((asset, index) => ({
        ...asset.file,
        metadata: {
          ...asset.file.metadata,
          referenceLibrary: {
            assetId: asset.id,
            title: asset.title,
            purpose: purposes[asset.id]?.trim() || undefined,
            position: startingPosition + index,
          },
        },
      })),
    );
    onOpenChange(false);
    setSelectedAssets([]);
    setPurposes({});
  };

  return (
    <OGDialog open={open} onOpenChange={close} triggerRef={returnFocusRef}>
      <OGDialogContent
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          searchRef.current?.focus();
        }}
        className="flex h-[min(760px,90vh)] w-[min(980px,96vw)] max-w-none flex-col gap-0 overflow-hidden p-0"
      >
        <header className="border-border-light flex items-center justify-between border-b px-5 py-4">
          <div>
            <OGDialogTitle className="text-base">
              {localize('com_reference_library_choose')}
            </OGDialogTitle>
            <OGDialogDescription className="mt-0.5 text-xs">
              {localize('com_reference_library_choose_help')}
            </OGDialogDescription>
          </div>
          <OGDialogClose aria-label={localize('com_reference_library_close_details')}>
            <X className="size-4" aria-hidden="true" />
          </OGDialogClose>
        </header>

        <div className="border-border-light space-y-3 border-b p-4">
          <div className="relative">
            <Search
              className="text-text-secondary absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label={localize('com_reference_library_search_owned')}
              placeholder={localize('com_reference_library_search_owned')}
              className={cn(
                'border-border-medium text-text-primary focus:border-link h-10 w-full rounded-xl border bg-transparent pr-3 pl-10 text-sm outline-none disabled:opacity-50',
                disabledFillClasses,
              )}
            />
          </div>
          <div
            className="flex gap-2 overflow-x-auto pb-1"
            aria-label={localize('com_reference_library_collections')}
          >
            <button
              type="button"
              aria-pressed={!collectionId}
              onClick={() => setCollectionId(undefined)}
              className={cn(
                'focus-visible:ring-focus-control rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap focus-visible:ring-2',
                !collectionId ? 'bg-link text-white' : 'bg-surface-secondary text-text-secondary',
              )}
            >
              {localize('com_reference_library_all')}
            </button>
            {collections.data?.map((collection) => (
              <button
                type="button"
                key={collection.id}
                aria-pressed={collectionId === collection.id}
                onClick={() => setCollectionId(collection.id)}
                className={cn(
                  'focus-visible:ring-focus-control rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap focus-visible:ring-2',
                  collectionId === collection.id
                    ? 'bg-link text-white'
                    : 'bg-surface-secondary text-text-secondary',
                )}
              >
                {collection.name} <span className="opacity-70">{collection.assetCount}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <span className="sr-only" aria-live="polite" aria-atomic="true">
            {isBusy ? localize('com_reference_library_loading') : ''}
          </span>
          {isLoading && (
            <div
              className="text-text-secondary grid h-full place-items-center text-sm"
              role="status"
            >
              {localize('com_reference_library_loading')}
            </div>
          )}
          {!isLoading && isError && (
            <div className="grid h-full place-items-center text-center" role="alert">
              <div>
                <p className="text-text-primary text-sm font-medium">
                  {localize('com_reference_library_load_error')}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => {
                    void assets.refetch();
                    void collections.refetch();
                  }}
                >
                  {localize('com_ui_retry')}
                </Button>
              </div>
            </div>
          )}
          {!isLoading && !isError && visibleAssets.length === 0 && (
            <div className="grid h-full place-items-center text-center">
              <div>
                <Images className="text-text-secondary mx-auto size-9" aria-hidden="true" />
                <p className="text-text-primary mt-3 text-sm font-medium">
                  {localize(
                    collectionId
                      ? 'com_reference_library_empty_collection'
                      : 'com_reference_library_no_match',
                  )}
                </p>
                {!collectionId && (
                  <p className="text-text-secondary mt-1 text-xs">
                    {localize('com_reference_library_no_match_help')}
                  </p>
                )}
              </div>
            </div>
          )}
          {!isLoading && !isError && visibleAssets.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {visibleAssets.map((asset) => {
                const isSelected = selectedIds.has(asset.id);
                const capacityReached =
                  !isSelected &&
                  maxSelectionCount != null &&
                  selectedAssets.length >= maxSelectionCount;
                return (
                  <button
                    type="button"
                    key={asset.id}
                    aria-pressed={isSelected}
                    aria-label={localize(isSelected ? 'com_ui_deselect_var' : 'com_ui_select_var', {
                      0: asset.title,
                    })}
                    disabled={capacityReached}
                    onClick={() => choose(asset)}
                    className={cn(
                      'group focus-visible:ring-focus-control overflow-hidden rounded-xl border text-left transition focus-visible:ring-2',
                      disabledFillClasses,
                      isSelected
                        ? 'border-link ring-link/20 ring-2'
                        : 'border-border-light hover:border-border-medium',
                    )}
                  >
                    <div className="bg-surface-secondary relative aspect-[4/3]">
                      <ReferenceImage
                        asset={asset}
                        className="size-full rounded-none object-cover"
                      />
                      <span
                        className={cn(
                          'absolute top-2 left-2 grid size-6 place-items-center rounded-full border',
                          isSelected
                            ? 'border-link bg-link text-white'
                            : 'border-white/80 bg-black/30 text-transparent group-hover:text-white',
                        )}
                        aria-hidden="true"
                      >
                        <Check className="size-3.5" />
                      </span>
                    </div>
                    <span className="text-text-primary block truncate px-2.5 py-2 text-xs font-medium">
                      {asset.title}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {!isLoading && !isError && assets.hasNextPage && (
            <div className="mt-4 flex justify-center">
              <Button
                variant="outline"
                size="sm"
                disabled={assets.isFetchingNextPage}
                onClick={() => void assets.fetchNextPage()}
              >
                {assets.isFetchingNextPage
                  ? localize('com_reference_library_loading')
                  : localize('com_ui_load_more')}
              </Button>
            </div>
          )}
          {selectedAssets.length > 0 && (
            <div className="border-border-light mt-4 space-y-2 border-t pt-4">
              {selectedAssets.map((asset) => (
                <label
                  key={asset.id}
                  className="text-text-secondary flex items-center gap-3 text-xs"
                >
                  <span className="text-text-primary w-32 truncate font-medium">{asset.title}</span>
                  <input
                    value={purposes[asset.id] || ''}
                    onChange={(event) =>
                      setPurposes((current) => ({ ...current, [asset.id]: event.target.value }))
                    }
                    aria-label={asset.title}
                    maxLength={120}
                    placeholder={localize('com_reference_library_purpose_placeholder')}
                    className="border-border-medium text-text-primary h-9 min-w-0 flex-1 rounded-lg border bg-transparent px-3 text-xs"
                  />
                </label>
              ))}
            </div>
          )}
        </div>

        <footer className="border-border-light flex items-center justify-between border-t px-5 py-3">
          <span className="text-text-secondary text-xs">
            {selectedAssets.length} {localize('com_reference_library_selected')}
            {maxSelectionCount != null
              ? ` · ${localize('com_reference_library_maximum', { 0: maxSelectionCount })}`
              : ''}
          </span>
          <Button onClick={attach} disabled={!selectionIsValid}>
            {localize('com_reference_library_attach')}
          </Button>
        </footer>
      </OGDialogContent>
    </OGDialog>
  );
}
