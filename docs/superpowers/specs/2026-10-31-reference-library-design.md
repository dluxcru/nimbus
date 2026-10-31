# Reference Library Design

**Date:** 2026-10-31  
**Status:** Ready for user review  
**Target:** `dluxcru/nimbus`, forked from `LibreChat-AI/LibreChat`

## Summary

Nimbus will add a private reference-image library to LibreChat. Users can browse image providers, import durable copies, organize assets, and attach references to image requests.

The feature will use LibreChat authentication, MongoDB, file storage, and attachment paths. A separate domain module will keep the reference logic isolated from the chat and provider code.

## Goals

The first release must let a user:

1. Browse Google Images results, Wikimedia Commons, and Pexels.
2. Import a sanitized image copy with source and license data.
3. Upload a local image or save an existing LibreChat image.
4. Organize assets with collections, tags, favorites, ratings, and color labels.
5. Find assets with search, filters, saved filters, and duplicate suggestions.
6. Change metadata on multiple assets.
7. Attach individual assets or selected collection items to an image request.
8. Save a generated image to the library.
9. Move assets to trash, restore them, and purge them after the retention period.

## Non-goals

The first release will not include:

- Shared libraries or project access-control lists.
- Direct Google Images scraping.
- A remote-bookmark storage mode.
- Unsplash imports.
- Automatic license decisions.
- Artificial intelligence tagging or image caption generation.
- New image models or editing tools.
- Automatic import of all existing LibreChat files.

A user can save an existing LibreChat image to the library with an explicit action.

## Product decisions

### Fork target

LibreChat is the implementation base. It already supplies user accounts, file storage, image attachments, web search, and image-generation tools.

T3 Code is not the implementation base. It is a local coding-agent control surface and has no durable image library or image-search pipeline.

Nimbus will adopt these T3 Code interaction patterns:

- Paste and drag support.
- A thumbnail shelf for selected images.
- Movable image chips inside prompt text.
- A clear link between a chip and its image.
- Image previews and attachment validation before submission.

### Navigation

The primary interface is a dedicated **Library** workspace. A compact library picker is also available from the chat composer.

The Library workspace contains:

- All assets.
- Collections.
- Favorites.
- Imports.
- Saved filters.
- Trash.

The workspace supports a grid view and a list view. An asset inspector shows metadata, provenance, duplicate suggestions, and collection membership.

### Library ownership

Each library is private to one user. Every server query gets the owner identifier from the authenticated session.

The API returns `404` for an unknown asset and for an asset that belongs to another user. This behavior prevents identifier discovery.

## User flows

### Browse and import

1. The user opens **Browse web** in the Library workspace.
2. The user selects Google, Wikimedia, or Pexels.
3. The client sends a query and provider filters to the Nimbus API.
4. The server adapter returns normalized, temporary search results.
5. Each result shows the source, creator, and license state when available.
6. The user selects one or more results.
7. The server resolves each selected result again through its provider adapter.
8. The import pipeline validates and stores each image.
9. The new assets appear in the Imports view.

Google results show a **Rights unknown** state unless the provider supplies reliable license data. The interface keeps the source-page link visible.
The user must acknowledge this rights state before each Google import batch. Nimbus does not make a license decision for the user.

### Manage assets

The user can:

- Add or remove tags.
- Add assets to ordered collections.
- Set a favorite state.
- Set a rating from one to five.
- Set one color label.
- Edit the title, notes, and alternative text.
- Apply metadata changes to multiple selected assets.
- Save the active filter.
- Find exact and similar images.

Metadata changes to a selected group are atomic. The API rejects the complete metadata update if one selected asset is invalid.

### Use references in chat

1. The user opens the reference picker from the composer.
2. The user selects individual assets or one collection.
3. A collection selection opens a second selection step.
4. The picker shows the current image tool limits.
5. The user selects compatible collection items.
6. The composer inserts image chips at the cursor.
7. The user can add a short purpose note to each chip, such as `architecture` or `lighting`.
8. The message stores the chip order, purpose notes, and reference asset identifiers.
9. The attachment resolver verifies ownership and resolves each asset to an existing LibreChat file attachment.
10. The active image tool receives normal ordered image attachments.

Nimbus will not claim that a purpose note supplies provider-specific weighting. The note gives plain text context to the model.

### Save an image to the library

Each generated or uploaded image has a **Save to Library** action. This action uses the same validation, sanitation, hash, and metadata path as an external import. Nimbus reuses a file only when its metadata contains the current `referenceSanitizationVersion`. Otherwise, the pipeline writes a sanitized copy.

### Delete and restore

Deleting an asset moves it to trash. The default retention period is 30 days.

A user can restore an asset before the purge date. A purge removes the stored file only when no library asset, message attachment, or generated output uses that file.

## Architecture

### Client components

The client will add these bounded components:

- `ReferenceLibraryPage`: workspace route and view state.
- `ReferenceAssetGrid`: virtualized grid and bulk selection.
- `ReferenceAssetList`: sortable metadata view.
- `ReferenceAssetInspector`: metadata and provenance editor.
- `ReferenceSearchDialog`: provider search and import queue.
- `ReferenceFilterBar`: search, filters, and saved filters.
- `ReferenceCollectionNav`: collections and trash navigation.
- `ReferencePicker`: individual and collection selection from the composer.
- `ReferenceChip`: ordered inline reference and purpose note.

The composer integration will add one palette entry and one staged-context type. The existing file-upload path remains unchanged.

### Server domain

The server will add a `reference-library` domain with these interfaces:

- `ReferenceLibraryService`: asset, collection, tag, filter, and trash operations.
- `ReferenceSearchProvider`: provider search and trusted result resolution.
- `ReferenceImportPipeline`: download, validation, sanitation, hashing, storage, and metadata creation.
- `ReferenceDuplicateService`: exact and perceptual duplicate checks.
- `ReferenceAttachmentResolver`: conversion from owned asset identifiers to LibreChat attachments.
- `ReferenceFileLifecycle`: file-reference checks before a purge.

Routes will call the domain services. Routes will not access the reference collections directly.

### Search-provider contract

Each provider adapter implements this logical contract:

```ts
interface ReferenceSearchProvider {
  search(input: SearchInput, signal: AbortSignal): Promise<SearchPage>;
  resolveImport(input: ResolveImportInput, signal: AbortSignal): Promise<RemoteReference>;
}
```

`SearchPage` contains normalized results and an opaque cursor. Each result includes a signed import token that expires after 10 minutes.

The client cannot submit an arbitrary remote image URL. The server verifies the token and resolves the provider asset again before download.

### Provider adapters

The first release contains:

- **Google:** Serper image search. The adapter keeps the result page and uses the source image address only for the import. It marks rights as unknown by default.
- **Wikimedia Commons:** MediaSearch and image-information APIs. The adapter retains creator, license, attribution, and source-page data.
- **Pexels:** Pexels search API. The adapter retains the photographer and Pexels links. The interface shows the required attribution.

The server uses deployment-level credentials. It hides a provider tab when that provider is not configured.

Unsplash is not in the first release. The Unsplash API requires hotlinked image URLs for all uses. This rule conflicts with the approved durable-copy requirement.

### Import pipeline

The pipeline performs these actions in order:

1. Resolve the provider asset from a trusted token.
2. Permit only public HTTP or HTTPS destinations.
3. Resolve the host and reject private, loopback, link-local, and metadata addresses.
4. Repeat the network checks after each redirect.
5. Stream the response into temporary storage.
6. Enforce time, byte, image-dimension, and pixel-count limits.
7. Check the file signature and decoded image type.
8. Reject malformed files and decompression bombs.
9. Calculate the source SHA-256 hash.
10. Correct the image orientation and remove EXIF and GPS metadata.
11. Calculate the stored SHA-256 hash and a 64-bit perceptual hash.
12. Check for exact and similar assets that belong to the user.
13. Store the sanitized image through the configured LibreChat file strategy.
14. Create the reference metadata.
15. Remove all temporary data.

The client sends a random idempotency key for each selected provider asset. The server scopes the key to the user and keeps a completed result for 24 hours. A repeated request returns the first successful asset.

An exact source or stored hash does not create a second asset. The response identifies the existing asset and offers metadata or collection changes.

A perceptual hash with a Hamming distance of eight or less creates a similarity suggestion. It does not block the import.

### Storage

Nimbus will use the existing LibreChat file strategy for image bytes and thumbnails. This supports the configured local or object storage without a second storage system.

MongoDB will store the reference records. Every reference collection has an `ownerId` index prefix.

#### `ReferenceAsset`

- `ownerId`
- `fileId`
- `title`
- `altText`
- `notes`
- `tagIds`
- `favorite`
- `rating`
- `colorLabel`
- `mimeType`
- `width`
- `height`
- `byteSize`
- `sourceSha256`
- `storedSha256`
- `perceptualHash`
- `provenance`
- `createdAt`
- `updatedAt`
- `trashedAt`
- `purgeAfter`

`rating` is null or an integer from one to five. `colorLabel` is null or one of red, orange, yellow, green, blue, purple, or gray.

`provenance` stores:

- Provider name and provider asset identifier.
- Source-page URL and a stable public image URL when the provider supplies one. Nimbus does not store signed or credential-bearing image URLs.
- Creator name and profile URL.
- License name and license URL.
- Rights state.
- Import time.

#### `ReferenceCollection`

- `ownerId`
- `name`
- `description`
- `coverAssetId`
- `createdAt`
- `updatedAt`

#### `ReferenceCollectionItem`

- `ownerId`
- `collectionId`
- `assetId`
- `position`
- `note`

A unique index on `ownerId`, `collectionId`, and `assetId` prevents duplicate membership.

#### `ReferenceTag`

- `ownerId`
- `name`
- `normalizedName`
- `createdAt`
- `updatedAt`

A unique index on `ownerId` and `normalizedName` makes tag names case-insensitive for one user.

#### `ReferenceSavedFilter`

- `ownerId`
- `name`
- `version`
- `filter`
- `createdAt`
- `updatedAt`

The filter schema supports text, tags, collections, favorite state, rating, color label, provider, rights state, orientation, dimensions, dates, and trash state.

### API surface

The API will use `/api/reference-library` as its base path.

Resource groups:

- `/assets`
- `/collections`
- `/tags`
- `/saved-filters`
- `/search`
- `/imports`
- `/duplicates`
- `/trash`

List endpoints use cursor pagination. Bulk endpoints accept asset identifiers and return a stable operation result.

Import endpoints can return partial success because each remote image has an independent failure mode. Metadata bulk updates are atomic.

### Configuration

The LibreChat configuration will add a `referenceLibrary` block with these controls:

- Feature enabled state.
- Serper API key.
- Pexels API key.
- Wikimedia enabled state.
- Maximum import bytes.
- Maximum decoded pixels.
- Import timeout.
- Trash retention days.

The default trash retention is 30 days. The default byte and pixel limits will match or be stricter than the existing LibreChat image-upload limits.

## Search and filters

The asset list uses MongoDB indexes that start with `ownerId`. The first release will use MongoDB text search and indexed metadata filters. It will not require Atlas Search.

The Library workspace supports:

- Text search across title, notes, alternative text, creator, and tags.
- Multiple tags with AND or OR matching.
- Collection membership.
- Favorite state.
- Minimum rating.
- Color labels.
- Provider and rights state.
- Landscape, portrait, or square orientation.
- Width, height, and date ranges.
- Exact duplicates and similar-image groups.

A saved filter stores a versioned filter document. The server rejects fields that the stored version does not support.

## Image-tool integration

The reference picker asks the active image tool for its attachment capabilities. These capabilities include accepted formats, maximum files, maximum bytes, and size limits.

The picker prevents an invalid selection before submission. The server repeats the checks before it resolves the attachments.

An unknown tool uses the existing LibreChat upload limits. It does not get a false model-specific limit.

The message stores reference context separately from the asset record. Later changes to the asset title, notes, or tags do not change old messages.

## Error handling

### Search errors

A provider failure affects only that provider. Other provider tabs continue to work.

The user sees a provider-specific message. A rate-limit response shows the retry time when the provider supplies one.

### Import errors

Each import result has one of these states:

- Imported.
- Existing exact asset.
- Similar asset found.
- Rights confirmation required.
- Unsupported file.
- File too large.
- Invalid image.
- Provider unavailable.
- Storage failure.

A batch import shows one result for each selected image. A failed item does not remove a successful item.

### Atomicity and cleanup

The import pipeline creates the metadata only after file storage succeeds. If metadata creation fails, the lifecycle service removes the unreferenced file.

A background cleanup task removes abandoned temporary files and unreferenced files from interrupted imports.

### Ownership errors

The service always scopes reads and writes to the session owner. It does not trust an `ownerId` from the request body or query.

### Deletion errors

A purge first checks all known references to the file. If another record still uses the file, the purge removes only the reference asset.

## Security and privacy

The feature must:

- Reuse LibreChat authentication and request protections.
- Protect all provider credentials on the server.
- Validate each remote destination before and after redirects.
- Reject private network destinations and cloud metadata services.
- Bound download time, bytes, dimensions, and decoded pixels.
- Detect the content type from file bytes.
- Remove EXIF and GPS metadata before storage.
- Escape user metadata in the interface.
- Apply ownership checks in the service layer.
- Record import failures without provider secrets or full signed URLs.

The feature will not store new user personal information. Creator names and profile links are public source provenance.

## File lifecycle

A reference asset does not own a file exclusively. Chat messages and generated outputs can use the same file.

The lifecycle service checks file references before deletion. This check uses a single service so that future file consumers can join the same contract.

The service treats a trashed exact duplicate as the existing asset. The import response offers restoration instead of creating another asset.

## Testing

### Unit tests

Unit tests cover:

- Filter and saved-filter serialization.
- Tags, ratings, labels, and collection order.
- Exact and perceptual duplicate decisions.
- Attachment order and purpose-note serialization.
- Image-tool capability limits.
- File-reference decisions.

### Provider contract tests

Provider adapters use recorded fixtures. The normal test suite does not call live provider services.

Tests cover pagination, attribution, missing fields, malformed responses, quotas, and timeouts.

### API integration tests

Integration tests cover:

- Cross-user asset, collection, tag, and filter access.
- Server-side request forgery attempts.
- Redirects to blocked destinations.
- MIME spoofing and malformed images.
- Oversized and excessive-pixel images.
- Idempotent imports.
- Cleanup after storage or database failure.
- Exact duplicates and similar suggestions.
- Search, bulk edits, saved filters, collection order, trash, restore, and purge.

### Client tests

Client tests cover:

- Grid and list behavior.
- Keyboard and screen-reader navigation.
- Bulk selection and metadata changes.
- Provider search and import states.
- The individual asset picker.
- The collection selection step.
- Reference chip insertion, movement, editing, and removal.
- Capability-limit messages.

### End-to-end test

The main end-to-end test uses mocked external providers and a stub image tool. It performs this sequence:

1. Search a provider.
2. Import an image.
3. Check its provenance.
4. Tag, rate, label, and collect it.
5. Import an exact duplicate.
6. Import a similar image.
7. Attach individual assets and collection items.
8. Submit an image request.
9. Save the generated output to the library.
10. Move an asset to trash and restore it.

The final verification also runs LibreChat and exercises the changed path in a browser.

## Rollout and migration

The feature is disabled by default until an administrator enables `referenceLibrary`.

The release does not migrate existing files. Existing conversations and uploads continue to work without changes.

A user can save an existing image to the library. Nimbus reuses the file only when its metadata contains the current `referenceSanitizationVersion`. Otherwise, the import pipeline creates a sanitized copy.

The implementation will add database indexes through the existing LibreChat startup or migration convention.

## Acceptance criteria

The feature is complete when:

1. A user can open a private Library workspace.
2. A user can search every configured provider.
3. A user can import a sanitized, durable image with provenance.
4. A user can manage collections, tags, favorites, ratings, labels, notes, and saved filters.
5. A user can find exact duplicates and review similar-image suggestions.
6. A user can change metadata on multiple assets.
7. A user can select individual assets and collection items from the composer.
8. The active image tool receives the selected references in visible order.
9. A user can save a generated image to the library.
10. Trash, restore, retention, and safe file purge work.
11. One user cannot read or change another user’s library data.
12. Search and import failures do not corrupt successful assets.
13. Existing LibreChat upload, chat, and image-tool behavior continues to work.
14. The automated tests and the browser smoke test pass.
