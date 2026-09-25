# Bugs and Gaps — Complete Analysis

## PolyLive: Every Defect Found, Fixed, and Documented Across 8 Spikes

---

## 1. Introduction

This document catalogs every defect discovered during the PolyLive Claude-Obsidian experiment: 3 genuine bugs found and fixed during Spike #6's integration testing, 4 TypeScript compilation errors found and fixed during Spike #8's React Native integration, and 7 explicitly documented gaps (`it.todo()`) that represent functionality specified but not yet implementable without hardware or infrastructure not available in the experiment's scope.

The distinction between bugs, compilation errors, and gaps is deliberate and important:

- **Bugs** are behavioral defects in code that compiled successfully but produced incorrect results at runtime. These are the most valuable findings because they prove the testing methodology works.
- **Compilation errors** are type-level or API-surface mismatches caught by the TypeScript compiler before any code executed. These demonstrate the value of TypeScript's type system but represent a different class of defect.
- **Gaps** are documented absences — functionality that the specification defines but that no code implements yet, or verification that requires physical hardware the experiment didn't have. These are honest acknowledgments, not bugs.

---

## 2. The Three Bugs (Spike #6)

All three bugs were discovered during Spike #6, which was dedicated exclusively to writing integration tests, critical case tests, and crash recovery scenarios against the code generated in Spikes #1–5. The common pattern: each bug was invisible to unit tests that used mocked dependencies and only became visible when the tests exercised the real implementation (SQLite, IFC serializer, CDT) with actual data flowing end to end.

### Bug 1: ObjectStore Did Not Persist `linkedPhotos` in SQLite Roundtrip

**Discovery context:** End-to-end test Flow 7 ("Photo Capture + Link") in `test/integration/EndToEnd.test.ts`.

**Symptom:** When `LinkPhotoToObjectUseCase` linked a photo to a Wall, the `linkedPhotos` array was correctly updated in the in-memory object. However, after writing the object to SQLite and reading it back from a fresh `ObjectStore` instance (simulating an app restart), the `linkedPhotos` field was empty.

**Root cause:** `ObjectStore.ts` serialized the object's properties to the `properties_json` column but did not include `linkedPhotos` in the serialization/deserialization mapping. The field was part of the domain object's TypeScript interface but not part of the persistence contract.

**Why unit tests missed it:** Unit tests for `LinkPhotoToObjectUseCase` used a mocked `IObjectStore` that stored and returned in-memory objects directly. A mock never serializes anything, so it never reveals serialization gaps.

**Fix:** Updated `ObjectStore.ts` to include `linkedPhotos` in both the serialization (object → `properties_json`) and deserialization (`properties_json` → object) paths.

**Regression test:** `test/critical/CriticalCases.test.ts` → "Bug 1 corregido: ObjectStore persiste y restaura linkedPhotos desde properties_json" — creates a Wall, links a photo to it, rereads the object from a new ObjectStore instance over the same database, and verifies that `linkedPhotos` contains the expected `photoId`.

**Impact assessment:** High. Without this fix, any photo linked to a BIM object would silently disappear after an app restart. The user would see the photo linkage in the current session but lose it permanently upon closing and reopening the app.

---

### Bug 2: ExportRoomIfcUseCase Mixed Doors and Windows into a Single Array

**Discovery context:** End-to-end test Flow 4 ("ExportIfc") in `test/integration/EndToEnd.test.ts`, testing against the real `IFCSerializer` (not mocked).

**Symptom:** When `ExportRoomIfcUseCase` prepared the export data for a Room containing both Doors and Windows, it filtered the Room's child objects with a combined condition (`instanceof Door || instanceof Window`) into a single array. The downstream `IFCSerializer` expected `doors` and `windows` as two separate arrays in its `SerializeInput` type.

**Root cause:** Contract misalignment between the UseCase (which treated doors and windows as interchangeable for filtering) and the Serializer (which needed them separated for IFC STEP entity generation, because `IfcDoor` and `IfcWindow` are distinct IFC entity types with different attribute schemas).

**Why unit tests missed it:** Unit tests for `ExportRoomIfcUseCase` mocked the `IFCSerializer`, and the mock accepted whatever was passed without validating the structure of the input. The contract mismatch only surfaced when the real serializer attempted to iterate `doors` and `windows` separately.

**Fix:** Updated `ExportRoomIfcUseCase.ts` (and its associated `use-cases/types.ts`) to construct and pass `doors[]` and `windows[]` as independent arrays, each filtered by the correct `instanceof` check.

**Regression test:** `CriticalCases.test.ts` → "Bug 2 corregido: ExportRoomIfcUseCase pasa doors[] y windows[] por separado al IFCSerializer" — captures the exact object that the serializer would receive and verifies that `doors` and `windows` are separate arrays, each containing instances of the correct type.

**Impact assessment:** Medium-High. Without this fix, IFC export would either fail silently (producing an invalid STEP file) or crash when the serializer tried to access Door-specific attributes on a Window object, or vice versa.

---

### Bug 3: CloseRoomUseCase Did Not Convert Circular Columns to Hole Polygons

**Discovery context:** Integration tests with the real CDT engine for Rooms containing internal Columns.

**Symptom:** When a Room with an internal Column was closed, `CloseRoomUseCase` needed to inform the CDT (Constrained Delaunay Triangulation) engine that a hole exists at the column's position. The CDT engine accepts holes as polygons (arrays of `{x, y}` vertices). However, Columns are geometrically described as circles (`{center, radius}` derived from `diameter`). The UseCase passed the circle descriptor directly, which the CDT either rejected or ignored.

**Root cause:** Missing geometric conversion step. The CDT specification (`CDT-algoritmo.md` and `CDT-casos-prueba.md`, test cases G and H) explicitly defines hole handling as polygon-based, but the UseCase implementation did not include the circle-to-polygon approximation step before calling the CDT.

**Why unit tests missed it:** Unit tests for `CloseRoomUseCase` mocked the `ICDT` interface. The mock accepted any input format for holes without validating that the input was actually a valid polygon array. The real CDT implementation enforced the polygon format.

**Fix:** Updated `CloseRoomUseCase.ts` to convert each internal Column's diameter into an approximated polygon (minimum 3 points, typically 8–12 points for smooth representation) before passing it as a hole to the CDT.

**Regression test:** `CriticalCases.test.ts` → "Bug 3 corregido: CloseRoomUseCase convierte Column.diameter en polígono de hueco antes de llamar al CDT" — creates a Room with an internal Column, captures the `holes` argument that the CDT would receive, and verifies that each hole is an array of at least 3 `{x, y}` points, explicitly **not** a `{center, radius}` descriptor.

**Impact assessment:** High. Without this fix, rooms containing columns would either fail to triangulate (causing the room closure operation to fail) or produce incorrect triangulations that ignored the column's physical presence, leading to wrong floor area calculations.

---

### Bug Pattern Analysis

All three bugs share a common pattern that has methodological significance:

1. **They were invisible to mocked unit tests.** Each bug involved a contract mismatch between two real implementations that only manifested when both sides were exercised together with actual data.

2. **They were discovered by Spike #6's integration tests.** The deliberate decision to dedicate an entire spike to integration testing — with real SQLite, real IFC serializer, real CDT engine — is what made these bugs findable.

3. **They affected data integrity, not just cosmetics.** Bug 1 caused data loss. Bug 2 produced invalid export files. Bug 3 produced incorrect geometric calculations. All three would have reached production if the testing strategy had relied solely on mocked unit tests.

This pattern validates the testing strategy's core principle: **unit tests with mocks verify logic; integration tests with real implementations verify contracts.**

---

## 3. The Four TypeScript Compilation Errors (Spike #8)

These errors were discovered during Spike #8's React Native integration. Unlike the bugs above, these were caught by the TypeScript compiler before any code executed.

### Error 1: expo-camera Permissions API Surface

**Error message:** `requestCameraPermissionsAsync is not exported from expo-camera`

**Root cause:** The permission functions in `expo-camera` are methods on the `Camera` named export object, not standalone module-level exports. The correct import is `import { Camera } from 'expo-camera'` followed by `Camera.requestCameraPermissionsAsync()`.

**Fix:** Changed import pattern and method invocation across `ExpoPhotoCapture.ts` and its mock.

### Error 2: Skia Type Names (SkCanvas / SkPaint)

**Error message:** `Cannot find name 'Canvas'` / `Cannot find name 'Paint'` (used as types)

**Root cause:** In `@shopify/react-native-skia`, `Canvas` and `Paint` are value exports (React component and paint constructor). The type aliases are `SkCanvas` and `SkPaint`, imported via `import type { SkCanvas, SkPaint }`.

**Fix:** Changed type annotations throughout `SkiaCanvasAdapter.ts` and `SkiaCanvas.tsx`.

### Error 3: Skia v1 No `onDraw` Prop

**Error message:** Property `onDraw` does not exist on type `CanvasProps`

**Root cause:** `@shopify/react-native-skia` v1 replaced the `<Canvas onDraw={...}>` pattern with `<Picture picture={createPicture(callback, rect)} />` for imperative drawing.

**Fix:** Refactored `SkiaCanvas.tsx` to use the `Picture` + `createPicture` rendering model.

### Error 4: `createPicture` Argument Order

**Error message:** Type mismatch on `createPicture` arguments

**Root cause:** `createPicture(callback, rect)` — drawing callback first, bounding rectangle second — not the reverse.

**Fix:** Swapped argument order.

**Methodological note:** These 4 errors occurred because the initial code generation used API patterns from training data that predated the current Skia v1 release. Once the correct API surface was loaded as context (via the vault's satellite documentation), all 4 errors were resolved in the same session. This illustrates both a limitation of LLM-based code generation (training data can lag behind library releases) and the effectiveness of the selective context loading approach (the correct API documentation, once loaded, immediately resolved the errors).

---

## 4. The Seven Documented Gaps (`it.todo()`)

The test suite uses `it.todo()` to explicitly mark functionality that is specified but not yet testable within the experiment's scope. Each `it.todo()` includes a reason explaining *why* the test cannot be written yet — preventing future developers from mistaking an intentional gap for a forgotten test.

### Gap 1: RecoverRoomDraftUseCase Not Implemented

**Location:** `test/integration/CrashRecovery.test.ts`
**Specification:** Master Technical Document §7.10 — the app should reconstruct a Room and its CommandStack from the `polygon_drafts` table and offer the user a choice to continue or discard.
**Current state:** The `polygon_drafts` table exists in the SQLite schema and persists correctly (verified by CrashRecovery tests). The UseCase that would read from this table and rebuild the in-progress Room does not exist as code.
**Blocking dependency:** This UseCase requires UI integration to present the "Restore last survey?" dialog. Without a UI layer, the UseCase can be implemented but not meaningfully tested end-to-end.

### Gap 2: AppError USE_CASE_ROLLBACK with Complete Context

**Location:** `test/integration/CrashRecovery.test.ts`
**Specification:** `arquitectura-carpetas-v1.md` includes `shared/errors/AppError.ts` in the planned folder structure.
**Current state:** The `shared/errors/` directory and `AppError.ts` file do not exist. UseCases currently throw ad-hoc errors without a unified error type.
**Blocking dependency:** None — this is implementable now and is recommended as a pre-Spike #8 task (see NEXT-STEPS.md §3).

### Gap 3: BackupDatabaseUseCase / RestoreDatabaseUseCase

**Location:** `test/critical/CriticalCases.test.ts`
**Specification:** `backup-integridad.md` — rotational backup strategy with up to 5 backups, restore from the most recent one that passes its own integrity verification.
**Current state:** Fully specified, not implemented. No file in `src/` implements backup or restore.
**Blocking dependency:** None — this is implementable now.

### Gap 4: Manual Verification in Revit / Real IFC Viewer

**Location:** `test/field/FieldScenarios.test.ts`, field case #4
**Specification:** The generated STEP file should import correctly into Autodesk Revit and display correct geometry.
**Current state:** STEP syntax is validated programmatically by automated tests. Visual/geometric correctness when imported into Revit cannot be automated without Revit.
**Blocking dependency:** Physical access to a Revit license and manual visual inspection.

### Gap 5: Force-Close on Physical Device During CREATING/EDITING

**Location:** `test/field/FieldScenarios.test.ts`, field case #6
**Specification:** The app should survive a force-close mid-survey and offer recovery on restart.
**Current state:** The persistence logic that survives process restart is tested in `CrashRecovery.test.ts` at the data layer. The actual recovery dialog and UX flow require a running app on a physical device.
**Blocking dependency:** Physical device with the app installed.

### Gap 6: Network Upload of IFC Files

**Location:** `test/field/FieldScenarios.test.ts`, field case #9
**Specification:** The app should upload exported IFC files to a server for team sharing.
**Current state:** No HTTP client, no upload UseCase, no synchronization logic exists in `src/`. This is entirely unbuilt infrastructure.
**Blocking dependency:** Backend API and network client implementation.

### Gap 7: Battery Stress Test (1 Hour)

**Location:** `test/field/FieldScenarios.test.ts`, field case #10
**Specification:** 1-hour continuous usage test on physical device measuring battery drain, memory leaks, and thermal behavior.
**Current state:** This is fundamentally not automatable in Jest/CI. It requires a physical device running the installed app for 60 minutes with monitoring instrumentation.
**Blocking dependency:** Physical device, battery monitoring tools, dedicated test time.

---

## 5. Additional Known Limitations (Documented in Test Comments)

Two behavioral limitations are documented as comments within passing tests, not as `it.todo()` gaps, because they describe deliberate design boundaries rather than missing implementation:

### CommandStack Does Not Persist Between Restarts

The `CommandStack` (undo/redo history) lives in memory only. Objects survive a simulated crash because each operation commits individually to SQLite, but the undo/redo history is lost. `escenarios-recuperación.md` aspires to reconstruct the full `CommandStack` after a restart; that capability is not implemented.

**Impact:** After an app restart, the user cannot undo or redo any operations from the previous session. This is a known trade-off: persisting a full command history to SQLite adds complexity and I/O overhead that may not be justified for v0.1.

### Redo After Create Does Not Restore Soft-Deleted Objects

After undoing a `CreateWallCommand` (which performs a soft-delete) and then redoing it, the object remains marked as deleted. This is because the current `Command` pattern assumes `execute()` persisted the object on first run and does not re-persist on redo.

**Impact:** The undo/redo cycle for object creation has a known asymmetry. Undo correctly soft-deletes; redo does not correctly un-soft-delete. This is explicitly verified by End-to-End Flow 5 ("Undo/Redo") so that the behavior is documented, not silently wrong.

---

## 6. Bug Detection Methodology

The table below summarizes how each defect category was detected and what testing approach was necessary to find it:

| Defect | Detection Method | Why Mocked Tests Missed It |
|---|---|---|
| Bug 1 (linkedPhotos) | Integration test with real SQLite | Mocks don't serialize |
| Bug 2 (doors/windows) | Integration test with real IFCSerializer | Mock accepted any input format |
| Bug 3 (column polygon) | Integration test with real CDT | Mock accepted any hole format |
| TS Error 1 (expo-camera) | TypeScript compiler (`tsc --noEmit`) | N/A — type-level error |
| TS Error 2 (Skia types) | TypeScript compiler | N/A — type-level error |
| TS Error 3 (Skia v1 API) | TypeScript compiler | N/A — type-level error |
| TS Error 4 (createPicture) | TypeScript compiler | N/A — type-level error |

**Key insight:** The 3 bugs were all contract mismatches between layers — a UseCase passing data in format A, an infrastructure implementation expecting format B. Mocked unit tests cannot find these because the mock adapts to whatever it receives. Only integration tests that exercise both sides of a contract simultaneously can reveal contract mismatches.

---

## 7. Recommendations

Based on the defect patterns observed across 8 spikes:

**For immediate resolution (blocks production):**
1. Implement `RecoverRoomDraftUseCase` — data persistence is proven; the UseCase needs to read `polygon_drafts` and rebuild the Room.
2. Implement `AppError` as a centralized error type — every UseCase currently throws ad-hoc errors, making UI error handling fragile.
3. Implement `BackupDatabaseUseCase` and `RestoreDatabaseUseCase` — the specification is complete; the code is missing.

**For device validation phase:**
4. Run field test case #4 (Revit import) with a real IFC viewer.
5. Run field test case #6 (force-close recovery) on the Motorola Edge 50.
6. Run field test case #10 (battery stress) as a dedicated manual test session.

**For long-term quality:**
7. Fix the redo-after-create asymmetry in the Command pattern before adding more object types.
8. Evaluate whether CommandStack persistence is worth the implementation cost for v0.1 or can be deferred to v0.2.

---

## 8. Conclusion

The PolyLive experiment's defect record — 3 bugs found and fixed, 4 compilation errors resolved, 7 gaps honestly documented — tells a specific story about testing methodology. The bugs were found precisely when the testing strategy moved from mocked unit tests to integration tests with real implementations. The compilation errors were found when the codebase expanded from pure TypeScript to platform-specific React Native APIs. And the gaps were documented rather than papered over with tests that pretend to verify what they cannot.

This defect profile is the strongest evidence that the generated codebase is a trustworthy foundation for production development: not because it is defect-free (no codebase is), but because its defects were found by its own testing infrastructure, fixed with regression coverage, and its remaining limitations are explicitly cataloged rather than hidden.
