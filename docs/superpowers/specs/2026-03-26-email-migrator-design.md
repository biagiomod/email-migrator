# Email Migrator — Design Specification

**Date:** 2026-03-26
**Status:** Approved
**Scope:** Phase 1 — First batch migration

---

## 1. Problem Statement

Migrate a large set of HTML email templates from SourceSystem (SourceBrand) to TargetSystem (TargetBrand). The migration must be auditable, governed, and reviewable by non-technical stakeholders. This is treated as a translation problem, not a copy-paste problem.

**Core principle:** Source template → canonical taxonomy/schema → target template mapping. Never direct template-to-template conversion.

---

## 2. Constraints

- Rush assignment. Speed > completeness.
- May be a one-time-use tool. Do not over-engineer.
- Source template format is unknown — assume raw HTML dump until confirmed.
- Target system module structure is unknown — mapper is pluggable and implemented later.
- Fully deterministic in Phase 1. No AI. AI adapter interface is defined but not implemented.
- If AI is added in a future phase, GitHub Copilot is the preferred candidate (work environment constraint).
- Non-technical reviewers must be able to approve/reject translations without touching JSON or a terminal.

---

## 3. Pipeline

```
INGEST → EXTRACT → NORMALIZE → MAP → ASSESS → REVIEW → EXPORT
```

### Stage responsibilities

| Stage | Responsibility | Output |
|-------|---------------|--------|
| INGEST | Scan source directory. Assign stable template IDs. Record file metadata. No parsing. | Manifest (in-memory) |
| EXTRACT | Pluggable adapter parses source HTML. Identifies content regions, UI structure, variable tokens. | Raw component data (in-memory) |
| NORMALIZE | Maps raw extracted data to canonical schema (Zod-validated). Assigns stable component IDs. | CanonicalTemplate (in-memory) |
| MAP | Pluggable adapter matches canonical components to target system modules. Returns match type + confidence + reason. | CanonicalTemplate with mapping_results (in-memory) |
| ASSESS | Runs QA rules. Sets component and template status. Writes final migration spec JSON to disk. Hard exits if any template is `blocked`. | migration-spec JSON files |
| REVIEW | Local web server. Non-technical reviewer sees original email + taxonomy + proposed mapping. Approves / flags / overrides per template. Batch-approve available for exact-match templates. | Approved migration-spec JSON files |
| EXPORT | Gated: only runs after all required reviews are approved. Pluggable adapter generates target artifacts from approved specs. | Target artifacts |

### Key invariants

- **ASSESS is the only stage that writes to disk.** All prior stages operate on in-memory typed objects.
- **No target artifacts are generated until REVIEW approval.** EXPORT is hard-gated.
- **BLOCKED templates never enter REVIEW.** If ASSESS produces any `blocked` template, the pipeline exits with a non-zero code and prints a summary. Fix and re-run.
- **`ready` and `needs_review` templates both enter REVIEW.** Exact-match templates can be batch-approved.

---

## 4. Canonical Taxonomy

### 4A. Content Block Types

Plain text and copy regions. What is in the email.

| Type | Description |
|------|-------------|
| `subject_line` | Email subject |
| `preheader` | Preview/preheader text |
| `headline` | Primary heading |
| `body_text` | Main copy |
| `cta` | Call to action text + URL |
| `disclaimer` | Legal/compliance copy |
| `footer_content` | Contact info, unsubscribe link, address |

> Add new types only when observed in real templates.

### 4B. UI Module Types

Layout and structural containers. How the email is assembled.

| Type | Description |
|------|-------------|
| `header` | Logo / brand bar |
| `hero` | Full-width image or banner |
| `text_block` | Text content region |
| `button` | CTA button element |
| `divider` | Horizontal rule or spacer |
| `footer` | Bottom legal area |

> `card`, `badge`, `info_block`, `multi_column` deferred until observed.

### 4C. Variable Types

Personalization tokens extracted verbatim from source. Not resolved — catalogued only.

| Type | Example |
|------|---------|
| `string` | `{{firstName}}` |
| `date` | `{{statementDate}}` |
| `currency` | `{{accountBalance}}` |
| `number` | `{{transactionCount}}` |
| `url` | `{{ctaUrl}}` |

> `string` is always a safe fallback type.

### 4D. Conditions

Conditional sections captured but not parsed. The raw expression string is preserved for human review.

### 4E. Compliance

Minimal placeholder. Family name + `required` / `present` flags. Deep compliance taxonomy is deferred until requirements are known.

---

## 5. Canonical Schema (Zod)

```typescript
// src/schemas/canonical-template.ts

import { z } from 'zod';

const ContentBlockType = z.enum([
  'subject_line', 'preheader', 'headline',
  'body_text', 'cta', 'disclaimer', 'footer_content'
]);

const UiModuleType = z.enum([
  'header', 'hero', 'text_block',
  'button', 'divider', 'footer'
]);

const MatchType = z.enum([
  'exact', 'partial', 'none', 'manual_review'
]);

const ReviewStatus = z.enum([
  'pending', 'approved', 'rejected', 'overridden'
]);

const ContentBlock = z.object({
  id: z.string(),                         // e.g. "welcome-01:headline:0"
  type: ContentBlockType,
  order: z.number().int(),                // required — position in template, top to bottom
  role: z.string().optional(),            // e.g. "primary", "secondary"
  text: z.string(),                       // content text (may contain variable tokens)
  url: z.string().url().optional(),       // only populated for cta blocks
  variables: z.array(z.string()),         // token strings found in text — usage context
  condition_ids: z.array(z.string()),     // refs to conditions that guard this block
});

const UiModule = z.object({
  id: z.string(),
  type: UiModuleType,
  order: z.number().int(),
  variant: z.string().optional(),         // e.g. "primary_button", "hero_image"
  content_block_ids: z.array(z.string()), // content blocks inside this module
});

const Variable = z.object({
  token: z.string(),                      // e.g. "{{firstName}}"
  type: z.enum(['string', 'date', 'currency', 'number', 'url']),
});

const Condition = z.object({
  id: z.string(),
  expression: z.string(),                 // raw conditional string, unparsed
  affects: z.array(z.string()),           // content_block ids guarded by this condition
});

const ComplianceMarker = z.object({
  family: z.string(),
  required: z.boolean(),
  present: z.boolean(),
});

const MappingResult = z.object({
  component_id: z.string(),              // canonical ID — always traceable
  match_type: MatchType,
  confidence: z.number().min(0).max(1),
  target_module: z.string().optional(),  // TargetSystem module name/ID
  reason: z.string(),
  review_status: ReviewStatus,
  reviewer_note: z.string().optional(),
});

export const CanonicalTemplate = z.object({
  template_id: z.string(),
  source_file: z.string(),
  template_family: z.string().optional(),
  message_type: z.string().optional(),   // e.g. "transactional", "promotional"
  content_blocks: z.array(ContentBlock),
  ui_modules: z.array(UiModule),
  variables: z.array(Variable),
  conditions: z.array(Condition),
  compliance: z.array(ComplianceMarker),
  mapping_results: z.array(MappingResult).default([]),
  status: z.enum(['ready', 'needs_review', 'blocked']),
  review_notes: z.string().optional(),
  assessed_at: z.string().datetime().optional(),
});

export type CanonicalTemplate = z.infer<typeof CanonicalTemplate>;
```

---

## 6. Stable ID Convention

```
{templateId}:{componentType}:{index}
```

Examples:
- `welcome-01:headline:0`
- `welcome-01:button:1`
- `statement-q1:disclaimer:0`

Rules:
- `templateId` is derived from the source filename (slugified, no extension)
- `index` is zero-based, scoped per `componentType` within a template
- IDs are assigned during NORMALIZE and never change after that
- `mapping_results[].component_id` always references a canonical ID

---

## 7. Variable Handling Rule

Two levels, always kept consistent by the extractor:

| Level | Field | Purpose |
|-------|-------|---------|
| Template | `variables[]` | Deduplicated list of all tokens in the template. Used by MAP and REVIEW to understand full personalization scope. |
| Block | `content_blocks[].variables` | Token strings found within that specific block's `text`. Used for traceability and compliance review. |

**Rule:** Every token in any `content_blocks[].variables` must also appear in the template-level `variables[]`. The extractor is responsible for keeping these consistent. The normalizer validates this during NORMALIZE.

---

## 8. Confidence Scoring

Three bands. Single config threshold.

| Score | Band | Meaning |
|-------|------|---------|
| 1.0 | Exact | Rule matched precisely. Can be batch-approved. |
| 0.5–0.9 | Partial | Rule matched with caveats. Routed to human review. |
| 0.0–0.49 | None / ambiguous | No rule matched, or match is weak. Manual review required. |

`AUTO_APPROVE_THRESHOLD` is a single config value (default: `1.0`). Components with confidence at or above this threshold are auto-approved; all others enter REVIEW.

---

## 9. Adapter Interfaces

### ExtractorAdapter

```typescript
interface ExtractorAdapter {
  name: string;
  canHandle(filePath: string): boolean;
  extract(filePath: string, templateId: string): RawExtractedTemplate;
}
```

Phase 1 ships one implementation: `HtmlExtractorAdapter`. No registry or factory needed until a second format appears.

### MapperAdapter

```typescript
interface MapperAdapter {
  name: string;
  map(component: ContentBlock | UiModule, template: CanonicalTemplate): MappingResult;
}
```

Phase 1 ships one implementation: `GenericRuleMapper` (rule-based lookup). TargetSystem-specific mapper is implemented when TargetSystem module structure is known.

### ClassifierAdapter (Phase 2 stub)

```typescript
interface ClassifierAdapter {
  name: string;
  classify(raw: string, candidates: string[]): { label: string; confidence: number };
}
```

Not implemented in Phase 1. GitHub Copilot or any LLM plugs in here when available.

---

## 10. Review UI Requirements

- Local web server (`migrator review`)
- Non-technical reviewer — no JSON editing, no terminal interaction required
- Shows per template: original email (rendered iframe), extracted taxonomy summary, proposed target mapping
- Actions per template: **Approve**, **Flag for revision**, **Override mapping**
- **Batch approve** available for all `exact` match + `ready` status templates
- Decisions written back to migration spec JSON
- EXPORT is blocked until all `needs_review` templates have a non-`pending` review_status

---

## 11. Folder Structure

```
Email_Migrator/
├── src/
│   ├── schemas/          # Zod schemas (canonical-template.ts, etc.)
│   ├── taxonomies/       # Controlled vocabulary JSON files
│   ├── extractors/       # ExtractorAdapter interface + HtmlExtractorAdapter
│   ├── normalizers/      # Raw extracted data → validated CanonicalTemplate
│   ├── mappers/          # MapperAdapter interface + GenericRuleMapper
│   ├── qa/               # QA rules, confidence scoring, status assignment
│   ├── assess/           # ASSESS stage: runs QA + writes migration spec JSON
│   ├── review/           # Local web server + review UI
│   ├── export/           # ExportAdapter interface (stub in Phase 1)
│   ├── cli/              # CLI entry points
│   └── ai/               # ClassifierAdapter interface (stub in Phase 1)
├── fixtures/             # Sample source HTML templates for development
├── specs/                # Output migration spec JSON files (git-ignored or tracked)
├── reports/              # HTML review output (git-ignored)
├── docs/
│   └── superpowers/
│       └── specs/        # Design documents
└── package.json
```

---

## 12. CLI Commands

```bash
# Run the full pipeline (stages 1–5)
migrator run --source ./source-templates

# Launch the review UI (stage 6)
migrator review --specs ./specs --source ./source-templates

# Export approved templates (stage 7, gated)
migrator export --specs ./specs --output ./output

# Run a single stage for development/debugging
migrator ingest --source ./source-templates
migrator extract --source ./source-templates
migrator assess --specs ./specs
```

---

## 13. Intentionally Deferred (Do Not Build in Phase 1)

- Full design token system (colors, typography, spacing, border radius)
- Accessibility audit fields (WCAG, alt text scoring)
- Deep compliance taxonomy (jurisdictions, product families)
- Multi-column / grid layout detection
- Dark mode / brand theme variants
- Region / language / version dependencies
- Image asset extraction and cataloguing
- Parsing of conditional logic expressions (record raw only)
- AI classification (interface defined, not implemented)
- Hosted / multi-user review app

Each of these can be added as optional fields or new adapter implementations without breaking the schema or pipeline contract.

---

## 14. What Extractor Must Populate (Phase 1)

**Required:**
- `template_id`, `source_file`
- `content_blocks[]` — each with `id`, `type`, `order`, `text`, `variables`, `condition_ids`; also `url` for CTA blocks
- `ui_modules[]` — each with `id`, `type`, `order`, `content_block_ids`
- `variables[]` — all tokens found in raw text

**Optional / can be empty:**
- `conditions[]` — add when conditional templates appear in real batches
- `compliance[]` — stub with one placeholder marker
- `template_family`, `message_type` — fill manually or via filename convention
- `mapping_results[]` — populated by MAP, not EXTRACT
