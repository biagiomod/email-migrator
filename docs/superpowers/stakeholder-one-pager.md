# Email Migrator — One-Pager

**What we built:** A tool that migrates email templates from SourceSystem to TargetSystem systematically, safely, and at scale.

**Why it exists:** Manual template migration is slow, inconsistent, and error-prone. Missing a personalisation variable or a compliance disclaimer in a transactional email is a serious problem. With hundreds of templates to migrate, manual work is not viable.

**How it works:**

The tool reads each source HTML template, classifies every content and layout element against a shared canonical vocabulary, maps those elements to their TargetSystem equivalents, and produces a structured migration spec. A human reviewer must approve each spec before any TargetSystem output is generated.

```
Source template → Canonical taxonomy → TargetSystem mapping → Human review → Export
```

**Key properties:**

- **Deterministic.** Rule-based mapping. Every template goes through the same process.
- **Auditable.** Every mapping decision is recorded with a confidence score and a reason.
- **Safe.** QA rules catch errors automatically. Blocked templates halt the pipeline. Export requires human sign-off.
- **Fast.** A batch of templates processes in seconds. Human review is focused only on cases that need it.

**Phase 1 is complete.** The full pipeline runs, produces migration specs, and includes a local review UI. 57 tests pass.

**What Phase 1 does not do:** Export to TargetSystem (needs structure confirmation), AI classification, design token extraction, multi-column layout, image transfer, hosted review.

**Next step:** Confirm TargetSystem template structure, process a real template batch, and build the export adapter in Phase 2.

---

*Generalised tool — all system and brand names are neutral placeholders.*
