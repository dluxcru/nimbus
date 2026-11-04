function validatedReferenceLibraryMetadata(value) {
  if (
    value == null ||
    typeof value !== 'object' ||
    typeof value.assetId !== 'string' ||
    value.assetId.length === 0 ||
    typeof value.title !== 'string' ||
    value.title.length === 0 ||
    !Number.isSafeInteger(value.position) ||
    value.position < 0 ||
    (value.purpose != null && typeof value.purpose !== 'string')
  ) {
    return null;
  }

  return {
    assetId: value.assetId,
    title: value.title,
    ...(value.purpose != null ? { purpose: value.purpose } : {}),
    position: value.position,
  };
}

/**
 * Restores the turn-specific reference snapshot after buildMessageFiles has
 * authorized and hydrated the attachment rows from the database. Request
 * metadata never supplies the file itself or any metadata outside this
 * allowlist.
 */
function mergeReferenceLibraryMetadata(requestFiles, hydratedFiles) {
  if (!Array.isArray(requestFiles) || !Array.isArray(hydratedFiles)) {
    return hydratedFiles;
  }

  const referencesByFileId = new Map();
  for (const file of requestFiles) {
    if (typeof file?.file_id !== 'string' || referencesByFileId.has(file.file_id)) {
      continue;
    }
    const reference = validatedReferenceLibraryMetadata(file.metadata?.referenceLibrary);
    if (reference) {
      referencesByFileId.set(file.file_id, reference);
    }
  }

  return hydratedFiles.map((file) => {
    const reference = referencesByFileId.get(file?.file_id);
    if (!reference) {
      return file;
    }
    return {
      ...file,
      metadata: {
        ...file.metadata,
        referenceLibrary: reference,
      },
    };
  });
}

module.exports = { mergeReferenceLibraryMetadata };
