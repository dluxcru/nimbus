const { mergeReferenceLibraryMetadata } = require('./referenceLibraryMetadata');

describe('mergeReferenceLibraryMetadata', () => {
  it('copies only validated reference snapshot fields onto matching authorized files', () => {
    const hydrated = [
      {
        file_id: 'file-1',
        filename: 'castle.png',
        metadata: { fileIdentifier: 'trusted-db-value' },
      },
    ];
    const requestFiles = [
      {
        file_id: 'file-1',
        metadata: {
          referenceLibrary: {
            assetId: 'asset-1',
            title: 'Castle',
            purpose: 'architecture',
            position: 2,
            ownerId: 'must-not-persist',
          },
          fileIdentifier: 'untrusted-request-value',
        },
      },
    ];

    expect(mergeReferenceLibraryMetadata(requestFiles, hydrated)).toEqual([
      {
        file_id: 'file-1',
        filename: 'castle.png',
        metadata: {
          fileIdentifier: 'trusted-db-value',
          referenceLibrary: {
            assetId: 'asset-1',
            title: 'Castle',
            purpose: 'architecture',
            position: 2,
          },
        },
      },
    ]);
  });

  it('leaves ordinary, unmatched, and malformed attachments unchanged', () => {
    const ordinary = { file_id: 'ordinary', filename: 'notes.txt' };
    const malformed = { file_id: 'malformed', filename: 'bad.png' };
    const hydrated = [ordinary, malformed];
    const requestFiles = [
      {
        file_id: 'unmatched',
        metadata: {
          referenceLibrary: {
            assetId: 'asset-other',
            title: 'Other',
            position: 0,
          },
        },
      },
      {
        file_id: 'malformed',
        metadata: {
          referenceLibrary: {
            assetId: 'asset-bad',
            title: 'Bad',
            position: -1,
          },
        },
      },
    ];

    const merged = mergeReferenceLibraryMetadata(requestFiles, hydrated);

    expect(merged).toEqual(hydrated);
    expect(merged[0]).toBe(ordinary);
    expect(merged[1]).toBe(malformed);
  });
});
