# ARCHITECTURE COMPLETE
## 5-Layer Architecture with Dependency Rules, Patterns, and Flow Diagrams

**Project:** PolyLive — App de Levantamientos BIM  
**Author:** Jose Orozco  
**Date:** September 2026  
**Version:** 1.0 Final  

---

## 1. ARCHITECTURAL OVERVIEW

PolyLive implements a strict 5-layer architecture inspired by Clean Architecture and Domain-Driven Design principles, adapted for the constraints of a React Native + Expo mobile application. The architecture enforces unidirectional dependency flow: each layer may only depend on layers below it, never on layers above, and no layer may skip a level.

This document describes each layer in detail, the dependency rules that govern inter-layer communication, the design patterns used at each level, and the data flow through the system for key operations.

---

## 2. THE FIVE LAYERS

### 2.1 Layer 1: Domain (Pure TypeScript)

**Location:** `src/domain/`  
**Dependencies:** None. Zero imports from React Native, Expo, Zustand, or any framework.  
**Responsibility:** Defines the business model, validation rules, and geometric algorithms.

The Domain layer is the innermost ring of the architecture. Every file in this layer is pure TypeScript that can run in any JavaScript environment — Node, a browser, a test runner — without any platform dependency. This isolation is the single most important architectural decision in the project: it makes the entire business logic testable with plain Jest in Node, no simulator required.

#### Sub-modules

**`domain/objects/`** — The BIM object model:
- `RevitObjectBase.ts`: Abstract base class with `id`, `type`, `isDeleted`, `properties`, `geometry`
- `Wall.ts`: Walls with `startPoint`, `endPoint`, `thickness` (Meters), `height` (Meters), material
- `Door.ts` / `Window.ts`: Hosted elements with parent wall reference, parametric `t` position
- `Column.ts`: Freestanding structural elements with polygon footprint
- `Room.ts`: Spatial container with `outerBoundary` (Polygon2D), `holes`, `isOpen` flag
- `Floor.ts`: Implicit floor generated when a Room is closed (conditional on Room type)

**`domain/geometry/`** — Geometric algorithms:
- `CDT.ts`: Constrained Delaunay Triangulation (Bowyer-Watson), 12 validated test cases
- `miter.ts`: Wall intersection calculations for visual rendering of corner joints
- `snap.ts`: Angular snap (15° default) and vertex snap (24px + 0.5m tolerance)
- `projections.ts`: Point-to-wall-local-coordinate projection

**`domain/validation/`** — Business rule validation:
- `WallValidationService.ts`: Thickness range, minimum length, intersection checks
- `DoorValidationService.ts`: Width/height constraints, parent wall compatibility
- `RoomValidationService.ts`: Polygon closure, minimum area, self-intersection detection
- `ExportValidationService.ts`: Pre-export compatibility gate (7 check cases)

**`domain/units/`** — Type-safe measurement units:
- `branded-types.ts`: `Meters`, `Degrees`, `SquareMeters`, `CanvasPoint` — all implemented as TypeScript branded types that prevent accidental mixing of units (e.g., adding Meters to Degrees produces a compile-time error)

**`domain/ids/`** — Deterministic ID generation:
- `id-generator.ts`: Format `{SEDE}-{BLOQUE}-{PISO}-{SEQ}` following the project's hierarchical naming convention

#### Key Constraint
```
// This import would BREAK the architecture:
import { SQLiteObjectStore } from '@infrastructure/sqlite/SQLiteObjectStore'; // ❌ FORBIDDEN

// Domain defines INTERFACES that infrastructure implements:
export interface IObjectStore {
  createObject(obj: RevitObjectBase): Promise<RevitObjectId>;
  getObject(id: RevitObjectId): Promise<RevitObjectBase | null>;
  updateObject(obj: RevitObjectBase): Promise<void>;
  deleteObject(id: RevitObjectId): Promise<void>;
}
```

### 2.2 Layer 2: Application (UseCases and Commands)

**Location:** `src/application/`  
**Dependencies:** Domain layer (types and interfaces). Infrastructure via domain-defined interfaces only.  
**Responsibility:** Orchestrates business operations, manages the Command pattern for undo/redo.

The Application layer is where operations are defined. Every user-visible action (create a wall, take a measurement, export IFC) maps to a UseCase class. Operations that modify BIM objects flow through the Command pattern, enabling undo/redo.

#### UseCases (`application/use-cases/`)

Organized by functional area:

- **Objects:** `CreateWallUseCase`, `CreateColumnUseCase`, `CreateDoorUseCase`, `CreateWindowUseCase`, `UpdateWallPropertyUseCase`, `MoveWallUseCase`, `DeleteObjectUseCase`
- **Room:** `CloseRoomUseCase`, `EditClosedRoomVertexUseCase`
- **Measurements:** `CaptureMeasurementUseCase`
- **Audit:** `CapturePhotoUseCase`, `LinkPhotoToObjectUseCase`
- **Export:** `ExportRoomIfcUseCase`, `ExportSiteIfcUseCase`, `ExportRoomJsonUseCase`
- **Survey:** `CreateControlPointUseCase`, `DefineSiteCoordinateSystemUseCase`
- **System:** `RecoverRoomDraftUseCase`, `BackupDatabaseUseCase`, `RestoreDatabaseUseCase`

Each UseCase receives its dependencies via constructor injection:

```typescript
class CreateWallUseCase {
  constructor(
    private objectStore: IObjectStore,     // interface from domain/
    private commandStack: CommandStack,     // from application/
    private validator: WallValidationService // from domain/
  ) {}

  async execute(params: CreateWallParams): Promise<Wall> {
    const wall = Wall.create(params);
    this.validator.validate(wall);
    const command = new CreateWallCommand(wall, this.objectStore);
    await this.commandStack.execute(command);
    return wall;
  }
}
```

#### Commands (`application/commands/`)

The 18 typed commands implement the `ICommand` interface:

```typescript
interface ICommand {
  readonly type: string;
  execute(): Promise<void>;
  undo(): Promise<void>;
}
```

Every command guarantees symmetric execute/undo behavior — calling `undo()` restores the exact state that existed before `execute()`. This symmetry is validated by round-trip tests for each command.

**Command list:** CreateWallCommand, UpdateWallThicknessCommand, UpdateWallHeightCommand, UpdateWallMaterialCommand, MoveWallCommand, CreateDoorCommand, UpdateDoorWidthCommand, UpdateDoorHeightCommand, CreateWindowCommand, UpdateWindowWidthCommand, UpdateWindowHeightCommand, CreateColumnCommand, MoveColumnCommand, DeleteObjectCommand, CloseRoomCommand, MoveRoomVertexCommand, LinkPhotoCommand, CreateControlPointCommand.

#### CommandStack

The CommandStack manages command history with:
- **FIFO eviction:** maximum 100 commands; oldest commands are dropped when the limit is reached
- **Redo branch clearing:** executing a new command while in a mid-undo state clears the redo branch
- **Empty-stack guards:** undo/redo on an empty stack is a no-op, not an error

**Undo/Redo scope rule:** Only operations that create, modify, or delete a `RevitObjectBase` enter the CommandStack. UI configuration (theme, snap settings, zoom/pan), raw BLE measurements (before application to an object), and export operations do not enter.

### 2.3 Layer 3: Infrastructure (External Integrations)

**Location:** `src/infrastructure/`  
**Dependencies:** Domain types and interfaces. Never imports from Application, Native, or UI.  
**Responsibility:** Implements domain-defined interfaces using platform-specific technologies.

#### SQLite (`infrastructure/sqlite/`)
- `db.ts`: Database initialization with WAL mode, PRAGMA settings (journal_mode=WAL, foreign_keys=ON, synchronous=NORMAL)
- `SQLiteObjectStore.ts`: Concrete implementation of `IObjectStore`, mapping domain objects to/from the `revit_objects` table
- `DatabaseBackup.ts`: Backup with WAL checkpoint + integrity verification, triggered every 20 writes or 5 minutes
- `migrations/`: Schema migration files

#### BLE (`infrastructure/ble/`)
- `BLEManager.ts`: Generic Bluetooth Low Energy manager wrapping `react-native-ble-plx`
- `HuepaDriver.ts`: Device-specific driver for the Huepa laser measurement device — 7 samples at 100ms intervals, ±5mm accuracy, with median filtering
- `BLEReconnectionManager.ts`: Exponential backoff reconnection (1s → 2s → 4s, 3 attempts max)

#### Filesystem (`infrastructure/filesystem/`)
- `PhotoRepository.ts`: Photo storage using expo-file-system, handles JPEG compression and metadata

#### Export (`infrastructure/export/ifc/`)
- `StepEntityRegistry.ts`: STEP entity ID management (sequential #1, #2, ...)
- `GuidGenerator.ts`: IFC-compliant GUID generation (22-character base64)
- `EntityBuilders.ts`: Builders for IfcWall, IfcDoor, IfcWindow, IfcColumn, IfcSlab entities
- `IfcExporter.ts`: Orchestrator that assembles the complete IFC/STEP file, runs in a worker thread

### 2.4 Layer 4: Native (Platform Adapters) — New in Spike #8

**Location:** `src/native/`  
**Dependencies:** Domain interfaces. Platform-specific APIs (Expo, Skia).  
**Responsibility:** Wraps platform-specific native APIs behind adapter interfaces.

This layer was introduced in Spike #8 to handle React Native-specific integrations that don't fit cleanly into Infrastructure (which is more about data persistence and external services).

#### Canvas (`native/canvas/`)
- `SkiaCanvasAdapter.ts`: Implements `ICanvasRenderer` interface using @shopify/react-native-skia
  - Wraps `SkCanvas` with methods: `drawLine`, `drawRect`, `drawPath`, `drawCircle`, `drawText`, `clear`
  - Manages `SkPaint` objects for fill and stroke styles
  - Translates domain-level drawing commands to Skia-specific API calls

#### Camera (`native/camera/`)
- `ExpoPhotoCapture.ts`: Wraps expo-camera for photo capture
  - Permission management (request, check, status mapping)
  - Camera ref lifecycle management
  - Photo capture with configurable quality (0.0-1.0, default 0.8)
  - EXIF data extraction

#### Permissions (`native/permissions/`)
- `PermissionsManager.ts`: Unified permission manager for Camera, Location, and Bluetooth
  - Platform-aware (Android 12+ requires BLUETOOTH_SCAN/BLUETOOTH_CONNECT)
  - Tracks combined permission state
  - Provides `checkAll()`, `requestAll()`, `getMissing()`, `allGranted()` methods

#### File System (`native/fs/`)
- `ExpoFileSystemAdapter.ts`: Wraps expo-file-system behind a platform-agnostic interface

### 2.5 Layer 5: UI (React Native Components)

**Location:** `src/screens/`, `src/components/`, `src/state/`  
**Dependencies:** Application layer (UseCases). State layer (Zustand). Domain types only (never functions).  
**Responsibility:** Rendering, user interaction, state management.

#### Screens (`screens/`)
Eight screens in a React Navigation RootStack:
- `OperatorSelector`: Profile selection/creation
- `Dashboard`: Recent projects, quick access
- `ProjectNavigator`: Site → Block → Level → Room hierarchical navigation
- `SurveyScreen`: Main canvas workspace with 4-zone layout (menu, status bar, FAB, panel)
- `AuditPhotoScreen`: Camera + photo gallery
- `ExportScreen`: IFC/Photos/Audit export with 2D preview
- `SettingsScreen`: Basic + advanced configuration
- `OperatorProfileManager`: Profile CRUD

#### Components (`components/`)
Reusable UI building blocks:
- `Canvas2D.tsx` (SkiaCanvas): Skia canvas wrapper using `Picture` + `createPicture` for imperative rendering
- `PropertyPanel.tsx`: Hybrid drawer/expandable (40% width on tablet, fullscreen on phone)
- `FAB.tsx`: Expandable floating action button with contextual tools
- `StatusBar.tsx`: Selection context display
- `PanelEspacios.tsx`: Right drawer with space hierarchy
- `LupaPrecision.tsx`: 2-3x zoom overlay during active tracing
- `MiterPreview.tsx`: Real-time wall intersection rendering
- `PerformanceIndicator.tsx`: FPS/CPU status (green/yellow/red)

#### State (`state/`)
Zustand store with 4 slices:
- `survey-slice.ts`: `interactionMode`, `lifecycle`, `currentPolygon`, selected objects
- `ble-slice.ts`: BLE connection state, measurement data
- `ui-slice.ts`: Theme (light/dark/high-contrast), language, snap settings
- `control-points-slice.ts`: Survey control points

---

## 3. DEPENDENCY RULES MATRIX

The following matrix defines what each layer can import from:

| From ↓ / To → | UI (screens/components) | Application | Domain | Infrastructure | Native | State |
|----------------|------------------------|-------------|--------|---------------|--------|-------|
| **UI** | ✅ (between components) | ✅ (UseCases) | Types only | ❌ | ❌ | ✅ (read/subscribe) |
| **Application** | ❌ | ✅ (between UseCases) | ✅ (types + interfaces) | ✅ (via interfaces) | ✅ (via interfaces) | ✅ (write after CommandStack) |
| **Domain** | ❌ | ❌ | ✅ (between modules) | ❌ | ❌ | ❌ |
| **Infrastructure** | ❌ | ❌ | ✅ (types/interfaces) | ✅ (between modules) | ❌ | ❌ |
| **Native** | ❌ | ❌ | ✅ (types/interfaces) | ❌ | ✅ (between modules) | ❌ |
| **State** | — | — | ✅ (types) | ❌ | ❌ | ✅ (between slices) |

### Critical Rule: Domain Never Imports Framework Code

The domain layer must never contain imports from `react-native`, `expo-*`, `zustand`, `@shopify/react-native-skia`, or any other framework. This is enforced by convention and can be verified with a lint rule:

```bash
# Verification script — should return zero results
grep -r "from 'react-native\|from 'expo-\|from 'zustand\|from '@shopify" src/domain/
```

### The Interface Inversion Pattern

When Application needs Infrastructure (e.g., to persist a Wall), it never imports the concrete class. Instead:

1. **Domain** defines the interface: `IObjectStore` in `domain/objects/`
2. **Infrastructure** implements it: `SQLiteObjectStore implements IObjectStore`
3. **Application** receives it via constructor injection: `constructor(private store: IObjectStore)`
4. **Wiring** happens at the app entry point (`app/providers/`), where concrete implementations are injected

This pattern is used consistently for: `IObjectStore`, `ICanvasRenderer`, `IPhotoRepository`, `IBLEDriver`, `IFileSystem`.

---

## 4. DESIGN PATTERNS

### 4.1 Command Pattern (Application Layer)

Every BIM object mutation flows through the Command pattern:

```
User Action → UseCase → Command.execute() → CommandStack → State Update
                              ↕
                        Command.undo() (on Undo action)
```

**Benefits realized:**
- 100% undo/redo coverage for all 18 object operations
- Each command is independently testable
- CommandStack provides a clean transaction log

### 4.2 Adapter Pattern (Native Layer)

Platform-specific APIs are wrapped behind domain-defined interfaces:

```
Domain: ICanvasRenderer (interface)
  ↓ implements
Native: SkiaCanvasAdapter (wraps SkCanvas)
  ↓ used by
UI: SkiaCanvas component (provides adapter to parent)
```

**Benefits realized:**
- Domain geometry code is platform-independent
- Canvas rendering can be swapped (e.g., from Skia to a different engine) without touching domain logic
- Testing uses mock adapters in Node, no Skia required

### 4.3 Repository Pattern (Infrastructure Layer)

Data persistence follows the Repository pattern:

```
Domain: IObjectStore (interface)
  ↓ implements
Infrastructure: SQLiteObjectStore (uses expo-sqlite)
  ↓ injected into
Application: CreateWallUseCase (receives IObjectStore)
```

### 4.4 Factory Pattern

Factory functions provide clean instantiation with default configuration:

```typescript
// Domain
export function createPermissionsManager(): PermissionsManager { return new PermissionsManager(); }

// Native
export function createPhotoCapture(config?: Partial<PhotoCaptureConfig>): ExpoPhotoCapture {
  return new ExpoPhotoCapture(config);
}
```

### 4.5 Observer Pattern (State Layer)

Zustand's subscription model implements the Observer pattern for reactive state updates:

```
CommandStack.execute(command) → Zustand store.setState() → React components re-render
```

---

## 5. DATA FLOW DIAGRAMS

### 5.1 Wall Creation Flow

```
[User taps FAB → "Wall"]
    ↓
[SurveyScreen: sets interactionMode = 'drawing_wall']
    ↓
[User traces on Canvas: touch events → snap processing]
    ↓
[SkiaCanvasAdapter: renders preview line in real-time]
    ↓
[User completes trace: two endpoints captured]
    ↓
[CreateWallUseCase.execute(startPoint, endPoint, thickness)]
    ↓
  [WallValidationService.validate(wall)]
    ↓ (if valid)
  [CreateWallCommand created]
    ↓
  [CommandStack.execute(command)]
    ↓
    [command.execute() → IObjectStore.createObject(wall)]
      ↓
      [SQLiteObjectStore → INSERT INTO revit_objects]
    ↓
    [Zustand store updated: wall added to current room's objects]
    ↓
  [Canvas re-renders with new wall visible]
    ↓
  [Miter calculations triggered for adjacent walls]
```

### 5.2 BLE Measurement Flow

```
[User taps "Measure with device" in PropertyPanel]
    ↓
[CaptureMeasurementUseCase initiated]
    ↓
[BLEManager.connect() → HuepaDriver]
    ↓ (with reconnection: 1s → 2s → 4s backoff)
[HuepaDriver: capture 7 samples @ 100ms intervals]
    ↓
[Median filtering → final value in Meters]
    ↓
[User confirms → UpdateWallThicknessCommand created]
    ↓
[CommandStack.execute(command)]
    ↓
[Wall thickness updated, persisted to SQLite]
```

### 5.3 IFC Export Flow

```
[User taps "Export IFC" on ExportScreen]
    ↓
[ExportRoomIfcUseCase.execute()]
    ↓
  [ExportValidationService: 7-case compatibility gate]
    ↓ (all checks pass)
  [IObjectStore.getObjectsByRoom(roomId)]
    ↓
  [IfcExporter (runs in worker thread)]
    ↓
    [StepEntityRegistry: assigns sequential IDs]
    [GuidGenerator: creates IFC GUIDs]
    [EntityBuilders: IfcWall, IfcDoor, IfcWindow, IfcColumn, IfcSlab]
    ↓
  [Assembled .ifc STEP file]
    ↓
[File saved via ExpoFileSystemAdapter]
    ↓
[User can share/download the file]
```

---

## 6. FOLDER STRUCTURE

```
src/
├── app/                          # Entry point, global providers, root navigation
│   ├── App.tsx
│   ├── providers/                # ThemeProvider, DI container
│   └── navigation/
│       └── RootStack.tsx
├── screens/                      # One folder per screen
│   ├── OperatorSelector/
│   ├── Dashboard/
│   ├── ProjectNavigator/
│   ├── Survey/
│   ├── AuditPhoto/
│   ├── Export/
│   ├── Settings/
│   └── OperatorProfileManager/
├── components/                   # Reusable UI components
│   ├── canvas/
│   ├── property-panel/
│   ├── fab/
│   ├── status-bar/
│   ├── panel-espacios/
│   ├── undo-redo/
│   └── shared/
├── application/                  # UseCases + Commands
│   ├── use-cases/
│   │   ├── objects/
│   │   ├── room/
│   │   ├── measurements/
│   │   ├── audit/
│   │   ├── export/
│   │   ├── survey/
│   │   └── system/
│   └── commands/
├── domain/                       # Pure TypeScript — NO framework deps
│   ├── geometry/
│   ├── objects/
│   ├── validation/
│   ├── ids/
│   └── units/
├── native/                       # Platform adapters (Spike #8)
│   ├── canvas/
│   ├── camera/
│   ├── permissions/
│   └── fs/
├── infrastructure/               # External integrations
│   ├── sqlite/
│   ├── ble/
│   ├── filesystem/
│   ├── camera/
│   ├── location/
│   └── export/ifc/
├── state/                        # Zustand store
│   ├── store.ts
│   └── slices/
├── i18n/                         # Internationalization
└── shared/                       # Cross-cutting utilities
    ├── errors/
    └── utils/
```

---

## 7. IMPORT ALIASES

```json
// tsconfig.json paths
{
  "compilerOptions": {
    "paths": {
      "@app/*": ["src/app/*"],
      "@screens/*": ["src/screens/*"],
      "@components/*": ["src/components/*"],
      "@application/*": ["src/application/*"],
      "@domain/*": ["src/domain/*"],
      "@infrastructure/*": ["src/infrastructure/*"],
      "@native/*": ["src/native/*"],
      "@state/*": ["src/state/*"],
      "@shared/*": ["src/shared/*"],
      "@i18n/*": ["src/i18n/*"]
    }
  }
}
```

Convention: always import using layer aliases (`@domain/geometry/CDT`), never relative paths (`../../../domain/geometry/CDT`). This makes cross-layer violations visually obvious in code review.

---

## 8. TESTING ARCHITECTURE

Testing follows the layer boundaries:

| Layer | Test Type | Environment | Dependencies |
|-------|-----------|-------------|--------------|
| Domain | Unit tests | Node (Jest) | None — pure TypeScript |
| Application | Unit + Integration | Node (Jest) | Mock stores/adapters |
| Infrastructure | Integration tests | Node (Jest) | Mock expo-sqlite |
| Native | Unit tests | Node (Jest) | Mock Skia/Camera/Permissions |
| UI | Component tests | React Native Testing Library | Mock everything below UI |

**Key insight:** Because domain is pure TypeScript and all other layers depend on it through interfaces, 80%+ of tests run in plain Node without any React Native simulator, making the test suite fast (typically < 5 seconds for all 304 tests).

---

## 9. TECHNOLOGY STACK

| Concern | Technology | Rationale |
|---------|-----------|-----------|
| Framework | React Native + Expo (managed) | Cross-platform, managed workflow simplifies native module access |
| Language | TypeScript (strict mode) | Type safety, branded types for units |
| Canvas rendering | @shopify/react-native-skia v1 | High-performance 2D rendering, imperative API via adapters |
| State management | Zustand | Minimal boilerplate, TypeScript-friendly, no context nesting |
| Persistence | expo-sqlite (WAL mode) | Offline-first, single-file database, mature |
| BLE | react-native-ble-plx | Most mature RN BLE library |
| Camera | expo-camera | Managed workflow compatible |
| File system | expo-file-system | Managed workflow compatible |
| Navigation | React Navigation | Standard RN navigation |
| UI components | React Native Paper (Material Design 3) | Theming, accessibility |
| Testing | Jest + React Native Testing Library | Standard, fast in Node |
| Build | EAS Build | Cloud builds, no local Xcode/Android Studio required |

---

## 10. ARCHITECTURAL DECISIONS LOG

| Decision | Rationale | Alternatives Considered |
|----------|-----------|------------------------|
| 5-layer architecture | Clean separation, testability, replaceability | 3-layer (too coarse), microservices (overkill for mobile) |
| Domain = pure TypeScript | Testable anywhere, no platform lock-in | Allow React Native types in domain (rejected: couples to platform) |
| Command pattern for mutations | Undo/redo requirement, audit trail | Event sourcing (too complex), simple state diffs (no redo) |
| Adapter pattern for native | Replaceable platform APIs | Direct Skia calls in components (rejected: untestable) |
| Zustand over Redux | Less boilerplate, better TypeScript support | Redux Toolkit (verbose), MobX (magic), Jotai (atomic, less familiar) |
| SQLite WAL mode | Concurrent reads during writes, crash recovery | MMKV (no SQL), AsyncStorage (limited queries) |
| Branded types | Compile-time unit safety | Runtime validation (late errors), plain numbers (no safety) |
| expo-camera over react-native-camera | Managed workflow, maintained, simpler API | react-native-camera (deprecated) |

---

*End of Architecture Complete document. This document describes the architectural design as implemented through Spikes #1-8 of the PolyLive experiment.*
