import React from 'react';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import type { ReferenceProviderResult } from 'librechat-data-provider';
import { SearchImport } from './ReferenceLibrary';

const mockSearchMutate = jest.fn();
const mockImportMutate = jest.fn();

jest.mock('~/data-provider', () => ({
  useSearchReferenceImages: () => ({
    mutate: mockSearchMutate,
    isLoading: false,
    isSuccess: false,
    isError: false,
  }),
  useImportReferenceImages: () => ({
    mutate: mockImportMutate,
    isLoading: false,
    isError: false,
  }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: Record<string, string | number>) =>
    values?.['0'] != null ? `${key}:${values['0']}` : key,
}));

const result = (id: string, title: string): ReferenceProviderResult => ({
  provider: 'wikimedia',
  providerAssetId: id,
  title,
  thumbnailUrl: `https://example.com/${id}.jpg`,
  sourcePageUrl: `https://example.com/${id}`,
  creator: 'Artist',
  licenseName: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  rightsState: 'known',
  importToken: `token-${id}`,
});

describe('SearchImport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps failed imports selected and clears successful imports', async () => {
    const user = userEvent.setup();
    const first = result('first', 'First');
    const second = result('second', 'Second');
    mockSearchMutate.mockImplementation((_request, options) =>
      options.onSuccess({
        results: [{ provider: 'wikimedia', items: [first, second], nextCursor: null }],
      }),
    );
    mockImportMutate.mockImplementation((_request, options) =>
      options.onSuccess({
        results: [
          { importToken: first.importToken, ok: true, reused: false },
          {
            importToken: second.importToken,
            ok: false,
            error: { code: 'import_failed', message: 'Source download failed' },
          },
        ],
      }),
    );

    render(<SearchImport capabilities={{ google: false, wikimedia: true, pexels: false }} />);
    await user.type(
      screen.getByRole('textbox', { name: 'com_reference_library_search_sources' }),
      'castles',
    );
    await user.click(screen.getByRole('button', { name: 'com_ui_search' }));
    await user.click(screen.getByRole('button', { name: 'com_ui_select_var:First' }));
    await user.click(screen.getByRole('button', { name: 'com_ui_select_var:Second' }));
    await user.click(screen.getByRole('button', { name: 'com_reference_library_import_selected' }));

    expect(screen.getByRole('button', { name: 'com_ui_select_var:First' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'com_ui_deselect_var:Second' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Source download failed');
  });
});
