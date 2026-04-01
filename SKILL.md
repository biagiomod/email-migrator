# Content Guidelines

This file is maintained by Content Designers. Edit it directly in any text editor.

Changes are picked up immediately — no server restart needed.

---

## How to use this file

- **Prose sections** (like this one) are displayed as-is in the Guidelines panel inside the editor.
- The two fenced blocks below (`char-limits` and `forbidden-terms`) drive live validation warnings in the edit form. Warnings are advisory only — they never block saving.

---

## Character limits

Field names must match the content block types used in the migration spec.

```char-limits
subject_line: 60
preheader: 100
headline: 80
body_text: 500
cta: 30
disclaimer: 300
footer_content: 200
```

---

## Forbidden terms

One term per line. Matching is case-insensitive.

```forbidden-terms
synergy
leverage
please be advised
as per
going forward
touch base
circle back
```

---

## Tone and voice

- Use plain language. Write at a grade 8 reading level or below.
- Address the customer directly: "you" and "your", not "the customer".
- Use active voice. Avoid passive constructions.
- Dates: write in full — "April 1, 2026", not "04/01/26".
- Amounts: always include currency symbol — "$50.00", not "50.00".

---

## Compliance notes

- Every transactional email must include an unsubscribe link in the footer.
- Disclaimer text must not be edited without legal review.
- Do not remove or alter `{{...}}` personalisation tokens — they are required for delivery.
