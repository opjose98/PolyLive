# Lessons Learned

## Reflections on the Claude-Obsidian Experiment: What Worked, What Was Difficult, and What We Would Do Differently

---

## 1. Introduction

This document captures the qualitative insights from the PolyLive Claude-Obsidian experiment — the kind of knowledge that does not fit in a metrics table or an architecture diagram but that practitioners need when deciding whether and how to apply this methodology to their own projects. It is organized around three questions: What worked well enough to recommend without reservation? What was more difficult than expected? And what would we change if starting over?

---

## 2. What Worked

### 2.1 Selective Context Loading Is Real

The experiment's central hypothesis — that fragmenting documentation into atomic notes with explicit wikilinks would reduce context consumption without compromising code quality — was validated without exceptions across 8 spikes, 134 files, and 304 tests. The 52% average token savings is not a theoretical projection; it is measured across every spike, and the range (40–58%) shows that the savings are consistent, not an artifact of one lucky spike.

More importantly, the savings did not degrade as the vault grew from 8 notes (Spike #1) to 67 notes (Spike #6). This is the finding that matters for scalability: the mechanism (loading a subgraph, not the whole vault) inherently scales with subgraph size rather than vault size.

**Lesson:** If your project has documentation exceeding 500 lines and you plan to generate code across multiple sessions, the fragmentation approach pays for itself starting from the second or third spike. The initial investment in creating the vault is real work, but the compound return across subsequent spikes makes it worthwhile.

### 2.2 Architecture-Mirrored Vault Structure Prevents Drift

The decision to organize vault folders as mirrors of the codebase layers (`01-Dominio/` → `domain/`, `02-Aplicación/` → `application/`, etc.) turned out to be one of the experiment's most valuable design choices. It creates a navigational invariant: if you want to find the specification for a domain entity, you look in `01-Dominio/objetos-bim/`, and if you want to find the specification for a UseCase, you look in `02-Aplicación/use-cases/`. There is no guessing, no "where did we put that?" moment.

This structure also enforces the dependency rules by convention: a note in `01-Dominio/` that depends on a note in `03-Infraestructura/` is visually wrong in the same way that a `domain/` import from `infrastructure/` is programmatically wrong. The vault's folder structure serves as a visual lint rule.

**Lesson:** Do not organize your vault by document type (specs, designs, decisions) or by chronology (sprint-1, sprint-2). Organize it by code architecture. The vault should be a map of the codebase, not a filing cabinet for project documents.

### 2.3 Wikilinks Are Better Than File Includes

An earlier approach to managing documentation for LLM context was to use file includes or concatenation scripts to assemble the relevant sections of a monolithic document. Wikilinks are superior for three reasons:

First, they are bidirectional in Obsidian's graph view — you can see both "what does this note depend on?" and "what depends on this note?" — which makes impact analysis trivial when changing a specification.

Second, they are human-readable. A `depends-on` list of wikilinks is immediately understandable by a developer reading the note; a script that assembles context from line ranges is not.

Third, they are granular. A wikilink points to an entire note (typically 80–200 lines), not to a line range within a document. This means the unit of context loading is the atomic note — exactly the right granularity for a code generation task.

**Lesson:** Use wikilinks as the primary mechanism for declaring dependencies between notes. Avoid building custom tooling for context assembly when wikilinks + depth-limited traversal achieve the same result with zero engineering overhead.

### 2.4 The Dedicated Testing Spike Was the Most Valuable

If we had to choose a single spike from the experiment to recommend, it would be Spike #6 — the testing spike. Not because it generated the most code (it generated fewer files than Spikes #3 or #5), but because it found 3 real bugs that would have reached production otherwise.

The bugs shared a common pattern: they were contract mismatches between layers (UseCase → Infrastructure, UseCase → CDT) that were invisible to unit tests using mocks and only became visible when both sides of the contract were exercised with real implementations. This pattern is not specific to PolyLive — it applies to any layered architecture where interfaces abstract away implementation details. The mocks respect the interface contract, but the real implementations may interpret it differently.

**Lesson:** After generating code across multiple spikes, dedicate an entire spike to writing integration tests with real implementations (no mocks). This is where bugs live, and finding them before deployment is orders of magnitude cheaper than finding them in the field.

### 2.5 Branded Types Eliminated an Entire Class of Bugs

PolyLive uses branded types (`Meters`, `Degrees`, `SquareMeters`, `CanvasPoint`) to prevent mixing physical units at compile time. Throughout 134 files and 8 spikes, there was not a single unit-conversion bug. This is not because the developers were careful — it is because the type system made unit-conversion bugs impossible. You cannot pass `Degrees` where `Meters` is expected; the compiler rejects it.

This matters more in LLM-generated code than in manually written code: a human developer might notice "wait, this function expects meters but I'm passing degrees" through domain knowledge, but an LLM generating code from specifications might not catch the mismatch unless the type system enforces it.

**Lesson:** If your domain involves physical units, measurement types, or any values that should not be mixed, invest in branded types at the very start. The cost is minimal (a few type definitions); the benefit is lifelong immunity to a class of bugs that is notoriously hard to find through testing alone.

### 2.6 Honest Gap Documentation Built Trust

The 7 `it.todo()` entries in the test suite, each with an explicit reason why the test cannot be written yet, turned out to be unexpectedly valuable for building trust in the codebase. When every gap is documented, the absence of a test is a transparent decision rather than an oversight. This makes it possible to assess the codebase's actual readiness rather than relying on an inflated pass count.

**Lesson:** Never fabricate a test to fill a gap. An `it.todo()` with a reason ("requires physical device", "UseCase not implemented yet") is more honest and more useful than a test that asserts `expect(true).toBe(true)` and inflates the coverage number.

---

## 3. What Was Difficult

### 3.1 The Initial Vault Fragmentation Is Significant Work

Fragmenting the Master Technical Document (1,638 lines, 18 sections) into 67 atomic notes with explicit wikilinks was not a trivial task. It required reading every section, identifying the atomic concepts, deciding where each note belongs in the architecture-mirrored folder structure, and declaring all dependencies as wikilinks. This is knowledge-engineering work, and it took meaningful time.

The experiment did not measure this cost in hours, which is an honest limitation. What we can say is that the fragmentation cost is a one-time investment: once the vault exists, adding new notes is incremental (each new note links to existing notes), and the compound savings across spikes amortize the initial cost.

**Lesson:** Budget real time for vault creation. For a project with 1,000+ lines of documentation, expect the initial fragmentation to take 1–2 full working sessions. For a new project starting from scratch, build the vault incrementally as you write the specifications — this is faster than fragmenting a monolith retroactively.

### 3.2 API Surface Changes in Third-Party Libraries

Spike #8's 4 TypeScript compilation errors all came from the same root cause: the LLM's training data contained API patterns for older versions of `@shopify/react-native-skia` and `expo-camera` that no longer matched the current releases. Specifically:

- Skia v1 replaced `onDraw` with `Picture` + `createPicture`
- Skia's type exports are `SkCanvas`/`SkPaint`, not `Canvas`/`Paint`
- `expo-camera`'s permission functions live on the `Camera` object, not as module-level exports

These errors were diagnosable and fixable once the correct API documentation was loaded as context, but they illustrate a fundamental limitation of LLM-assisted code generation: the LLM's knowledge of library APIs is frozen at training time, and libraries evolve faster than training cycles.

**Lesson:** For every third-party library in your project, include its current API documentation (or at least its type definitions) in the vault as a reference note. Do not rely on the LLM's training data for API surface accuracy, especially for libraries that release major versions annually.

### 3.3 Mock Design Requires Disciplined Minimalism

The 6 module mocks required for Jest to test React Native code (`react-native-skia`, `expo-camera`, `expo-file-system`, `expo-location`, `expo-sqlite`, `react-native-ble-plx`) were a significant design effort. Each mock had to satisfy two contradictory requirements: it must implement enough of the real API that the code under test can execute, and it must implement as little as possible so that mock maintenance does not become a project in itself.

The principle that worked was **minimal surface + configurable responses**: each mock exposes only the API methods actually called by the codebase, using `jest.fn()` with configurable return values. No mock contains conditional logic or state machines. This kept the 6 mocks to a combined total of approximately 200 lines — manageable and maintainable.

**Lesson:** Design your mocks as narrow API stubs, not as simulations of the real library. A mock that tries to replicate the library's behavior is twice the maintenance burden and half the diagnostic value of a simple stub that returns whatever you configure.

### 3.4 SQLite Specification Lived in the Wrong Place

The SQLite persistence specification (schema, WAL mode, data model) lived in satellite project documents (the Master Technical Document, the traceability matrix) rather than in dedicated vault notes under `03-Infraestructura/sqlite/`. This meant that Spikes #2 and #5 (which both needed SQLite context) had to load sections of the monolithic document in addition to vault notes, partially defeating the purpose of the vault.

This is not a failure of the methodology — it is a failure to apply the methodology consistently. If the SQLite specification had been fragmented into vault notes the same way the CDT algorithm and IFC export were, the SQLite-related spikes would have benefited from the same selective context loading.

**Lesson:** Apply the fragmentation criterion uniformly across all domains. Do not leave some specifications in monolithic documents because "they are infrastructure details that don't need their own notes." Infrastructure specifications benefit from atomicity just as much as domain specifications do.

### 3.5 The Vault Does Not Self-Document Its Gaps

At the end of the experiment, the vault had 10 scaffolded-but-empty folders — subfolders that were created as part of the full taxonomy but never populated. These empty folders are transparent about their emptiness, but they do not actively signal "this domain is under-specified." A developer browsing the vault might assume that the absence of notes under `03-Infraestructura/ble/` means BLE is simple enough not to need specifications, when in reality it means the BLE specification was never fragmented from the monolith.

**Lesson:** For vaults larger than 50 notes, add a vault health check: a simple script that lists empty folders and warns about notes with no incoming wikilinks (orphans). This is not needed for the 50–200 note range that PolyLive operates in, but it would be essential for larger projects.

---

## 4. What We Would Do Differently

### 4.1 Fragment SQLite and BLE From the Start

As noted in §3.4, the SQLite and BLE specifications should have been fragmented into vault notes from the beginning, not left in satellite documents. If starting the experiment over, every domain that will generate code — including infrastructure domains — would get its own vault notes before any code generation begins.

### 4.2 Include Library API Documentation as Vault Notes

For each third-party library (`@shopify/react-native-skia`, `expo-camera`, `expo-sqlite`, `react-native-ble-plx`), we would create a vault note containing the current API surface: the correct import patterns, the type names, and any v1/v2 migration notes. These notes would be linked from the domain notes that specify the use of those libraries, ensuring that the correct API surface is loaded whenever Claude generates platform-specific code.

### 4.3 Measure Wall-Clock Time Per Spike

The experiment measured token savings, file counts, test counts, and compilation results — but not wall-clock time per spike. This is the metric that managers and budget holders care about most: "How much faster is this than doing it manually?" Without a controlled comparison, we cannot answer this question with data, only with the qualitative observation that the methodology produced a large, coherent codebase across 8 spikes.

If running the experiment again, we would measure: start-to-completion time for each spike, number of LLM calls per spike, and total tokens consumed (not just context tokens saved). These metrics would enable a genuine cost-benefit analysis.

### 4.4 Run `npm test` After Every Spike, Not Just at the End

Spikes #7 and #8 both generated code that was not immediately tested in the full test suite within the same session. This created a risk window where bugs could accumulate across spikes without being caught. The quality gate should be: no spike is complete until `tsc --noEmit` and `npm test` pass with all existing tests plus the new tests for that spike. This was the stated protocol, but practical constraints (session limits, environment differences) meant it was not always enforced in the same session.

### 4.5 Automate the Context Loading Protocol

The 5-step context loading protocol (identify entry note → traverse depth 2 → load subgraph → generate → test) was executed manually in each spike. For a production methodology, this should be automated: a script that takes an entry note, traverses wikilinks to depth 2, and outputs the combined context as a single document ready to paste into an LLM session. This eliminates human error in the traversal step and makes the methodology reproducible by any team member.

---

## 5. Recommendations for Other Teams

### 5.1 Start Small

Do not try to fragment your entire documentation into a vault in one sitting. Start with the highest-risk domain (the module most likely to have bugs or architectural complexity), create 5–10 notes for it, run one spike, and evaluate whether the approach works for your project before committing to the full fragmentation.

### 5.2 The Vault Is a Living Document

The vault is not a design artifact that you create once and then consume. It evolves with the codebase. When a spike reveals a specification gap, update the relevant vault note. When a new domain is added, add new notes with wikilinks to existing notes. When a specification changes, update the note — the wikilinks ensure that dependent notes' traversals will pick up the change.

### 5.3 Do Not Skip the Testing Spike

It is tempting to treat testing as an ongoing activity rather than a dedicated spike. Resist this temptation. The PolyLive experiment's 3 bugs were found precisely because Spike #6 was focused exclusively on integration testing with real implementations. The focused attention — loading the testing strategy notes, exercising cross-layer contracts, running against real SQLite and real serializers — is what surfaced the contract mismatches that no individual unit test could find.

### 5.4 TypeScript (or Equivalent) Is Not Optional

The methodology's cross-spike coherence depends critically on the type system catching mismatches between modules generated in different sessions. Without static types, you would need to rely on integration tests alone for coherence verification — and integration tests can only find bugs that you think to test for. The type system finds mismatches you did not anticipate, which is exactly what happens when modules are generated independently.

### 5.5 Measure What You Can, Admit What You Cannot

The PolyLive experiment reports token savings (52%), test counts (304), compilation results (0 errors), and bugs found (3). It does not report time savings, cost savings, or productivity multipliers — because these were not measured. This honesty about what was and was not measured is itself a lesson: overclaming undermines credibility. Report the metrics you have evidence for, and say "not measured" for the rest.

---

## 6. Conclusion

The Claude-Obsidian methodology works. It produced a 134-file, 304-test codebase with zero compilation errors, zero import rule violations, and 3 bugs found and fixed by its own testing infrastructure. It saved 52% of context tokens on average without sacrificing quality. And it scaled across 8 spikes without degradation.

It also has real costs: the initial vault fragmentation takes meaningful time, third-party library APIs need to be included as reference notes, and the testing spike requires disciplined commitment to integration testing with real implementations. These costs are worth paying for projects of sufficient size and complexity (50+ notes, multi-layer architecture, iterative development). For simpler projects, a well-structured monolithic document with clear sections may be sufficient.

The most important lesson is not about Obsidian or wikilinks or vault structures. It is about the value of explicit, traversable dependencies in documentation. When every specification declares what it depends on, context management becomes a graph traversal problem with a known algorithm — not a judgment call that varies by developer and by day. That is the insight that will outlast any specific tooling choice.
