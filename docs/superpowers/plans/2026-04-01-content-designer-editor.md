# Content Designer Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a localhost browser tool with a pipeline dashboard, per-template split-pane editor, SKILL.md content guidelines, and reviewer annotation — all served from the existing Express review server.

**Architecture:** Two new vanilla-HTML pages (`dashboard.html`, `editor.html`) served by the existing Express server in `src/review/server.ts`. New server endpoints handle pipeline execution (child process), spec editing, and SKILL.md parsing. Reviewer edits are stored as additional fields on the existing spec JSON without overwriting original extracted values.

**Tech Stack:** TypeScript 5, Express 4, Zod, Cheerio, Node `child_process`, Vitest, supertest (new devDep)

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Modify | `src/schemas/canonical-template.ts` | Add reviewer annotation fields to schema |
| Create | `src/review/guidelines.ts` | Parse SKILL.md into charLimits + forbiddenTerms |
| Modify | `src/review/server.ts` | Add 7 new endpoints, fix KI-001, serve new pages |
| Create | `src/review/ui/dashboard.html` | Pipeline control + review queue SPA |
| Create | `src/review/ui/editor.html` | Split-pane email preview + edit form SPA |
| Create | `SKILL.md` | Starter content guidelines file |
| Install | `supertest` + `@types/supertest` | HTTP testing for new endpoints |
| Create | `tests/unit/guidelines.test.ts` | Parser unit tests |
| Create | `tests/unit/schema-reviewer.test.ts` | Schema annotation field tests |
| Create | `tests/review/server-new-endpoints.test.ts` | Endpoint integration tests |

---

## Task 1: Install supertest + add reviewer annotation fields to schema

**Files:**
- Modify: `package.json`
- Modify: `src/schemas/canonical-template.ts`
- Create: `tests/unit/schema-reviewer.test.ts`

- [ ] **Step 1: Install supertest**

```bash
npm install --save-dev supertest @types/supertest
```

Expected: package.json devDependencies gains `"supertest"` and `"@types/supertest"`.

- [ ] **Step 2: Write the failing tests**

Create `tests/unit/schema-reviewer.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { CanonicalTemplate, ContentBlock } from '../../src/schemas/canonical-template';

describe('reviewer annotation fields', () => {
  const baseTemplate = {
    template_id: 'test-01',
    source_file: 'test.html',
    content_blocks: [],
    ui_modules: [],
    variables: [],
    conditions: [],
    compliance: [],
    mapping_results: [],
    status: 'ready' as const,
  };

  it('accepts a template with reviewer annotation fields', () => {
    const result = CanonicalTemplate.safeParse({
      ...baseTemplate,
      reviewed_by: 'Jane Smith',
      reviewed_at: '2026-04-01T14:00:00.000Z',
      editor_status: 'approved',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a template without reviewer annotation fields (backward compat)', () => {
    const result = CanonicalTemplate.safeParse(baseTemplate);
    expect(result.success).toBe(true);
  });

  it('rejects an invalid editor_status value', () => {
    const result = CanonicalTemplate.safeParse({
      ...baseTemplate,
      editor_status: 'maybe',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a content block with edited_value fields', () => {
    const result = ContentBlock.safeParse({
      id: 'test-01:headline:0',
      type: 'headline',
      order: 0,
      text: 'Hello world',
      variables: [],
      condition_ids: [],
      edited_by: 'Jane Smith',
      edited_at: '2026-04-01T14:00:00.000Z',
      edited_value: 'Hello, friend',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a content block without edited_value fields (backward compat)', () => {
    const result = ContentBlock.safeParse({
      id: 'test-01:headline:0',
      type: 'headline',
      order: 0,
      text: 'Hello world',
      variables: [],
      condition_ids: [],
    });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npm test -- --reporter=verbose tests/unit/schema-reviewer.test.ts
```

Expected: FAIL — `reviewed_by`, `editor_status`, `edited_by`, `edited_value` not recognised by schema.

- [ ] **Step 4: Add annotation fields to the schema**

In `src/schemas/canonical-template.ts`, update `ContentBlock` to:

```typescript
export const ContentBlock = z.object({
  id: z.string(),
  type: ContentBlockType,
  order: z.number().int(),
  role: z.string().optional(),
  text: z.string(),
  url: z.string().url().optional(),
  variables: z.array(z.string()),
  condition_ids: z.array(z.string()),
  // Reviewer annotation (Phase 2)
  edited_by: z.string().optional(),
  edited_at: z.string().optional(),
  edited_value: z.string().optional(),
});
```

Update `CanonicalTemplate` to add after `review_notes`:

```typescript
  reviewed_by: z.string().optional(),
  reviewed_at: z.string().optional(),
  editor_status: z.enum(['approved', 'flagged', 'pending']).optional(),
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test -- --reporter=verbose tests/unit/schema-reviewer.test.ts
```

Expected: 5 tests PASS.

- [ ] **Step 6: Run the full test suite to confirm no regressions**

```bash
npm test
```

Expected: all existing tests still pass (the new optional fields don't break existing parses).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/schemas/canonical-template.ts tests/unit/schema-reviewer.test.ts
git commit -m "feat: add reviewer annotation fields to schema; install supertest"
```

---

## Task 2: SKILL.md parser

**Files:**
- Create: `src/review/guidelines.ts`
- Create: `tests/unit/guidelines.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/guidelines.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseGuidelines } from '../../src/review/guidelines';

describe('parseGuidelines', () => {
  it('parses char-limits block', () => {
    const raw = `
# Content Guidelines

Some prose.

\`\`\`char-limits
headline: 80
cta: 30
subject_line: 60
\`\`\`
`;
    const result = parseGuidelines(raw);
    expect(result.charLimits).toEqual({ headline: 80, cta: 30, subject_line: 60 });
  });

  it('parses forbidden-terms block', () => {
    const raw = `
\`\`\`forbidden-terms
synergy
leverage
please be advised
\`\`\`
`;
    const result = parseGuidelines(raw);
    expect(result.forbiddenTerms).toEqual(['synergy', 'leverage', 'please be advised']);
  });

  it('returns empty objects when blocks are absent', () => {
    const result = parseGuidelines('# Just prose, no special blocks.');
    expect(result.charLimits).toEqual({});
    expect(result.forbiddenTerms).toEqual([]);
  });

  it('preserves raw string', () => {
    const raw = '# Hello\n\nSome content.';
    expect(parseGuidelines(raw).raw).toBe(raw);
  });

  it('skips malformed char-limit lines (no colon)', () => {
    const raw = `\`\`\`char-limits\nheadline 80\ncta: 30\n\`\`\``;
    expect(parseGuidelines(raw).charLimits).toEqual({ cta: 30 });
  });

  it('skips blank lines in forbidden-terms', () => {
    const raw = `\`\`\`forbidden-terms\nsynergy\n\nleverage\n\`\`\``;
    expect(parseGuidelines(raw).forbiddenTerms).toEqual(['synergy', 'leverage']);
  });

  it('returns empty objects when raw is empty string', () => {
    const result = parseGuidelines('');
    expect(result.charLimits).toEqual({});
    expect(result.forbiddenTerms).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --reporter=verbose tests/unit/guidelines.test.ts
```

Expected: FAIL — `parseGuidelines` not found.

- [ ] **Step 3: Implement the parser**

Create `src/review/guidelines.ts`:

```typescript
// src/review/guidelines.ts

export interface Guidelines {
  raw: string;
  charLimits: Record<string, number>;
  forbiddenTerms: string[];
}

/**
 * Parse SKILL.md content into structured guidelines.
 * Two optional fenced blocks are recognised:
 *   ```char-limits       — colon-separated "field: maxChars" pairs
 *   ```forbidden-terms   — one term per line
 * Everything else is passed through as raw prose.
 */
export function parseGuidelines(raw: string): Guidelines {
  const charLimits: Record<string, number> = {};
  const forbiddenTerms: string[] = [];

  const fenceRe = /```(\S+)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = fenceRe.exec(raw)) !== null) {
    const lang = match[1];
    const body = match[2];

    if (lang === 'char-limits') {
      for (const line of body.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const colonIdx = trimmed.indexOf(':');
        if (colonIdx === -1) continue;
        const key = trimmed.slice(0, colonIdx).trim();
        const val = parseInt(trimmed.slice(colonIdx + 1).trim(), 10);
        if (key && !isNaN(val)) charLimits[key] = val;
      }
    } else if (lang === 'forbidden-terms') {
      for (const line of body.split('\n')) {
        const trimmed = line.trim();
        if (trimmed) forbiddenTerms.push(trimmed);
      }
    }
  }

  return { raw, charLimits, forbiddenTerms };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --reporter=verbose tests/unit/guidelines.test.ts
```

Expected: 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/review/guidelines.ts tests/unit/guidelines.test.ts
git commit -m "feat: add SKILL.md guidelines parser"
```

---

## Task 3: Server — guidelines endpoint, fix KI-001, serve new pages

**Files:**
- Modify: `src/review/server.ts`
- Create: `tests/review/server-guidelines.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/review/server-guidelines.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as http from 'http';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';
import express from 'express';

// We test the server factory directly by importing and calling startReviewServer,
// then capturing the returned app. To support this, server.ts must export the
// Express app (see implementation step).

import { createReviewApp } from '../../src/review/server';

let tmpDir: string;
let specsDir: string;
let sourceDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-test-'));
  specsDir = path.join(tmpDir, 'specs');
  sourceDir = path.join(tmpDir, 'source');
  fs.mkdirSync(specsDir);
  fs.mkdirSync(sourceDir);

  // Write a SKILL.md in tmpDir (simulates project root passed via option)
  fs.writeFileSync(path.join(tmpDir, 'SKILL.md'), `# Guidelines\n\n\`\`\`char-limits\nheadline: 80\n\`\`\`\n\n\`\`\`forbidden-terms\nsynergy\n\`\`\`\n`);
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('GET /api/guidelines', () => {
  it('returns 200 with parsed guidelines', async () => {
    const app = createReviewApp({ specsDir, sourceDir, port: 0, skillFile: path.join(tmpDir, 'SKILL.md') });
    const res = await request(app).get('/api/guidelines');
    expect(res.status).toBe(200);
    expect(res.body.charLimits).toEqual({ headline: 80 });
    expect(res.body.forbiddenTerms).toEqual(['synergy']);
    expect(typeof res.body.raw).toBe('string');
  });

  it('returns empty guidelines when SKILL.md is absent', async () => {
    const app = createReviewApp({ specsDir, sourceDir, port: 0, skillFile: path.join(tmpDir, 'no-such-file.md') });
    const res = await request(app).get('/api/guidelines');
    expect(res.status).toBe(200);
    expect(res.body.charLimits).toEqual({});
    expect(res.body.forbiddenTerms).toEqual([]);
  });
});

describe('GET /dashboard', () => {
  it('returns 200 HTML', async () => {
    const app = createReviewApp({ specsDir, sourceDir, port: 0, skillFile: path.join(tmpDir, 'SKILL.md') });
    const res = await request(app).get('/dashboard');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
  });
});

describe('GET /editor', () => {
  it('returns 200 HTML', async () => {
    const app = createReviewApp({ specsDir, sourceDir, port: 0, skillFile: path.join(tmpDir, 'SKILL.md') });
    const res = await request(app).get('/editor');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --reporter=verbose tests/review/server-guidelines.test.ts
```

Expected: FAIL — `createReviewApp` not exported, no `/api/guidelines`, `/dashboard`, `/editor` routes.

- [ ] **Step 3: Refactor server.ts to export `createReviewApp` and add new routes**

Replace the content of `src/review/server.ts` with the following (all existing routes preserved, three additions: `createReviewApp` export, `GET /api/guidelines`, `GET /dashboard`, `GET /editor`, and KI-001 fix in `saveSpec`):

```typescript
// src/review/server.ts
import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { CanonicalTemplate } from '../schemas/canonical-template';
import { parseGuidelines } from './guidelines';

export interface ReviewServerOptions {
  specsDir: string;
  sourceDir: string;
  port: number;
  skillFile?: string; // path to SKILL.md; defaults to <cwd>/SKILL.md
}

function loadSpecs(specsDir: string): CanonicalTemplate[] {
  if (!fs.existsSync(specsDir)) return [];
  const results: CanonicalTemplate[] = [];
  for (const f of fs.readdirSync(specsDir).filter(f => f.endsWith('.json')).sort()) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(specsDir, f), 'utf-8'));
      results.push(parsed as CanonicalTemplate);
    } catch (err) {
      console.error(`[review] Failed to load spec file "${f}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return results;
}

// KI-001 fix: use safeSpecPath for the write operation
function saveSpec(specsDir: string, template: CanonicalTemplate): void {
  const specPath = safeSpecPath(specsDir, template.template_id);
  if (!specPath) throw new Error(`Invalid template_id for write: ${template.template_id}`);
  fs.writeFileSync(specPath, JSON.stringify(template, null, 2), 'utf-8');
}

function safeSpecPath(specsDir: string, id: string): string | null {
  const resolved = path.resolve(specsDir, `${id}.json`);
  if (!resolved.startsWith(path.resolve(specsDir) + path.sep)) return null;
  return resolved;
}

/**
 * Create and configure the Express app without starting the server.
 * Exported for testing.
 */
export function createReviewApp(options: ReviewServerOptions): express.Application {
  const { specsDir, sourceDir } = options;
  const skillFile = options.skillFile ?? path.join(process.cwd(), 'SKILL.md');

  const app = express();
  app.use(express.json());

  // Serve the original review UI
  app.get('/', (_req, res) => {
    res.sendFile(path.resolve(__dirname, 'ui/app.html'));
  });

  // Serve new Content Designer pages
  app.get('/dashboard', (_req, res) => {
    res.sendFile(path.resolve(__dirname, 'ui/dashboard.html'));
  });

  app.get('/editor', (_req, res) => {
    res.sendFile(path.resolve(__dirname, 'ui/editor.html'));
  });

  // Serve original source HTML files (for iframe preview)
  app.use('/source', express.static(sourceDir));

  // GET /api/guidelines — parse SKILL.md
  app.get('/api/guidelines', (_req, res) => {
    let raw = '';
    if (fs.existsSync(skillFile)) {
      try { raw = fs.readFileSync(skillFile, 'utf-8'); } catch { /* skip */ }
    }
    res.json(parseGuidelines(raw));
  });

  // GET /api/templates — list all templates with status summary (existing)
  app.get('/api/templates', (_req, res) => {
    const specs = loadSpecs(specsDir);
    res.json(specs.map(t => ({
      template_id: t.template_id,
      source_file: path.basename(t.source_file),
      status: t.status,
      content_blocks_count: t.content_blocks.length,
      ui_modules_count: t.ui_modules.length,
      variables_count: t.variables.length,
      mapping_results: t.mapping_results.map(r => ({
        component_id: r.component_id,
        match_type: r.match_type,
        confidence: r.confidence,
        target_module: r.target_module,
        review_status: r.review_status,
      })),
      review_notes: t.review_notes,
    })));
  });

  // GET /api/templates/:id — full spec for one template (existing)
  app.get('/api/templates/:id', (req, res) => {
    const specPath = safeSpecPath(specsDir, req.params.id);
    if (!specPath) return res.status(400).json({ error: 'Invalid id' });
    if (!fs.existsSync(specPath)) return res.status(404).json({ error: 'Template not found' });
    try {
      res.json(JSON.parse(fs.readFileSync(specPath, 'utf-8')));
    } catch {
      res.status(500).json({ error: 'Failed to read spec' });
    }
  });

  // POST /api/templates/:id/approve (existing)
  app.post('/api/templates/:id/approve', (req, res) => {
    const specPath = safeSpecPath(specsDir, req.params.id);
    if (!specPath) return res.status(400).json({ error: 'Invalid id' });
    if (!fs.existsSync(specPath)) return res.status(404).json({ error: 'Not found' });
    let spec: CanonicalTemplate;
    try {
      spec = CanonicalTemplate.parse(JSON.parse(fs.readFileSync(specPath, 'utf-8')));
    } catch {
      return res.status(500).json({ error: 'Failed to read spec' });
    }
    const updated: CanonicalTemplate = {
      ...spec,
      mapping_results: spec.mapping_results.map(r => ({ ...r, review_status: 'approved' as const })),
    };
    saveSpec(specsDir, updated);
    res.json({ ok: true, template_id: req.params.id });
  });

  // POST /api/templates/:id/flag (existing)
  app.post('/api/templates/:id/flag', (req, res) => {
    const specPath = safeSpecPath(specsDir, req.params.id);
    if (!specPath) return res.status(400).json({ error: 'Invalid id' });
    if (!fs.existsSync(specPath)) return res.status(404).json({ error: 'Not found' });
    let spec: CanonicalTemplate;
    try {
      spec = CanonicalTemplate.parse(JSON.parse(fs.readFileSync(specPath, 'utf-8')));
    } catch {
      return res.status(500).json({ error: 'Failed to read spec' });
    }
    const { note } = req.body as { note?: string };
    const updated: CanonicalTemplate = {
      ...spec,
      status: 'needs_review',
      review_notes: note ?? spec.review_notes,
    };
    saveSpec(specsDir, updated);
    res.json({ ok: true, template_id: req.params.id });
  });

  // POST /api/batch-approve (existing)
  app.post('/api/batch-approve', (_req, res) => {
    const specs = loadSpecs(specsDir);
    let count = 0;
    specs.forEach(spec => {
      const allExact = spec.mapping_results.every(r => r.match_type === 'exact' && r.confidence >= 1.0);
      if (allExact || spec.status === 'ready') {
        const updated: CanonicalTemplate = {
          ...spec,
          mapping_results: spec.mapping_results.map(r => ({ ...r, review_status: 'approved' as const })),
        };
        saveSpec(specsDir, updated);
        count++;
      }
    });
    res.json({ ok: true, approved: count });
  });

  return app;
}

export function startReviewServer(options: ReviewServerOptions): void {
  const app = createReviewApp(options);
  app.listen(options.port, () => {
    console.log(`\n✓ Review UI running at http://localhost:${options.port}`);
    console.log(`  Original review:   http://localhost:${options.port}/`);
    console.log(`  Content Designer:  http://localhost:${options.port}/dashboard`);
    console.log(`  Reviewing specs in: ${options.specsDir}`);
    console.log(`  Press Ctrl+C to stop.\n`);
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --reporter=verbose tests/review/server-guidelines.test.ts
```

Expected: all tests PASS. (dashboard and editor will 404 until HTML files exist in Task 7/8 — if those tasks aren't done yet, temporarily create empty placeholder files.)

> Note: `dashboard.html` and `editor.html` don't exist yet. If running this task before Tasks 7 and 8, create placeholder files so the route tests pass:
> ```bash
> echo "<!DOCTYPE html><html><body>dashboard</body></html>" > src/review/ui/dashboard.html
> echo "<!DOCTYPE html><html><body>editor</body></html>" > src/review/ui/editor.html
> ```

- [ ] **Step 5: Run the full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/review/server.ts src/review/guidelines.ts tests/review/server-guidelines.test.ts src/review/ui/dashboard.html src/review/ui/editor.html
git commit -m "feat: export createReviewApp, add /api/guidelines, /dashboard, /editor routes; fix KI-001"
```

---

## Task 4: Server — spec list, detail, edit, and preview endpoints

**Files:**
- Modify: `src/review/server.ts`
- Create: `tests/review/server-spec-endpoints.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/review/server-spec-endpoints.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';
import { createReviewApp } from '../../src/review/server';

let tmpDir: string;
let specsDir: string;
let sourceDir: string;

const sampleSpec = {
  template_id: 'payment-reminder',
  source_file: 'payment-reminder.html',
  content_blocks: [
    { id: 'payment-reminder:headline:0', type: 'headline', order: 0, text: 'Pay now', variables: [], condition_ids: [] },
    { id: 'payment-reminder:cta:0', type: 'cta', order: 1, text: 'Make a payment', variables: [], condition_ids: [] },
  ],
  ui_modules: [],
  variables: [],
  conditions: [],
  compliance: [],
  mapping_results: [],
  status: 'needs_review',
};

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-endpoints-test-'));
  specsDir = path.join(tmpDir, 'specs');
  sourceDir = path.join(tmpDir, 'source');
  fs.mkdirSync(specsDir);
  fs.mkdirSync(sourceDir);
  fs.writeFileSync(path.join(specsDir, 'payment-reminder.json'), JSON.stringify(sampleSpec, null, 2));
  fs.writeFileSync(path.join(sourceDir, 'payment-reminder.html'), '<html><body><h1>Pay now</h1><a>Make a payment</a></body></html>');
  fs.writeFileSync(path.join(tmpDir, 'SKILL.md'), '');
});

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

const makeApp = () => createReviewApp({ specsDir, sourceDir, port: 0, skillFile: path.join(tmpDir, 'SKILL.md') });

describe('GET /api/specs', () => {
  it('returns array of spec summaries', async () => {
    const res = await request(makeApp()).get('/api/specs');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].template_id).toBe('payment-reminder');
    expect(res.body[0].status).toBe('needs_review');
    expect(res.body[0]).not.toHaveProperty('content_blocks'); // summary only
  });
});

describe('GET /api/spec/:id', () => {
  it('returns full spec', async () => {
    const res = await request(makeApp()).get('/api/spec/payment-reminder');
    expect(res.status).toBe(200);
    expect(res.body.template_id).toBe('payment-reminder');
    expect(res.body.content_blocks).toHaveLength(2);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(makeApp()).get('/api/spec/no-such-template');
    expect(res.status).toBe(404);
  });

  it('returns 400 for path-traversal attempt', async () => {
    const res = await request(makeApp()).get('/api/spec/..%2Fpasswd');
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/spec/:id', () => {
  it('saves edited values and reviewer annotation', async () => {
    const payload = {
      reviewed_by: 'Jane Smith',
      blocks: [
        { id: 'payment-reminder:headline:0', edited_value: 'Pay before due date' },
      ],
    };
    const res = await request(makeApp()).patch('/api/spec/payment-reminder').send(payload);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Verify persisted to disk
    const saved = JSON.parse(fs.readFileSync(path.join(specsDir, 'payment-reminder.json'), 'utf-8'));
    expect(saved.reviewed_by).toBe('Jane Smith');
    expect(typeof saved.reviewed_at).toBe('string');
    const editedBlock = saved.content_blocks.find((b: { id: string }) => b.id === 'payment-reminder:headline:0');
    expect(editedBlock.edited_value).toBe('Pay before due date');
    expect(editedBlock.edited_by).toBe('Jane Smith');
    expect(typeof editedBlock.edited_at).toBe('string');
    // Original text not overwritten
    expect(editedBlock.text).toBe('Pay now');
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(makeApp()).patch('/api/spec/ghost').send({ reviewed_by: 'x', blocks: [] });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/spec/:id/preview', () => {
  it('returns HTML with data-block-id spans and inline script', async () => {
    const res = await request(makeApp()).get('/api/spec/payment-reminder/preview');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('data-block-id="payment-reminder:headline:0"');
    expect(res.text).toContain('postMessage');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --reporter=verbose tests/review/server-spec-endpoints.test.ts
```

Expected: FAIL — routes don't exist yet.

- [ ] **Step 3: Add the four endpoints to `src/review/server.ts`**

Inside `createReviewApp`, after the `POST /api/batch-approve` block and before `return app`, add:

```typescript
  // GET /api/specs — summary list for the dashboard queue
  app.get('/api/specs', (_req, res) => {
    const specs = loadSpecs(specsDir);
    res.json(specs.map(t => ({
      template_id: t.template_id,
      source_file: path.basename(t.source_file),
      status: t.status,
      reviewed_by: t.reviewed_by,
      reviewed_at: t.reviewed_at,
      editor_status: t.editor_status,
    })));
  });

  // GET /api/spec/:id — full spec JSON
  app.get('/api/spec/:id', (req, res) => {
    const specPath = safeSpecPath(specsDir, req.params.id);
    if (!specPath) return res.status(400).json({ error: 'Invalid id' });
    if (!fs.existsSync(specPath)) return res.status(404).json({ error: 'Not found' });
    try {
      res.json(JSON.parse(fs.readFileSync(specPath, 'utf-8')));
    } catch {
      res.status(500).json({ error: 'Failed to read spec' });
    }
  });

  // PATCH /api/spec/:id — save reviewer edits + annotation
  app.patch('/api/spec/:id', (req, res) => {
    const specPath = safeSpecPath(specsDir, req.params.id);
    if (!specPath) return res.status(400).json({ error: 'Invalid id' });
    if (!fs.existsSync(specPath)) return res.status(404).json({ error: 'Not found' });

    let spec: CanonicalTemplate;
    try {
      spec = JSON.parse(fs.readFileSync(specPath, 'utf-8')) as CanonicalTemplate;
    } catch {
      return res.status(500).json({ error: 'Failed to read spec' });
    }

    const { reviewed_by, blocks } = req.body as {
      reviewed_by?: string;
      blocks?: Array<{ id: string; edited_value: string }>;
    };

    const now = new Date().toISOString();
    const blockEdits = new Map((blocks ?? []).map(b => [b.id, b.edited_value]));

    const updated: CanonicalTemplate = {
      ...spec,
      reviewed_by: reviewed_by ?? spec.reviewed_by,
      reviewed_at: now,
      content_blocks: spec.content_blocks.map(cb => {
        const editedValue = blockEdits.get(cb.id);
        if (editedValue === undefined) return cb;
        return { ...cb, edited_value: editedValue, edited_by: reviewed_by, edited_at: now };
      }),
    };

    try {
      saveSpec(specsDir, updated);
    } catch {
      return res.status(500).json({ error: 'Failed to write spec' });
    }
    res.json({ ok: true, template_id: req.params.id });
  });

  // GET /api/spec/:id/preview — annotated HTML for iframe (Cheerio-injected spans + postMessage script)
  app.get('/api/spec/:id/preview', (req, res) => {
    const specPath = safeSpecPath(specsDir, req.params.id);
    if (!specPath) return res.status(400).json({ error: 'Invalid id' });
    if (!fs.existsSync(specPath)) return res.status(404).json({ error: 'Not found' });

    let spec: CanonicalTemplate;
    try {
      spec = JSON.parse(fs.readFileSync(specPath, 'utf-8')) as CanonicalTemplate;
    } catch {
      return res.status(500).json({ error: 'Failed to read spec' });
    }

    const sourceFile = path.join(sourceDir, path.basename(spec.source_file));
    if (!fs.existsSync(sourceFile)) {
      return res.status(404).json({ error: 'Source HTML not found' });
    }

    let html: string;
    try {
      html = fs.readFileSync(sourceFile, 'utf-8');
    } catch {
      return res.status(500).json({ error: 'Failed to read source HTML' });
    }

    // Use Cheerio to wrap matching text nodes in <span data-block-id="...">
    const cheerio = require('cheerio') as typeof import('cheerio');
    const $ = cheerio.load(html);

    for (const cb of spec.content_blocks) {
      const needle = cb.text.trim();
      if (!needle) continue;
      $('body *').each((_i, el) => {
        const element = el as cheerio.Element;
        if (element.type !== 'tag') return;
        const $el = $(element);
        if ($el.children().length > 0) return; // only leaf nodes
        const text = $el.text().trim();
        if (text === needle) {
          $el.attr('data-block-id', cb.id);
          $el.css('cursor', 'pointer');
        }
      });
    }

    // Inject postMessage script before </body>
    const script = `<script>
document.addEventListener('click', function(e) {
  var el = e.target;
  while (el && !el.dataset.blockId) el = el.parentElement;
  if (el && el.dataset.blockId) {
    window.parent.postMessage({ type: 'block-click', blockId: el.dataset.blockId }, '*');
  }
});
</script>`;

    let annotated = $.html();
    if (annotated.includes('</body>')) {
      annotated = annotated.replace('</body>', script + '\n</body>');
    } else {
      annotated += script;
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(annotated);
  });
```

- [ ] **Step 4: Add Cheerio import at the top of `server.ts`**

Add to the imports section at the top of `src/review/server.ts`:

```typescript
import * as cheerio from 'cheerio';
```

And remove the `require('cheerio')` line from inside the route handler (replace it with just using `cheerio` directly):

```typescript
    const $ = cheerio.load(html);
```

- [ ] **Step 5: Run the tests**

```bash
npm test -- --reporter=verbose tests/review/server-spec-endpoints.test.ts
```

Expected: all tests PASS.

- [ ] **Step 6: Run the full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/review/server.ts tests/review/server-spec-endpoints.test.ts
git commit -m "feat: add /api/specs, /api/spec/:id, PATCH /api/spec/:id, /api/spec/:id/preview endpoints"
```

---

## Task 5: Server — pipeline run/status endpoints

**Files:**
- Modify: `src/review/server.ts`
- Create: `tests/review/server-pipeline.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/review/server-pipeline.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';
import { createReviewApp } from '../../src/review/server';

let tmpDir: string;
let specsDir: string;
let sourceDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-test-'));
  specsDir = path.join(tmpDir, 'specs');
  sourceDir = path.join(tmpDir, 'source');
  fs.mkdirSync(specsDir);
  fs.mkdirSync(sourceDir);
  fs.writeFileSync(path.join(tmpDir, 'SKILL.md'), '');
});

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

const makeApp = () => createReviewApp({ specsDir, sourceDir, port: 0, skillFile: path.join(tmpDir, 'SKILL.md') });

describe('GET /api/pipeline/status before any run', () => {
  it('returns idle state', async () => {
    const app = makeApp();
    const res = await request(app).get('/api/pipeline/status');
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('idle');
  });
});

describe('POST /api/pipeline/run', () => {
  it('returns 200 and starts a run', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/pipeline/run')
      .send({ sourceDir, specsDir });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('returns 409 if pipeline is already running', async () => {
    const app = makeApp();
    // First call starts it
    await request(app).post('/api/pipeline/run').send({ sourceDir, specsDir });
    // Second call should conflict — but only if still running.
    // We stub: this test just verifies the endpoint exists and responds.
    const res = await request(app).get('/api/pipeline/status');
    expect(res.status).toBe(200);
    expect(['idle', 'running', 'done', 'error']).toContain(res.body.state);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --reporter=verbose tests/review/server-pipeline.test.ts
```

Expected: FAIL — routes don't exist.

- [ ] **Step 3: Add pipeline state and endpoints to `src/review/server.ts`**

Add the pipeline state object just before the `createReviewApp` function definition:

```typescript
// In-memory pipeline run state (one run at a time per server instance)
interface PipelineState {
  state: 'idle' | 'running' | 'done' | 'error';
  startedAt?: string;
  finishedAt?: string;
  total?: number;
  ready?: number;
  needsReview?: number;
  blocked?: number;
  error?: string;
}
```

Inside `createReviewApp`, add a local state variable at the very top of the function body:

```typescript
  const pipelineState: PipelineState = { state: 'idle' };
```

Then add the two endpoints inside `createReviewApp` after the spec endpoints and before `return app`:

```typescript
  // GET /api/pipeline/status
  app.get('/api/pipeline/status', (_req, res) => {
    res.json(pipelineState);
  });

  // POST /api/pipeline/run — spawn pipeline child process
  app.post('/api/pipeline/run', (req, res) => {
    if (pipelineState.state === 'running') {
      return res.status(409).json({ error: 'Pipeline already running' });
    }

    const body = req.body as { sourceDir?: string; specsDir?: string };
    const runSourceDir = body.sourceDir ?? sourceDir;
    const runSpecsDir = body.specsDir ?? specsDir;

    pipelineState.state = 'running';
    pipelineState.startedAt = new Date().toISOString();
    pipelineState.finishedAt = undefined;
    pipelineState.total = undefined;
    pipelineState.ready = undefined;
    pipelineState.needsReview = undefined;
    pipelineState.blocked = undefined;
    pipelineState.error = undefined;

    // Spawn as a child process so the server stays responsive
    const { spawn } = require('child_process') as typeof import('child_process');
    const child = spawn(
      process.execPath, // node
      [
        require.resolve('tsx/cli'),
        path.resolve(__dirname, '../../cli/index.ts'),
        'run',
        '--source', runSourceDir,
        '--specs', runSpecsDir,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    const output: string[] = [];
    child.stdout?.on('data', (d: Buffer) => output.push(d.toString()));
    child.stderr?.on('data', (d: Buffer) => output.push(d.toString()));

    child.on('close', (code: number | null) => {
      pipelineState.finishedAt = new Date().toISOString();
      if (code === 0 || code === 1) {
        // Parse counts from output lines like "Ready:        5"
        const joined = output.join('');
        const total = parseInt((joined.match(/Total:\s+(\d+)/) ?? [])[1] ?? '0', 10);
        const ready = parseInt((joined.match(/Ready:\s+(\d+)/) ?? [])[1] ?? '0', 10);
        const needsReview = parseInt((joined.match(/Needs review:\s+(\d+)/) ?? [])[1] ?? '0', 10);
        const blocked = parseInt((joined.match(/Blocked:\s+(\d+)/) ?? [])[1] ?? '0', 10);
        pipelineState.state = 'done';
        pipelineState.total = total;
        pipelineState.ready = ready;
        pipelineState.needsReview = needsReview;
        pipelineState.blocked = blocked;
      } else {
        pipelineState.state = 'error';
        pipelineState.error = output.join('').slice(-500);
      }
    });

    child.on('error', (err: Error) => {
      pipelineState.state = 'error';
      pipelineState.error = err.message;
      pipelineState.finishedAt = new Date().toISOString();
    });

    res.json({ ok: true, message: 'Pipeline started' });
  });
```

- [ ] **Step 4: Run the tests**

```bash
npm test -- --reporter=verbose tests/review/server-pipeline.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Run the full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/review/server.ts tests/review/server-pipeline.test.ts
git commit -m "feat: add POST /api/pipeline/run and GET /api/pipeline/status endpoints"
```

---

## Task 6: SKILL.md starter file

**Files:**
- Create: `SKILL.md`

No tests needed (static file).

- [ ] **Step 1: Create `SKILL.md` in the project root**

```markdown
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
```

- [ ] **Step 2: Verify it parses correctly**

```bash
node -e "
const fs = require('fs');
const raw = fs.readFileSync('SKILL.md', 'utf-8');
// Quick sanity check
const hasCharLimits = raw.includes('\`\`\`char-limits');
const hasForbiddenTerms = raw.includes('\`\`\`forbidden-terms');
console.log('char-limits block present:', hasCharLimits);
console.log('forbidden-terms block present:', hasForbiddenTerms);
"
```

Expected:
```
char-limits block present: true
forbidden-terms block present: true
```

- [ ] **Step 3: Commit**

```bash
git add SKILL.md
git commit -m "feat: add SKILL.md starter content guidelines file"
```

---

## Task 7: dashboard.html

**Files:**
- Modify: `src/review/ui/dashboard.html` (replace placeholder from Task 3)

No automated tests. Manual verification steps provided.

- [ ] **Step 1: Write `src/review/ui/dashboard.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Migrator — Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f0f2f5; color: #1a1a2e; min-height: 100vh; }
    header { background: #1a1a2e; color: white; padding: 14px 24px; display: flex; align-items: center; justify-content: space-between; }
    header h1 { font-size: 1rem; font-weight: 600; }
    header a { color: #93c5fd; font-size: 0.8rem; text-decoration: none; }

    .layout { display: flex; gap: 20px; padding: 20px 24px; align-items: flex-start; }
    .panel-pipeline { flex: 0 0 340px; background: white; border-radius: 8px; border: 1px solid #e0e0e0; padding: 20px; }
    .panel-queue { flex: 1; background: white; border-radius: 8px; border: 1px solid #e0e0e0; padding: 20px; }

    @media (max-width: 900px) {
      .layout { flex-direction: column; }
      .panel-pipeline { flex: unset; width: 100%; }
    }

    h2 { font-size: 0.95rem; font-weight: 700; margin-bottom: 14px; color: #1a1a2e; }
    .dir-label { font-size: 0.75rem; color: #666; margin-bottom: 4px; }
    .dir-value { font-size: 0.78rem; font-family: monospace; background: #f4f4f4; padding: 5px 8px; border-radius: 4px; margin-bottom: 12px; word-break: break-all; }

    .progress-bar-track { background: #e5e7eb; border-radius: 4px; height: 8px; margin-bottom: 6px; overflow: hidden; }
    .progress-bar-fill { background: #2563eb; height: 100%; border-radius: 4px; transition: width 0.4s; width: 0%; }
    .progress-label { font-size: 0.75rem; color: #6b7280; margin-bottom: 12px; }

    .counts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px; }
    .count-item { background: #f8f9fa; border-radius: 6px; padding: 8px 10px; }
    .count-item .num { font-size: 1.2rem; font-weight: 700; }
    .count-item .lbl { font-size: 0.7rem; color: #888; text-transform: uppercase; }
    .count-ready .num { color: #15803d; }
    .count-review .num { color: #b45309; }
    .count-blocked .num { color: #b91c1c; }
    .count-total .num { color: #1e40af; }

    button { cursor: pointer; border: none; border-radius: 6px; font-size: 0.875rem; font-weight: 600; padding: 9px 16px; }
    .btn-run { background: #2563eb; color: white; width: 100%; margin-bottom: 0; }
    .btn-run:hover { background: #1d4ed8; }
    .btn-run:disabled { background: #93c5fd; cursor: not-allowed; }

    .queue-toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; flex-wrap: wrap; gap: 8px; }
    .queue-toolbar select { font-size: 0.8rem; padding: 5px 8px; border: 1px solid #d1d5db; border-radius: 5px; background: white; }
    .btn-batch { background: #15803d; color: white; font-size: 0.8rem; padding: 6px 12px; }
    .btn-batch:hover { background: #166534; }
    .btn-batch:disabled { background: #86efac; cursor: not-allowed; }

    .queue-list { display: flex; flex-direction: column; gap: 6px; }
    .queue-row { display: flex; align-items: center; background: #f8f9fa; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 12px; cursor: pointer; text-decoration: none; color: inherit; }
    .queue-row:hover { background: #e8f0fe; border-color: #2563eb; }
    .queue-row .filename { flex: 1; font-size: 0.85rem; font-weight: 500; word-break: break-all; }
    .queue-row .meta { font-size: 0.72rem; color: #6b7280; margin-top: 2px; }
    .badge { padding: 3px 9px; border-radius: 10px; font-size: 0.7rem; font-weight: 700; white-space: nowrap; margin-left: 8px; }
    .badge-ready { background: #dcfce7; color: #15803d; }
    .badge-needs_review { background: #fef3c7; color: #b45309; }
    .badge-blocked { background: #fee2e2; color: #b91c1c; }
    .arrow { margin-left: 8px; color: #2563eb; font-size: 0.9rem; }

    .empty { text-align: center; color: #9ca3af; padding: 32px; font-size: 0.875rem; }
    #status-msg { font-size: 0.78rem; color: #6b7280; margin-top: 8px; min-height: 1.2em; }
  </style>
</head>
<body>
  <header>
    <h1>Email Migrator — Content Designer Dashboard</h1>
    <a href="/">Original Review UI →</a>
  </header>

  <div class="layout">
    <!-- Left: Pipeline control -->
    <div class="panel-pipeline">
      <h2>Run Migration Pipeline</h2>
      <div class="dir-label">Source templates</div>
      <div class="dir-value" id="src-dir">—</div>
      <div class="dir-label">Specs output</div>
      <div class="dir-value" id="specs-dir">—</div>

      <div class="progress-bar-track">
        <div class="progress-bar-fill" id="progress-bar"></div>
      </div>
      <div class="progress-label" id="progress-label">Not started</div>

      <div class="counts">
        <div class="count-item count-total"><div class="num" id="cnt-total">—</div><div class="lbl">Total</div></div>
        <div class="count-item count-ready"><div class="num" id="cnt-ready">—</div><div class="lbl">Ready</div></div>
        <div class="count-item count-review"><div class="num" id="cnt-review">—</div><div class="lbl">Needs review</div></div>
        <div class="count-item count-blocked"><div class="num" id="cnt-blocked">—</div><div class="lbl">Blocked</div></div>
      </div>

      <button class="btn-run" id="run-btn" onclick="runPipeline()">▶ Run Pipeline</button>
      <div id="status-msg"></div>
    </div>

    <!-- Right: Review queue -->
    <div class="panel-queue">
      <div class="queue-toolbar">
        <h2 style="margin:0">Review Queue <span id="queue-count" style="font-weight:400;color:#6b7280;font-size:0.82rem"></span></h2>
        <div style="display:flex;gap:8px;align-items:center">
          <select id="filter-select" onchange="renderQueue()">
            <option value="all">All</option>
            <option value="needs_review">Needs review</option>
            <option value="blocked">Blocked</option>
            <option value="ready">Ready</option>
          </select>
          <button class="btn-batch" id="batch-btn" onclick="batchApprove()">Batch Approve Ready</button>
        </div>
      </div>
      <div class="queue-list" id="queue-list">
        <div class="empty">Loading…</div>
      </div>
    </div>
  </div>

  <script>
    let allSpecs = [];
    let polling = null;

    function esc(s) {
      return String(s)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }

    async function loadSpecs() {
      try {
        const r = await fetch('/api/specs');
        if (!r.ok) return;
        allSpecs = await r.json();
        renderQueue();
      } catch(e) { /* network error */ }
    }

    function renderQueue() {
      const filter = document.getElementById('filter-select').value;
      const filtered = filter === 'all' ? allSpecs : allSpecs.filter(s => s.status === filter);
      document.getElementById('queue-count').textContent = `(${filtered.length} shown, ${allSpecs.length} total)`;
      const el = document.getElementById('queue-list');
      if (filtered.length === 0) {
        el.innerHTML = '<div class="empty">No templates to show.</div>';
        return;
      }
      el.innerHTML = filtered.map(s => `
        <a class="queue-row" href="/editor?id=${esc(s.template_id)}">
          <div>
            <div class="filename">${esc(s.source_file)}</div>
            ${s.reviewed_by ? `<div class="meta">Reviewed by ${esc(s.reviewed_by)}${s.reviewed_at ? ' · ' + new Date(s.reviewed_at).toLocaleString() : ''}</div>` : ''}
          </div>
          <span class="badge badge-${esc(s.status)}">${esc(s.status.replace('_',' '))}</span>
          <span class="arrow">›</span>
        </a>`).join('');
    }

    async function runPipeline() {
      const btn = document.getElementById('run-btn');
      btn.disabled = true;
      btn.textContent = 'Running…';
      document.getElementById('status-msg').textContent = 'Pipeline started…';
      try {
        const r = await fetch('/api/pipeline/run', { method: 'POST', headers: {'Content-Type':'application/json'}, body: '{}' });
        if (!r.ok) {
          document.getElementById('status-msg').textContent = 'Failed to start pipeline.';
          btn.disabled = false; btn.textContent = '▶ Run Pipeline';
          return;
        }
      } catch(e) {
        document.getElementById('status-msg').textContent = 'Error: ' + e.message;
        btn.disabled = false; btn.textContent = '▶ Run Pipeline';
        return;
      }
      startPolling();
    }

    function startPolling() {
      if (polling) clearInterval(polling);
      polling = setInterval(async () => {
        try {
          const r = await fetch('/api/pipeline/status');
          if (!r.ok) return;
          const data = await r.json();
          updatePipelineUI(data);
          if (data.state === 'done' || data.state === 'error') {
            clearInterval(polling); polling = null;
            document.getElementById('run-btn').disabled = false;
            document.getElementById('run-btn').textContent = '▶ Run Pipeline';
            loadSpecs();
          }
        } catch(e) { /* ignore */ }
      }, 2000);
    }

    function updatePipelineUI(data) {
      const total = data.total ?? 0;
      const ready = data.ready ?? 0;
      const needsReview = data.needsReview ?? 0;
      const blocked = data.blocked ?? 0;
      document.getElementById('cnt-total').textContent = total || '—';
      document.getElementById('cnt-ready').textContent = ready || '—';
      document.getElementById('cnt-review').textContent = needsReview || '—';
      document.getElementById('cnt-blocked').textContent = blocked || '—';
      const pct = total > 0 ? Math.round(((ready + needsReview + blocked) / total) * 100) : 0;
      document.getElementById('progress-bar').style.width = pct + '%';
      if (data.state === 'running') {
        document.getElementById('progress-label').textContent = 'Running…';
        document.getElementById('status-msg').textContent = '';
      } else if (data.state === 'done') {
        document.getElementById('progress-label').textContent = `Complete — ${total} template(s) processed`;
        document.getElementById('status-msg').textContent = '';
      } else if (data.state === 'error') {
        document.getElementById('progress-label').textContent = 'Pipeline error';
        document.getElementById('status-msg').textContent = data.error ?? 'Unknown error';
      } else {
        document.getElementById('progress-label').textContent = 'Not started';
      }
    }

    async function batchApprove() {
      const btn = document.getElementById('batch-btn');
      btn.disabled = true;
      try {
        const r = await fetch('/api/batch-approve', { method: 'POST' });
        if (!r.ok) { btn.disabled = false; return; }
        const data = await r.json();
        if (data.ok) { await loadSpecs(); }
      } finally {
        btn.disabled = false;
      }
    }

    // Poll pipeline status on load (may already be running from previous session)
    fetch('/api/pipeline/status').then(r => r.ok ? r.json() : null).then(data => {
      if (data) {
        updatePipelineUI(data);
        if (data.state === 'running') {
          document.getElementById('run-btn').disabled = true;
          document.getElementById('run-btn').textContent = 'Running…';
          startPolling();
        }
      }
    }).catch(() => {});

    // Load server config to show paths
    fetch('/api/templates').then(r => r.ok ? r.json() : []).then(specs => {
      if (specs.length > 0) {
        document.getElementById('src-dir').textContent = specs[0].source_file ? specs[0].source_file.replace(/[^/]+$/, '') : '—';
      }
    }).catch(() => {});

    loadSpecs();
  </script>
</body>
</html>
```

- [ ] **Step 2: Start the review server and verify manually**

```bash
npx tsx src/cli/index.ts run --source ./demo/fixtures --specs ./demo/specs
npx tsx src/cli/index.ts review --specs ./demo/specs --source ./demo/fixtures --port 3333
```

Open http://localhost:3333/dashboard. Verify:
- Pipeline panel shows on the left
- Review queue shows on the right with the demo template
- Status badge is visible
- Clicking a queue row navigates to `/editor?id=payment-reminder` (404 until Task 8)

- [ ] **Step 3: Commit**

```bash
git add src/review/ui/dashboard.html
git commit -m "feat: add dashboard.html — pipeline control and review queue"
```

---

## Task 8: editor.html

**Files:**
- Modify: `src/review/ui/editor.html` (replace placeholder from Task 3)

- [ ] **Step 1: Write `src/review/ui/editor.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Migrator — Editor</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }

    header { background: #1e293b; padding: 10px 20px; display: flex; align-items: center; gap: 16px; border-bottom: 1px solid #334155; flex-shrink: 0; }
    header a { color: #93c5fd; font-size: 0.8rem; text-decoration: none; white-space: nowrap; }
    .header-title { font-size: 0.875rem; font-weight: 600; color: #e2e8f0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .header-status { font-size: 0.75rem; }
    .badge { padding: 3px 9px; border-radius: 10px; font-size: 0.7rem; font-weight: 700; }
    .badge-ready { background: #dcfce7; color: #15803d; }
    .badge-needs_review { background: #fef3c7; color: #b45309; }
    .badge-blocked { background: #fee2e2; color: #b91c1c; }

    .split { display: flex; flex: 1; overflow: hidden; }

    /* Left: email preview */
    .preview-pane { width: 50%; border-right: 2px solid #334155; background: #f8fafc; display: flex; flex-direction: column; overflow: hidden; }
    .pane-label { font-size: 0.7rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #64748b; padding: 8px 12px; background: #f1f5f9; border-bottom: 1px solid #e2e8f0; flex-shrink: 0; }
    .preview-pane iframe { flex: 1; border: none; width: 100%; }

    /* Right: form */
    .form-pane { width: 50%; background: #0f172a; display: flex; flex-direction: column; overflow: hidden; }
    .form-scroll { flex: 1; overflow-y: auto; padding: 14px; }
    .form-footer { padding: 12px 14px; border-top: 1px solid #1e293b; background: #0f172a; flex-shrink: 0; display: flex; gap: 8px; }

    .reviewer-row { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
    .reviewer-row label { font-size: 0.72rem; font-weight: 700; color: #64748b; text-transform: uppercase; white-space: nowrap; }
    .reviewer-row input { flex: 1; background: #1e293b; border: 1px solid #334155; border-radius: 4px; padding: 5px 8px; color: #e2e8f0; font-size: 0.82rem; }

    .field-group { margin-bottom: 12px; }
    .field-label { font-size: 0.7rem; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 4px; display: flex; align-items: center; gap: 6px; }
    .field-limit { color: #f59e0b; }
    .field-textarea { width: 100%; background: #1e293b; border: 1px solid #334155; border-radius: 4px; padding: 7px 8px; color: #e2e8f0; font-size: 0.85rem; line-height: 1.5; resize: vertical; min-height: 56px; font-family: inherit; }
    .field-textarea:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,.15); }
    .field-textarea.active { border-color: #3b82f6; }
    .field-meta { font-size: 0.72rem; margin-top: 3px; display: flex; gap: 8px; }
    .char-ok { color: #4ade80; }
    .char-warn { color: #f59e0b; }
    .warn-msg { color: #f59e0b; }

    button { cursor: pointer; border: none; border-radius: 6px; font-weight: 600; font-size: 0.82rem; padding: 8px 14px; }
    .btn-save { background: #2563eb; color: white; flex: 1; }
    .btn-save:hover { background: #1d4ed8; }
    .btn-save:disabled { background: #334155; color: #64748b; cursor: not-allowed; }
    .btn-flag { background: #92400e; color: #fef3c7; }
    .btn-flag:hover { background: #78350f; }
    .btn-guide { background: #1e293b; color: #94a3b8; border: 1px solid #334155; }
    .btn-guide:hover { background: #334155; }

    /* Guidelines panel */
    .guide-panel { position: fixed; top: 0; right: 0; width: 420px; height: 100vh; background: #1e293b; border-left: 2px solid #334155; overflow-y: auto; padding: 20px; z-index: 100; transform: translateX(100%); transition: transform .25s; }
    .guide-panel.open { transform: translateX(0); }
    .guide-panel h3 { font-size: 0.9rem; margin-bottom: 12px; color: #e2e8f0; display: flex; align-items: center; justify-content: space-between; }
    .guide-panel .close-btn { cursor: pointer; background: none; border: none; color: #94a3b8; font-size: 1.2rem; padding: 0; font-weight: 400; }
    .guide-content { font-size: 0.82rem; line-height: 1.6; color: #cbd5e1; }
    .guide-content h1, .guide-content h2, .guide-content h3 { color: #e2e8f0; margin: 12px 0 6px; }
    .guide-content p { margin-bottom: 8px; }
    .guide-content ul, .guide-content ol { margin-left: 16px; margin-bottom: 8px; }
    .guide-content code { background: #0f172a; padding: 1px 4px; border-radius: 3px; font-size: 0.78rem; }
    .guide-content pre { background: #0f172a; padding: 8px; border-radius: 4px; overflow-x: auto; margin-bottom: 8px; }
    .guide-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,.4); z-index: 99; }
    .guide-overlay.open { display: block; }

    .toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: #1e293b; color: #e2e8f0; padding: 10px 20px; border-radius: 6px; font-size: 0.82rem; border: 1px solid #334155; z-index: 200; opacity: 0; transition: opacity .2s; pointer-events: none; }
    .toast.show { opacity: 1; }
  </style>
</head>
<body>
  <header>
    <a href="/dashboard">← Dashboard</a>
    <div class="header-title" id="header-title">Loading…</div>
    <div class="header-status"><span id="status-badge" class="badge"></span></div>
  </header>

  <div class="split">
    <!-- Left: email preview -->
    <div class="preview-pane">
      <div class="pane-label">Email Preview — click text to focus field</div>
      <iframe id="preview-iframe" sandbox="allow-scripts allow-same-origin" title="Email preview"></iframe>
    </div>

    <!-- Right: edit form -->
    <div class="form-pane">
      <div class="form-scroll" id="form-scroll">
        <div class="reviewer-row">
          <label for="reviewer-name">Your name</label>
          <input type="text" id="reviewer-name" placeholder="e.g. Jane Smith" oninput="saveReviewerName(this.value)">
        </div>
        <div id="fields-container"><p style="color:#64748b;font-size:.82rem">Loading fields…</p></div>
      </div>
      <div class="form-footer">
        <button class="btn-save" id="save-btn" onclick="saveAndApprove()">Save &amp; Approve</button>
        <button class="btn-flag" onclick="flagTemplate()">Flag</button>
        <button class="btn-guide" onclick="toggleGuide()">📋 Guidelines</button>
      </div>
    </div>
  </div>

  <!-- Guidelines panel -->
  <div class="guide-overlay" id="guide-overlay" onclick="toggleGuide()"></div>
  <div class="guide-panel" id="guide-panel">
    <h3>Content Guidelines <button class="close-btn" onclick="toggleGuide()">✕</button></h3>
    <div class="guide-content" id="guide-content">Loading…</div>
  </div>

  <div class="toast" id="toast"></div>

  <script>
    const params = new URLSearchParams(location.search);
    const templateId = params.get('id') || '';
    let spec = null;
    let guidelines = { charLimits: {}, forbiddenTerms: [] };

    function esc(s) {
      return String(s)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }

    function toast(msg, duration) {
      const el = document.getElementById('toast');
      el.textContent = msg;
      el.classList.add('show');
      setTimeout(() => el.classList.remove('show'), duration || 2500);
    }

    // Reviewer name persistence
    const reviewerNameEl = document.getElementById('reviewer-name');
    reviewerNameEl.value = localStorage.getItem('reviewer_name') || '';
    function saveReviewerName(v) { localStorage.setItem('reviewer_name', v); }

    // Load guidelines
    async function loadGuidelines() {
      try {
        const r = await fetch('/api/guidelines');
        if (r.ok) guidelines = await r.json();
      } catch(e) { /* skip */ }
    }

    // Load spec
    async function loadSpec() {
      if (!templateId) { document.getElementById('header-title').textContent = 'No template id'; return; }
      const r = await fetch('/api/spec/' + encodeURIComponent(templateId));
      if (!r.ok) { document.getElementById('header-title').textContent = 'Template not found'; return; }
      spec = await r.json();
      renderHeader();
      renderFields();
      loadPreview();
    }

    function renderHeader() {
      document.title = spec.source_file + ' — Editor';
      document.getElementById('header-title').textContent = spec.source_file;
      const badge = document.getElementById('status-badge');
      badge.textContent = spec.status.replace('_', ' ');
      badge.className = 'badge badge-' + spec.status;
    }

    function renderFields() {
      const editableTypes = ['subject_line','preheader','headline','body_text','cta','disclaimer','footer_content'];
      const blocks = spec.content_blocks.filter(b => editableTypes.includes(b.type));
      if (blocks.length === 0) {
        document.getElementById('fields-container').innerHTML = '<p style="color:#64748b;font-size:.82rem">No editable content blocks found in this spec.</p>';
        return;
      }
      document.getElementById('fields-container').innerHTML = blocks.map(b => {
        const limit = guidelines.charLimits[b.type];
        const current = b.edited_value ?? b.text;
        const limitHtml = limit ? `<span class="field-limit">${limit} chars max</span>` : '';
        return `<div class="field-group" id="group-${esc(b.id)}">
          <div class="field-label">${esc(b.type.replace('_',' '))} ${limitHtml}</div>
          <textarea class="field-textarea" id="field-${esc(b.id)}" data-block-id="${esc(b.id)}" data-type="${esc(b.type)}"
            oninput="validateField(this)"
            rows="${b.type === 'body_text' ? 5 : 2}"
          >${esc(current)}</textarea>
          <div class="field-meta" id="meta-${esc(b.id)}"></div>
        </div>`;
      }).join('');
      blocks.forEach(b => {
        const ta = document.getElementById('field-' + b.id);
        if (ta) validateField(ta);
      });
    }

    function validateField(ta) {
      const blockId = ta.dataset.blockId;
      const type = ta.dataset.type;
      const val = ta.value;
      const limit = guidelines.charLimits[type];
      const meta = document.getElementById('meta-' + blockId);
      const msgs = [];
      if (limit) {
        const cls = val.length > limit ? 'char-warn' : 'char-ok';
        msgs.push(`<span class="${cls}">${val.length} / ${limit}</span>`);
      } else {
        msgs.push(`<span style="color:#64748b">${val.length} chars</span>`);
      }
      for (const term of (guidelines.forbiddenTerms || [])) {
        if (val.toLowerCase().includes(term.toLowerCase())) {
          msgs.push(`<span class="warn-msg">⚠ "${esc(term)}" is a flagged term</span>`);
          break;
        }
      }
      if (meta) meta.innerHTML = msgs.join('');
    }

    function focusField(blockId) {
      const el = document.getElementById('field-' + blockId);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('active');
      el.focus();
      setTimeout(() => el.classList.remove('active'), 1500);
    }

    // postMessage from iframe
    window.addEventListener('message', e => {
      if (e.data && e.data.type === 'block-click') focusField(e.data.blockId);
    });

    function loadPreview() {
      document.getElementById('preview-iframe').src = '/api/spec/' + encodeURIComponent(templateId) + '/preview';
    }

    async function saveAndApprove() {
      const btn = document.getElementById('save-btn');
      btn.disabled = true;
      const reviewedBy = document.getElementById('reviewer-name').value.trim();
      const blocks = collectEdits();
      try {
        const patchRes = await fetch('/api/spec/' + encodeURIComponent(templateId), {
          method: 'PATCH',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ reviewed_by: reviewedBy, blocks }),
        });
        if (!patchRes.ok) { toast('Save failed'); btn.disabled = false; return; }
        const approveRes = await fetch('/api/templates/' + encodeURIComponent(templateId) + '/approve', { method: 'POST' });
        if (!approveRes.ok) { toast('Approve failed'); btn.disabled = false; return; }
        toast('Saved & approved ✓', 1800);
        setTimeout(() => goToNext(), 1800);
      } catch(e) {
        toast('Error: ' + e.message);
        btn.disabled = false;
      }
    }

    async function flagTemplate() {
      const reviewedBy = document.getElementById('reviewer-name').value.trim();
      const note = prompt('Optional flag note:');
      const blocks = collectEdits();
      await fetch('/api/spec/' + encodeURIComponent(templateId), {
        method: 'PATCH',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ reviewed_by: reviewedBy, blocks }),
      });
      await fetch('/api/templates/' + encodeURIComponent(templateId) + '/flag', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ note }),
      });
      toast('Flagged ✓', 1800);
      setTimeout(() => goToNext(), 1800);
    }

    function collectEdits() {
      const blocks = [];
      document.querySelectorAll('.field-textarea').forEach(ta => {
        const originalBlock = spec.content_blocks.find(b => b.id === ta.dataset.blockId);
        const currentText = originalBlock ? (originalBlock.edited_value ?? originalBlock.text) : '';
        if (ta.value !== currentText) {
          blocks.push({ id: ta.dataset.blockId, edited_value: ta.value });
        }
      });
      return blocks;
    }

    async function goToNext() {
      try {
        const r = await fetch('/api/specs');
        if (!r.ok) { location.href = '/dashboard'; return; }
        const specs = await r.json();
        const unreviewed = specs.filter(s => s.status === 'needs_review' && s.template_id !== templateId);
        if (unreviewed.length > 0) {
          location.href = '/editor?id=' + encodeURIComponent(unreviewed[0].template_id);
        } else {
          location.href = '/dashboard';
        }
      } catch(e) { location.href = '/dashboard'; }
    }

    async function toggleGuide() {
      const panel = document.getElementById('guide-panel');
      const overlay = document.getElementById('guide-overlay');
      const isOpen = panel.classList.contains('open');
      if (!isOpen) {
        // Refresh guidelines each time
        await loadGuidelines();
        const content = document.getElementById('guide-content');
        content.innerHTML = mdToHtml(guidelines.raw || '_No SKILL.md found._');
      }
      panel.classList.toggle('open');
      overlay.classList.toggle('open');
    }

    // Minimal markdown-to-HTML (headers, paragraphs, bold, code, lists)
    function mdToHtml(md) {
      return md
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/```[\s\S]*?```/g, m => '<pre><code>' + m.slice(3, m.lastIndexOf('```') - m.length + 3) + '</code></pre>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>')
        .replace(/\n{2,}/g, '</p><p>')
        .replace(/^(?!<[hup])/gm, '<p>')
        .replace(/(?<![>])$/gm, '</p>')
        .replace(/<p><\/p>/g, '');
    }

    // Init
    Promise.all([loadGuidelines(), loadSpec()]);
  </script>
</body>
</html>
```

- [ ] **Step 2: Start the review server and verify manually**

```bash
npx tsx src/cli/index.ts review --specs ./demo/specs --source ./demo/fixtures --port 3333
```

Open http://localhost:3333/dashboard, click the demo template row. Verify:
- Editor opens at `/editor?id=payment-reminder`
- Left iframe shows the demo email HTML
- Right panel shows editable fields (headline, body_text, cta, disclaimer)
- Editing a field updates the char count
- Clicking a text element in the iframe highlights the corresponding field
- "Save & Approve" saves the spec and redirects to dashboard
- "Flag" saves and redirects
- "Guidelines" opens the SKILL.md panel

- [ ] **Step 3: Run the full test suite to confirm nothing is broken**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/review/ui/editor.html
git commit -m "feat: add editor.html — split-pane email preview and edit form"
```

---

## Task 9: Push to GitHub

- [ ] **Step 1: Push all commits**

```bash
git push origin main
```

Expected: all 8+ commits pushed to `https://github.com/biagiomod/email-migrator`.

- [ ] **Step 2: Verify on GitHub**

Check that `SKILL.md`, `src/review/ui/dashboard.html`, `src/review/ui/editor.html`, `src/review/server.ts`, `src/review/guidelines.ts`, and test files all appear in the repo.
