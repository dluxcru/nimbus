import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronLeft,
  Grid2X2,
  ImagePlus,
  Images,
  Library,
  List,
  Plus,
  Search,
  SlidersHorizontal,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@librechat/client';
import type {
  ReferenceAsset,
  ReferenceAssetFilters,
  ReferenceProvider,
  ReferenceProviderResult,
  ReferenceProviderSearchResult,
} from 'librechat-data-provider';
import {
  useBulkUpdateReferenceAssets,
  useCreateReferenceCollection,
  useCreateReferenceSavedFilter,
  useImportReferenceImages,
  useInfiniteReferenceLibraryAssets,
  useReferenceCollectionAssets,
  useReferenceLibraryCapabilities,
  useReferenceLibraryCollections,
  useReferenceLibrarySavedFilters,
  useReferenceLibraryTags,
  useRestoreReferenceAssets,
  useSearchReferenceImages,
  useSetReferenceCollectionAssets,
  useTrashReferenceAssets,
  useUpdateReferenceAsset,
} from '~/data-provider';
import ReferenceImage from './ReferenceImage';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

const CONTROL_FOCUS =
  'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-control focus-visible:ring-offset-2 focus-visible:ring-offset-surface-primary';

type WorkspaceView = 'library' | 'imports' | 'trash';

const PROVIDER_LABELS: Record<ReferenceProvider, string> = {
  google: 'Google Images',
  wikimedia: 'Wikimedia Commons',
  pexels: 'Pexels',
};

function AssetCard({
  asset,
  selected,
  onSelect,
  onOpen,
}: {
  asset: ReferenceAsset;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const localize = useLocalize();
  return (
    <article
      className={cn(
        'group bg-surface-primary relative overflow-hidden rounded-2xl border transition',
        selected
          ? 'border-link ring-link/20 ring-2'
          : 'border-border-light hover:border-border-medium hover:-translate-y-0.5 hover:shadow-md',
      )}
    >
      <button
        className="block w-full text-left"
        onClick={onOpen}
        aria-label={localize('com_ui_open_var', { 0: asset.title })}
      >
        <div className="bg-surface-secondary relative aspect-[4/3] overflow-hidden">
          <ReferenceImage
            asset={asset}
            className="size-full rounded-none object-cover transition duration-300 group-hover:scale-[1.025]"
          />
        </div>
        <div className="px-3 pt-2.5 pb-3">
          <div className="flex items-start gap-2">
            <h3 className="text-text-primary min-w-0 flex-1 truncate text-sm font-medium">
              {asset.title}
            </h3>
            {asset.favorite && (
              <Star className="text-status-warning fill-status-warning-border mt-0.5 size-3.5" />
            )}
          </div>
          <p className="text-text-secondary mt-1 truncate text-xs">
            {asset.source.creator || asset.source.provider || `${asset.width} × ${asset.height}`}
          </p>
        </div>
      </button>
      <button
        type="button"
        onClick={onSelect}
        aria-label={localize(selected ? 'com_ui_deselect_var' : 'com_ui_select_var', {
          0: asset.title,
        })}
        className={cn(
          'absolute top-2.5 left-2.5 grid size-6 place-items-center rounded-full border shadow-sm transition',
          selected
            ? 'border-link bg-link text-white'
            : 'border-white/80 bg-black/35 text-transparent opacity-0 backdrop-blur group-hover:opacity-100',
        )}
      >
        <Check className="size-3.5" />
      </button>
    </article>
  );
}

function AssetList({
  assets,
  selected,
  onSelect,
  onOpen,
}: {
  assets: ReferenceAsset[];
  selected: Set<string>;
  onSelect: (assetId: string) => void;
  onOpen: (asset: ReferenceAsset) => void;
}) {
  const localize = useLocalize();
  return (
    <div className="space-y-1 p-4 lg:p-6">
      {assets.map((asset) => (
        <article
          key={asset.id}
          className={cn(
            'bg-surface-primary flex items-center gap-3 rounded-xl border p-2',
            selected.has(asset.id) ? 'border-link' : 'border-border-light',
          )}
        >
          <button
            onClick={() => onSelect(asset.id)}
            className={cn(
              'grid size-6 shrink-0 place-items-center rounded-full border',
              selected.has(asset.id)
                ? 'border-link bg-link text-white'
                : 'border-border-medium text-transparent',
            )}
            aria-label={localize(
              selected.has(asset.id) ? 'com_ui_deselect_var' : 'com_ui_select_var',
              { 0: asset.title },
            )}
          >
            <Check className="size-3.5" />
          </button>
          <button
            onClick={() => onOpen(asset)}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
            aria-label={localize('com_ui_open_var', { 0: asset.title })}
          >
            <ReferenceImage asset={asset} className="size-14 shrink-0 rounded-lg object-cover" />
            <span className="min-w-0 flex-1">
              <span className="text-text-primary block truncate text-sm font-medium">
                {asset.title}
              </span>
              <span className="text-text-secondary mt-1 block truncate text-xs">
                {asset.tags.join(', ') ||
                  asset.source.creator ||
                  asset.source.provider ||
                  localize('com_reference_library_local_image')}
              </span>
            </span>
            <span className="text-text-secondary hidden text-xs sm:block">
              {asset.width} × {asset.height}
            </span>
            <span className="text-text-secondary hidden w-12 text-center text-xs md:block">
              {asset.rating ? `${asset.rating}★` : '—'}
            </span>
          </button>
        </article>
      ))}
    </div>
  );
}

function AssetInspector({ asset, onClose }: { asset: ReferenceAsset; onClose: () => void }) {
  const localize = useLocalize();
  const update = useUpdateReferenceAsset();
  const [title, setTitle] = useState(asset.title);
  const [notes, setNotes] = useState(asset.notes);
  const [altText, setAltText] = useState(asset.altText);
  const [rating, setRating] = useState(asset.rating?.toString() ?? '');
  const [colorLabel, setColorLabel] = useState(asset.colorLabel ?? '');
  const [tags, setTags] = useState(asset.tags.join(', '));

  const save = () => {
    update.mutate({
      assetId: asset.id,
      patch: {
        rating: rating ? Number(rating) : null,
        colorLabel: colorLabel || null,
        title: title.trim(),
        notes,
        altText,
        tags: tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      },
    });
  };

  return (
    <aside className="border-border-light bg-surface-primary flex h-full w-full max-w-md flex-col border-l shadow-xl">
      <header className="border-border-light flex items-center justify-between border-b px-4 py-3">
        <div>
          <p className="text-text-secondary text-xs font-medium tracking-widest uppercase">
            {localize('com_reference_library_asset')}
          </p>
          <h2 className="text-text-primary mt-0.5 truncate text-base font-semibold">
            {asset.title}
          </h2>
        </div>
        <button
          className="hover:bg-surface-secondary rounded-lg p-2"
          onClick={onClose}
          aria-label={localize('com_reference_library_close_details')}
        >
          <X className="size-4" />
        </button>
      </header>
      <div className="bg-surface-secondary aspect-[4/3] p-3">
        <ReferenceImage asset={asset} className="size-full rounded-xl object-contain" />
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <label className="text-text-secondary block text-xs font-medium">
          {localize('com_reference_library_title_field')}
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="border-border-medium text-text-primary mt-1.5 w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
          />
        </label>
        <label className="text-text-secondary block text-xs font-medium">
          {localize('com_reference_library_notes')}
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={4}
            className="border-border-medium text-text-primary mt-1.5 w-full resize-none rounded-lg border bg-transparent px-3 py-2 text-sm"
          />
        </label>
        <label className="text-text-secondary block text-xs font-medium">
          {localize('com_reference_library_alt_text')}
          <textarea
            value={altText}
            onChange={(event) => setAltText(event.target.value)}
            rows={3}
            className="border-border-medium text-text-primary mt-1.5 w-full resize-none rounded-lg border bg-transparent px-3 py-2 text-sm"
          />
        </label>
        <label className="text-text-secondary block text-xs font-medium">
          {localize('com_reference_library_tags')}
          <input
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="character, lighting, costume"
            className="border-border-medium text-text-primary mt-1.5 w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-text-secondary block text-xs font-medium">
            {localize('com_reference_library_rating')}
            <select
              value={rating}
              onChange={(event) => setRating(event.target.value)}
              className="border-border-medium bg-surface-primary text-text-primary mt-1.5 h-10 w-full rounded-lg border px-3 text-sm"
            >
              <option value="">{localize('com_reference_library_unrated')}</option>
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {localize('com_reference_library_rating_stars', { count: value })}
                </option>
              ))}
            </select>
          </label>
          <label className="text-text-secondary block text-xs font-medium">
            {localize('com_reference_library_color_label')}
            <select
              value={colorLabel}
              onChange={(event) => setColorLabel(event.target.value)}
              className="border-border-medium bg-surface-primary text-text-primary mt-1.5 h-10 w-full rounded-lg border px-3 text-sm"
            >
              <option value="">{localize('com_reference_library_none')}</option>
              {['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'gray'].map((color) => (
                <option key={color} value={color}>
                  {color}
                </option>
              ))}
            </select>
          </label>
        </div>
        <dl className="bg-surface-secondary grid grid-cols-2 gap-3 rounded-xl p-3 text-xs">
          <div>
            <dt className="text-text-secondary">{localize('com_reference_library_dimensions')}</dt>
            <dd className="text-text-primary mt-1 font-medium">
              {asset.width} × {asset.height}
            </dd>
          </div>
          <div>
            <dt className="text-text-secondary">{localize('com_reference_library_rights')}</dt>
            <dd className="text-text-primary mt-1 font-medium capitalize">
              {asset.source.rightsState}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-text-secondary">{localize('com_reference_library_source')}</dt>
            <dd className="text-text-primary mt-1 truncate font-medium">
              {asset.source.licenseName ||
                asset.source.provider ||
                localize('com_reference_library_uploaded_image')}
            </dd>
          </div>
        </dl>
      </div>
      <footer className="border-border-light border-t p-4">
        <Button onClick={save} disabled={update.isLoading} className="w-full">
          {update.isLoading
            ? localize('com_reference_library_saving')
            : localize('com_reference_library_save_changes')}
        </Button>
      </footer>
    </aside>
  );
}

export function SearchImport({
  capabilities,
}: {
  capabilities: Record<ReferenceProvider, boolean>;
}) {
  const search = useSearchReferenceImages();
  const localize = useLocalize();
  const importer = useImportReferenceImages();
  const [query, setQuery] = useState('');
  const [providers, setProviders] = useState<ReferenceProvider[]>(
    (Object.keys(capabilities) as ReferenceProvider[]).filter((provider) => capabilities[provider]),
  );
  const [providerResults, setProviderResults] = useState<ReferenceProviderSearchResult[]>([]);
  const [selected, setSelected] = useState<Record<string, ReferenceProviderResult>>({});
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());
  const [importErrors, setImportErrors] = useState<Record<string, string>>({});
  const results = providerResults.flatMap((result) => result.items);
  const hasSearched = providerResults.length > 0 || search.isSuccess || search.isError;
  const nextResults = providerResults.filter((result) => result.nextCursor);

  const toggleProvider = (provider: ReferenceProvider) => {
    setProviders((current) =>
      current.includes(provider)
        ? current.filter((item) => item !== provider)
        : [...current, provider],
    );
  };
  const runSearch = () => {
    const trimmed = query.trim();
    if (!trimmed || providers.length === 0) {
      return;
    }
    search.mutate(
      { query: trimmed, providers },
      {
        onSuccess: ({ results: next }) => {
          setProviderResults(next);
          setSelected({});
          setAcknowledged(new Set());
          setImportErrors({});
        },
      },
    );
  };
  const loadMore = () => {
    const cursors = Object.fromEntries(
      nextResults.map((result) => [result.provider, result.nextCursor as string]),
    ) as Partial<Record<ReferenceProvider, string>>;
    search.mutate(
      {
        query: query.trim(),
        providers: nextResults.map((result) => result.provider),
        cursor: cursors,
      },
      {
        onSuccess: ({ results: next }) =>
          setProviderResults((current) =>
            current.map((result) => {
              const page = next.find((candidate) => candidate.provider === result.provider);
              return page
                ? {
                    ...page,
                    items: [...result.items, ...page.items],
                  }
                : result;
            }),
          ),
      },
    );
  };
  const importSelected = () => {
    const items = Object.values(selected).map((item) => ({
      importToken: item.importToken,
      title: item.title,
      acknowledgeUnknownRights:
        item.rightsState === 'unknown' ? acknowledged.has(item.importToken) : undefined,
    }));
    importer.mutate(
      { items, idempotencyKey: crypto.randomUUID() },
      {
        onSuccess: ({ results: imported }) => {
          const succeeded = new Set(
            imported.filter((result) => result.ok).map((result) => result.importToken),
          );
          setSelected((current) =>
            Object.fromEntries(
              Object.entries(current).filter(([importToken]) => !succeeded.has(importToken)),
            ),
          );
          setAcknowledged((current) => {
            const next = new Set(current);
            succeeded.forEach((importToken) => next.delete(importToken));
            return next;
          });
          setImportErrors(
            Object.fromEntries(
              imported
                .filter((result) => !result.ok)
                .map((result) => [
                  result.importToken,
                  result.error?.message || localize('com_reference_library_import_failed'),
                ]),
            ),
          );
        },
      },
    );
  };
  const blockedByRights = Object.values(selected).some(
    (item) => item.rightsState === 'unknown' && !acknowledged.has(item.importToken),
  );

  return (
    <section className="mx-auto flex h-full max-w-7xl flex-col px-5 py-5 lg:px-8">
      <div className="border-border-light bg-surface-primary rounded-2xl border p-4 shadow-sm">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search
              className="text-text-secondary absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && runSearch()}
              aria-label={localize('com_reference_library_search_sources')}
              placeholder={localize('com_reference_library_search_sources')}
              className={cn(
                'border-border-medium text-text-primary focus:border-link h-11 w-full rounded-xl border bg-transparent pr-3 pl-10 text-sm outline-none',
                CONTROL_FOCUS,
              )}
            />
          </div>
          <Button
            onClick={runSearch}
            disabled={!query.trim() || providers.length === 0 || search.isLoading}
          >
            {localize('com_ui_search')}
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {(Object.keys(capabilities) as ReferenceProvider[])
            .filter((provider) => capabilities[provider])
            .map((provider) => (
              <button
                type="button"
                key={provider}
                aria-pressed={providers.includes(provider)}
                onClick={() => toggleProvider(provider)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium',
                  CONTROL_FOCUS,
                  providers.includes(provider)
                    ? 'border-link bg-link/10 text-link'
                    : 'border-border-medium text-text-secondary',
                )}
              >
                {PROVIDER_LABELS[provider]}
              </button>
            ))}
        </div>
      </div>

      {search.isLoading && results.length === 0 && (
        <div className="text-text-secondary grid flex-1 place-items-center text-sm" role="status">
          {localize('com_reference_library_searching_sources')}
        </div>
      )}
      {search.isError && results.length === 0 && (
        <div className="grid flex-1 place-items-center text-center" role="alert">
          <div>
            <p className="text-text-primary text-sm font-medium">
              {localize('com_reference_library_search_failed')}
            </p>
            <Button variant="outline" className="mt-3" onClick={runSearch}>
              {localize('com_ui_retry')}
            </Button>
          </div>
        </div>
      )}
      {!search.isLoading && !search.isError && results.length === 0 && (
        <div className="grid flex-1 place-items-center py-20 text-center">
          <div>
            <ImagePlus className="text-text-secondary mx-auto size-10" aria-hidden="true" />
            <h2 className="text-text-primary mt-4 text-lg font-semibold">
              {localize(
                hasSearched
                  ? 'com_reference_library_no_source_results'
                  : 'com_reference_library_build_set',
              )}
            </h2>
            <p className="text-text-secondary mt-1 max-w-md text-sm">
              {localize(
                hasSearched
                  ? 'com_reference_library_no_source_results_help'
                  : 'com_reference_library_build_set_help',
              )}
            </p>
          </div>
        </div>
      )}
      {results.length > 0 && (
        <div className="mt-5 grid grid-cols-2 gap-3 overflow-y-auto pb-24 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {results.map((item) => {
            const isSelected = Boolean(selected[item.importToken]);
            const needsAcknowledgement = item.rightsState === 'unknown';
            const importError = importErrors[item.importToken];
            return (
              <article
                key={item.importToken}
                className={cn(
                  'bg-surface-primary overflow-hidden rounded-2xl border',
                  isSelected ? 'border-link ring-link/20 ring-2' : 'border-border-light',
                )}
              >
                <button
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={localize(isSelected ? 'com_ui_deselect_var' : 'com_ui_select_var', {
                    0: item.title,
                  })}
                  onClick={() =>
                    setSelected((current) => {
                      const next = { ...current };
                      if (next[item.importToken]) {
                        delete next[item.importToken];
                      } else {
                        next[item.importToken] = item;
                      }
                      return next;
                    })
                  }
                  className={cn(
                    'bg-surface-secondary relative block aspect-[4/3] w-full overflow-hidden',
                    CONTROL_FOCUS,
                  )}
                >
                  <img
                    src={item.thumbnailUrl}
                    alt={item.title}
                    className="size-full object-cover"
                    loading="lazy"
                  />
                  <span
                    className={cn(
                      'absolute top-2 left-2 grid size-6 place-items-center rounded-full border',
                      isSelected
                        ? 'border-link bg-link text-white'
                        : 'border-white/80 bg-black/30 text-transparent',
                    )}
                    aria-hidden="true"
                  >
                    <Check className="size-3.5" />
                  </span>
                </button>
                <div className="space-y-1 p-3">
                  <h3 className="text-text-primary truncate text-sm font-medium">{item.title}</h3>
                  <p className="text-text-secondary truncate text-xs">
                    {item.creator || PROVIDER_LABELS[item.provider]}
                  </p>
                  <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs">
                    <a
                      href={item.sourcePageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-link hover:underline"
                    >
                      {localize('com_reference_library_review_source')}
                    </a>
                    {item.licenseName &&
                      (item.licenseUrl ? (
                        <a
                          href={item.licenseUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-link hover:underline"
                        >
                          {item.licenseName}
                        </a>
                      ) : (
                        <span className="text-text-secondary">{item.licenseName}</span>
                      ))}
                  </div>
                  {needsAcknowledgement && isSelected && (
                    <label className="text-status-warning-strong text-2xs mt-2 flex items-start gap-2 leading-4">
                      <input
                        type="checkbox"
                        checked={acknowledged.has(item.importToken)}
                        onChange={(event) =>
                          setAcknowledged((current) => {
                            const next = new Set(current);
                            event.target.checked
                              ? next.add(item.importToken)
                              : next.delete(item.importToken);
                            return next;
                          })
                        }
                        className="mt-0.5"
                      />
                      {localize('com_reference_library_rights_unknown')}
                    </label>
                  )}
                  {importError && (
                    <p className="text-status-error text-xs" role="alert">
                      {importError}
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {providerResults.some((result) => result.error) && (
        <div className="text-status-warning-strong mt-3 text-sm" role="alert">
          {providerResults
            .filter((result) => result.error)
            .map((result) => `${PROVIDER_LABELS[result.provider]}: ${result.error?.message}`)
            .join(' · ')}
        </div>
      )}
      {nextResults.length > 0 && (
        <div className="mb-20 flex justify-center">
          <Button variant="outline" onClick={loadMore} disabled={search.isLoading}>
            {search.isLoading
              ? localize('com_reference_library_searching_sources')
              : localize('com_ui_load_more')}
          </Button>
        </div>
      )}
      {importer.isError && (
        <p className="text-status-error mb-20 text-center text-sm" role="alert">
          {localize('com_reference_library_import_failed')}
        </p>
      )}
      {Object.keys(selected).length > 0 && (
        <div className="border-border-medium bg-surface-primary fixed bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-4 rounded-2xl border px-4 py-3 shadow-2xl">
          <span className="text-text-primary text-sm font-medium">
            {Object.keys(selected).length} {localize('com_reference_library_selected')}
          </span>
          <Button onClick={importSelected} disabled={blockedByRights || importer.isLoading}>
            {importer.isLoading
              ? localize('com_reference_library_importing')
              : localize('com_reference_library_import_selected')}
          </Button>
        </div>
      )}
    </section>
  );
}

export default function ReferenceLibrary() {
  const localize = useLocalize();
  const capabilities = useReferenceLibraryCapabilities();
  const [view, setView] = useState<WorkspaceView>('library');
  const [query, setQuery] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [collectionId, setCollectionId] = useState<string>();
  const [extraFilters, setExtraFilters] = useState<ReferenceAssetFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [bulkCollectionId, setBulkCollectionId] = useState<string>();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeAsset, setActiveAsset] = useState<ReferenceAsset | null>(null);
  const filters = useMemo<ReferenceAssetFilters>(
    () => ({
      ...extraFilters,
      query: query || undefined,
      favorite: favoritesOnly || undefined,
      collectionId,
      trashed: view === 'trash',
      limit: 100,
    }),
    [query, favoritesOnly, collectionId, view, extraFilters],
  );
  const assets = useInfiniteReferenceLibraryAssets(filters, {
    enabled: capabilities.data?.enabled === true && view !== 'imports',
  });
  const collections = useReferenceLibraryCollections(capabilities.data?.enabled === true);
  const tags = useReferenceLibraryTags(capabilities.data?.enabled === true);
  const collectionAssets = useReferenceCollectionAssets(bulkCollectionId);
  const setCollectionAssets = useSetReferenceCollectionAssets();
  const savedFilters = useReferenceLibrarySavedFilters(capabilities.data?.enabled === true);
  const bulkUpdate = useBulkUpdateReferenceAssets();
  const trash = useTrashReferenceAssets();
  const restore = useRestoreReferenceAssets();
  const createCollection = useCreateReferenceCollection();
  const createSavedFilter = useCreateReferenceSavedFilter();
  useEffect(() => {
    setSelected(new Set());
  }, [query, favoritesOnly, collectionId, view, extraFilters]);

  if (capabilities.isLoading)
    return (
      <div className="text-text-secondary grid h-full place-items-center text-sm">
        {localize('com_reference_library_opening')}
      </div>
    );
  if (!capabilities.data?.enabled)
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div>
          <Images className="text-text-secondary mx-auto size-10" />
          <h1 className="text-text-primary mt-4 text-xl font-semibold">
            {localize('com_reference_library_disabled')}
          </h1>
          <p className="text-text-secondary mt-2 text-sm">
            {localize('com_reference_library_disabled_help')}
          </p>
        </div>
      </div>
    );
  if (view === 'imports')
    return (
      <div className="bg-surface-secondary flex h-full flex-col">
        <WorkspaceHeader view={view} setView={setView} />
        <SearchImport capabilities={capabilities.data.providers} />
      </div>
    );

  const currentAssets = assets.data?.pages.flatMap((page) => page.items) || [];
  const totalAssets = assets.data?.pages[0]?.total;
  const toggleSelected = (assetId: string) =>
    setSelected((current) => {
      const next = new Set(current);
      next.has(assetId) ? next.delete(assetId) : next.add(assetId);
      return next;
    });
  const clearSelection = () => setSelected(new Set());
  const runBulk = (action: 'favorite' | 'trash' | 'restore') => {
    const ids = [...selected];
    if (action === 'favorite')
      bulkUpdate.mutate(
        { assetIds: ids, patch: { favorite: true } },
        { onSuccess: clearSelection },
      );
    if (action === 'trash') trash.mutate(ids, { onSuccess: clearSelection });
    if (action === 'restore') restore.mutate(ids, { onSuccess: clearSelection });
  };
  const addCollection = () => {
    const name = globalThis.prompt(localize('com_reference_library_collection_name'))?.trim();
    if (name) {
      createCollection.mutate({ name, description: '' });
    }
  };
  const addSelectedToCollection = () => {
    if (!bulkCollectionId || !collectionAssets.data) {
      return;
    }
    const assetIds = [...collectionAssets.data.items.map((asset) => asset.id), ...selected].filter(
      (assetId, index, ids) => ids.indexOf(assetId) === index,
    );
    setCollectionAssets.mutate(
      { collectionId: bulkCollectionId, assetIds },
      { onSuccess: clearSelection },
    );
  };
  const saveFilter = () => {
    const name = globalThis.prompt(localize('com_reference_library_saved_filter_name'))?.trim();
    if (name) {
      const filter = { ...filters };
      delete filter.cursor;
      createSavedFilter.mutate({ name, filter });
    }
  };
  const applySavedFilter = (filter: ReferenceAssetFilters) => {
    setQuery(filter.query || '');
    setFavoritesOnly(Boolean(filter.favorite));
    setCollectionId(filter.collectionId);
    const rest = { ...filter };
    delete rest.query;
    delete rest.favorite;
    delete rest.collectionId;
    delete rest.trashed;
    delete rest.cursor;
    setExtraFilters(rest);
  };
  const clearAllFilters = () => {
    setQuery('');
    setFavoritesOnly(false);
    setCollectionId(undefined);
    setExtraFilters({});
    clearSelection();
  };
  const hasActiveFilters =
    Boolean(query) ||
    favoritesOnly ||
    Boolean(collectionId) ||
    Object.values(extraFilters).some((value) =>
      Array.isArray(value) ? value.length > 0 : value != null && value !== '',
    );
  let mobileScope = 'all';
  if (favoritesOnly) {
    mobileScope = 'favorites';
  } else if (collectionId) {
    mobileScope = `collection:${collectionId}`;
  }

  let assetContent: React.ReactNode;
  if (assets.isLoading) {
    assetContent = (
      <div className="text-text-secondary grid min-h-[50vh] place-items-center text-sm">
        {localize('com_reference_library_loading')}
      </div>
    );
  } else if (assets.isError) {
    assetContent = (
      <div className="grid min-h-[50vh] place-items-center text-center" role="alert">
        <div>
          <p className="text-text-primary text-sm font-medium">
            {localize('com_reference_library_load_error')}
          </p>
          <Button variant="outline" className="mt-3" onClick={() => assets.refetch()}>
            {localize('com_ui_retry')}
          </Button>
        </div>
      </div>
    );
  } else if (currentAssets.length === 0) {
    assetContent = (
      <div className="grid min-h-[55vh] place-items-center px-6 text-center">
        <div>
          <Images className="text-text-secondary mx-auto size-10" />
          <h2 className="text-text-primary mt-4 text-lg font-semibold">
            {localize(
              view === 'trash'
                ? 'com_reference_library_empty_trash'
                : 'com_reference_library_no_match',
            )}
          </h2>
          <p className="text-text-secondary mt-1 text-sm">
            {localize(
              view === 'trash'
                ? 'com_reference_library_empty_trash_help'
                : 'com_reference_library_no_match_help',
            )}
          </p>
        </div>
      </div>
    );
  } else if (layout === 'list') {
    assetContent = (
      <AssetList
        assets={currentAssets}
        selected={selected}
        onSelect={toggleSelected}
        onOpen={setActiveAsset}
      />
    );
  } else {
    assetContent = (
      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4 lg:p-6 xl:grid-cols-5 2xl:grid-cols-6">
        {currentAssets.map((asset) => (
          <AssetCard
            key={asset.id}
            asset={asset}
            selected={selected.has(asset.id)}
            onSelect={() => toggleSelected(asset.id)}
            onOpen={() => setActiveAsset(asset)}
          />
        ))}
      </div>
    );
  }
  if (!assets.isError && currentAssets.length > 0 && assets.hasNextPage) {
    assetContent = (
      <>
        {assetContent}
        <div className="flex justify-center px-4 pb-8">
          <Button
            variant="outline"
            onClick={() => assets.fetchNextPage()}
            disabled={assets.isFetchingNextPage}
          >
            {assets.isFetchingNextPage ? localize('com_ui_loading') : localize('com_ui_load_more')}
          </Button>
        </div>
      </>
    );
  }

  return (
    <div className="bg-surface-secondary flex h-full flex-col">
      <WorkspaceHeader
        view={view}
        setView={(next) => {
          setView(next);
          clearSelection();
        }}
      />
      <div className="flex min-h-0 flex-1">
        <aside className="border-border-light bg-surface-primary hidden w-60 shrink-0 overflow-y-auto border-r p-3 md:block">
          <FilterButton
            active={!collectionId && !favoritesOnly}
            onClick={() => {
              setCollectionId(undefined);
              setFavoritesOnly(false);
            }}
            icon={<Library className="size-4" />}
            label={localize('com_reference_library_all')}
            count={totalAssets}
          />
          <FilterButton
            active={favoritesOnly}
            onClick={() => {
              setFavoritesOnly(true);
              setCollectionId(undefined);
            }}
            icon={<Star className="size-4" />}
            label={localize('com_reference_library_favorites')}
          />
          <div className="mt-6 mb-2 flex items-center justify-between px-2">
            <p className="text-text-secondary text-2xs font-semibold tracking-widest uppercase">
              {localize('com_reference_library_collections')}
            </p>
            <button
              onClick={addCollection}
              className="text-text-secondary hover:bg-surface-secondary rounded p-1"
              aria-label={localize('com_reference_library_create_collection')}
            >
              <Plus className="size-3.5" />
            </button>
          </div>
          {collections.data?.map((collection) => (
            <FilterButton
              key={collection.id}
              active={collectionId === collection.id}
              onClick={() => {
                setCollectionId(collection.id);
                setFavoritesOnly(false);
              }}
              label={collection.name}
              count={collection.assetCount}
            />
          ))}
          <p className="text-text-secondary text-2xs mt-6 mb-2 px-2 font-semibold tracking-widest uppercase">
            {localize('com_reference_library_tags')}
          </p>
          <div className="flex flex-wrap gap-1.5 px-2">
            {tags.data?.slice(0, 18).map((tag) => (
              <button
                key={tag.id}
                onClick={() => setExtraFilters((current) => ({ ...current, tags: [tag.name] }))}
                className={cn(
                  'text-2xs rounded-md px-2 py-1',
                  extraFilters.tags?.includes(tag.name)
                    ? 'bg-link/15 text-link-hover'
                    : 'bg-surface-secondary text-text-secondary',
                )}
              >
                {tag.name} <span className="opacity-60">{tag.assetCount}</span>
              </button>
            ))}
          </div>
          {savedFilters.data && savedFilters.data.length > 0 && (
            <>
              <p className="text-text-secondary text-2xs mt-6 mb-2 px-2 font-semibold tracking-widest uppercase">
                {localize('com_reference_library_saved_filters')}
              </p>
              {savedFilters.data.map((filter) => (
                <FilterButton
                  key={filter.id}
                  label={filter.name}
                  onClick={() => applySavedFilter(filter.filter)}
                />
              ))}
            </>
          )}
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="border-border-light bg-surface-primary flex gap-2 overflow-x-auto border-b p-3 md:hidden">
            <label className="text-text-secondary min-w-40 text-xs">
              {localize('com_reference_library_collections')}
              <select
                value={mobileScope}
                onChange={(event) => {
                  const value = event.target.value;
                  setFavoritesOnly(value === 'favorites');
                  setCollectionId(value.startsWith('collection:') ? value.slice(11) : undefined);
                }}
                className="border-border-medium bg-surface-primary text-text-primary mt-1 h-9 w-full rounded-lg border px-2"
              >
                <option value="all">{localize('com_reference_library_all')}</option>
                <option value="favorites">{localize('com_reference_library_favorites')}</option>
                {collections.data?.map((collection) => (
                  <option key={collection.id} value={`collection:${collection.id}`}>
                    {collection.name} ({collection.assetCount})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-text-secondary min-w-36 text-xs">
              {localize('com_reference_library_tags')}
              <select
                value={extraFilters.tags?.[0] || ''}
                onChange={(event) =>
                  setExtraFilters((current) => ({
                    ...current,
                    tags: event.target.value ? [event.target.value] : undefined,
                  }))
                }
                className="border-border-medium bg-surface-primary text-text-primary mt-1 h-9 w-full rounded-lg border px-2"
              >
                <option value="">{localize('com_reference_library_any')}</option>
                {tags.data?.map((tag) => (
                  <option key={tag.id} value={tag.name}>
                    {tag.name} ({tag.assetCount})
                  </option>
                ))}
              </select>
            </label>
            {savedFilters.data && savedFilters.data.length > 0 && (
              <label className="text-text-secondary min-w-40 text-xs">
                {localize('com_reference_library_saved_filters')}
                <select
                  value=""
                  onChange={(event) => {
                    const filter = savedFilters.data?.find(
                      (item) => item.id === event.target.value,
                    );
                    if (filter) {
                      applySavedFilter(filter.filter);
                    }
                  }}
                  className="border-border-medium bg-surface-primary text-text-primary mt-1 h-9 w-full rounded-lg border px-2"
                >
                  <option value="">{localize('com_ui_select_var', { 0: '' })}</option>
                  {savedFilters.data.map((filter) => (
                    <option key={filter.id} value={filter.id}>
                      {filter.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              type="button"
              onClick={addCollection}
              className={cn(
                'border-border-medium text-text-primary mt-5 h-9 shrink-0 rounded-lg border px-3 text-xs font-medium',
                CONTROL_FOCUS,
              )}
            >
              <Plus className="mr-1 inline size-3.5" aria-hidden="true" />
              {localize('com_reference_library_collections')}
            </button>
          </div>
          <div className="border-border-light bg-surface-primary/95 sticky top-0 z-10 border-b backdrop-blur">
            <div className="flex items-center gap-2 px-4 py-3 lg:px-6">
              <div className="relative min-w-0 flex-1">
                <Search className="text-text-secondary absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={localize('com_reference_library_search_owned')}
                  className="border-border-medium text-text-primary focus:border-link h-10 w-full rounded-xl border bg-transparent pr-3 pl-10 text-sm outline-none"
                />
              </div>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className={cn(
                    'text-text-secondary hover:bg-surface-secondary rounded-lg p-2',
                    CONTROL_FOCUS,
                  )}
                  aria-label={localize('com_reference_library_clear_filters')}
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              )}
              <button
                onClick={() => setShowFilters((current) => !current)}
                className={cn(
                  'text-text-secondary hover:bg-surface-secondary rounded-xl border p-2.5',
                  showFilters ? 'border-link text-link' : 'border-border-medium',
                )}
                aria-label={localize('com_reference_library_filters')}
              >
                <SlidersHorizontal className="size-4" />
              </button>
              <button
                onClick={() => setLayout('grid')}
                className={cn(
                  'rounded-lg p-2.5',
                  layout === 'grid'
                    ? 'bg-surface-secondary text-text-primary'
                    : 'text-text-secondary',
                )}
                aria-label={localize('com_reference_library_grid_view')}
              >
                <Grid2X2 className="size-4" />
              </button>
              <button
                onClick={() => setLayout('list')}
                className={cn(
                  'rounded-lg p-2.5',
                  layout === 'list'
                    ? 'bg-surface-secondary text-text-primary'
                    : 'text-text-secondary',
                )}
                aria-label={localize('com_reference_library_list_view')}
              >
                <List className="size-4" />
              </button>
            </div>
            {showFilters && (
              <div className="border-border-light grid grid-cols-2 gap-2 border-t px-4 py-3 sm:grid-cols-4 lg:grid-cols-8 lg:px-6">
                <FilterSelect
                  label={localize('com_reference_library_minimum_rating')}
                  value={extraFilters.rating?.toString() || ''}
                  options={['1', '2', '3', '4', '5']}
                  onChange={(value) =>
                    setExtraFilters((current) => ({
                      ...current,
                      rating: value ? Number(value) : undefined,
                    }))
                  }
                />
                <FilterSelect
                  label={localize('com_reference_library_color')}
                  value={extraFilters.colorLabel || ''}
                  options={['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'gray']}
                  onChange={(value) =>
                    setExtraFilters((current) => ({ ...current, colorLabel: value || undefined }))
                  }
                />
                <FilterSelect
                  label={localize('com_reference_library_provider')}
                  value={extraFilters.provider || ''}
                  options={['google', 'wikimedia', 'pexels']}
                  onChange={(value) =>
                    setExtraFilters((current) => ({
                      ...current,
                      provider: (value || undefined) as ReferenceProvider | undefined,
                    }))
                  }
                />
                <FilterSelect
                  label={localize('com_reference_library_rights')}
                  value={extraFilters.rightsState || ''}
                  options={['known', 'unknown']}
                  onChange={(value) =>
                    setExtraFilters((current) => ({
                      ...current,
                      rightsState: (value || undefined) as ReferenceAssetFilters['rightsState'],
                    }))
                  }
                />
                <FilterSelect
                  label={localize('com_reference_library_orientation')}
                  value={extraFilters.orientation || ''}
                  options={['landscape', 'portrait', 'square']}
                  onChange={(value) =>
                    setExtraFilters((current) => ({
                      ...current,
                      orientation: (value || undefined) as ReferenceAssetFilters['orientation'],
                    }))
                  }
                />
                <FilterSelect
                  label={localize('com_reference_library_sort')}
                  value={extraFilters.sort || ''}
                  options={['updated-desc', 'created-desc', 'title-asc', 'rating-desc']}
                  onChange={(value) =>
                    setExtraFilters((current) => ({
                      ...current,
                      sort: (value || undefined) as ReferenceAssetFilters['sort'],
                    }))
                  }
                />
                <label className="text-text-secondary text-2xs">
                  {localize('com_reference_library_minimum_width')}
                  <input
                    type="number"
                    min="1"
                    value={extraFilters.minWidth || ''}
                    onChange={(event) =>
                      setExtraFilters((current) => ({
                        ...current,
                        minWidth: event.target.value ? Number(event.target.value) : undefined,
                      }))
                    }
                    className="border-border-medium text-text-primary mt-1 h-9 w-full rounded-lg border bg-transparent px-2 text-xs"
                  />
                </label>
                <label className="text-text-secondary text-2xs">
                  {localize('com_reference_library_minimum_height')}
                  <input
                    type="number"
                    min="1"
                    value={extraFilters.minHeight || ''}
                    onChange={(event) =>
                      setExtraFilters((current) => ({
                        ...current,
                        minHeight: event.target.value ? Number(event.target.value) : undefined,
                      }))
                    }
                    className="border-border-medium text-text-primary mt-1 h-9 w-full rounded-lg border bg-transparent px-2 text-xs"
                  />
                </label>
                <label className="text-text-secondary text-2xs">
                  {localize('com_reference_library_created_after')}
                  <input
                    type="date"
                    value={extraFilters.createdAfter?.slice(0, 10) || ''}
                    onChange={(event) =>
                      setExtraFilters((current) => ({
                        ...current,
                        createdAfter: event.target.value || undefined,
                      }))
                    }
                    className="border-border-medium text-text-primary mt-1 h-9 w-full rounded-lg border bg-transparent px-2 text-xs"
                  />
                </label>
                <button
                  onClick={saveFilter}
                  className="border-border-medium text-text-primary hover:bg-surface-secondary self-end rounded-lg border px-3 py-2 text-xs font-medium"
                >
                  {localize('com_reference_library_save_filter')}
                </button>
                <button
                  onClick={() => setExtraFilters({})}
                  className="text-text-secondary hover:bg-surface-secondary self-end rounded-lg px-3 py-2 text-xs"
                >
                  {localize('com_reference_library_clear_filters')}
                </button>
              </div>
            )}
          </div>
          {assetContent}
        </main>
        {activeAsset && (
          <AssetInspector
            key={activeAsset.id}
            asset={activeAsset}
            onClose={() => setActiveAsset(null)}
          />
        )}
      </div>
      {selected.size > 0 && (
        <div className="border-border-medium bg-surface-primary fixed bottom-5 left-1/2 z-30 flex max-w-[95vw] -translate-x-1/2 items-center gap-2 overflow-x-auto rounded-2xl border px-3 py-2.5 shadow-2xl">
          <span className="text-text-primary px-2 text-sm font-medium whitespace-nowrap">
            {selected.size} {localize('com_reference_library_selected')}
          </span>
          {view === 'trash' ? (
            <Button onClick={() => runBulk('restore')}>
              {localize('com_reference_library_restore')}
            </Button>
          ) : (
            <>
              <button
                onClick={() => runBulk('favorite')}
                className="text-text-secondary hover:bg-surface-secondary rounded-lg p-2"
                aria-label={localize('com_reference_library_add_favorites')}
              >
                <Star className="size-4" />
              </button>
              <select
                aria-label={localize('com_reference_library_set_rating')}
                defaultValue=""
                onChange={(event) =>
                  event.target.value &&
                  bulkUpdate.mutate({
                    assetIds: [...selected],
                    patch: { rating: Number(event.target.value) },
                  })
                }
                className="border-border-medium bg-surface-primary text-text-primary h-9 rounded-lg border px-2 text-xs"
              >
                <option value="">{localize('com_reference_library_rating')}</option>
                {[1, 2, 3, 4, 5].map((rating) => (
                  <option key={rating} value={rating}>
                    {localize('com_reference_library_rating_symbol', { count: rating })}
                  </option>
                ))}
              </select>
              <select
                aria-label={localize('com_reference_library_set_color')}
                defaultValue=""
                onChange={(event) =>
                  event.target.value &&
                  bulkUpdate.mutate({
                    assetIds: [...selected],
                    patch: { colorLabel: event.target.value },
                  })
                }
                className="border-border-medium bg-surface-primary text-text-primary h-9 rounded-lg border px-2 text-xs capitalize"
              >
                <option value="">{localize('com_reference_library_color_label')}</option>
                {['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'gray'].map((color) => (
                  <option key={color}>{color}</option>
                ))}
              </select>
              <select
                aria-label={localize('com_reference_library_choose_collection')}
                value={bulkCollectionId || ''}
                onChange={(event) => setBulkCollectionId(event.target.value || undefined)}
                className="border-border-medium bg-surface-primary text-text-primary h-9 max-w-40 rounded-lg border px-2 text-xs"
              >
                <option value="">{localize('com_reference_library_collections')}</option>
                {collections.data?.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.name}
                  </option>
                ))}
              </select>
              <Button
                onClick={addSelectedToCollection}
                disabled={!bulkCollectionId || collectionAssets.isLoading}
              >
                {localize('com_reference_library_add')}
              </Button>
              <Button onClick={() => runBulk('trash')} variant="outline">
                <Trash2 className="mr-2 size-4" />
                {localize('com_reference_library_move_trash')}
              </Button>
            </>
          )}
          <button
            onClick={clearSelection}
            className="hover:bg-surface-secondary rounded-lg p-2"
            aria-label={localize('com_reference_library_clear_selection')}
          >
            <X className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function WorkspaceHeader({
  view,
  setView,
}: {
  view: WorkspaceView;
  setView: (view: WorkspaceView) => void;
}) {
  const localize = useLocalize();
  return (
    <header className="border-border-light bg-surface-primary flex min-h-16 shrink-0 flex-col items-stretch gap-2 border-b px-4 py-2 sm:flex-row sm:items-center sm:justify-between lg:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => history.back()}
          className="hover:bg-surface-secondary rounded-lg p-2"
          aria-label={localize('com_ui_go_back')}
        >
          <ChevronLeft className="size-5" />
        </button>
        <div>
          <h1 className="text-text-primary text-base font-semibold">
            {localize('com_reference_library_title')}
          </h1>
          <p className="text-text-secondary hidden text-xs sm:block">
            {localize('com_reference_library_subtitle')}
          </p>
        </div>
      </div>
      <nav
        className="bg-surface-secondary flex max-w-full overflow-x-auto rounded-xl p-1"
        aria-label={localize('com_reference_library_title')}
      >
        <ViewTab active={view === 'library'} onClick={() => setView('library')}>
          {localize('com_reference_library_title')}
        </ViewTab>
        <ViewTab active={view === 'imports'} onClick={() => setView('imports')}>
          {localize('com_reference_library_browse_import')}
        </ViewTab>
        <ViewTab active={view === 'trash'} onClick={() => setView('trash')}>
          {localize('com_reference_library_trash')}
        </ViewTab>
      </nav>
    </header>
  );
}

function ViewTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition',
        active
          ? 'bg-surface-primary text-text-primary shadow-sm'
          : 'text-text-secondary hover:text-text-primary',
      )}
    >
      {children}
    </button>
  );
}

function FilterButton({
  active = false,
  onClick,
  icon,
  label,
  count,
}: {
  active?: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'mb-0.5 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm',
        active
          ? 'bg-link/10 text-link-hover font-medium'
          : 'text-text-secondary hover:bg-surface-secondary hover:text-text-primary',
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && <span className="text-xs opacity-60">{count}</span>}
    </button>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const localize = useLocalize();
  return (
    <label className="text-text-secondary text-2xs">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="border-border-medium bg-surface-primary text-text-primary mt-1 h-9 w-full rounded-lg border px-2 text-xs capitalize"
      >
        <option value="">{localize('com_reference_library_any')}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option.replace('-', ' ')}
          </option>
        ))}
      </select>
    </label>
  );
}
