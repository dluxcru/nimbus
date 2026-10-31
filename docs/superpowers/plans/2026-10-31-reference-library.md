# Reference Library Implementation Plan

**Goal:** Add a private, per-user reference-image library to LibreChat with provider search, durable sanitized imports, DAM metadata, collections, composer attachment, and generated-image capture.

**Architecture:** Keep the feature in a bounded `reference-library` domain. Reuse LibreChat authentication, MongoDB, configured file storage, file previews, and composer attachment behavior. Store library metadata in dedicated MongoDB collections. Store image bytes through the existing file-strategy functions. Expose one authenticated `/api/reference-library` route family and one lazy-loaded `/library` client workspace.

**Tech stack:** Express, Mongoose, TypeScript, React, React Query, Sharp, Undici, Jest, Playwright.

## Task 1: Shared configuration and transport contracts

**Files:**
- Modify: `packages/data-provider/src/config.ts`
- Create: `packages/data-provider/src/types/referenceLibrary.ts`
- Modify: `packages/data-provider/src/types/index.ts`
- Modify: `packages/data-provider/src/api-endpoints.ts`
- Modify: `packages/data-provider/src/data-service.ts`
- Modify: `packages/data-provider/src/keys.ts`
- Test: `packages/data-provider/src/referenceLibrary.spec.ts`

1. Add a strict `referenceLibrary` configuration schema with feature enablement, provider credentials, import limits, and trash retention.
2. Define stable request and response types for assets, collections, tags, saved filters, provider results, imports, duplicate suggestions, trash, and composer references.
3. Add endpoint builders, data-service functions, and query keys.
4. Test endpoint construction and request serialization.

## Task 2: Persistence models and owner-scoped methods

**Files:**
- Create: `packages/data-schemas/src/types/referenceLibrary.ts`
- Create: `packages/data-schemas/src/schema/referenceAsset.ts`
- Create: `packages/data-schemas/src/schema/referenceCollection.ts`
- Create: `packages/data-schemas/src/schema/referenceCollectionItem.ts`
- Create: `packages/data-schemas/src/schema/referenceTag.ts`
- Create: `packages/data-schemas/src/schema/referenceSavedFilter.ts`
- Create: `packages/data-schemas/src/methods/referenceLibrary.ts`
- Create: `packages/data-schemas/src/methods/referenceLibrary.spec.ts`
- Modify: schema/type/method/model barrel files and `createModels`/`createMethods` registration.

1. Add owner-prefixed indexes, exact-hash uniqueness, normalized tag uniqueness, collection ordering, text search, and trash indexes.
2. Implement owner-scoped asset, collection, tag, saved-filter, duplicate, trash, restore, and purge methods.
3. Make collection membership and tag writes idempotent.
4. Test cross-user isolation, duplicate handling, collection order, and trash lifecycle against MongoMemoryServer.

## Task 3: Provider adapters and signed import tokens

**Files:**
- Create: `api/server/services/ReferenceLibrary/providers.js`
- Create: `api/server/services/ReferenceLibrary/importTokens.js`
- Test: corresponding `*.spec.js` files.

1. Implement normalized search adapters for Serper Google Images, Wikimedia Commons, and Pexels.
2. Keep provider-specific fields inside adapters and return a shared result shape.
3. Sign short-lived import tokens containing provider identity, provider asset identity, canonical source URL, image URL, and preview metadata.
4. Verify token signatures and expiry before import.
5. Test normalization, provider-local errors, and tamper/expiry rejection with mocked HTTP responses.

## Task 4: Secure image fetch, sanitation, and storage

**Files:**
- Create: `api/server/services/ReferenceLibrary/imageImport.js`
- Create: `api/server/services/ReferenceLibrary/index.js`
- Test: `api/server/services/ReferenceLibrary/imageImport.spec.js`

1. Resolve signed-token imports through the provider adapter rather than accepting arbitrary client URLs.
2. Fetch with public-address DNS enforcement, per-hop redirect validation, timeout, byte limit, and actual-content sniffing.
3. Decode with Sharp using a pixel limit, auto-orient, strip metadata, and encode to configured output format.
4. Compute exact SHA-256 and perceptual dHash; deduplicate per owner.
5. Save bytes through the configured file strategy, then create the asset record. Remove the stored object if the database write fails.
6. Return stable partial-success results for bulk imports and idempotency-key retries.
7. Test SSRF blocking, redirects, MIME spoofing, oversized bodies, decompression limits, EXIF stripping, exact duplicate reuse, and rollback.

## Task 5: Authenticated API routes and startup capabilities

**Files:**
- Create: `api/server/routes/referenceLibrary.js`
- Create: `api/server/routes/referenceLibrary.spec.js`
- Modify: `api/server/routes/index.js`
- Modify: `api/server/index.js`
- Modify: `api/server/routes/config.js`
- Modify: config route tests.

1. Add authenticated routes for capabilities, assets, search, imports, duplicates, collections, tags, saved filters, trash, restore, and purge.
2. Validate every body, query, cursor, and bulk-size boundary before calling the domain service.
3. Derive `ownerId` only from the authenticated session.
4. Return startup capability data without exposing provider secrets.
5. Test authentication, feature disablement, validation, cross-user access, partial success, and response status mapping.

## Task 6: Client data layer and library workspace

**Files:**
- Create: `client/src/data-provider/ReferenceLibrary/queries.ts`
- Create: `client/src/data-provider/ReferenceLibrary/mutations.ts`
- Modify: client data-provider barrels.
- Create: `client/src/components/ReferenceLibrary/ReferenceLibraryView.tsx`
- Create supporting components in the same directory for toolbar, grid/list, inspector, provider browser, collection rail, bulk bar, trash, and duplicate review.
- Create: `client/src/routes/ReferenceLibraryRoute.tsx`
- Modify: `client/src/routes/index.tsx`
- Modify: `client/src/hooks/Nav/useUnifiedSidebarLinks.ts`
- Test: focused component and route tests.

1. Add React Query hooks with stable keys and precise cache invalidation.
2. Add a lazy `/library` route and sidebar entry shown only when enabled.
3. Implement search/filter/sort, grid/list toggle, selection, bulk metadata edits, collection/tag management, saved filters, duplicate review, trash, and restore.
4. Implement provider search tabs with per-provider loading/error state, rights metadata, Google acknowledgement, multiselect, and partial import results.
5. Preserve keyboard navigation, focus, labels, and screen-reader announcements.

## Task 7: Composer reference picker and message snapshot

**Files:**
- Create: `client/src/components/ReferenceLibrary/ReferencePicker.tsx`
- Modify: `client/src/components/Chat/Input/Composer/Palette.tsx`
- Modify: `client/src/hooks/Input/useAttachItems.ts`
- Modify: `client/src/hooks/Input/useComposerItems.ts`
- Modify: message/request types only where needed for immutable reference snapshots.
- Test: focused composer hook and picker tests.

1. Add a References section to the composer palette.
2. Let users select assets or collection members, reorder them, and add optional purpose notes.
3. Reuse existing `TFile` attachments for image delivery while sending a separate visible-order reference snapshot for model context.
4. Ensure removal, copied drafts, queued turns, and conversation restore preserve reference identity and order.
5. Test individual, collection, reorder, remove, and send flows.

## Task 8: Save existing images to the library

**Files:**
- Modify: generated/uploaded image action menus.
- Reuse: reference-library import/sanitize service and API.
- Test: focused action and API tests.

1. Add `Save to Library` to generated and uploaded image actions.
2. Reuse a file only when it carries the current sanitation-version metadata; otherwise sanitize to a new stored copy.
3. Preserve provenance linking the asset to the originating LibreChat file.
4. Test both reuse and re-sanitize paths.

## Task 9: Localization and operator configuration

**Files:**
- Modify: `client/src/locales/en/translation.json`
- Modify: `.env.example` or project configuration example only for new provider variables.
- Modify: `librechat.example.yaml`
- Modify: existing configuration documentation.

1. Add user-visible strings for all library, provider, rights, duplicate, trash, and composer states.
2. Document the feature block, required provider credentials, limits, and rights behavior.
3. Keep secrets server-side and document that imported copies are durable.

## Task 10: Verification and cleanup

1. Build `@librechat/data-schemas` and `librechat-data-provider`.
2. Run targeted data-schema, data-provider, API-route, import-security, client-workspace, and composer tests.
3. Run package typechecks and lint only on changed files.
4. Start LibreChat with mocked providers, exercise search → import → organize → attach → send → save → trash → restore in Playwright, and capture the observed result.
5. Remove temporary fixtures and stop services.
6. Commit coherent slices and push `feat/reference-library`.
