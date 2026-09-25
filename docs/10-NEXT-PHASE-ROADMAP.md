# Next Phase Roadmap

## PolyLive: From Validated Library to Deployed Application (Phases 2–5)

---

## 1. Current State: End of Phase 1

Phase 1 — the Claude-Obsidian experiment — is complete. It produced:

- **134 TypeScript files** implementing Domain, Application, Infrastructure, Native, and State layers
- **304 tests** across 24 suites (297 passing + 7 documented todos)
- **67 Obsidian vault notes** with explicit wikilink dependencies
- **52% average token savings** vs. monolithic documentation approach
- **3 bugs found and fixed** during integration testing
- **5-layer architecture** validated with zero import rule violations
- **React Native integration** verified with Skia, BLE, Camera, Permissions, and FileSystem adapters

What does not exist yet: rendered UI screens, a running APK on a physical device, network connectivity, backup/restore infrastructure, and field validation. Phase 1 proved the methodology and built the library; Phases 2–5 build the application.

---

## 2. Phase 2 — System Infrastructure (Estimated: 1–2 Weeks)

### 2.1 Objective

Implement the three system-level UseCases identified as gaps during Phase 1, plus the centralized error model. These are foundational services that every screen and feature depends on.

### 2.2 Deliverables

**AppError centralized error type.**
`shared/errors/AppError.ts` — a structured error type with error codes, user-facing messages (localized), and technical detail fields. Every UseCase currently throws ad-hoc errors; this replaces all of them with a single, consistent error type that the UI layer can present uniformly.

Specification source: `arquitectura-carpetas-v1.md` §5, already fully specified.
Testing: Unit tests for error construction, serialization, and code-to-message mapping.

**RecoverRoomDraftUseCase.**
Reads from the `polygon_drafts` SQLite table (which already persists correctly, verified by `CrashRecovery.test.ts`) and reconstructs an in-progress Room with its partial wall geometry. Presents the user with a "Restore last survey?" dialog on app launch if draft data exists.

Specification source: Master Technical Document §7.10.
Testing: Integration test against real SQLite, verifying roundtrip from partial room → crash → restore → complete room.

**BackupDatabaseUseCase and RestoreDatabaseUseCase.**
Implements the rotational backup strategy from `backup-integridad.md`: up to 5 backups stored in the document directory, most recent first. Restore reads the most recent backup that passes its own integrity verification (SQLite `PRAGMA integrity_check`). Automatic backup triggers after every completed room export.

Specification source: `backup-integridad.md`, fully specified.
Testing: Integration test covering backup creation, rotation (6th backup deletes 1st), restore from latest valid, restore skip of corrupted backup to previous valid.

### 2.3 Vault Updates

Add vault notes for each new UseCase in `02-Aplicación/use-cases/`. Add a note for `AppError` in a new `shared/` vault folder. Update `mentioned-in` fields to reference Phase 2.

### 2.4 Quality Gate

- All existing 304 tests still passing (regression)
- New tests for all 4 deliverables passing
- `tsc --noEmit` clean
- No new import rule violations

---

## 3. Phase 3 — UI Implementation (Estimated: 3–4 Weeks)

### 3.1 Objective

Build the 9 React Native screens and reusable components specified in `sistema-wireframes-maestro.md`, connecting them to the existing UseCases, Commands, and State layer.

### 3.2 Screen Inventory

| Screen | Purpose | Key Components |
|---|---|---|
| `OperatorSelector` | Select or create operator profile | List, search, create form |
| `Dashboard` | Project overview, recent surveys | Card list, stats summary |
| `ProjectNavigator` | Browse projects and sites | Tree navigation, search |
| `SurveyScreen` | Main surveying interface — wall tracing, measurement, object placement | SkiaCanvas, PropertyPanel, FAB, UndoRedoButtons |
| `AuditPhotoScreen` | Capture and link photos to BIM objects | Camera preview, object selector, photo gallery |
| `ExportScreen` | Export room/project as IFC, preview before export | Export options, preview, progress indicator |
| `SettingsScreen` | App configuration, BLE pairing, backup management | Settings list, BLE scanner, backup controls |
| `OperatorProfileManager` | Edit operator profile details | Form fields, validation |
| `StatusBar` | Persistent status bar showing BLE connection, GPS signal, battery | Status indicators, tap-to-diagnose |

### 3.3 Implementation Order

1. **SurveyScreen** (the core experience) — integrates SkiaCanvas, GestureHandler, SnapHandler, MiterHandler, UndoRedoButtons, and PropertyPanel. This is the highest-risk screen because it exercises the most layers simultaneously.
2. **AuditPhotoScreen** — integrates ExpoPhotoCapture and LinkPhotoToObjectUseCase. Tests the camera permission flow on real devices.
3. **ExportScreen** — integrates ExportRoomIfcUseCase and ExpoFileSystemAdapter. Tests file writing on real devices.
4. **Dashboard + ProjectNavigator** — navigation infrastructure and data display.
5. **OperatorSelector + OperatorProfileManager** — user identity management.
6. **SettingsScreen** — BLE pairing (integrates BLEManager), backup management (integrates Backup/Restore UseCases).
7. **StatusBar** — persistent status indicators across all screens.

### 3.4 State Management: Zustand Slice Separation

The current `appStore.ts` is a single Zustand store. Phase 3 separates it into 4 slices as specified:

- `survey-slice`: Active survey state (current room, wall-in-progress, selected object)
- `ble-slice`: BLE connection state (connected device, signal strength, measurement history)
- `ui-slice`: UI state (canvas transform, interaction mode, selected tool)
- `control-points-slice`: Survey control points and site coordinate system

### 3.5 Navigation

React Navigation v6 with a `RootStack` containing all 9 screens. The navigation structure follows the user flow documented in `app-levantamientos-bim-arquitectura-ui-v1.1.md`:

```
OperatorSelector → Dashboard → ProjectNavigator → SurveyScreen
                                                       ↕
                                                  AuditPhotoScreen
                                                       ↕
                                                  ExportScreen
Settings accessible from Dashboard via gear icon
```

### 3.6 Import Layer Enforcement

**Critical:** Before writing the first screen component, implement the ESLint rule (or CI script) that fails the build if `domain/**/*.ts` imports from `react-native`, `expo-*`, or `zustand`. This rule is specified in `arquitectura-carpetas-v1.md` §2.2 and is the single most important guardrail for maintaining the architecture as UI code is added.

### 3.7 Quality Gate

- All existing tests still passing
- New component tests for each screen (at minimum: renders without crash, handles empty state, handles error state)
- Expo Dev Client build succeeds (not Expo Go — incompatible with SQLite WAL mode)
- Navigation flow testable on Android emulator

---

## 4. Phase 4 — Device Validation (Estimated: 1–2 Weeks)

### 4.1 Objective

Validate the complete application on physical Android devices, executing the field test cases that could not be automated in Phase 1's Jest environment.

### 4.2 Target Devices

- **Motorola Edge 50:** Primary test device for full functional validation
- **Moto G86:** Performance baseline device for frame rate and CDT benchmarking (if available)

### 4.3 Validation Plan

The validation follows the 4-phase plan from `plan-validacion-final.md`:

**Phase 4.A — Unit Verification (1 day):**
Run `npm test` on the device's Node.js environment (or via Expo Dev Client's test runner) to verify all 304+ tests pass in the React Native runtime, not just in desktop Node.js.

**Phase 4.B — Integration Verification (2 days):**
- Install the APK via Expo Dev Client
- Trace walls on the SurveyScreen and verify Skia rendering at 60fps
- Capture BLE measurements from a Huepar laser meter (field case #2)
- Take audit photos and verify camera permission flow
- Export a room as IFC and verify the file is written to device storage

**Phase 4.C — Field Testing (3 days):**
Execute the 10 field test cases from `pruebas-campo-10.md`:

1. ✅ Basic wall tracing (automated tests cover logic; verify UX on device)
2. ⬜ BLE measurement with real Huepar (latency, accuracy, reconnection)
3. ✅ Room closure and CDT triangulation (automated; verify visual on device)
4. ⬜ IFC export and import into Revit or IFC viewer (Gap #4)
5. ✅ Undo/redo of wall operations (automated; verify UX on device)
6. ⬜ Force-close during CREATING/EDITING and recovery (Gap #5)
7. ✅ Photo capture and linkage (automated; verify camera UX on device)
8. ✅ Multi-room project with shared walls (automated; verify on device)
9. ⬜ Network upload of IFC (Gap #6 — depends on backend)
10. ⬜ Battery stress test — 1 hour continuous use (Gap #7)

**Phase 4.D — Sign-Off (1 day):**
Code review by a second developer. Documentation review. Final regression test run. Sign-off for v0.1 release.

### 4.4 Additional Validation (from strategy document)

Three additional validation points from `estrategia-testing-y-fixtures.md` §1.4:
- **Gloved operation:** Verify touch input works with construction work gloves
- **Sunlight readability:** Verify screen contrast is sufficient under direct sunlight
- **GPS control point capture:** Verify GPS accuracy metadata is correctly captured and stored

---

## 5. Phase 5 — Production Hardening (Estimated: 2–3 Weeks)

### 5.1 Objective

Bring the application from "works on test devices" to "deployable to construction operators in the field."

### 5.2 Deliverables

**Structured logging.**
Add a logging service with severity levels (DEBUG, INFO, WARN, ERROR), timestamps, and context (current screen, active survey, last operation). Logs are written to a local file and rotatable. Critical errors trigger a user-visible notification.

**Network layer (if backend is available).**
Implement IFC file upload, project synchronization, and operator authentication. All network communication over HTTPS with certificate pinning. Retry logic with exponential backoff for unreliable field connectivity.

**Performance optimization.**
Based on Phase 4 benchmarking results: optimize Skia draw calls if frame rate is below target, optimize SQLite query patterns if write latency is noticeable during fast wall tracing, optimize APK size (tree shaking, asset compression).

**Internationalization.**
Create `i18n/es.json` and `i18n/en.json` with all user-facing strings. Integrate with the UI layer. Spanish is the primary language for field operators; English is secondary for management dashboards.

**Accessibility.**
Ensure all interactive elements have accessibility labels. Ensure minimum touch target size (48dp) for field use with gloves. Ensure sufficient color contrast for outdoor use.

### 5.3 APK Build and Distribution

- **Build system:** Expo Dev Client (not Expo Go — WAL mode incompatibility)
- **Target APK size:** ≤25 MB after optimization
- **Distribution:** Direct APK install for field testing; Google Play internal track for broader deployment
- **Update mechanism:** Expo OTA updates for JavaScript changes; full APK rebuild for native module changes

---

## 6. Timeline Summary

| Phase | Duration | Key Deliverable |
|---|---|---|
| Phase 1 (Complete) | 8 spikes | 134 files, 304 tests, methodology validated |
| Phase 2 — System Infrastructure | 1–2 weeks | AppError, RecoverRoomDraft, Backup/Restore |
| Phase 3 — UI Implementation | 3–4 weeks | 9 screens, navigation, state slices |
| Phase 4 — Device Validation | 1–2 weeks | Field testing on Motorola Edge 50 |
| Phase 5 — Production Hardening | 2–3 weeks | Logging, i18n, performance, distribution |
| **Total to v0.1 Production** | **~8–11 weeks** | |

---

## 7. Risk-Ordered Priority

If timeline pressure requires cutting scope for v0.1, the priority order (highest first) is:

1. **AppError + RecoverRoomDraftUseCase** — without error handling and crash recovery, field operators will lose trust after the first crash
2. **SurveyScreen** — the core value proposition; without it, there is no app
3. **Backup/Restore** — data loss on a construction site is unrecoverable; backups are non-negotiable for field deployment
4. **ExportScreen** — IFC export is the primary output; without it, survey data is trapped in the app
5. **BLE integration validation** — Huepar laser measurement is the app's differentiator
6. **AuditPhotoScreen** — photo documentation adds value but is not blocking
7. **SettingsScreen + OperatorSelector** — functional but secondary to the survey workflow
8. **Network upload** — can be deferred; operators can transfer IFC files via USB
9. **Battery stress test** — important for field confidence but does not block deployment

---

## 8. Continuing the Claude-Obsidian Methodology

The vault should continue to grow during Phases 2–5:
- Phase 2 adds 4–6 notes (new UseCases + AppError)
- Phase 3 adds 10–15 notes (screens, components, navigation)
- Phase 4 adds 3–5 notes (field test results, device-specific findings)
- Phase 5 adds 5–8 notes (logging, networking, i18n)

Projected vault size at v0.1: ~90–100 notes — still within the "medium" range (50–200 notes) where the methodology's scaling analysis shows the best cost-benefit ratio (see `METRICS-AND-ROI.md` §3).

Each phase should follow the same spike protocol: identify entry notes, traverse to depth 2, generate code, compile, test, commit, update vault. The methodology does not change because the scope grew — the vault's structure scales with the project.

---

## 9. Conclusion

The path from Phase 1's validated library to a production-deployed field application is approximately 8–11 weeks of focused development across 4 phases. The foundation is strong: 134 files that compile cleanly, 304 tests that pass, an architecture that has survived 8 spikes without a single import rule violation, and a methodology that demonstrably produces coherent code from fragmented specifications. The remaining work is implementation (screens, system UseCases, infrastructure) and validation (device testing, field testing) — building on a foundation that was designed to support exactly this next step.
