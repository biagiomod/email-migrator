# Architecture Overview

## The core idea

The system does not convert templates directly. It translates them through a shared canonical vocabulary:

```
SourceSystem template
        ↓
  EXTRACT + NORMALIZE → canonical content blocks + UI modules
        ↓
  MAP → TargetSystem component assignments
        ↓
  ASSESS → QA, status, migration spec written to disk
        ↓
  REVIEW → human approves
        ↓
  EXPORT → TargetSystem output (Phase 2)
```

The canonical taxonomy is the contract between the two systems. Once a source template is classified, the mapping decisions are independent of the source HTML structure.

---

## What each stage does

### INGEST (`src/pipeline/ingest.ts`)
- Scans the source directory for `.html` and `.htm` files
- Derives a stable `templateId` from the file name (`payment-reminder.html` → `payment-reminder`)
- Detects and rejects file name collisions before anything is processed
- Returns a manifest of files to process

### EXTRACT (`src/extractors/html-extractor.ts`)
- Parses each HTML file using Cheerio
- Produces raw content blocks (preheader, headline, body text, CTA, disclaimer, footer content)
- Produces raw UI modules (header, hero, text block, button, divider, footer)
- Extracts personalisation tokens from text content and `href` attributes
- Does not assign IDs or validate types — that's NORMALIZE's job

The extractor is pluggable. `HtmlExtractorAdapter` ships in Phase 1. Other extractors (for different source formats) can be added by implementing `ExtractorAdapter`.

### NORMALIZE (`src/normalizers/normalizer.ts`)
- Assigns stable canonical IDs: `{templateId}:{type}:{index}` (e.g. `payment-reminder:headline:0`)
- Validates that each block and module type is in the canonical vocabulary
- Skips unrecognised types with a warning (does not crash)
- Strips invalid URLs (keeps the variable token in `variables`, drops it from `url`)
- Re-derives template-level variables from all block-level variables (deduplicated)

### MAP (`src/mappers/generic-rule-mapper.ts`)
- Applies rule tables to each content block and UI module
- Returns a `MappingResult` for each component: target module, match type, confidence, reason
- Match types: `exact` (1.0), `partial` (0.7–0.8), `none` (0), `manual_review`
- All decisions are deterministic — same input always produces the same output
- The mapper is pluggable. `GenericRuleMapper` ships in Phase 1.

### ASSESS (`src/assess/assess.ts`)
- Runs the mapper on all components
- Runs the QA rule engine (`src/qa/rules.ts`)
- Computes template status: `ready`, `needs_review`, or `blocked`
- **ASSESS is the only stage that writes to disk.** One JSON file per template in `--specs`.
- If any template produces a QA error, status is `blocked` and the pipeline exits non-zero.

### REVIEW (`src/review/server.ts` + `src/review/ui/app.html`)
- Local Express server serving a vanilla JS single-page app
- Lists templates with status badges; shows full spec detail on click
- Approve / Flag / Batch-approve actions update the spec JSON on disk immediately
- Non-technical reviewers only: no code, no JSON editing
- Runs until manually stopped (`Ctrl+C`)

### EXPORT (`src/export/types.ts` — stub)
- Phase 2. Not implemented.
- Will read approved specs and generate TargetSystem output via `ExportAdapter`.

---

## How the canonical schema works

Defined in `src/schemas/canonical-template.ts` using Zod.

**Content block types:**
`subject_line`, `preheader`, `headline`, `body_text`, `cta`, `disclaimer`, `footer_content`

**UI module types:**
`header`, `hero`, `text_block`, `button`, `divider`, `footer`

**A content block:**
```json
{
  "id": "payment-reminder:cta:0",
  "type": "cta",
  "order": 3,
  "text": "Make a payment",
  "url": "{{payUrl}}",
  "variables": ["{{payUrl}}"],
  "condition_ids": []
}
```

**A UI module:**
```json
{
  "id": "payment-reminder:button:0",
  "type": "button",
  "order": 4,
  "content_block_ids": ["payment-reminder:cta:0"]
}
```

UI modules reference content blocks by ID. There is no nesting — the structure is flat.

**A mapping result:**
```json
{
  "component_id": "payment-reminder:cta:0",
  "match_type": "partial",
  "confidence": 0.8,
  "target_module": "TargetSystem/CTA",
  "reason": "CTA content mapped; button variant requires manual confirmation.",
  "review_status": "pending"
}
```

---

## Why review is mandatory

The pipeline computes a status for each template:

| Status | When | Meaning |
|--------|------|---------|
| `ready` | All components at confidence 1.0, no QA issues | Can be batch-approved |
| `needs_review` | Any partial match, or any QA warning | Must be reviewed individually |
| `blocked` | Any QA error (empty template, missing compliance) | Cannot proceed. Fix first. |

**Export is hard-gated.** The export command requires all specs to be approved. There is no way to skip this gate.

This matters because:
- Partial matches require a human to confirm the correct TargetSystem component
- QA warnings may indicate structural issues the mapper cannot resolve automatically
- Compliance errors must never silently pass through to production

---

## QA rules (`src/qa/rules.ts`)

| Code | Severity | Trigger |
|------|----------|---------|
| `EMPTY_TEMPLATE` | error | No content blocks extracted |
| `MISSING_REQUIRED_COMPLIANCE` | error | A required compliance marker is absent |
| `VARIABLE_INCONSISTENCY` | warning | A token in a content block is not in the template-level variable list |
| `UNUSED_TEMPLATE_VARIABLE` | warning | A template-level variable is not referenced in any content block |
| `DANGLING_CONTENT_BLOCK_REF` | warning | A UI module references a content block ID that doesn't exist |

---

## Key files in the repo

```
src/
  cli/index.ts                  — Commander CLI (run / review / export)
  pipeline/
    ingest.ts                   — File discovery and template ID derivation
    runner.ts                   — Pipeline orchestration
  extractors/
    types.ts                    — ExtractorAdapter interface
    html-extractor.ts           — Cheerio-based HTML extractor
  normalizers/
    normalizer.ts               — Canonical ID assignment and validation
  mappers/
    types.ts                    — MapperAdapter interface
    generic-rule-mapper.ts      — Rule-based mapper (Phase 1)
  qa/
    rules.ts                    — QA rule engine
  assess/
    assess.ts                   — ASSESS stage (the only disk writer)
  review/
    server.ts                   — Express review server
    ui/app.html                 — Vanilla JS review UI
  export/
    types.ts                    — ExportAdapter interface stub (Phase 2)
  ai/
    types.ts                    — ClassifierAdapter interface stub (Phase 2)
  schemas/
    canonical-template.ts       — Zod schema for CanonicalTemplate

fixtures/                       — Sample templates for testing
demo/fixtures/                  — Demo templates

tests/
  extractors/
  normalizers/
  mappers/
  qa/
  assess/
  e2e/                          — End-to-end pipeline test
```
