# Demo Guide

## Best demo setup

1. **Terminal** open at the project root
2. **Browser** open and ready (Chrome or Firefox)
3. **Source template** already in `demo/fixtures/payment-reminder.html` (included in repo)
4. **Specs directory** empty or non-existent: `rm -rf demo/specs`
5. Optional: open `demo/fixtures/payment-reminder.html` in a second browser tab to show the raw source

The demo uses `demo/fixtures/payment-reminder.html` — a simple, realistic payment reminder email with a headline, body text with personalisation variables, a CTA button, a disclaimer, and a footer.

---

## 2-minute demo

**Goal:** Show the pipeline running and the review UI opening. No deep dive.

```bash
# Step 1 — Run the pipeline
npx tsx src/cli/index.ts run --source ./demo/fixtures --specs ./demo/specs
```

Point at the terminal output. Say:
> "INGEST finds the file. EXTRACT parses it. NORMALIZE assigns stable IDs. MAP matches each component to TargetSystem. ASSESS runs QA, computes status, writes the spec to disk. All in under a second."

```bash
# Step 2 — Open the review UI
npx tsx src/cli/index.ts review --specs ./demo/specs --source ./demo/fixtures
```

Open `http://localhost:3000`.

> "This is the review UI. The template is listed as 'needs review' because the CTA button has a partial match — confidence 0.8. The reviewer clicks in, sees the full spec, and approves."

Click on `payment-reminder`. Show the content blocks and mapping results. Click **Approve**.

> "Done. That's the gate before export. Every template must pass through this before Phase 2 generates TargetSystem output."

---

## 5-minute demo

**Goal:** Walk through the full flow with explanation.

### Part 1 — Show the source (30 sec)

Open `demo/fixtures/payment-reminder.html` in browser or editor.

> "Here's the source. A payment reminder from SourceBrand. Preheader, headline, body text, CTA, disclaimer, footer. Variables like `{{firstName}}`, `{{amount}}`, `{{dueDate}}` are personalisation tokens. The goal is to migrate this to TargetSystem without losing anything."

### Part 2 — Run the pipeline (1 min)

```bash
npx tsx src/cli/index.ts run --source ./demo/fixtures --specs ./demo/specs
```

Walk through the terminal output line by line:
- `[ingest]` — file found, ID derived
- `[extract]` — HTML parsed
- `[normalize]` — stable IDs assigned
- `[map]` / `[assess]` — mapping and QA run
- Summary: `Needs review: 1, Blocked: 0`

> "One template, no errors, needs human review because of the partial-match CTA. The spec is now on disk."

Optional: show the spec JSON directly:
```bash
cat demo/specs/payment-reminder.json
```

> "Stable IDs. Every variable extracted. Every mapping with a reason and a confidence score. This is the audit trail."

### Part 3 — Open the review UI (1 min 30 sec)

```bash
npx tsx src/cli/index.ts review --specs ./demo/specs --source ./demo/fixtures
```

Open `http://localhost:3000`.

Point out:
- Sidebar with template list and status badge
- Click on `payment-reminder` to open the detail
- Content blocks section: preheader, headline, body text, CTA, disclaimer, footer content
- Variables section: all 6 tokens listed
- Mapping results table: show the `partial` rows for CTA and button module
  - > "The mapper says CTA content is mapped, but button variant needs confirmation. Confidence 0.8."
- Source template view (if side-by-side source is shown)

### Part 4 — Approve (30 sec)

Click **Approve**.

> "Reviewer confirms the mapping is correct for this template. Review status updates. This is what gates export."

Show the updated status in the sidebar.

### Part 5 — Show the blocked path (30 sec, optional)

No need to demo a blocked template live. Explain:

> "If a template is blocked — say, a required compliance disclaimer is missing — the pipeline exits with a non-zero code. The blocked template cannot be approved in the review UI. You fix the source, re-run, and review again. That's a hard gate, not a suggestion."

---

## What to show stakeholders

**Three things that land well:**

1. **The variable extraction.** Show `{{firstName}}`, `{{amount}}`, `{{dueDate}}` appearing automatically in the content block detail. No manual tagging required.

2. **The partial match explanation.** Show the CTA mapping result: `partial`, confidence 0.8, reason: "button variant requires manual confirmation." This shows the system knows what it doesn't know — it doesn't pretend to be certain.

3. **The blocked path (describe it, don't need to demo live).** "If a required disclaimer is missing, the pipeline halts. No template with a compliance error can pass through the review gate."

---

## Talking points

| Moment | What to say |
|--------|-------------|
| Terminal output | "Every stage is logged. You can see exactly what happened to each template." |
| Spec JSON | "This is the permanent record. Every mapping decision, every confidence score, every QA note, timestamp." |
| Partial match | "The system flags ambiguity explicitly. It doesn't silently choose a mapping it's not sure about." |
| Approve button | "Nothing moves forward without a human decision. This is the gate." |
| Batch approve | "For simple, high-confidence templates, batch approval takes seconds. Review effort goes to the cases that actually need it." |
| Blocked state | "Blocked means broken. The pipeline won't let a template with errors through, regardless of how many templates are waiting." |

---

## What NOT to show

- The spec JSON in detail to non-technical audiences (too dense — summarise it verbally)
- The blocked state live (requires a malformed template; describe it instead)
- Phase 2 export (it's not implemented — describe what it will do)

---

## Common demo issues

**Port 3000 already in use:**
```bash
npx tsx src/cli/index.ts review --specs ./demo/specs --source ./demo/fixtures --port 3001
```

**Specs directory is stale from a previous run:**
```bash
rm -rf demo/specs
npx tsx src/cli/index.ts run --source ./demo/fixtures --specs ./demo/specs
```

**The review UI shows "Failed to load templates":**
Make sure the pipeline ran first and `demo/specs/` contains `.json` files.
