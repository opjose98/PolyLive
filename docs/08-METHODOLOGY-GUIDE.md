# Claude-Obsidian Methodology Guide

## A Complete Framework for LLM-Assisted Code Generation with Selective Context Loading

---

## 1. Introduction

This guide codifies the methodology validated by the PolyLive experiment: using Obsidian vaults with atomic notes and explicit wikilinks as a context-management system for LLM-assisted code generation. The methodology reduced context token consumption by an average of 52% across 8 spikes while generating 134 TypeScript files and 304 tests with zero compilation errors, 3 bugs found and fixed, and full architectural coherence across modules generated in separate sessions.

This is not a theoretical framework — every technique described here was tested against a real production-quality codebase (a React Native BIM surveying application) and the results are documented with specific metrics. Where the experiment did not measure something (wall-clock time per spike, for example), this guide says so rather than extrapolating.

The guide is organized for practitioners who want to apply this methodology to their own projects. It covers vault design, note writing, spike planning, code generation workflow, testing strategy, and quality metrics.

---

## 2. Prerequisites

### 2.1 When This Methodology Applies

The Claude-Obsidian methodology is most effective for projects that meet these criteria:

**Substantial technical documentation.** The project has (or needs) technical specifications totaling 500+ lines. Below this threshold, the overhead of maintaining a vault likely exceeds the context savings.

**Multi-module architecture.** The codebase has at least 3 distinct modules or layers with defined boundaries. Single-module projects don't benefit from selective context loading because every task needs the same context.

**Iterative development.** The project will be built across multiple sessions, not in a single sitting. The vault's value compounds over time as each spike builds on the context graph established by previous spikes.

**Typed language target.** The generated code uses a statically typed language (TypeScript, Rust, Go, Java, Kotlin). The type system provides an automatic coherence check between modules generated in different sessions. Dynamically typed languages can work but lose this safety net.

### 2.2 Tools Required

- **Obsidian** (free): For vault creation, note editing, and graph visualization. The graph view is useful for verifying dependency chains but is not strictly required — the methodology works with any Markdown editor that supports wikilinks.
- **An LLM with large context window** (Claude recommended): The methodology reduces context consumption but still requires loading 10–20 notes per spike (typically 2,000–5,000 tokens of context per spike).
- **A test runner** (Jest, pytest, cargo test, etc.): Every spike must end with passing tests. The methodology uses tests as the quality gate, not code review alone.

---

## 3. Vault Design

### 3.1 Folder Structure: Mirror Your Architecture

The vault's folder structure must mirror the codebase's architectural layers. This is not organizational aesthetics — it is the mechanism that ensures a developer (or an LLM) navigating the vault follows the same mental model as navigating the codebase.

**Template folder structure:**

```
_vault/
├── 01-Domain/           Pure business logic, no external dependencies
│   ├── entities/        One note per domain entity
│   ├── algorithms/      One note per core algorithm
│   ├── validation/      Business rule specifications
│   └── types/           Type definitions, branded types, value objects
├── 02-Application/      Orchestration layer
│   ├── use-cases/       One note per use case
│   ├── commands/        Command pattern specifications (if used)
│   └── state/           State management specifications
├── 03-Infrastructure/   External system integrations
│   ├── persistence/     Database schema, ORM configuration
│   ├── export/          File format specifications (IFC, CSV, PDF, etc.)
│   └── external-apis/   Third-party API integrations
├── 04-UI/               User interface specifications
│   ├── screens/         One note per screen or view
│   ├── components/      Shared component specifications
│   └── interactions/    Gesture handling, navigation, animations
└── 05-Testing/          Testing strategy and fixtures
    ├── unit/            Unit testing approach and cases
    ├── integration/     Integration testing flows
    └── fixtures/        Test data specifications
```

**Rules:**

1. A note's folder determines which code layer it specifies. `01-Domain/entities/Wall.md` specifies `domain/entities/Wall.ts` — the path alignment is not a coincidence; it is a navigational invariant.
2. Scaffolded-but-empty folders are acceptable. They document the full intended taxonomy without fabricating content. The PolyLive vault had 10 empty folders across its 15-folder structure.
3. Cross-cutting concerns (logging, error handling, configuration) get their own folder at the appropriate layer level, not a catch-all folder.

### 3.2 Note Atomicity: The Fragmentation Criterion

The fragmentation criterion that produced the PolyLive vault's 67 notes: **if a unit of content is something someone would cite separately in a technical review, it becomes its own note.**

Examples of correct atomicity:
- ✅ One note for the CDT algorithm specification
- ✅ One note for CDT test cases (separate from the algorithm note — a reviewer might discuss test coverage without the algorithm details)
- ✅ One note per domain entity (Wall, Door, Room, Column, Window, Floor)
- ✅ One note for the Command base interface, separate from CommandStack semantics

Examples of incorrect atomicity:
- ❌ One note for "all geometry" (too coarse — CDT, miter joints, snapping, and projections are independently citable)
- ❌ One note per method of a class (too fine — methods are not independently citable in a review)
- ❌ One note for "types" combining branded types, value objects, and IDs (citable as separate concepts)

**Target note size:** 80–200 lines of Markdown. Notes shorter than 50 lines are probably too atomic; notes longer than 300 lines are probably not atomic enough.

### 3.3 Wikilink Conventions

Every note declares its dependencies in YAML frontmatter:

```yaml
---
name: CreateWallUseCase
depends-on:
  - "[[Wall-specification]]"
  - "[[Command-abstraction]]"
  - "[[CommandStack]]"
  - "[[IObjectStore]]"
mentioned-in: [spike-4]
---
```

**Rules:**

1. `depends-on` lists every note that a developer (or LLM) must understand to implement the current note's specification. This is the mechanism that enables selective context loading.
2. Dependencies are directional: if Note A depends on Note B, it means "you cannot implement A without reading B." The reverse is not implied.
3. No circular dependencies. The vault's dependency graph must be a DAG (directed acyclic graph). This is automatically enforced if the vault mirrors an architecture with unidirectional dependency rules.
4. `mentioned-in` tracks which spike consumed the note. This is metadata for traceability, not a dependency.

---

## 4. Spike Planning

### 4.1 What Is a Spike?

In this methodology, a spike is a focused code generation session that produces a self-contained set of files and tests from a specific subgraph of the vault. A spike has:

- **An entry note:** The note that defines the primary domain of the spike.
- **A context subgraph:** The entry note plus all transitively reachable notes at depth ≤ 2.
- **An output:** TypeScript (or other language) files and their corresponding tests.
- **A quality gate:** `tsc --noEmit` (compilation) + `npm test` (all tests passing) before the spike is considered complete.

### 4.2 Spike Ordering: Start with Pure Domain, End with Integration

The PolyLive experiment validated the following spike ordering principle:

1. **First spikes: Pure domain logic.** Types, entities, algorithms — code with no external dependencies. These spikes have the smallest context subgraphs and produce the foundation types that all subsequent spikes depend on.
2. **Middle spikes: Application and infrastructure.** UseCases, Commands, persistence, export — code that orchestrates domain logic with external systems. These spikes have larger context subgraphs because they bridge layers.
3. **Late spikes: UI and integration.** Canvas rendering, gesture handling, React Native components — code that touches the platform. These have the largest context subgraphs and the highest risk of platform-specific errors.
4. **Dedicated testing spike.** After the code is generated, a spike focused exclusively on integration testing, critical cases, and edge cases. This is where real bugs surface.
5. **Platform integration spike.** The final spike adapts the generated code to the target platform (React Native, web, desktop). This tests the adapter pattern at the platform boundary.

### 4.3 Context Loading Protocol

For each spike, the context loading protocol is:

1. **Identify the entry note(s).** What domain does this spike generate code for?
2. **Traverse outgoing wikilinks to depth 2.** Starting from each entry note, follow `depends-on` links two levels deep. Collect all reached notes into the context set.
3. **Load the context set, nothing more.** The collected notes are the context for this spike. Do not load additional notes "just in case" — the wikilinks already express the necessary context.
4. **Generate code from the loaded context.** The LLM produces code files and tests based solely on the loaded context.
5. **Run the quality gate.** Compile and test. If either fails, diagnose from the loaded context first; load additional notes only if the error requires context not reachable from the entry note.

**Depth 2 rationale:** The PolyLive experiment tested depth 1 (too narrow — missed transitive dependencies), depth 2 (correct — captured necessary context without overfetching), and depth 3 (overfetching — loaded notes that were not relevant to the spike). Depth 2 is the experimentally validated default.

---

## 5. Code Generation Workflow

### 5.1 Per-Spike Workflow

```
1. SELECT entry note(s) for this spike
2. TRAVERSE wikilinks to depth 2 → context subgraph
3. LOAD context subgraph into LLM session
4. GENERATE code files following the vault's folder structure
5. GENERATE tests following the testing strategy note
6. COMPILE (tsc --noEmit or equivalent)
7. TEST (npm test or equivalent)
8. If errors:
   8a. DIAGNOSE from loaded context
   8b. If context insufficient, LOAD the specific missing note
   8c. FIX and return to step 6
9. COMMIT to repository
10. UPDATE vault notes (if the spike revealed specification gaps)
```

### 5.2 Cross-Spike Coherence

The methodology's most valuable property is that modules generated in separate spikes maintain type and architectural coherence without manual integration work. This works because:

- **Shared types are defined once** in domain-layer notes and referenced by wikilinks. Every spike that needs `Meters` or `Point2D` loads the same `tipos-geométricos.md` note.
- **Interfaces are defined in the domain layer** and implemented in higher layers. `IObjectStore`, `ICDT`, `IValidationService` are specified in domain notes; their implementations in infrastructure notes import these types without redefining them.
- **The type system enforces coherence at compile time.** If Spike #3 changes the `Command` interface, Spike #4's code won't compile until it conforms — TypeScript catches the inconsistency before tests even run.

---

## 6. Testing Strategy

### 6.1 The Four-Layer Testing Pyramid

The PolyLive experiment validated a four-layer testing approach:

**Layer 1 — Domain Unit Tests (no mocks).** Pure domain logic tests: geometry algorithms, entity validation, type conversions. These tests use no mocks because domain code has no external dependencies. They are the fastest to run and the most stable.

**Layer 2 — Application Unit Tests (mock stores).** UseCase and Command tests that mock infrastructure interfaces (`IObjectStore`, `ICDT`). These verify orchestration logic: does the UseCase call the right methods in the right order with the right arguments?

**Layer 3 — Integration Tests (real implementations).** End-to-end tests that exercise UseCases against real SQLite, real serializers, and real algorithms. **This is where real bugs are found.** The PolyLive experiment's 3 bugs were all discovered at this layer.

**Layer 4 — Platform Integration Tests (mock native modules).** Tests that verify the adapter layer between the application and the native platform (Skia, Camera, BLE, Permissions). These use Jest module mocks because the native APIs are not available in Node.js.

### 6.2 Testing Spike as Audit

The dedicated testing spike (Spike #6 in PolyLive) is methodologically distinct from the others: its purpose is to audit, not to generate. The testing notes in `05-Testing/` were written after the code existed, forcing the specifications to engage with the actual implementation rather than an idealized version.

**Template for testing notes:**

```yaml
---
name: integration-test-flows
depends-on:
  - "[[UseCase-A]]"
  - "[[UseCase-B]]"
  - "[[ObjectStore-specification]]"
  - "[[unit-testing-strategy]]"
mentioned-in: [spike-testing]
---

## Flow 1: [Name]
Steps: ...
Expected: ...
Verification: real [implementation], not mocked

## Flow 2: [Name]
...
```

### 6.3 Honest Documentation of Gaps

When a test cannot be written because the functionality is not implemented or requires unavailable hardware, use `it.todo()` with an explicit reason:

```typescript
it.todo('RecoverRoomDraftUseCase — not implemented yet (§7.10)');
it.todo('Manual Revit import — requires physical Revit license');
it.todo('Battery stress test — requires 1hr on physical device');
```

Never fabricate a test that pretends to verify what it cannot. The experiment's 7 `it.todo()` cases are more valuable than 7 passing tests that verify nothing real.

---

## 7. Quality Metrics

### 7.1 What to Measure

| Metric | How to Compute | PolyLive Value |
|---|---|---|
| Token savings per spike | (monolithic doc tokens − subgraph tokens) / monolithic doc tokens × 100 | 40–58%, avg 52% |
| Compilation success | `tsc --noEmit` exit code | 0 errors across 134 files |
| Test pass rate | passing / (passing + failing) × 100 | 100% (304/304, excl. 7 todo) |
| Cross-layer type coherence | Any `tsc` error referencing a type from another layer? | 0 violations |
| Import rule violations | Static analysis: does domain import from infrastructure? | 0 violations |
| Bugs found by integration tests | Count of behavioral defects in previously compiling code | 3 |
| Documented gaps | Count of `it.todo()` with explicit reasons | 7 |

### 7.2 What Not to Measure (or at Least Not to Overclaim)

- **"Time saved"** — unless you have a control group of developers doing the same task manually, you cannot claim a time saving figure. The PolyLive experiment did not measure this.
- **"Lines of code generated per hour"** — this metric is meaningless without quality context. 1,000 lines of wrong code is worse than 100 lines of correct code.
- **"Coverage percentage"** — line coverage alone does not indicate quality. The PolyLive experiment's estimated ~83% coverage matters less than the fact that 3 real bugs were found by the 17% of tests that exercised integration paths.

---

## 8. Templates and Checklists

### 8.1 New Note Template

```markdown
---
name: [concept-name]
depends-on:
  - "[[dependency-1]]"
  - "[[dependency-2]]"
mentioned-in: []
---

# [Concept Name]

## Purpose
[One paragraph: what this concept is and why it exists in the architecture]

## Specification
[The technical specification — types, algorithms, rules, constraints]

## Interfaces
[TypeScript interfaces this concept defines or implements]

## Validation Rules
[Business rules that apply to this concept]

## Related Concepts
[Brief description of how this concept relates to its dependencies — NOT duplicating their content, just explaining the relationship]
```

### 8.2 Pre-Spike Checklist

- [ ] Entry note(s) identified
- [ ] Wikilink traversal at depth 2 completed — context subgraph documented
- [ ] Previous spike's tests still passing (regression check)
- [ ] Target output files listed (what files will this spike produce?)
- [ ] Target test files listed (what tests will verify the output?)
- [ ] Any new dependencies from previous spikes that need to be incorporated?

### 8.3 Post-Spike Checklist

- [ ] All generated files compile (`tsc --noEmit`)
- [ ] All tests pass (`npm test`)
- [ ] No import rule violations (domain does not import from infrastructure, etc.)
- [ ] Files committed to repository
- [ ] Vault notes updated with `mentioned-in` for this spike
- [ ] Any specification gaps discovered during generation documented in the relevant note
- [ ] Token savings measured and recorded

### 8.4 Testing Spike Checklist

- [ ] Integration test flows documented as vault notes
- [ ] Tests exercise real implementations, not mocks, for contract verification
- [ ] Every bug found is documented with: discovery context, root cause, fix, regression test
- [ ] Every untestable scenario is marked with `it.todo()` and an explicit reason
- [ ] No test fabricated to inflate pass count

---

## 9. Scaling Recommendations

| Project Scale | Recommendation |
|---|---|
| **Small** (< 50 notes) | The overhead of maintaining the vault may not pay for itself. Consider a well-structured single document with clear sections instead. Fragment only if the project will grow. |
| **Medium** (50–200 notes) | The sweet spot validated by this experiment (67 notes). The vault is large enough for significant token savings, small enough to manage manually. |
| **Large** (200+ notes) | The methodology should continue to scale, but add automated tooling: orphaned note detection (notes with no incoming wikilinks), duplicate detection (two notes specifying the same concept), and depth analysis (are any subgraphs exceeding depth 2 for practical spikes?). |
| **Multi-developer teams** | The vault enables parallel development: each developer works on a different spike using a different subgraph. The shared types in the domain layer ensure coherence. This is a qualitative observation from the PolyLive experiment, not measured with actual team data. |

---

## 10. Conclusion

The Claude-Obsidian methodology is a practical, tested approach to managing context for LLM-assisted code generation. Its core insight is simple: fragment specifications into atomic notes connected by explicit dependency links, load only the relevant subgraph for each task, and verify every task with compilation and tests before moving on. The PolyLive experiment demonstrated that this approach reduces context consumption by 52% on average while maintaining complete architectural coherence across 8 spikes, 134 files, and 304 tests. The methodology is not specific to Claude or to Obsidian — any LLM with a large context window and any Markdown editor with link support can implement it. What makes it work is the discipline of atomicity, explicit dependencies, and honest quality gates.
