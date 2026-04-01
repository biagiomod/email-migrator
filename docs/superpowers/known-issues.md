# Known Issues

KI-002 remains open (non-blocking). KI-001 was resolved in Phase 2.

---

## ~~KI-001 — `saveSpec()` write path lacks path-safety guard~~ ✅ Resolved in Phase 2

**Severity:** Minor hardening (non-blocking)
**Component:** `src/review/server.ts` — `saveSpec()` function
**Resolved:** Phase 2 — `saveSpec()` now calls `safeSpecPath()` before writing and throws on invalid IDs. All call sites wrapped in try/catch.

~~**Description:**
The review server's read paths (`GET /api/templates/:id`, `POST .../approve`, `POST .../flag`) all use a `safeSpecPath()` helper that resolves the path and confirms it stays within the `--specs` directory before reading. This prevents path traversal on read.

The `saveSpec()` function, called when a reviewer approves or flags a template, constructs its write path using `template.template_id` read from the spec JSON contents — not from the URL parameter that was validated. `path.join` does not strip `..` components, so a spec file with a crafted `template_id` (e.g. `../../etc/shadow`) could in theory write outside `specsDir`.~~

---

## KI-002 — One `onclick` in `renderSidebar` passes `template_id` without `esc()`

**Severity:** Minor hardening (non-blocking)
**Component:** `src/review/ui/app.html` — `renderSidebar()` function
**Affects:** Review UI, sidebar rendering

**Description:**
The review UI uses an `esc()` helper throughout to prevent XSS by HTML-encoding all template data before injecting it into `innerHTML`. One `onclick` attribute in `renderSidebar` passes `t.template_id` directly into a JavaScript string literal inside an HTML attribute, without going through `esc()`.

While `esc()` now escapes single quotes (`'` → `&#39;`), this particular instance was missed.

**Why it's low risk:**
In practice, `template_id` values always come through `slugify()` in `src/pipeline/ingest.ts`, which strips all characters outside `[a-z0-9-]`. A crafted `template_id` with injection characters would have to be manually written into a spec file on disk.

**Intended fix:**
Wrap `t.template_id` in `esc()` at the affected `onclick` in `renderSidebar`, consistent with how all other template data is handled in the UI.
