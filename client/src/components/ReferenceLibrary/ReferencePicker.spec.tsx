import React, { createRef, useState } from 'react';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReferenceAsset } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import ReferencePicker from './ReferencePicker';

const mockFetchNextPage = jest.fn();
const mockRefetch = jest.fn();
let mockAssetQuery: Record<string, unknown>;
let mockCollections: Record<string, unknown>;

jest.mock('@librechat/chat/components', () => ({
  FilePreview: ({ file }: { file: { filename?: string } }) => <span>{file.filename}</span>,
  getFileType: () => 'image',
}));

jest.mock('~/data-provider', () => ({
  useInfiniteReferenceLibraryAssets: () => mockAssetQuery,
  useReferenceLibraryCollections: () => mockCollections,
}));

jest.mock('~/hooks', () => ({
  useDebounce: (value: string) => value,
  useLocalize: () => (key: string, values?: Record<string, string | number>) =>
    values?.['0'] != null ? `${key}:${values['0']}` : key,
}));

const asset = (id: string, title: string): ReferenceAsset =>
  ({
    id,
    fileId: `file-${id}`,
    file: {
      user: 'user-1',
      file_id: `file-${id}`,
      filename: `${title}.png`,
      filepath: `/files/${id}.png`,
      type: 'image/png',
      bytes: 100,
      source: 'local',
      embedded: false,
      object: 'file',
      usage: 0,
    },
    title,
    notes: '',
    altText: '',
    tags: [],
    favorite: false,
    rating: null,
    colorLabel: null,
    width: 100,
    height: 100,
    orientation: 'square',
    mimeType: 'image/png',
    bytes: 100,
    source: { kind: 'upload', rightsState: 'known' },
    collectionIds: [],
    exactHash: id,
    perceptualHash: id,
    sanitizationVersion: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    trashedAt: null,
  }) as ReferenceAsset;

const first = asset('one', 'First');
const second = asset('two', 'Second');

function renderPicker(onAttach = jest.fn()) {
  const returnFocusRef = createRef<HTMLButtonElement>();
  function Harness() {
    const [open, setOpen] = useState(true);
    const localize = useLocalize();
    return (
      <>
        <button ref={returnFocusRef} type="button">
          {localize('com_reference_library_choose')}
        </button>
        <ReferencePicker
          open={open}
          onOpenChange={setOpen}
          onAttach={onAttach}
          maxSelectionCount={4}
          returnFocusRef={returnFocusRef}
        />
      </>
    );
  }
  const result = render(<Harness />);
  return { ...result, refresh: () => result.rerender(<Harness />) };
}

describe('ReferencePicker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCollections = { data: [], isLoading: false, isError: false, refetch: jest.fn() };
    mockAssetQuery = {
      data: { pages: [{ items: [first, second], nextCursor: null, total: 2 }] },
      isLoading: false,
      isFetching: false,
      isFetchingNextPage: false,
      isError: false,
      hasNextPage: false,
      fetchNextPage: mockFetchNextPage,
      refetch: mockRefetch,
    };
  });
  it('shows each owned reference as an image instead of a generic file tile', () => {
    renderPicker();

    expect(screen.getByRole('img', { name: 'First' })).toHaveAttribute('src', '/files/one.png');
    expect(screen.getByRole('img', { name: 'Second' })).toHaveAttribute('src', '/files/two.png');
  });

  it('keeps ordered selections and purpose edits when the visible query changes', async () => {
    const user = userEvent.setup();
    const onAttach = jest.fn();
    const view = renderPicker(onAttach);

    await user.click(screen.getByRole('button', { name: 'com_ui_select_var:First' }));
    await user.type(screen.getByRole('textbox', { name: 'First' }), 'lighting');

    mockAssetQuery = {
      ...mockAssetQuery,
      data: { pages: [{ items: [second], nextCursor: null, total: 1 }] },
    };
    view.refresh();
    await user.click(screen.getByRole('button', { name: 'com_ui_select_var:Second' }));
    await user.click(screen.getByRole('button', { name: 'com_reference_library_attach' }));

    expect(onAttach).toHaveBeenCalledWith([
      expect.objectContaining({
        file_id: 'file-one',
        metadata: {
          referenceLibrary: expect.objectContaining({
            assetId: 'one',
            purpose: 'lighting',
            position: 0,
          }),
        },
      }),
      expect.objectContaining({
        file_id: 'file-two',
        metadata: {
          referenceLibrary: expect.objectContaining({ assetId: 'two', position: 1 }),
        },
      }),
    ]);
  });

  it('renders a retryable error instead of the empty state', async () => {
    const user = userEvent.setup();
    mockAssetQuery = {
      ...mockAssetQuery,
      data: undefined,
      isError: true,
    };
    renderPicker();

    expect(screen.getByRole('alert')).toHaveTextContent('com_reference_library_load_error');
    expect(screen.queryByText('com_reference_library_no_match')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'com_ui_retry' }));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('loads another owned page when more assets are available', async () => {
    const user = userEvent.setup();
    mockAssetQuery = { ...mockAssetQuery, hasNextPage: true };
    renderPicker();

    await user.click(screen.getByRole('button', { name: 'com_ui_load_more' }));
    expect(mockFetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('focuses search initially and restores the invoking control after Escape', async () => {
    const user = userEvent.setup();
    renderPicker();

    await waitFor(() =>
      expect(
        screen.getByRole('searchbox', { name: 'com_reference_library_search_owned' }),
      ).toHaveFocus(),
    );
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'com_reference_library_choose' })).toHaveFocus(),
    );
  });
});
