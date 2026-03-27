# Email Migrator

A taxonomy-first tool for migrating HTML email templates from one template system to another. Instead of converting templates directly, it classifies every content and layout element against a shared canonical vocabulary, maps those elements to their target equivalents, and produces structured migration specs. No target output is generated until a human reviewer approves.

**Phase 1 complete — 57 tests passing.**

---

## How it works

```
INGEST → EXTRACT → NORMALIZE → MAP → ASSESS → REVIEW → EXPORT
```

| Stage | What it does |
|-------|-------------|
| **INGEST** | Discovers `.html` files, derives stable template IDs |
| **EXTRACT** | Parses each template into content blocks, UI modules, and variables |
| **NORMALIZE** | Assigns stable canonical IDs (`templateId:type:index`) |
| **MAP** | Matches each component to a target equivalent with confidence scoring |
| **ASSESS** | Runs QA rules, computes status, writes migration spec JSON to disk |
| **REVIEW** | Human approves or flags specs in a local browser UI |
| **EXPORT** | Generates target output from approved specs *(Phase 2)* |

Key invariants:
- ASSESS is the only stage that writes to disk
- Blocked templates halt the pipeline with a non-zero exit code
- Export is hard-gated — only runs after human approval

---

## Quickstart

**Prerequisites:** Node.js 18+

```bash
npm install
```

**Run the pipeline on the demo fixture:**

```bash
npx tsx src/cli/index.ts run \
  --source ./demo/fixtures \
  --specs ./demo/specs
```

**Launch the review UI:**

```bash
npx tsx src/cli/index.ts review \
  --specs ./demo/specs \
  --source ./demo/fixtures \
  --port 3333
```

Open `http://localhost:3333`.

**Run with your own templates:**

```bash
npx tsx src/cli/index.ts run --source ./my-templates --specs ./my-specs
npx tsx src/cli/index.ts review --specs ./my-specs --source ./my-templates
```

**Run tests:**

```bash
npm test
```

---

## CLI reference

```
migrator run     --source <dir> [--specs <dir>]
migrator review  --specs <dir> --source <dir> [--port <number>]
migrator export  --specs <dir> --output <dir>    # Phase 2, not yet implemented
```

---

## Template status

After the pipeline runs, each template is assigned one of three statuses:

| Status | Meaning |
|--------|---------|
| `ready` | All components at 100% confidence, no QA issues — eligible for batch approval |
| `needs_review` | One or more partial matches or QA warnings — review individually |
| `blocked` | QA errors (empty template, missing compliance) — pipeline exits non-zero |

---

## Tech stack

TypeScript 5 · Zod · Cheerio · Express 4 · Commander · Vitest · tsx

---

## Project structure

```
src/
  cli/                  — Commander CLI entry point
  pipeline/             — INGEST + runner orchestration
  extractors/           — HTML extractor (pluggable adapter)
  normalizers/          — Canonical ID assignment and validation
  mappers/              — Rule-based mapper (pluggable adapter)
  qa/                   — QA rule engine
  assess/               — ASSESS stage (the only disk writer)
  review/               — Express server + vanilla JS review UI
  schemas/              — Zod schema for CanonicalTemplate
  export/               — ExportAdapter stub (Phase 2)
  ai/                   — ClassifierAdapter stub (Phase 2)

fixtures/               — Sample templates for testing
demo/fixtures/          — Demo template (payment reminder)
tests/                  — Unit + e2e tests
docs/superpowers/       — Full documentation
```

---

## Documentation

Full documentation is in [`docs/superpowers/`](docs/superpowers/). Open [`docs/superpowers/index.html`](docs/superpowers/index.html) in a browser for the complete single-page presentation and reference.

| Doc | Contents |
|-----|---------|
| [Quickstart](docs/superpowers/quickstart.md) | Shortest path to running locally |
| [User Guide](docs/superpowers/user-guide.md) | Inputs, outputs, workflow, troubleshooting |
| [Architecture Overview](docs/superpowers/architecture-overview.md) | Pipeline stages, canonical schema, QA rules |
| [Demo Guide](docs/superpowers/demo-guide.md) | 2-min and 5-min demo scripts, talking points |
| [Stakeholder Presentation](docs/superpowers/stakeholder-presentation.md) | Slide deck, diagrams, exec summary, walkthrough |
| [FAQ](docs/superpowers/faq.md) | Plain-language Q&A |
| [Known Issues](docs/superpowers/known-issues.md) | Phase 1 hardening items (non-blocking) |

---

## License

[MIT](LICENSE)
