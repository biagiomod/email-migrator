# FAQ

## What does this tool actually do?

It reads HTML email templates from SourceSystem, classifies every content and layout element against a shared vocabulary (the canonical taxonomy), maps those elements to their TargetSystem equivalents, and produces structured migration spec files. A human reviewer must approve each spec before export.

It does not generate TargetSystem output in Phase 1 — that requires the export adapter, which is Phase 2.

---

## Do I need to know TypeScript or Node.js to use it?

No. You need Node.js installed to run the commands, but you don't need to write or read any code. The review UI is a browser-based tool that any non-technical reviewer can use.

---

## What HTML template structures does the extractor support?

The extractor (`HtmlExtractorAdapter`) recognises:
- Elements with class names containing `preheader` or `preview`
- `h1` and `h2` elements (outside the footer) as headlines
- `p` elements in `text-block` or `content` containers as body text
- Anchor elements with class names containing `button`, `cta`, or `btn` as CTAs
- Elements with class names containing `disclaimer` or `legal`
- `p` elements in `footer` containers as footer content
- Header, hero, divider, and footer UI modules by class name

Tables and complex nested layouts are partially supported. Unusual HTML structures may produce fewer extracted blocks. If a template produces zero content blocks, the pipeline will flag it as `BLOCKED: EMPTY_TEMPLATE`.

---

## What personalisation variable formats does it recognise?

Three formats:
- `{{variable_name}}` — Handlebars / Mustache style
- `[[variable_name]]` — bracket style
- `[VARIABLE_NAME]` — uppercase with at least 2 characters

Variables are extracted from text content and from `href` attributes (for links like unsubscribe and privacy policy URLs).

---

## What does "needs review" mean? Can I just approve everything?

"Needs review" means at least one component was mapped with confidence below 1.0, or the QA engine produced a warning. You can approve a template from `needs_review` status — the system does not block you. But you should look at the mapping results before approving to confirm the partial matches are correct.

"Ready" templates (confidence 1.0, no warnings) can be batch-approved without individual review.

---

## What does "blocked" mean?

A blocked template has a QA error — either no content blocks were extracted (`EMPTY_TEMPLATE`), or a required compliance marker is missing. The pipeline exits with a non-zero code when any template is blocked.

Blocked templates cannot be approved. You must fix the source template (or the compliance configuration), re-run the pipeline, and review again.

---

## Can I re-run the pipeline on the same templates?

Yes. Running `migrator run` overwrites the spec files in `--specs`. Any previous approvals are lost. Re-running is expected when you update source templates or fix blocked ones.

---

## Can I add more templates to the source directory after the first run?

Yes. Run `migrator run` again with the same `--source` directory. It processes all `.html` files it finds. Existing approved specs for unchanged templates will be overwritten (approvals are not preserved across runs).

---

## How do I know if a variable was missed?

The QA engine checks variable consistency bidirectionally:
- `VARIABLE_INCONSISTENCY`: a token appears in a content block but is not in the template-level variable list
- `UNUSED_TEMPLATE_VARIABLE`: a token is declared at the template level but doesn't appear in any content block

Both produce warnings in `review_notes`. If you see these, check the source template for unusual variable formatting or extra tokens that shouldn't be there.

---

## Can two templates have the same name?

No. Template IDs are derived from file names (lowercase, non-alphanumeric replaced with `-`). If two files produce the same ID, the pipeline throws an error before processing anything. Rename one of the files.

---

## Where are the spec files stored?

In the directory you pass to `--specs`. Default is `./specs` for `migrator run`, but you specify it explicitly for `migrator review`. The files are named `{templateId}.json`.

---

## The review UI isn't loading. What do I check?

1. Did you run `migrator run` first? The review UI needs spec files to exist.
2. Is the `--specs` path correct? It must match the directory where the pipeline wrote its files.
3. Is port 3000 in use? Use `--port 3001` (or any open port).

---

## Can multiple people review at the same time?

The review server is local-only and single-user in Phase 1. It serves from and writes to the local filesystem. Running it on multiple machines simultaneously against the same `--specs` directory (e.g. a shared network drive) is not recommended — concurrent writes to the same spec file can corrupt it.

---

## Will this tool work on Windows?

It should work on any platform where Node.js runs. However, it has only been tested on macOS/Linux. Path handling uses `path.join` and `path.resolve` throughout, which are cross-platform. If you encounter issues on Windows, please report them.

---

## What's coming in Phase 2?

- Export adapter: generates TargetSystem output from approved specs
- AI-assisted classification: for templates with unusual structure or ambiguous mappings
- Design token extraction: colours, typography, spacing
- Multi-column layout support
- Image asset detection and handoff
- Hosted review UI for team workflows
