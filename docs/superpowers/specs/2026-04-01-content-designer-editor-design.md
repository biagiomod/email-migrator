# Content Designer Editor — Design Spec

**Date:** 2026-04-01
**Status:** Approved

---

## Goal

Add a localhost browser tool that lets Content Designers visually review and edit migrated email specs, trigger and monitor the migration pipeline in batch, and apply content guidelines via a maintainable `SKILL.md` file — all without leaving the local environment.

## Architecture

Two new HTML pages served by the **existing Express review server** (`src/review/server.ts`). No new server process. No new runtime dependencies.

```
dashboard.html   — home screen: pipeline trigger + review queue
editor.html      — per-template editor: email preview (left) + edit form (right)
```

Both pages are vanilla HTML + JS (no build step), consistent with the existing `app.html` review UI pattern.

### New server endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/pipeline/run` | Start `runPipeline()` in a child process |
| `GET` | `/api/pipeline/status` | Poll progress (processed count, counts by status) |
| `GET` | `/api/specs` | All specs: id, filename, status, reviewed_by, reviewed_at |
| `GET` | `/api/spec/:id` | Single full spec JSON |
| `PATCH` | `/api/spec/:id` | Save edits + reviewer annotation to spec JSON |
| `GET` | `/api/guidelines` | Parse and return SKILL.md (char limits, forbidden terms, raw markdown) |

Existing endpoints (`GET /api/templates`, `POST /api/approve`, `POST /api/flag`) are unchanged.

---

## Dashboard (`dashboard.html`)

**Layout:** Side-by-side (Option B). Left panel ~35%, right panel ~65%. Stacks vertically below ~900px viewport width.

### Left panel — Pipeline control

- Source dir and specs dir displayed as read-only paths (from server config, not user input)
- **Run Pipeline** button → `POST /api/pipeline/run`
- Polls `GET /api/pipeline/status` every 2 seconds while running
- Live progress bar + counts: ready / needs_review / blocked / running
- Button disables and shows "Running…" while pipeline is active
- Re-enables when pipeline exits (status returns `done`)

### Right panel — Review queue

- Fetches all specs via `GET /api/specs` on load and after each pipeline run completes
- Each row: filename, status badge, reviewer name + timestamp (if already reviewed)
- Status badge colours: green = ready, amber = needs_review, red = blocked
- Clicking any row navigates to `editor.html?id=<templateId>`
- **Batch Approve All Ready** button — iterates `ready` specs and calls `POST /api/approve` for each; shows "Approving N / M…" progress inline
- Filter dropdown: All / needs_review / ready / blocked (client-side, no server round-trip)

---

## Editor (`editor.html`)

**Entry:** `editor.html?id=<templateId>`
**Layout:** 50/50 equal split (Option A). Left = email preview. Right = edit form.

### Left panel — Email preview

- Renders the original source HTML in a sandboxed `<iframe>` (`sandbox="allow-same-origin"` — no scripts, no forms)
- Text elements in the iframe that correspond to editable content blocks are wrapped in `<span data-block-id="...">` at render time by the server (`GET /api/spec/:id` also returns annotated HTML)
- Clicking a span in the iframe sends a `postMessage` to the parent with the block id; the right-side form scrolls to and highlights the matching field
- "← Dashboard" link in the top bar

### Right panel — Edit form

- Reviewer name field at the top — pre-filled from `localStorage` key `reviewer_name`; persists across page loads
- One `<textarea>` per editable content block present in the spec (headline, body_copy, cta, disclaimer, subject_line, preheader — only blocks the spec actually contains)
- Each field shows: field label, char count vs. limit (from SKILL.md), current value
- **Inline validation warnings** (non-blocking, never prevent saving):
  - Yellow ⚠ if character count exceeds the SKILL.md limit
  - Yellow ⚠ if a forbidden term from SKILL.md is found in the field value
  - Warnings appear below the field as plain text; no modals
- **Save & Approve** button → `PATCH /api/spec/:id` then `POST /api/approve`; on success redirects to next unreviewed template in the queue (or back to dashboard if none)
- **Flag** button → `PATCH /api/spec/:id` then `POST /api/flag` with an optional note textarea
- **Guidelines** button → slides open an in-page panel showing SKILL.md rendered as HTML (read-only); fetches fresh from `GET /api/guidelines` each time it is opened

---

## SKILL.md — Content Guidelines

**Location:** `SKILL.md` in the project root.
**Owners:** Content Designers — edit directly in any text editor.

### Format

Plain Markdown with two optional fenced blocks the editor reads:

````markdown
# Content Guidelines

...any prose the team wants — rendered in the Guidelines panel as-is...

```char-limits
headline: 80
subject_line: 60
preheader: 100
cta: 30
body_copy: 500
```

```forbidden-terms
synergy
leverage
please be advised
as per
```
````

- Everything outside the fenced blocks is prose and renders unchanged in the Guidelines panel.
- `char-limits` block: colon-separated `field_name: max_chars` pairs; field names match `content_blocks[].type` values in the canonical schema.
- `forbidden-terms` block: one term per line, case-insensitive matching.
- If SKILL.md is absent, unreadable, or the blocks are missing/malformed, the editor continues to work — validation warnings are silently skipped for affected rules.

### Server behaviour

`GET /api/guidelines` reads SKILL.md from disk at request time (no in-memory cache). Returns:

```json
{
  "raw": "# Content Guidelines\n...",
  "charLimits": { "headline": 80, "cta": 30 },
  "forbiddenTerms": ["synergy", "leverage"]
}
```

The editor fetches guidelines once on load and again each time the Guidelines panel is opened, so edits to SKILL.md are picked up without a server restart.

---

## Reviewer Annotation

Edits and approvals are written back into the spec JSON on disk. The original extracted values are **never overwritten** — the audit trail is preserved.

### Template-level fields (added to `CanonicalTemplate`)

```ts
reviewed_by?:    string   // reviewer name from localStorage
reviewed_at?:    string   // ISO 8601 timestamp
review_status?:  'approved' | 'flagged' | 'pending'
```

### Content-block-level fields (added per block in `content_blocks[]`)

```ts
edited_by?:    string   // reviewer name
edited_at?:    string   // ISO 8601 timestamp
edited_value?: string   // the value the reviewer saved
```

`edited_value` sits alongside the original `value` field. If a block was never edited, none of these fields are present.

### `PATCH /api/spec/:id` payload

```json
{
  "reviewed_by": "Jane Smith",
  "blocks": [
    { "id": "payment-reminder:headline:0", "edited_value": "Your payment is due" }
  ]
}
```

The server merges this into the spec JSON and writes it back to disk using a path-safe write (fixing KI-001 from Phase 1: `template_id` sanitised before use in file path).

### Reviewer name persistence

- Stored in `localStorage` under key `reviewer_name`
- Pre-filled in the reviewer name field on every editor load
- User types it once per browser/device

---

## File Structure

New and modified files:

```
src/review/
  server.ts               — modified: add 6 new endpoints
  ui/
    app.html              — unchanged (existing review UI)
    dashboard.html        — new
    editor.html           — new

SKILL.md                  — new (starter file committed to repo)
docs/superpowers/specs/
  2026-04-01-content-designer-editor-design.md   — this file
```

No new npm dependencies. The pipeline child process uses Node's built-in `child_process.spawn`.

---

## Out of Scope (Phase 2 / future)

- Real-time multi-user collaboration (two designers editing the same template simultaneously)
- Exporting final TargetSystem HTML output (this is the existing Phase 2 EXPORT stage — unchanged)
- Authentication / access control (tool is local-only, no network exposure)
- Mobile / small-screen layout optimisation
