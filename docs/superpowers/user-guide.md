# User Guide

## What the system is

The Email Migrator is a CLI tool that processes HTML email templates from SourceSystem and produces structured migration specs that map each template's content and layout to TargetSystem equivalents. A human reviewer must approve each spec before export.

It is not a direct template converter. It is a translation layer: every element in a source template is classified against a shared canonical vocabulary, then mapped to a corresponding TargetSystem component.

---

## What inputs it expects

- A directory of `.html` (or `.htm`) email template files
- File names become template IDs (e.g. `payment-reminder.html` → `payment-reminder`)
- File names must be unique after normalisation (lowercase, non-alphanumeric chars replaced with `-`)

**Valid:**
```
payment-reminder.html
welcome-email.html
account-statement.html
```

**Will cause an error:**
```
Payment Reminder.html   ← same slug as payment-reminder.html
.html                   ← empty slug
```

---

## What outputs it generates

After `migrator run`, a JSON migration spec is written to `--specs` for each template:

```
specs/
  payment-reminder.json
  welcome-email.json
```

Each spec contains:
- `template_id` — stable identifier
- `content_blocks` — classified text elements with stable IDs and extracted variables
- `ui_modules` — classified layout elements linked to their content blocks
- `variables` — all personalisation tokens, deduplicated
- `mapping_results` — TargetSystem component mapping for each block and module
- `status` — `ready`, `needs_review`, or `blocked`
- `review_notes` — QA issues, if any
- `assessed_at` — timestamp

---

## How to run the pipeline

```bash
npx tsx src/cli/index.ts run --source ./templates --specs ./specs
```

**What happens:**
1. INGEST discovers `.html` files and derives template IDs
2. EXTRACT parses each file: content blocks, UI modules, variables
3. NORMALIZE assigns stable canonical IDs
4. MAP matches each component to its TargetSystem equivalent with confidence scoring
5. ASSESS runs QA rules, computes status, writes one JSON spec per template

**Terminal output:**
```
Starting migration pipeline
Source: /path/to/templates
Specs:  /path/to/specs

[ingest] Found 3 template(s)
[extract] payment-reminder.html
[normalize] payment-reminder.html
...

--- Pipeline complete ---
Total:        3
Ready:        2
Needs review: 1
Blocked:      0

✓ Specs written to /path/to/specs
  Run: migrator review --specs ./specs --source ./templates
```

**If blocked templates are found**, the pipeline exits with a non-zero code and tells you where to look:
```
✗ 1 template(s) are BLOCKED. Review spec files in ./specs for error details.
```

Open the relevant spec JSON and look at `review_notes` for the error codes.

---

## How to launch review

```bash
npx tsx src/cli/index.ts review --specs ./specs --source ./templates
```

Opens a local review server at `http://localhost:3000` (or `--port <number>` to change).

The server runs until you stop it with `Ctrl+C`.

Navigate to `http://localhost:3000/dashboard` to start.

---

## How the Content Designer UI works

The review UI has two pages: **Dashboard** and **Editor**.

### Dashboard (`/dashboard`)

- **Pipeline panel (left)** — shows source and specs paths, a **Run Pipeline** button, a live progress bar, and counts by status. Polls every 2 seconds while the pipeline is running.
- **Review queue (right)** — lists every spec with filename, status badge, and reviewer name/timestamp if already reviewed. Filter by status (All / needs_review / ready / blocked). Click any row to open the Editor. **Batch Approve All Ready** approves all `ready` specs at once.

### Editor (`/editor?id=<templateId>`)

- **Left panel** — sandboxed iframe rendering the original source HTML. Click any highlighted text element to jump to the matching form field on the right.
- **Right panel** — reviewer name field (persisted in `localStorage`), one textarea per editable content block, inline warnings for char-limit overruns and forbidden terms (non-blocking). Three actions:
  - **Save & Approve** — saves edits to the spec JSON, marks it approved, advances to the next unreviewed template
  - **Flag** — saves edits with an optional note, marks it flagged
  - **Guidelines** — slides open a panel showing the full `SKILL.md` rendered as HTML

### Reviewer annotations

Edits and approvals are written back into the spec JSON. The original extracted values are never overwritten — both `value` (original) and `edited_value` (reviewer's version) are preserved. Each edited block also records `edited_by` and `edited_at`.

### SKILL.md — content guidelines

`SKILL.md` in the project root defines the validation rules the editor enforces:

```markdown
```char-limits
headline: 80
subject_line: 60
cta: 30
```

```forbidden-terms
synergy
leverage
```
```

Edit this file directly in any text editor. Changes are picked up immediately — no server restart. If the file is absent or malformed, validation warnings are silently skipped.

**Blocked templates cannot be approved.** Fix the underlying issue, re-run the pipeline, and review again.

---

## How export works

Export is a Phase 2 feature. The CLI command exists but does nothing yet:

```bash
npx tsx src/cli/index.ts export --specs ./specs --output ./output
# → "Export is not implemented in Phase 1."
```

When Phase 2 is built, the export adapter reads approved specs and generates TargetSystem output. All templates in `--specs` must be approved before export proceeds.

---

## Common workflow

```
1. Put source templates in a directory:
   mkdir -p templates/
   # copy .html files in

2. Run the pipeline:
   npx tsx src/cli/index.ts run --source ./templates --specs ./specs

3. Check the summary.
   - All blocked? Fix and re-run.
   - Needs review? Continue.

4. Launch the review UI:
   npx tsx src/cli/index.ts review --specs ./specs --source ./templates
   Open http://localhost:3000/dashboard

5. Review each template in the browser.
   - Batch-approve all "ready" templates from the dashboard.
   - Click "needs_review" templates to open the editor, edit content, then Save & Approve or Flag.

6. When all approved, export (Phase 2).
```

---

## Common failure cases

### "Source directory not found"
The `--source` path doesn't exist or is a typo. Use an absolute path or check the relative path.

### "templateId collision"
Two files in the source directory produce the same ID after normalisation. Example: `Welcome Email.html` and `welcome-email.html` both become `welcome-email`. Rename one.

### "BLOCKED: EMPTY_TEMPLATE"
The extractor couldn't find any content blocks in the template. The HTML structure may be unusual. Check the source file — it may be empty, minified, or structured in a way the extractor doesn't recognise.

### "BLOCKED: MISSING_REQUIRED_COMPLIANCE"
A required compliance marker declared in the template's `compliance` array is missing. This is only triggered if you have pre-configured compliance requirements. Check `review_notes` in the spec for which family is missing.

### "Pipeline failed: ..."
An unexpected error before ASSESS completed. The error message includes the file name where it happened. Check the source file for encoding issues or unusual characters in the file name.

---

## Troubleshooting basics

**The review UI shows "Failed to load templates"**
Check that `--specs` points to a directory that exists and contains `.json` files. The pipeline must have run first.

**A spec shows no mapping results**
Status will be `needs_review`. This shouldn't happen with the default mapper — check that the template has content blocks (not `EMPTY_TEMPLATE`).

**Variables appear in content blocks but not in the template-level variable list**
The QA rule `VARIABLE_INCONSISTENCY` will flag this as a warning. It means a variable was found in a block's text but wasn't captured during normalisation. This is usually a sign that the variable token format is unusual — the default extractor recognises `{{token}}`, `[[token]]`, and `[TOKEN]` patterns.

**Port already in use**
Use `--port 3001` (or any available port between 1 and 65535).
