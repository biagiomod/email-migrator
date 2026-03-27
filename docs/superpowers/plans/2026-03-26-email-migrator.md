# Email Migrator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 7-stage deterministic pipeline (INGEST → EXTRACT → NORMALIZE → MAP → ASSESS → REVIEW → EXPORT) that translates HTML email templates into a canonical taxonomy, maps them to TargetSystem modules, and presents them for non-technical human review before any export.

**Architecture:** All pipeline stages (INGEST through MAP) operate on in-memory typed objects. ASSESS is the only stage that writes migration spec JSON to disk. A local Express server serves the review UI at `localhost:3000`. Three pluggable adapter interfaces (extractor, mapper, AI classifier) are defined in Phase 1; only the first two have implementations. EXPORT is hard-gated: it will not run until all required templates are approved in the review UI.

**Tech Stack:** TypeScript 5, Zod (schema validation), Cheerio (HTML parsing), Express 4 (review server), Commander (CLI), Vitest (testing), tsx (TypeScript runner — no build step needed)

---

## File Map

| File | Responsibility |
|------|---------------|
| `src/schemas/canonical-template.ts` | Zod schemas + exported TS types for the full canonical model |
| `src/taxonomies/content-block-types.json` | Controlled vocabulary for ContentBlockType |
| `src/taxonomies/ui-module-types.json` | Controlled vocabulary for UiModuleType |
| `src/extractors/types.ts` | `ExtractorAdapter` interface + `RawExtractedTemplate` type |
| `src/extractors/html-extractor.ts` | `HtmlExtractorAdapter` — cheerio-based HTML parser |
| `src/normalizers/normalizer.ts` | `normalize()` — raw → Zod-validated `CanonicalTemplate`, assigns stable IDs |
| `src/mappers/types.ts` | `MapperAdapter` interface |
| `src/mappers/generic-rule-mapper.ts` | `GenericRuleMapper` — maps by component type, rule-based |
| `src/qa/rules.ts` | QA rule functions → `QaIssue[]` |
| `src/assess/assess.ts` | Runs QA + mapper, sets template status, writes spec JSON |
| `src/pipeline/ingest.ts` | `ingest()` — scans source dir, returns `TemplateEntry[]` |
| `src/pipeline/runner.ts` | `runPipeline()` — orchestrates INGEST → ASSESS |
| `src/export/types.ts` | `ExportAdapter` interface (stub, not implemented) |
| `src/ai/types.ts` | `ClassifierAdapter` interface (stub, not implemented) |
| `src/review/server.ts` | Express server — serves review UI + REST API for approvals |
| `src/review/ui/app.html` | Single-page review UI (vanilla HTML/JS) |
| `src/cli/index.ts` | Commander setup — registers `run`, `review`, `export` commands |
| `fixtures/sample-welcome.html` | Minimal realistic HTML email for development and tests |
| `tests/schemas/canonical-template.test.ts` | Schema validation tests |
| `tests/extractors/html-extractor.test.ts` | Extractor tests against fixture |
| `tests/normalizers/normalizer.test.ts` | Normalizer ID assignment + Zod validation tests |
| `tests/mappers/generic-rule-mapper.test.ts` | Mapper rule coverage tests |
| `tests/qa/rules.test.ts` | QA rule tests (blocked/warning/pass cases) |
| `tests/assess/assess.test.ts` | ASSESS status computation + file-write tests |

---

## Task 1: Project Setup

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `vitest.config.ts`

- [ ] **Step 1: Initialize package.json**

```json
{
  "name": "email-migrator",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "dev": "tsx src/cli/index.ts",
    "migrator": "tsx src/cli/index.ts"
  },
  "dependencies": {
    "cheerio": "^1.0.0",
    "commander": "^12.0.0",
    "express": "^4.18.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.0",
    "@types/node": "^20.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.0.0",
    "vitest": "^1.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Create .gitignore**

```
node_modules/
dist/
specs/
.superpowers/
*.log
```

- [ ] **Step 5: Create directory structure and install dependencies**

```bash
mkdir -p src/schemas src/taxonomies src/extractors src/normalizers \
  src/mappers src/qa src/assess src/pipeline src/review/ui \
  src/export src/ai src/cli \
  tests/schemas tests/extractors tests/normalizers \
  tests/mappers tests/qa tests/assess \
  fixtures specs
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 6: Verify test runner works**

```bash
# Create a trivial smoke test to confirm vitest works
cat > tests/smoke.test.ts << 'EOF'
describe('setup', () => {
  it('vitest is working', () => {
    expect(1 + 1).toBe(2);
  });
});
EOF
npm test
```

Expected output includes: `✓ tests/smoke.test.ts > setup > vitest is working`

- [ ] **Step 7: Delete smoke test**

```bash
rm tests/smoke.test.ts
```

- [ ] **Step 8: Commit**

```bash
git init
git add package.json tsconfig.json vitest.config.ts .gitignore
git commit -m "chore: project setup — TypeScript, Zod, Cheerio, Express, Vitest"
```

---

## Task 2: Canonical Schema

**Files:**
- Create: `src/schemas/canonical-template.ts`
- Create: `tests/schemas/canonical-template.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/schemas/canonical-template.test.ts
import { describe, it, expect } from 'vitest';
import { CanonicalTemplate } from '../../src/schemas/canonical-template';

describe('CanonicalTemplate schema', () => {
  it('accepts a valid minimal template', () => {
    const result = CanonicalTemplate.safeParse({
      template_id: 'welcome-01',
      source_file: 'source/welcome.html',
      content_blocks: [],
      ui_modules: [],
      variables: [],
      conditions: [],
      compliance: [],
      mapping_results: [],
      status: 'ready',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a content block with required fields', () => {
    const result = CanonicalTemplate.safeParse({
      template_id: 'welcome-01',
      source_file: 'source/welcome.html',
      content_blocks: [{
        id: 'welcome-01:headline:0',
        type: 'headline',
        order: 0,
        text: 'Hello, {{firstName}}!',
        variables: ['{{firstName}}'],
        condition_ids: [],
      }],
      ui_modules: [],
      variables: [{ token: '{{firstName}}', type: 'string' }],
      conditions: [],
      compliance: [],
      mapping_results: [],
      status: 'needs_review',
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown content block type', () => {
    const result = CanonicalTemplate.safeParse({
      template_id: 'welcome-01',
      source_file: 'source/welcome.html',
      content_blocks: [{
        id: 'welcome-01:unknown:0',
        type: 'not_a_real_type',
        order: 0,
        text: 'Some text',
        variables: [],
        condition_ids: [],
      }],
      ui_modules: [],
      variables: [],
      conditions: [],
      compliance: [],
      mapping_results: [],
      status: 'ready',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid status', () => {
    const result = CanonicalTemplate.safeParse({
      template_id: 'welcome-01',
      source_file: 'source/welcome.html',
      content_blocks: [],
      ui_modules: [],
      variables: [],
      conditions: [],
      compliance: [],
      mapping_results: [],
      status: 'published',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a CTA block with optional url', () => {
    const result = CanonicalTemplate.safeParse({
      template_id: 'welcome-01',
      source_file: 'source/welcome.html',
      content_blocks: [{
        id: 'welcome-01:cta:0',
        type: 'cta',
        order: 2,
        text: 'Get started',
        url: 'https://example.com/start',
        variables: [],
        condition_ids: [],
      }],
      ui_modules: [],
      variables: [],
      conditions: [],
      compliance: [],
      mapping_results: [],
      status: 'ready',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a mapping result with confidence out of range', () => {
    const result = CanonicalTemplate.safeParse({
      template_id: 'welcome-01',
      source_file: 'source/welcome.html',
      content_blocks: [],
      ui_modules: [],
      variables: [],
      conditions: [],
      compliance: [],
      mapping_results: [{
        component_id: 'welcome-01:header:0',
        match_type: 'exact',
        confidence: 1.5,
        reason: 'Direct match',
        review_status: 'pending',
      }],
      status: 'ready',
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test tests/schemas
```

Expected: FAIL — `Cannot find module '../../src/schemas/canonical-template'`

- [ ] **Step 3: Implement the canonical schema**

```typescript
// src/schemas/canonical-template.ts
import { z } from 'zod';

export const ContentBlockType = z.enum([
  'subject_line',
  'preheader',
  'headline',
  'body_text',
  'cta',
  'disclaimer',
  'footer_content',
]);

export const UiModuleType = z.enum([
  'header',
  'hero',
  'text_block',
  'button',
  'divider',
  'footer',
]);

export const MatchType = z.enum([
  'exact',
  'partial',
  'none',
  'manual_review',
]);

export const ReviewStatus = z.enum([
  'pending',
  'approved',
  'rejected',
  'overridden',
]);

export const ContentBlock = z.object({
  id: z.string(),
  type: ContentBlockType,
  order: z.number().int(),
  role: z.string().optional(),
  text: z.string(),
  url: z.string().url().optional(),
  variables: z.array(z.string()),
  condition_ids: z.array(z.string()),
});

export const UiModule = z.object({
  id: z.string(),
  type: UiModuleType,
  order: z.number().int(),
  variant: z.string().optional(),
  content_block_ids: z.array(z.string()),
});

export const Variable = z.object({
  token: z.string(),
  type: z.enum(['string', 'date', 'currency', 'number', 'url']),
});

export const Condition = z.object({
  id: z.string(),
  expression: z.string(),
  affects: z.array(z.string()),
});

export const ComplianceMarker = z.object({
  family: z.string(),
  required: z.boolean(),
  present: z.boolean(),
});

export const MappingResult = z.object({
  component_id: z.string(),
  match_type: MatchType,
  confidence: z.number().min(0).max(1),
  target_module: z.string().optional(),
  reason: z.string(),
  review_status: ReviewStatus,
  reviewer_note: z.string().optional(),
});

export const CanonicalTemplate = z.object({
  template_id: z.string(),
  source_file: z.string(),
  template_family: z.string().optional(),
  message_type: z.string().optional(),
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

export type ContentBlock = z.infer<typeof ContentBlock>;
export type UiModule = z.infer<typeof UiModule>;
export type Variable = z.infer<typeof Variable>;
export type Condition = z.infer<typeof Condition>;
export type ComplianceMarker = z.infer<typeof ComplianceMarker>;
export type MappingResult = z.infer<typeof MappingResult>;
export type CanonicalTemplate = z.infer<typeof CanonicalTemplate>;
export type ContentBlockType = z.infer<typeof ContentBlockType>;
export type UiModuleType = z.infer<typeof UiModuleType>;
export type MatchType = z.infer<typeof MatchType>;
export type ReviewStatus = z.infer<typeof ReviewStatus>;
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test tests/schemas
```

Expected: `6 passed`

- [ ] **Step 5: Create controlled vocabulary JSON files**

```json
// src/taxonomies/content-block-types.json
{
  "subject_line": "Email subject line",
  "preheader": "Preheader / preview text shown in inbox",
  "headline": "Primary heading inside the email body",
  "body_text": "Main copy paragraphs",
  "cta": "Call-to-action text and link",
  "disclaimer": "Legal or compliance copy",
  "footer_content": "Footer text — contact info, unsubscribe, address"
}
```

```json
// src/taxonomies/ui-module-types.json
{
  "header": "Logo and brand bar at top",
  "hero": "Full-width image or banner",
  "text_block": "Text content region",
  "button": "CTA button element",
  "divider": "Horizontal rule or visual spacer",
  "footer": "Bottom section — legal and footer links"
}
```

- [ ] **Step 6: Commit**

```bash
git add src/schemas/ src/taxonomies/ tests/schemas/
git commit -m "feat: canonical schema (Zod) and controlled vocabulary files"
```

---

## Task 3: Test Fixture + HTML Extractor

**Files:**
- Create: `fixtures/sample-welcome.html`
- Create: `src/extractors/types.ts`
- Create: `src/extractors/html-extractor.ts`
- Create: `tests/extractors/html-extractor.test.ts`

- [ ] **Step 1: Create the test fixture**

```html
<!-- fixtures/sample-welcome.html -->
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Welcome to SourceBrand, {{firstName}}</title>
</head>
<body>
  <div class="preheader" style="display:none;max-height:0">Your account is ready, {{firstName}}</div>
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td class="header" align="center">
        <img src="logo.png" alt="SourceBrand Logo" width="200">
      </td>
    </tr>
    <tr>
      <td class="hero" align="center">
        <img src="hero.jpg" alt="Welcome banner" width="600">
      </td>
    </tr>
    <tr>
      <td class="text-block" style="padding:24px">
        <h1>Hello, {{firstName}}!</h1>
        <p>Welcome to SourceBrand. Your account number is {{accountNumber}}.</p>
        <p>You can access your account at any time.</p>
        <a href="{{ctaUrl}}" class="button" style="background:#0052CC;color:#fff;padding:12px 24px;text-decoration:none">Get started</a>
      </td>
    </tr>
    <tr>
      <td class="footer" style="padding:16px;background:#f5f5f5">
        <p class="disclaimer">SourceBrand is a registered trademark. Subject to terms and conditions. Member FDIC.</p>
        <p>&copy; 2026 SourceBrand. <a href="{{unsubscribeUrl}}">Unsubscribe</a> | <a href="{{privacyUrl}}">Privacy Policy</a></p>
      </td>
    </tr>
  </table>
</body>
</html>
```

- [ ] **Step 2: Write the failing tests**

```typescript
// tests/extractors/html-extractor.test.ts
import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { HtmlExtractorAdapter } from '../../src/extractors/html-extractor';

const fixturePath = path.resolve(__dirname, '../../fixtures/sample-welcome.html');
const fixtureHtml = fs.readFileSync(fixturePath, 'utf-8');
const extractor = new HtmlExtractorAdapter();

describe('HtmlExtractorAdapter', () => {
  it('canHandle accepts .html files', () => {
    expect(extractor.canHandle('templates/welcome.html')).toBe(true);
    expect(extractor.canHandle('templates/welcome.txt')).toBe(false);
  });

  it('returns the source file path and suggested template ID', () => {
    const result = extractor.extract(fixtureHtml, fixturePath, 'sample-welcome');
    expect(result.sourceFile).toBe(fixturePath);
    expect(result.suggestedTemplateId).toBe('sample-welcome');
  });

  it('extracts a headline content block', () => {
    const result = extractor.extract(fixtureHtml, fixturePath, 'sample-welcome');
    const headline = result.contentBlocks.find(b => b.type === 'headline');
    expect(headline).toBeDefined();
    expect(headline!.text).toContain('Hello');
    expect(headline!.variables).toContain('{{firstName}}');
  });

  it('extracts a preheader content block', () => {
    const result = extractor.extract(fixtureHtml, fixturePath, 'sample-welcome');
    const preheader = result.contentBlocks.find(b => b.type === 'preheader');
    expect(preheader).toBeDefined();
    expect(preheader!.text).toContain('account is ready');
  });

  it('extracts a CTA content block with URL', () => {
    const result = extractor.extract(fixtureHtml, fixturePath, 'sample-welcome');
    const cta = result.contentBlocks.find(b => b.type === 'cta');
    expect(cta).toBeDefined();
    expect(cta!.text).toBe('Get started');
    expect(cta!.url).toBe('{{ctaUrl}}');
  });

  it('extracts a disclaimer content block', () => {
    const result = extractor.extract(fixtureHtml, fixturePath, 'sample-welcome');
    const disclaimer = result.contentBlocks.find(b => b.type === 'disclaimer');
    expect(disclaimer).toBeDefined();
    expect(disclaimer!.text).toContain('registered trademark');
  });

  it('extracts variables at template level (deduplicated)', () => {
    const result = extractor.extract(fixtureHtml, fixturePath, 'sample-welcome');
    expect(result.variables).toContain('{{firstName}}');
    expect(result.variables).toContain('{{accountNumber}}');
    expect(result.variables).toContain('{{ctaUrl}}');
    // Variables are unique (no duplicates)
    const unique = new Set(result.variables);
    expect(unique.size).toBe(result.variables.length);
  });

  it('extracts UI modules including header, hero, and footer', () => {
    const result = extractor.extract(fixtureHtml, fixturePath, 'sample-welcome');
    const types = result.uiModules.map(m => m.type);
    expect(types).toContain('header');
    expect(types).toContain('hero');
    expect(types).toContain('footer');
  });

  it('assigns order values to content blocks', () => {
    const result = extractor.extract(fixtureHtml, fixturePath, 'sample-welcome');
    result.contentBlocks.forEach((block, index) => {
      expect(typeof block.order).toBe('number');
    });
  });
});
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
npm test tests/extractors
```

Expected: FAIL — `Cannot find module '../../src/extractors/html-extractor'`

- [ ] **Step 4: Define the extractor types**

```typescript
// src/extractors/types.ts

export interface RawContentBlock {
  type: string;
  text: string;
  url?: string;
  variables: string[];
  order: number;
}

export interface RawUiModule {
  type: string;
  order: number;
  variant?: string;
  contentBlockIndices: number[];
}

export interface RawCondition {
  expression: string;
  affectedBlockIndices: number[];
}

export interface RawExtractedTemplate {
  sourceFile: string;
  suggestedTemplateId: string;
  contentBlocks: RawContentBlock[];
  uiModules: RawUiModule[];
  variables: string[];
  conditions: RawCondition[];
}

export interface ExtractorAdapter {
  name: string;
  canHandle(filePath: string): boolean;
  extract(html: string, filePath: string, templateId: string): RawExtractedTemplate;
}
```

- [ ] **Step 5: Implement HtmlExtractorAdapter**

```typescript
// src/extractors/html-extractor.ts
import * as cheerio from 'cheerio';
import { ExtractorAdapter, RawContentBlock, RawExtractedTemplate, RawUiModule } from './types';

const TOKEN_PATTERN = /\{\{([^}]+)\}\}|\[\[([^\]]+)\]\]|\[([A-Z_]{2,})\]/g;

function extractTokens(text: string): string[] {
  const tokens: string[] = [];
  let match: RegExpExecArray | null;
  TOKEN_PATTERN.lastIndex = 0;
  while ((match = TOKEN_PATTERN.exec(text)) !== null) {
    tokens.push(match[0]);
  }
  return tokens;
}

export class HtmlExtractorAdapter implements ExtractorAdapter {
  name = 'html';

  canHandle(filePath: string): boolean {
    return filePath.endsWith('.html') || filePath.endsWith('.htm');
  }

  extract(html: string, filePath: string, templateId: string): RawExtractedTemplate {
    const $ = cheerio.load(html);
    const contentBlocks: RawContentBlock[] = [];
    let order = 0;

    // Preheader: hidden div at top of body
    const preheaderEl = $('[class*="preheader"], [class*="preview"]').first();
    if (preheaderEl.length) {
      const text = preheaderEl.text().trim();
      if (text) {
        contentBlocks.push({ type: 'preheader', text, variables: extractTokens(text), order: order++ });
      }
    }

    // Headline: first h1 or h2 not in footer
    const headlineEl = $('h1, h2').not('[class*="footer"] h1, [class*="footer"] h2').first();
    if (headlineEl.length) {
      const text = headlineEl.text().trim();
      if (text) {
        contentBlocks.push({ type: 'headline', text, variables: extractTokens(text), order: order++ });
      }
    }

    // Body text: p tags in text-block or main content area, excluding footer
    $('[class*="text-block"] p, [class*="content"] p, td > p')
      .not('[class*="footer"] p, [class*="disclaimer"] p')
      .each((_, el) => {
        const text = $(el).text().trim();
        if (text && text.length > 10) {
          contentBlocks.push({ type: 'body_text', text, variables: extractTokens(text), order: order++ });
        }
      });

    // CTA: anchor tags styled as buttons
    $('a[class*="button"], a[class*="cta"], a[class*="btn"]').each((_, el) => {
      const text = $(el).text().trim();
      const href = $(el).attr('href') || '';
      if (text) {
        contentBlocks.push({
          type: 'cta',
          text,
          url: href || undefined,
          variables: [...extractTokens(text), ...extractTokens(href)],
          order: order++,
        });
      }
    });

    // Disclaimer: elements with disclaimer/legal class
    $('[class*="disclaimer"], [class*="legal"]').each((_, el) => {
      const text = $(el).text().trim();
      if (text) {
        contentBlocks.push({ type: 'disclaimer', text, variables: extractTokens(text), order: order++ });
      }
    });

    // Footer content: remaining text in footer (excluding disclaimer already captured)
    $('[class*="footer"] p').not('[class*="disclaimer"]').each((_, el) => {
      const text = $(el).text().trim();
      if (text) {
        contentBlocks.push({ type: 'footer_content', text, variables: extractTokens(text), order: order++ });
      }
    });

    // ---- UI Modules ----
    const uiModules: RawUiModule[] = [];
    let moduleOrder = 0;

    // Header module
    if ($('[class*="header"]').length) {
      uiModules.push({ type: 'header', order: moduleOrder++, contentBlockIndices: [] });
    }

    // Hero module
    if ($('[class*="hero"]').length) {
      uiModules.push({ type: 'hero', order: moduleOrder++, contentBlockIndices: [] });
    }

    // Text block module — contains headline, body, cta blocks
    const textBlockIndices = contentBlocks.reduce<number[]>((acc, b, i) => {
      if (['headline', 'body_text', 'cta'].includes(b.type)) acc.push(i);
      return acc;
    }, []);
    if (textBlockIndices.length > 0) {
      uiModules.push({ type: 'text_block', order: moduleOrder++, contentBlockIndices: textBlockIndices });
    }

    // Button module — one per CTA block
    contentBlocks.forEach((b, i) => {
      if (b.type === 'cta') {
        uiModules.push({ type: 'button', order: moduleOrder++, contentBlockIndices: [i] });
      }
    });

    // Divider
    if ($('hr, [class*="divider"]').length) {
      uiModules.push({ type: 'divider', order: moduleOrder++, contentBlockIndices: [] });
    }

    // Footer module
    if ($('[class*="footer"]').length) {
      const footerIndices = contentBlocks.reduce<number[]>((acc, b, i) => {
        if (['disclaimer', 'footer_content'].includes(b.type)) acc.push(i);
        return acc;
      }, []);
      uiModules.push({ type: 'footer', order: moduleOrder++, contentBlockIndices: footerIndices });
    }

    // ---- Variables (deduplicated from all content blocks) ----
    const allTokens = contentBlocks.flatMap(b => b.variables);
    const variables = [...new Set(allTokens)];

    return {
      sourceFile: filePath,
      suggestedTemplateId: templateId,
      contentBlocks,
      uiModules,
      variables,
      conditions: [],
    };
  }
}
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
npm test tests/extractors
```

Expected: `8 passed`

- [ ] **Step 7: Commit**

```bash
git add fixtures/ src/extractors/ tests/extractors/
git commit -m "feat: HtmlExtractorAdapter with cheerio-based content and UI detection"
```

---

## Task 4: Normalizer

**Files:**
- Create: `src/normalizers/normalizer.ts`
- Create: `tests/normalizers/normalizer.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/normalizers/normalizer.test.ts
import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { HtmlExtractorAdapter } from '../../src/extractors/html-extractor';
import { normalize } from '../../src/normalizers/normalizer';

const fixturePath = path.resolve(__dirname, '../../fixtures/sample-welcome.html');
const fixtureHtml = fs.readFileSync(fixturePath, 'utf-8');
const extractor = new HtmlExtractorAdapter();

describe('normalize()', () => {
  it('assigns stable canonical IDs to content blocks', () => {
    const raw = extractor.extract(fixtureHtml, fixturePath, 'sample-welcome');
    const canonical = normalize(raw, 'sample-welcome');

    canonical.content_blocks.forEach(block => {
      expect(block.id).toMatch(/^sample-welcome:[a-z_]+:\d+$/);
    });
  });

  it('ID format is {templateId}:{type}:{index} where index is per-type', () => {
    const raw = extractor.extract(fixtureHtml, fixturePath, 'sample-welcome');
    const canonical = normalize(raw, 'sample-welcome');

    // First headline is :0
    const headline = canonical.content_blocks.find(b => b.type === 'headline');
    expect(headline?.id).toBe('sample-welcome:headline:0');
  });

  it('assigns stable IDs to UI modules', () => {
    const raw = extractor.extract(fixtureHtml, fixturePath, 'sample-welcome');
    const canonical = normalize(raw, 'sample-welcome');

    canonical.ui_modules.forEach(mod => {
      expect(mod.id).toMatch(/^sample-welcome:[a-z_]+:\d+$/);
    });
  });

  it('converts contentBlockIndices to canonical content_block_ids', () => {
    const raw = extractor.extract(fixtureHtml, fixturePath, 'sample-welcome');
    const canonical = normalize(raw, 'sample-welcome');

    const textBlock = canonical.ui_modules.find(m => m.type === 'text_block');
    expect(textBlock).toBeDefined();
    textBlock!.content_block_ids.forEach(cbId => {
      const exists = canonical.content_blocks.some(b => b.id === cbId);
      expect(exists).toBe(true);
    });
  });

  it('produces a Zod-valid CanonicalTemplate', () => {
    const raw = extractor.extract(fixtureHtml, fixturePath, 'sample-welcome');
    const canonical = normalize(raw, 'sample-welcome');

    const { CanonicalTemplate } = require('../../src/schemas/canonical-template');
    const result = CanonicalTemplate.safeParse(canonical);
    expect(result.success).toBe(true);
  });

  it('ensures all block-level variables are present in template-level variables', () => {
    const raw = extractor.extract(fixtureHtml, fixturePath, 'sample-welcome');
    const canonical = normalize(raw, 'sample-welcome');

    const templateTokens = canonical.variables.map(v => v.token);
    canonical.content_blocks.forEach(block => {
      block.variables.forEach(token => {
        expect(templateTokens).toContain(token);
      });
    });
  });

  it('sets initial status to needs_review', () => {
    const raw = extractor.extract(fixtureHtml, fixturePath, 'sample-welcome');
    const canonical = normalize(raw, 'sample-welcome');
    expect(canonical.status).toBe('needs_review');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test tests/normalizers
```

Expected: FAIL — `Cannot find module '../../src/normalizers/normalizer'`

- [ ] **Step 3: Implement the normalizer**

```typescript
// src/normalizers/normalizer.ts
import { CanonicalTemplate, ContentBlock, UiModule, Variable } from '../schemas/canonical-template';
import { RawExtractedTemplate, RawContentBlock } from '../extractors/types';

const VALID_CONTENT_BLOCK_TYPES = new Set([
  'subject_line', 'preheader', 'headline', 'body_text',
  'cta', 'disclaimer', 'footer_content',
]);

const VALID_UI_MODULE_TYPES = new Set([
  'header', 'hero', 'text_block', 'button', 'divider', 'footer',
]);

function inferVariableType(token: string): Variable['type'] {
  const lower = token.toLowerCase();
  if (lower.includes('date') || lower.includes('time')) return 'date';
  if (lower.includes('amount') || lower.includes('balance') || lower.includes('price')) return 'currency';
  if (lower.includes('count') || lower.includes('number') || lower.includes('qty')) return 'number';
  if (lower.includes('url') || lower.includes('link') || lower.includes('href')) return 'url';
  return 'string';
}

export function normalize(raw: RawExtractedTemplate, templateId: string): CanonicalTemplate {
  // Track per-type counters for stable ID generation
  const typeCounters: Record<string, number> = {};

  const makeId = (scope: string, type: string): string => {
    typeCounters[type] = (typeCounters[type] ?? 0);
    const id = `${scope}:${type}:${typeCounters[type]}`;
    typeCounters[type]++;
    return id;
  };

  // Reset counters for content blocks and UI modules separately
  const cbTypeCounters: Record<string, number> = {};
  const modTypeCounters: Record<string, number> = {};

  // Normalize content blocks — skip unknown types with a console warning
  const contentBlocks: ContentBlock[] = [];
  raw.contentBlocks.forEach((rb, index) => {
    if (!VALID_CONTENT_BLOCK_TYPES.has(rb.type)) {
      console.warn(`[normalizer] Skipping unrecognized content block type "${rb.type}" at index ${index}`);
      return;
    }
    cbTypeCounters[rb.type] = cbTypeCounters[rb.type] ?? 0;
    const id = `${templateId}:${rb.type}:${cbTypeCounters[rb.type]++}`;
    contentBlocks.push({
      id,
      type: rb.type as ContentBlock['type'],
      order: rb.order,
      text: rb.text,
      url: rb.url,
      variables: rb.variables,
      condition_ids: [],
    });
  });

  // Build index: raw content block array position → canonical ID
  // (needed to resolve contentBlockIndices in ui modules)
  const rawIndexToId: Record<number, string> = {};
  let rawIdx = 0;
  raw.contentBlocks.forEach((rb, index) => {
    if (VALID_CONTENT_BLOCK_TYPES.has(rb.type)) {
      // find the canonical block that was created for this raw block
      const canonicalBlock = contentBlocks.find(
        b => b.type === rb.type && b.text === rb.text
      );
      if (canonicalBlock) rawIndexToId[index] = canonicalBlock.id;
    }
  });

  // Normalize UI modules
  const uiModules: UiModule[] = raw.uiModules
    .filter(rm => {
      if (!VALID_UI_MODULE_TYPES.has(rm.type)) {
        console.warn(`[normalizer] Skipping unrecognized UI module type "${rm.type}"`);
        return false;
      }
      return true;
    })
    .map(rm => {
      modTypeCounters[rm.type] = modTypeCounters[rm.type] ?? 0;
      const id = `${templateId}:${rm.type}:${modTypeCounters[rm.type]++}`;
      const contentBlockIds = rm.contentBlockIndices
        .map(i => rawIndexToId[i])
        .filter((id): id is string => id !== undefined);

      return {
        id,
        type: rm.type as UiModule['type'],
        order: rm.order,
        variant: rm.variant,
        content_block_ids: contentBlockIds,
      };
    });

  // Build deduplicated template-level variables
  const allTokens = contentBlocks.flatMap(b => b.variables);
  const uniqueTokens = [...new Set(allTokens)];
  const variables: Variable[] = uniqueTokens.map(token => ({
    token,
    type: inferVariableType(token),
  }));

  return {
    template_id: templateId,
    source_file: raw.sourceFile,
    content_blocks: contentBlocks,
    ui_modules: uiModules,
    variables,
    conditions: [],
    compliance: [],
    mapping_results: [],
    status: 'needs_review',
  };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test tests/normalizers
```

Expected: `7 passed`

- [ ] **Step 5: Commit**

```bash
git add src/normalizers/ tests/normalizers/
git commit -m "feat: normalizer — assigns stable IDs, Zod-validates, resolves variable consistency"
```

---

## Task 5: Mapper Interface + Stub Mapper

**Files:**
- Create: `src/mappers/types.ts`
- Create: `src/mappers/generic-rule-mapper.ts`
- Create: `tests/mappers/generic-rule-mapper.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/mappers/generic-rule-mapper.test.ts
import { describe, it, expect } from 'vitest';
import { GenericRuleMapper } from '../../src/mappers/generic-rule-mapper';
import { ContentBlock, UiModule, CanonicalTemplate } from '../../src/schemas/canonical-template';

const mapper = new GenericRuleMapper();

const minimalTemplate: CanonicalTemplate = {
  template_id: 'test-01',
  source_file: 'test.html',
  content_blocks: [],
  ui_modules: [],
  variables: [],
  conditions: [],
  compliance: [],
  mapping_results: [],
  status: 'needs_review',
};

describe('GenericRuleMapper', () => {
  it('returns exact match for known UI module types', () => {
    const mod: UiModule = { id: 'test-01:header:0', type: 'header', order: 0, content_block_ids: [] };
    const result = mapper.mapModule(mod, minimalTemplate);
    expect(result.match_type).toBe('exact');
    expect(result.confidence).toBe(1.0);
    expect(result.target_module).toBeDefined();
    expect(result.review_status).toBe('pending');
  });

  it('returns exact match for footer module', () => {
    const mod: UiModule = { id: 'test-01:footer:0', type: 'footer', order: 5, content_block_ids: [] };
    const result = mapper.mapModule(mod, minimalTemplate);
    expect(result.match_type).toBe('exact');
    expect(result.confidence).toBe(1.0);
  });

  it('returns partial match for button module (variant unknown)', () => {
    const mod: UiModule = { id: 'test-01:button:0', type: 'button', order: 3, content_block_ids: [] };
    const result = mapper.mapModule(mod, minimalTemplate);
    expect(result.match_type).toBe('partial');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThan(1);
  });

  it('returns exact match for known content block types', () => {
    const block: ContentBlock = {
      id: 'test-01:headline:0', type: 'headline', order: 0,
      text: 'Hello', variables: [], condition_ids: [],
    };
    const result = mapper.mapBlock(block, minimalTemplate);
    expect(result.match_type).toBe('exact');
    expect(result.confidence).toBe(1.0);
  });

  it('includes a human-readable reason for every mapping', () => {
    const mod: UiModule = { id: 'test-01:hero:0', type: 'hero', order: 1, content_block_ids: [] };
    const result = mapper.mapModule(mod, minimalTemplate);
    expect(typeof result.reason).toBe('string');
    expect(result.reason.length).toBeGreaterThan(0);
  });

  it('component_id on result matches the input component id', () => {
    const mod: UiModule = { id: 'test-01:divider:0', type: 'divider', order: 4, content_block_ids: [] };
    const result = mapper.mapModule(mod, minimalTemplate);
    expect(result.component_id).toBe('test-01:divider:0');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test tests/mappers
```

Expected: FAIL — `Cannot find module '../../src/mappers/generic-rule-mapper'`

- [ ] **Step 3: Define mapper types**

```typescript
// src/mappers/types.ts
import { ContentBlock, UiModule, MappingResult, CanonicalTemplate } from '../schemas/canonical-template';

export interface MapperAdapter {
  name: string;
  mapBlock(block: ContentBlock, template: CanonicalTemplate): MappingResult;
  mapModule(mod: UiModule, template: CanonicalTemplate): MappingResult;
}
```

- [ ] **Step 4: Implement the generic rule mapper**

```typescript
// src/mappers/generic-rule-mapper.ts
import { ContentBlock, UiModule, MappingResult, CanonicalTemplate } from '../schemas/canonical-template';
import { MapperAdapter } from './types';

// Rule tables: componentType → { targetModule, matchType, confidence, reason }
type MappingRule = {
  targetModule: string;
  matchType: MappingResult['match_type'];
  confidence: number;
  reason: string;
};

const CONTENT_BLOCK_RULES: Record<string, MappingRule> = {
  subject_line:   { targetModule: 'TargetSystem/SubjectLine',   matchType: 'exact',   confidence: 1.0, reason: 'Subject line maps directly by type.' },
  preheader:      { targetModule: 'TargetSystem/Preheader',     matchType: 'exact',   confidence: 1.0, reason: 'Preheader maps directly by type.' },
  headline:       { targetModule: 'TargetSystem/Headline',      matchType: 'exact',   confidence: 1.0, reason: 'Headline maps directly by type.' },
  body_text:      { targetModule: 'TargetSystem/BodyText',      matchType: 'exact',   confidence: 1.0, reason: 'Body text maps directly by type.' },
  cta:            { targetModule: 'TargetSystem/CTA',           matchType: 'partial', confidence: 0.8, reason: 'CTA content mapped; button variant requires manual confirmation.' },
  disclaimer:     { targetModule: 'TargetSystem/Disclaimer',    matchType: 'exact',   confidence: 1.0, reason: 'Disclaimer maps directly by type.' },
  footer_content: { targetModule: 'TargetSystem/FooterContent', matchType: 'exact',   confidence: 1.0, reason: 'Footer content maps directly by type.' },
};

const UI_MODULE_RULES: Record<string, MappingRule> = {
  header:     { targetModule: 'TargetSystem/Header',     matchType: 'exact',   confidence: 1.0, reason: 'Header module maps directly by type.' },
  hero:       { targetModule: 'TargetSystem/Hero',       matchType: 'exact',   confidence: 1.0, reason: 'Hero module maps directly by type.' },
  text_block: { targetModule: 'TargetSystem/TextBlock',  matchType: 'exact',   confidence: 1.0, reason: 'Text block maps directly by type.' },
  button:     { targetModule: 'TargetSystem/CTAButton',  matchType: 'partial', confidence: 0.7, reason: 'Button module mapped; variant (primary/secondary) unconfirmed — no style tokens available.' },
  divider:    { targetModule: 'TargetSystem/Divider',    matchType: 'exact',   confidence: 1.0, reason: 'Divider maps directly by type.' },
  footer:     { targetModule: 'TargetSystem/Footer',     matchType: 'exact',   confidence: 1.0, reason: 'Footer module maps directly by type.' },
};

export class GenericRuleMapper implements MapperAdapter {
  name = 'generic-rule-mapper';

  mapBlock(block: ContentBlock, _template: CanonicalTemplate): MappingResult {
    const rule = CONTENT_BLOCK_RULES[block.type];
    if (!rule) {
      return {
        component_id: block.id,
        match_type: 'none',
        confidence: 0,
        reason: `No rule defined for content block type "${block.type}".`,
        review_status: 'pending',
      };
    }
    return {
      component_id: block.id,
      match_type: rule.matchType,
      confidence: rule.confidence,
      target_module: rule.targetModule,
      reason: rule.reason,
      review_status: 'pending',
    };
  }

  mapModule(mod: UiModule, _template: CanonicalTemplate): MappingResult {
    const rule = UI_MODULE_RULES[mod.type];
    if (!rule) {
      return {
        component_id: mod.id,
        match_type: 'none',
        confidence: 0,
        reason: `No rule defined for UI module type "${mod.type}".`,
        review_status: 'pending',
      };
    }
    return {
      component_id: mod.id,
      match_type: rule.matchType,
      confidence: rule.confidence,
      target_module: rule.targetModule,
      reason: rule.reason,
      review_status: 'pending',
    };
  }
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npm test tests/mappers
```

Expected: `6 passed`

- [ ] **Step 6: Commit**

```bash
git add src/mappers/ tests/mappers/
git commit -m "feat: MapperAdapter interface + GenericRuleMapper (rule-based stub)"
```

---

## Task 6: QA Rules

**Files:**
- Create: `src/qa/rules.ts`
- Create: `tests/qa/rules.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/qa/rules.test.ts
import { describe, it, expect } from 'vitest';
import { runAllRules, QaIssue } from '../../src/qa/rules';
import { CanonicalTemplate } from '../../src/schemas/canonical-template';

const validTemplate: CanonicalTemplate = {
  template_id: 'test-01',
  source_file: 'test.html',
  content_blocks: [
    { id: 'test-01:headline:0', type: 'headline', order: 0, text: 'Hello {{firstName}}', variables: ['{{firstName}}'], condition_ids: [] },
    { id: 'test-01:cta:0',      type: 'cta',      order: 1, text: 'Click here', variables: [], condition_ids: [] },
  ],
  ui_modules: [
    { id: 'test-01:text_block:0', type: 'text_block', order: 0, content_block_ids: ['test-01:headline:0'] },
    { id: 'test-01:button:0',     type: 'button',     order: 1, content_block_ids: ['test-01:cta:0'] },
  ],
  variables: [{ token: '{{firstName}}', type: 'string' }],
  conditions: [],
  compliance: [{ family: 'general-disclaimer', required: true, present: true }],
  mapping_results: [],
  status: 'needs_review',
};

describe('runAllRules()', () => {
  it('returns no errors for a valid template', () => {
    const issues = runAllRules(validTemplate);
    const errors = issues.filter(i => i.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('returns error when template has no content blocks', () => {
    const empty: CanonicalTemplate = { ...validTemplate, content_blocks: [], ui_modules: [] };
    const issues = runAllRules(empty);
    expect(issues.some(i => i.severity === 'error' && i.code === 'EMPTY_TEMPLATE')).toBe(true);
  });

  it('returns error when required compliance marker is missing', () => {
    const noncompliant: CanonicalTemplate = {
      ...validTemplate,
      compliance: [{ family: 'general-disclaimer', required: true, present: false }],
    };
    const issues = runAllRules(noncompliant);
    expect(issues.some(i => i.severity === 'error' && i.code === 'MISSING_REQUIRED_COMPLIANCE')).toBe(true);
  });

  it('returns warning when block variable is not in template variables', () => {
    const inconsistent: CanonicalTemplate = {
      ...validTemplate,
      content_blocks: [
        { id: 'test-01:headline:0', type: 'headline', order: 0, text: 'Hello {{lastName}}', variables: ['{{lastName}}'], condition_ids: [] },
      ],
      variables: [],  // lastName missing from template-level
    };
    const issues = runAllRules(inconsistent);
    expect(issues.some(i => i.severity === 'warning' && i.code === 'VARIABLE_INCONSISTENCY')).toBe(true);
  });

  it('returns warning when UI module references non-existent content block ID', () => {
    const broken: CanonicalTemplate = {
      ...validTemplate,
      ui_modules: [
        { id: 'test-01:text_block:0', type: 'text_block', order: 0, content_block_ids: ['test-01:does-not-exist:0'] },
      ],
    };
    const issues = runAllRules(broken);
    expect(issues.some(i => i.severity === 'warning' && i.code === 'DANGLING_CONTENT_BLOCK_REF')).toBe(true);
  });

  it('returns QaIssue objects with code, severity, and message', () => {
    const empty: CanonicalTemplate = { ...validTemplate, content_blocks: [], ui_modules: [] };
    const issues = runAllRules(empty);
    issues.forEach((issue: QaIssue) => {
      expect(typeof issue.code).toBe('string');
      expect(['error', 'warning']).toContain(issue.severity);
      expect(typeof issue.message).toBe('string');
    });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test tests/qa
```

Expected: FAIL — `Cannot find module '../../src/qa/rules'`

- [ ] **Step 3: Implement QA rules**

```typescript
// src/qa/rules.ts
import { CanonicalTemplate } from '../schemas/canonical-template';

export interface QaIssue {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  componentId?: string;
}

export function checkEmptyTemplate(template: CanonicalTemplate): QaIssue[] {
  if (template.content_blocks.length === 0) {
    return [{
      code: 'EMPTY_TEMPLATE',
      severity: 'error',
      message: 'Template has no content blocks. The extractor may have failed to parse this file.',
    }];
  }
  return [];
}

export function checkRequiredCompliance(template: CanonicalTemplate): QaIssue[] {
  return template.compliance
    .filter(marker => marker.required && !marker.present)
    .map(marker => ({
      code: 'MISSING_REQUIRED_COMPLIANCE',
      severity: 'error' as const,
      message: `Required compliance family "${marker.family}" is not present in this template.`,
    }));
}

export function checkVariableConsistency(template: CanonicalTemplate): QaIssue[] {
  const templateTokens = new Set(template.variables.map(v => v.token));
  const issues: QaIssue[] = [];

  template.content_blocks.forEach(block => {
    block.variables.forEach(token => {
      if (!templateTokens.has(token)) {
        issues.push({
          code: 'VARIABLE_INCONSISTENCY',
          severity: 'warning',
          message: `Token "${token}" found in block "${block.id}" but not listed in template-level variables.`,
          componentId: block.id,
        });
      }
    });
  });

  return issues;
}

export function checkDanglingContentBlockRefs(template: CanonicalTemplate): QaIssue[] {
  const blockIds = new Set(template.content_blocks.map(b => b.id));
  const issues: QaIssue[] = [];

  template.ui_modules.forEach(mod => {
    mod.content_block_ids.forEach(cbId => {
      if (!blockIds.has(cbId)) {
        issues.push({
          code: 'DANGLING_CONTENT_BLOCK_REF',
          severity: 'warning',
          message: `UI module "${mod.id}" references content block "${cbId}" which does not exist.`,
          componentId: mod.id,
        });
      }
    });
  });

  return issues;
}

export function runAllRules(template: CanonicalTemplate): QaIssue[] {
  return [
    ...checkEmptyTemplate(template),
    ...checkRequiredCompliance(template),
    ...checkVariableConsistency(template),
    ...checkDanglingContentBlockRefs(template),
  ];
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test tests/qa
```

Expected: `6 passed`

- [ ] **Step 5: Commit**

```bash
git add src/qa/ tests/qa/
git commit -m "feat: QA rules — empty template, compliance, variable consistency, dangling refs"
```

---

## Task 7: ASSESS Stage

**Files:**
- Create: `src/assess/assess.ts`
- Create: `tests/assess/assess.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/assess/assess.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { assess, computeStatus } from '../../src/assess/assess';
import { CanonicalTemplate } from '../../src/schemas/canonical-template';
import { QaIssue } from '../../src/qa/rules';

const baseTemplate: CanonicalTemplate = {
  template_id: 'test-01',
  source_file: 'test.html',
  content_blocks: [
    { id: 'test-01:headline:0', type: 'headline', order: 0, text: 'Hello', variables: [], condition_ids: [] },
  ],
  ui_modules: [],
  variables: [],
  conditions: [],
  compliance: [],
  mapping_results: [],
  status: 'needs_review',
};

describe('computeStatus()', () => {
  it('returns blocked when there are error-level QA issues', () => {
    const issues: QaIssue[] = [{ code: 'EMPTY_TEMPLATE', severity: 'error', message: 'Empty' }];
    const result = computeStatus(baseTemplate, issues);
    expect(result).toBe('blocked');
  });

  it('returns needs_review when there are warning-level QA issues', () => {
    const issues: QaIssue[] = [{ code: 'VARIABLE_INCONSISTENCY', severity: 'warning', message: 'Warn' }];
    const template = { ...baseTemplate, mapping_results: [
      { component_id: 'test-01:headline:0', match_type: 'exact' as const, confidence: 1.0, reason: 'Direct', review_status: 'pending' as const },
    ]};
    const result = computeStatus(template, issues);
    expect(result).toBe('needs_review');
  });

  it('returns needs_review when any mapping confidence is below 1.0', () => {
    const template = { ...baseTemplate, mapping_results: [
      { component_id: 'test-01:headline:0', match_type: 'partial' as const, confidence: 0.7, reason: 'Partial', review_status: 'pending' as const },
    ]};
    const result = computeStatus(template, []);
    expect(result).toBe('needs_review');
  });

  it('returns ready when all mappings are exact with confidence 1.0 and no QA issues', () => {
    const template = { ...baseTemplate, mapping_results: [
      { component_id: 'test-01:headline:0', match_type: 'exact' as const, confidence: 1.0, reason: 'Direct', review_status: 'pending' as const },
    ]};
    const result = computeStatus(template, []);
    expect(result).toBe('ready');
  });
});

describe('assess()', () => {
  let specsDir: string;

  beforeEach(() => {
    specsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrator-assess-test-'));
  });

  afterEach(() => {
    fs.rmSync(specsDir, { recursive: true });
  });

  it('writes one JSON file per template to specsDir', () => {
    const templates = [baseTemplate, { ...baseTemplate, template_id: 'test-02', source_file: 'test2.html' }];
    assess(templates, specsDir);
    const files = fs.readdirSync(specsDir);
    expect(files).toHaveLength(2);
    expect(files).toContain('test-01.json');
    expect(files).toContain('test-02.json');
  });

  it('written JSON is parseable and contains the template_id', () => {
    assess([baseTemplate], specsDir);
    const raw = fs.readFileSync(path.join(specsDir, 'test-01.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.template_id).toBe('test-01');
  });

  it('sets assessed_at timestamp on written specs', () => {
    assess([baseTemplate], specsDir);
    const raw = fs.readFileSync(path.join(specsDir, 'test-01.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.assessed_at).toBeDefined();
  });

  it('returns the assessed templates with status set', () => {
    const results = assess([baseTemplate], specsDir);
    expect(results[0].status).toBeDefined();
    expect(['ready', 'needs_review', 'blocked']).toContain(results[0].status);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test tests/assess
```

Expected: FAIL — `Cannot find module '../../src/assess/assess'`

- [ ] **Step 3: Implement the ASSESS stage**

```typescript
// src/assess/assess.ts
import * as fs from 'fs';
import * as path from 'path';
import { CanonicalTemplate } from '../schemas/canonical-template';
import { runAllRules, QaIssue } from '../qa/rules';
import { GenericRuleMapper } from '../mappers/generic-rule-mapper';

const AUTO_APPROVE_THRESHOLD = 1.0;
const mapper = new GenericRuleMapper();

export function computeStatus(
  template: CanonicalTemplate,
  issues: QaIssue[],
): 'ready' | 'needs_review' | 'blocked' {
  if (issues.some(i => i.severity === 'error')) return 'blocked';

  const allExact = template.mapping_results.every(
    r => r.match_type === 'exact' && r.confidence >= AUTO_APPROVE_THRESHOLD,
  );

  if (issues.some(i => i.severity === 'warning') || !allExact) {
    return 'needs_review';
  }

  return 'ready';
}

export function assess(templates: CanonicalTemplate[], specsDir: string): CanonicalTemplate[] {
  fs.mkdirSync(specsDir, { recursive: true });

  return templates.map(template => {
    // Run mapper on all components
    const blockResults = template.content_blocks.map(b => mapper.mapBlock(b, template));
    const moduleResults = template.ui_modules.map(m => mapper.mapModule(m, template));
    const mappingResults = [...blockResults, ...moduleResults];

    const withMappings: CanonicalTemplate = { ...template, mapping_results: mappingResults };

    // Run QA rules
    const issues = runAllRules(withMappings);

    // Compute status
    const status = computeStatus(withMappings, issues);
    const reviewNotes = issues.map(i => `[${i.severity.toUpperCase()}] ${i.code}: ${i.message}`).join('\n') || undefined;

    const assessed: CanonicalTemplate = {
      ...withMappings,
      status,
      review_notes: reviewNotes,
      assessed_at: new Date().toISOString(),
    };

    // Write migration spec to disk
    const specPath = path.join(specsDir, `${template.template_id}.json`);
    fs.writeFileSync(specPath, JSON.stringify(assessed, null, 2), 'utf-8');

    return assessed;
  });
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test tests/assess
```

Expected: `9 passed`

- [ ] **Step 5: Commit**

```bash
git add src/assess/ tests/assess/
git commit -m "feat: ASSESS stage — runs mapper + QA, computes status, writes migration spec JSON"
```

---

## Task 8: Adapter Stubs

**Files:**
- Create: `src/export/types.ts`
- Create: `src/ai/types.ts`

No tests — these are interface stubs only.

- [ ] **Step 1: Create ExportAdapter stub**

```typescript
// src/export/types.ts
import { CanonicalTemplate } from '../schemas/canonical-template';

/**
 * ExportAdapter — Phase 1 stub.
 * Implement this when TargetSystem module structure is known.
 * Only called by the EXPORT stage after all required reviews are approved.
 */
export interface ExportAdapter {
  name: string;
  /** Returns the file path of the generated artifact. */
  export(template: CanonicalTemplate, outputDir: string): Promise<string>;
}
```

- [ ] **Step 2: Create ClassifierAdapter stub**

```typescript
// src/ai/types.ts

/**
 * ClassifierAdapter — Phase 2 stub.
 * Not implemented in Phase 1.
 * GitHub Copilot or any LLM plugs in here when available in the work environment.
 * The pipeline runs fully without this — it is strictly optional.
 */
export interface ClassifierAdapter {
  name: string;
  /**
   * Given raw text and a list of candidate labels, returns the best
   * label and a confidence score between 0 and 1.
   */
  classify(raw: string, candidates: string[]): Promise<{ label: string; confidence: number }>;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/export/ src/ai/
git commit -m "feat: ExportAdapter and ClassifierAdapter interface stubs (Phase 1 — not implemented)"
```

---

## Task 9: Pipeline Runner + CLI

**Files:**
- Create: `src/pipeline/ingest.ts`
- Create: `src/pipeline/runner.ts`
- Create: `src/cli/index.ts`

- [ ] **Step 1: Create INGEST stage**

```typescript
// src/pipeline/ingest.ts
import * as fs from 'fs';
import * as path from 'path';

export interface TemplateEntry {
  filePath: string;
  templateId: string;
  fileName: string;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function ingest(sourceDir: string): TemplateEntry[] {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Source directory not found: ${sourceDir}`);
  }

  return fs.readdirSync(sourceDir)
    .filter(f => f.endsWith('.html') || f.endsWith('.htm'))
    .sort()
    .map(fileName => ({
      filePath: path.resolve(sourceDir, fileName),
      templateId: slugify(path.basename(fileName, path.extname(fileName))),
      fileName,
    }));
}
```

- [ ] **Step 2: Create pipeline runner**

```typescript
// src/pipeline/runner.ts
import * as fs from 'fs';
import * as path from 'path';
import { ingest } from './ingest';
import { HtmlExtractorAdapter } from '../extractors/html-extractor';
import { normalize } from '../normalizers/normalizer';
import { assess } from '../assess/assess';
import { CanonicalTemplate } from '../schemas/canonical-template';

const extractor = new HtmlExtractorAdapter();

export interface RunOptions {
  sourceDir: string;
  specsDir: string;
}

export interface RunResult {
  total: number;
  ready: number;
  needsReview: number;
  blocked: number;
  specsDir: string;
}

export function runPipeline(options: RunOptions): RunResult {
  const { sourceDir, specsDir } = options;

  // INGEST
  const manifest = ingest(sourceDir);
  if (manifest.length === 0) {
    console.warn(`[ingest] No HTML files found in ${sourceDir}`);
    return { total: 0, ready: 0, needsReview: 0, blocked: 0, specsDir };
  }
  console.log(`[ingest] Found ${manifest.length} template(s)`);

  // EXTRACT → NORMALIZE per template
  const templates: CanonicalTemplate[] = [];
  for (const entry of manifest) {
    console.log(`[extract] ${entry.fileName}`);
    const html = fs.readFileSync(entry.filePath, 'utf-8');
    const raw = extractor.extract(html, entry.filePath, entry.templateId);
    const canonical = normalize(raw, entry.templateId);
    templates.push(canonical);
  }

  // MAP + ASSESS (assess runs mapper internally)
  console.log(`[assess] Running QA and mapping...`);
  const results = assess(templates, specsDir);

  const blocked = results.filter(t => t.status === 'blocked');
  const needsReview = results.filter(t => t.status === 'needs_review');
  const ready = results.filter(t => t.status === 'ready');

  return {
    total: results.length,
    ready: ready.length,
    needsReview: needsReview.length,
    blocked: blocked.length,
    specsDir,
  };
}
```

- [ ] **Step 3: Create CLI entry point**

```typescript
// src/cli/index.ts
import { Command } from 'commander';
import * as path from 'path';
import { runPipeline } from '../pipeline/runner';

const program = new Command();
program.name('migrator').description('Email template migration tool').version('1.0.0');

program
  .command('run')
  .description('Run the full pipeline: INGEST → EXTRACT → NORMALIZE → MAP → ASSESS')
  .requiredOption('--source <dir>', 'Directory containing source HTML email templates')
  .option('--specs <dir>', 'Directory to write migration spec JSON files', './specs')
  .action((options) => {
    const sourceDir = path.resolve(options.source);
    const specsDir = path.resolve(options.specs);

    console.log(`\nStarting migration pipeline`);
    console.log(`Source: ${sourceDir}`);
    console.log(`Specs:  ${specsDir}\n`);

    const result = runPipeline({ sourceDir, specsDir });

    console.log(`\n--- Pipeline complete ---`);
    console.log(`Total:       ${result.total}`);
    console.log(`Ready:       ${result.ready}`);
    console.log(`Needs review:${result.needsReview}`);
    console.log(`Blocked:     ${result.blocked}`);

    if (result.blocked > 0) {
      console.error(`\n✗ ${result.blocked} template(s) are BLOCKED. Review spec files in ${specsDir} for error details.`);
      process.exit(1);
    }

    console.log(`\n✓ Specs written to ${specsDir}`);
    console.log(`  Run: migrator review --specs ${specsDir} --source ${sourceDir}`);
  });

program
  .command('review')
  .description('Launch the local review UI')
  .requiredOption('--specs <dir>', 'Directory containing migration spec JSON files')
  .requiredOption('--source <dir>', 'Directory containing source HTML email templates')
  .option('--port <number>', 'Port for the review server', '3000')
  .action(async (options) => {
    const { startReviewServer } = await import('../review/server');
    const specsDir = path.resolve(options.specs);
    const sourceDir = path.resolve(options.source);
    const port = parseInt(options.port, 10);
    startReviewServer({ specsDir, sourceDir, port });
  });

program
  .command('export')
  .description('Export approved templates (gated: all must be approved first)')
  .requiredOption('--specs <dir>', 'Directory containing migration spec JSON files')
  .requiredOption('--output <dir>', 'Directory to write target artifacts')
  .action((options) => {
    const specsDir = path.resolve(options.specs);
    const outputDir = path.resolve(options.output);
    console.log(`Export is not implemented in Phase 1.`);
    console.log(`Specs dir: ${specsDir}`);
    console.log(`Output dir: ${outputDir}`);
    console.log(`Implement ExportAdapter in src/export/ when TargetSystem structure is known.`);
  });

program.parse(process.argv);
```

- [ ] **Step 4: Smoke test the pipeline against the fixture**

```bash
mkdir -p ./source-templates
cp fixtures/sample-welcome.html ./source-templates/

npm run dev -- run --source ./source-templates --specs ./specs
```

Expected output:
```
Starting migration pipeline
Source: .../source-templates
Specs:  .../specs

[ingest] Found 1 template(s)
[extract] sample-welcome.html
[assess] Running QA and mapping...

--- Pipeline complete ---
Total:        1
Ready:        0
Needs review: 1
Blocked:      0

✓ Specs written to .../specs
  Run: migrator review --specs .../specs --source .../source-templates
```

- [ ] **Step 5: Verify spec file was written**

```bash
cat specs/sample-welcome.json | head -30
```

Expected: JSON with `template_id: "sample-welcome"`, `status: "needs_review"`, populated `content_blocks`, `ui_modules`, `mapping_results`.

- [ ] **Step 6: Commit**

```bash
git add src/pipeline/ src/cli/ source-templates/
git commit -m "feat: pipeline runner (INGEST→ASSESS) and CLI with run/review/export commands"
```

---

## Task 10: Review Server

**Files:**
- Create: `src/review/server.ts`
- Create: `src/review/ui/app.html`

- [ ] **Step 1: Create the review server**

```typescript
// src/review/server.ts
import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { CanonicalTemplate } from '../schemas/canonical-template';

export interface ReviewServerOptions {
  specsDir: string;
  sourceDir: string;
  port: number;
}

function loadSpecs(specsDir: string): CanonicalTemplate[] {
  if (!fs.existsSync(specsDir)) return [];
  return fs.readdirSync(specsDir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .map(f => JSON.parse(fs.readFileSync(path.join(specsDir, f), 'utf-8')) as CanonicalTemplate);
}

function saveSpec(specsDir: string, template: CanonicalTemplate): void {
  const specPath = path.join(specsDir, `${template.template_id}.json`);
  fs.writeFileSync(specPath, JSON.stringify(template, null, 2), 'utf-8');
}

export function startReviewServer(options: ReviewServerOptions): void {
  const { specsDir, sourceDir, port } = options;
  const app = express();
  app.use(express.json());

  // Serve the review UI
  app.get('/', (_req, res) => {
    res.sendFile(path.resolve(__dirname, 'ui/app.html'));
  });

  // Serve original source HTML files (for iframe preview)
  app.use('/source', express.static(sourceDir));

  // GET /api/templates — list all templates with status summary
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

  // GET /api/templates/:id — full spec for one template
  app.get('/api/templates/:id', (req, res) => {
    const specPath = path.join(specsDir, `${req.params.id}.json`);
    if (!fs.existsSync(specPath)) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json(JSON.parse(fs.readFileSync(specPath, 'utf-8')));
  });

  // POST /api/templates/:id/approve — approve a template
  app.post('/api/templates/:id/approve', (req, res) => {
    const specPath = path.join(specsDir, `${req.params.id}.json`);
    if (!fs.existsSync(specPath)) return res.status(404).json({ error: 'Not found' });

    const spec: CanonicalTemplate = JSON.parse(fs.readFileSync(specPath, 'utf-8'));
    const updated: CanonicalTemplate = {
      ...spec,
      mapping_results: spec.mapping_results.map(r => ({ ...r, review_status: 'approved' as const })),
    };
    saveSpec(specsDir, updated);
    res.json({ ok: true, template_id: req.params.id });
  });

  // POST /api/templates/:id/flag — flag for revision
  app.post('/api/templates/:id/flag', (req, res) => {
    const specPath = path.join(specsDir, `${req.params.id}.json`);
    if (!fs.existsSync(specPath)) return res.status(404).json({ error: 'Not found' });

    const spec: CanonicalTemplate = JSON.parse(fs.readFileSync(specPath, 'utf-8'));
    const { note } = req.body as { note?: string };
    const updated: CanonicalTemplate = {
      ...spec,
      status: 'needs_review',
      review_notes: note ?? spec.review_notes,
    };
    saveSpec(specsDir, updated);
    res.json({ ok: true, template_id: req.params.id });
  });

  // POST /api/batch-approve — approve all exact-match + ready templates
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

  app.listen(port, () => {
    console.log(`\n✓ Review UI running at http://localhost:${port}`);
    console.log(`  Reviewing specs in: ${specsDir}`);
    console.log(`  Press Ctrl+C to stop.\n`);
  });
}
```

- [ ] **Step 2: Create the review UI**

```html
<!-- src/review/ui/app.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Migrator — Review</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f0f2f5; color: #1a1a2e; }
    header { background: #1a1a2e; color: white; padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; }
    header h1 { font-size: 1.1rem; font-weight: 600; }
    .badge { padding: 4px 10px; border-radius: 12px; font-size: 0.75rem; font-weight: 600; }
    .badge-ready { background: #d4edda; color: #155724; }
    .badge-needs_review { background: #fff3cd; color: #856404; }
    .badge-blocked { background: #f8d7da; color: #721c24; }

    .toolbar { background: white; border-bottom: 1px solid #e0e0e0; padding: 12px 24px; display: flex; gap: 12px; align-items: center; }
    button { cursor: pointer; padding: 8px 16px; border-radius: 6px; border: none; font-size: 0.875rem; font-weight: 500; }
    .btn-primary { background: #0052CC; color: white; }
    .btn-primary:hover { background: #0043a8; }
    .btn-approve { background: #28a745; color: white; }
    .btn-approve:hover { background: #218838; }
    .btn-flag { background: #ffc107; color: #333; }
    .btn-flag:hover { background: #e0a800; }

    .layout { display: grid; grid-template-columns: 320px 1fr; height: calc(100vh - 105px); }
    .sidebar { background: white; border-right: 1px solid #e0e0e0; overflow-y: auto; }
    .sidebar-item { padding: 14px 16px; border-bottom: 1px solid #f0f0f0; cursor: pointer; }
    .sidebar-item:hover { background: #f8f9fa; }
    .sidebar-item.active { background: #e8f0fe; border-left: 3px solid #0052CC; }
    .sidebar-item h3 { font-size: 0.875rem; font-weight: 600; margin-bottom: 4px; }
    .sidebar-item p { font-size: 0.75rem; color: #666; }
    .sidebar-empty { padding: 24px; color: #888; font-size: 0.875rem; text-align: center; }

    .main { overflow-y: auto; padding: 24px; }
    .main-empty { display: flex; align-items: center; justify-content: center; height: 100%; color: #888; }
    .card { background: white; border-radius: 8px; border: 1px solid #e0e0e0; margin-bottom: 20px; }
    .card-header { padding: 14px 18px; border-bottom: 1px solid #f0f0f0; font-weight: 600; font-size: 0.9rem; color: #333; }
    .card-body { padding: 18px; }

    .preview-frame { width: 100%; height: 400px; border: 1px solid #e0e0e0; border-radius: 6px; background: white; }
    .taxonomy-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .taxonomy-item { background: #f8f9fa; border-radius: 6px; padding: 10px 12px; font-size: 0.82rem; }
    .taxonomy-item .label { font-size: 0.7rem; text-transform: uppercase; color: #888; margin-bottom: 2px; }
    .taxonomy-item .value { color: #333; font-weight: 500; word-break: break-word; }
    .taxonomy-item .token { font-family: monospace; font-size: 0.78rem; background: #e8f0fe; padding: 1px 5px; border-radius: 3px; }

    .mapping-row { display: grid; grid-template-columns: 1fr 120px 60px 120px; gap: 8px; align-items: center; padding: 8px 0; border-bottom: 1px solid #f5f5f5; font-size: 0.82rem; }
    .mapping-row:last-child { border-bottom: none; }
    .conf-bar { height: 6px; border-radius: 3px; background: #e0e0e0; }
    .conf-fill { height: 100%; border-radius: 3px; }
    .conf-high { background: #28a745; }
    .conf-mid { background: #ffc107; }
    .conf-low { background: #dc3545; }
    .action-row { padding: 14px 18px; display: flex; gap: 10px; border-top: 1px solid #f0f0f0; }
    .loading { padding: 24px; text-align: center; color: #888; }
  </style>
</head>
<body>
<header>
  <h1>Email Migrator — Review</h1>
  <span id="summary" style="font-size:0.8rem;opacity:0.7">Loading...</span>
</header>

<div class="toolbar">
  <button class="btn-primary" onclick="batchApprove()">⚡ Batch Approve (Exact Match)</button>
  <button onclick="loadTemplates()">↻ Refresh</button>
  <span id="filter-label" style="font-size:0.82rem;color:#666;margin-left:8px"></span>
</div>

<div class="layout">
  <div class="sidebar" id="sidebar">
    <div class="loading">Loading templates...</div>
  </div>
  <div class="main" id="main">
    <div class="main-empty">Select a template from the sidebar to review it.</div>
  </div>
</div>

<script>
let templates = [];
let selectedId = null;

async function loadTemplates() {
  const res = await fetch('/api/templates');
  templates = await res.json();
  renderSidebar();
  updateSummary();
  if (selectedId) renderMain(templates.find(t => t.template_id === selectedId));
}

function updateSummary() {
  const ready = templates.filter(t => t.status === 'ready').length;
  const nr = templates.filter(t => t.status === 'needs_review').length;
  const blocked = templates.filter(t => t.status === 'blocked').length;
  document.getElementById('summary').textContent =
    `${templates.length} templates — ✓ ${ready} ready · ⚠ ${nr} needs review · ✗ ${blocked} blocked`;
}

function renderSidebar() {
  const el = document.getElementById('sidebar');
  if (templates.length === 0) {
    el.innerHTML = '<div class="sidebar-empty">No migration specs found.<br>Run: <code>migrator run</code> first.</div>';
    return;
  }
  el.innerHTML = templates.map(t => `
    <div class="sidebar-item ${t.template_id === selectedId ? 'active' : ''}" onclick="selectTemplate('${t.template_id}')">
      <h3>${t.template_id}</h3>
      <p><span class="badge badge-${t.status}">${t.status.replace('_', ' ')}</span>
         &nbsp;${t.content_blocks_count} blocks · ${t.mapping_results.length} mappings</p>
    </div>
  `).join('');
}

async function selectTemplate(id) {
  selectedId = id;
  renderSidebar();
  const res = await fetch(`/api/templates/${id}`);
  const spec = await res.json();
  renderMain(spec);
}

function renderMain(spec) {
  if (!spec) return;
  const main = document.getElementById('main');
  const allApproved = spec.mapping_results.every(r => r.review_status === 'approved');

  main.innerHTML = `
    <div class="card">
      <div class="card-header">
        ${spec.template_id}
        <span class="badge badge-${spec.status}" style="margin-left:8px">${spec.status.replace('_', ' ')}</span>
      </div>
      <div class="card-body">
        <p style="font-size:0.8rem;color:#888">Source: ${spec.source_file}</p>
        ${spec.review_notes ? `<p style="margin-top:8px;font-size:0.82rem;color:#856404;background:#fff3cd;padding:8px;border-radius:4px">${spec.review_notes.replace(/\n/g, '<br>')}</p>` : ''}
      </div>
      <div class="action-row">
        <button class="btn-approve" onclick="approveTemplate('${spec.template_id}')">✓ Approve Template</button>
        <button class="btn-flag" onclick="flagTemplate('${spec.template_id}')">⚑ Flag for Revision</button>
      </div>
    </div>

    <div class="card">
      <div class="card-header">Original Email Preview</div>
      <div class="card-body">
        <iframe class="preview-frame" src="/source/${encodeURIComponent(spec.source_file.split('/').pop())}"></iframe>
      </div>
    </div>

    <div class="card">
      <div class="card-header">Extracted Content Blocks (${spec.content_blocks.length})</div>
      <div class="card-body">
        <div class="taxonomy-grid">
          ${spec.content_blocks.map(b => `
            <div class="taxonomy-item">
              <div class="label">${b.type} · order ${b.order}</div>
              <div class="value">${b.text.substring(0, 80)}${b.text.length > 80 ? '…' : ''}</div>
              ${b.variables.length ? `<div style="margin-top:4px">${b.variables.map(v => `<span class="token">${v}</span>`).join(' ')}</div>` : ''}
              ${b.url ? `<div style="margin-top:2px;font-size:0.75rem;color:#0052CC">↗ ${b.url}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">Proposed Target Mappings</div>
      <div class="card-body">
        <div style="font-size:0.78rem;color:#888;margin-bottom:8px;display:grid;grid-template-columns:1fr 120px 60px 120px;gap:8px">
          <span>Component</span><span>Target Module</span><span>Conf.</span><span>Status</span>
        </div>
        ${spec.mapping_results.map(r => {
          const pct = Math.round(r.confidence * 100);
          const cls = pct === 100 ? 'conf-high' : pct >= 50 ? 'conf-mid' : 'conf-low';
          return `<div class="mapping-row">
            <div>
              <div style="font-weight:500">${r.component_id}</div>
              <div style="font-size:0.75rem;color:#888">${r.reason}</div>
            </div>
            <div style="font-size:0.8rem">${r.target_module ?? '—'}</div>
            <div>
              <div class="conf-bar"><div class="conf-fill ${cls}" style="width:${pct}%"></div></div>
              <div style="font-size:0.7rem;text-align:right;color:#666">${pct}%</div>
            </div>
            <div><span class="badge badge-${r.review_status === 'approved' ? 'ready' : 'needs_review'}">${r.review_status}</span></div>
          </div>`;
        }).join('')}
      </div>
    </div>
  `;
}

async function approveTemplate(id) {
  await fetch(`/api/templates/${id}/approve`, { method: 'POST' });
  await loadTemplates();
  await selectTemplate(id);
}

async function flagTemplate(id) {
  const note = prompt('Add a note for the reviewer (optional):');
  await fetch(`/api/templates/${id}/flag`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note }),
  });
  await loadTemplates();
  await selectTemplate(id);
}

async function batchApprove() {
  const res = await fetch('/api/batch-approve', { method: 'POST' });
  const data = await res.json();
  alert(`Batch approved ${data.approved} template(s).`);
  await loadTemplates();
}

loadTemplates();
</script>
</body>
</html>
```

- [ ] **Step 3: Test the review server manually**

```bash
# Ensure specs exist from Task 9
npm run dev -- review --specs ./specs --source ./source-templates --port 3000
```

Expected: `✓ Review UI running at http://localhost:3000`

Open http://localhost:3000 in a browser. You should see:
- Sidebar with `sample-welcome` template listed as `needs review`
- Clicking it shows the email preview, extracted content blocks, and mapping results
- "Approve Template" button writes back to the spec JSON
- "Batch Approve" button approves all exact-match templates

- [ ] **Step 4: Commit**

```bash
git add src/review/ src/pipeline/
git commit -m "feat: review server (Express) + single-page review UI with approve/flag/batch-approve"
```

---

## Task 11: End-to-End Smoke Test

**Files:**
- Create: `tests/e2e/pipeline.test.ts`

- [ ] **Step 1: Write the end-to-end test**

```typescript
// tests/e2e/pipeline.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runPipeline } from '../../src/pipeline/runner';
import { CanonicalTemplate } from '../../src/schemas/canonical-template';

const FIXTURE_DIR = path.resolve(__dirname, '../../fixtures');

describe('end-to-end pipeline', () => {
  let specsDir: string;
  let sourceDir: string;

  beforeEach(() => {
    specsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrator-e2e-specs-'));
    sourceDir = FIXTURE_DIR;
  });

  afterEach(() => {
    fs.rmSync(specsDir, { recursive: true });
  });

  it('processes sample-welcome.html without throwing', () => {
    expect(() => runPipeline({ sourceDir, specsDir })).not.toThrow();
  });

  it('writes a spec file for sample-welcome', () => {
    runPipeline({ sourceDir, specsDir });
    expect(fs.existsSync(path.join(specsDir, 'sample-welcome.json'))).toBe(true);
  });

  it('written spec passes CanonicalTemplate Zod validation', () => {
    runPipeline({ sourceDir, specsDir });
    const raw = fs.readFileSync(path.join(specsDir, 'sample-welcome.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    const result = CanonicalTemplate.safeParse(parsed);
    expect(result.success).toBe(true);
  });

  it('spec has content blocks with stable canonical IDs', () => {
    runPipeline({ sourceDir, specsDir });
    const spec: CanonicalTemplate = JSON.parse(
      fs.readFileSync(path.join(specsDir, 'sample-welcome.json'), 'utf-8')
    );
    expect(spec.content_blocks.length).toBeGreaterThan(0);
    spec.content_blocks.forEach(b => {
      expect(b.id).toMatch(/^sample-welcome:[a-z_]+:\d+$/);
    });
  });

  it('spec has mapping results for all components', () => {
    runPipeline({ sourceDir, specsDir });
    const spec: CanonicalTemplate = JSON.parse(
      fs.readFileSync(path.join(specsDir, 'sample-welcome.json'), 'utf-8')
    );
    const componentCount = spec.content_blocks.length + spec.ui_modules.length;
    expect(spec.mapping_results.length).toBe(componentCount);
  });

  it('returns summary with no blocked templates for the fixture', () => {
    const result = runPipeline({ sourceDir, specsDir });
    expect(result.blocked).toBe(0);
    expect(result.total).toBe(1);
  });
});
```

- [ ] **Step 2: Create tests/e2e directory and run the test**

```bash
mkdir -p tests/e2e
npm test tests/e2e
```

Expected: `6 passed`

- [ ] **Step 3: Run the full test suite**

```bash
npm test
```

Expected: All tests pass. No failures.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/
git commit -m "test: end-to-end pipeline test — validates full INGEST→ASSESS flow against fixture"
```

---

## Self-Review Checklist

Spec coverage check against `docs/superpowers/specs/2026-03-26-email-migrator-design.md`:

| Spec Section | Covered by Task |
|---|---|
| 7-stage pipeline | Tasks 3, 4, 5, 7, 9, 10 |
| Canonical schema + all field refinements | Task 2 |
| Controlled vocabularies | Task 2 (Step 5) |
| HtmlExtractorAdapter | Task 3 |
| Normalizer + stable IDs | Task 4 |
| Variable handling rule (block-level + template-level consistency) | Task 4 + QA rules Task 6 |
| MapperAdapter + GenericRuleMapper | Task 5 |
| QA rules (empty, compliance, variable, dangling refs) | Task 6 |
| ASSESS (single write point, status computation) | Task 7 |
| Hard exit on BLOCKED | Task 9 (runner) |
| ExportAdapter stub | Task 8 |
| ClassifierAdapter stub | Task 8 |
| CLI (run, review, export commands) | Task 9 |
| Review UI (non-technical, batch approve, iframe preview) | Task 10 |
| Batch approve exact-match | Task 10 |
| Confidence scoring (3 bands, single threshold) | Task 7 |
| `assessed_at` timestamp | Task 7 |

No gaps found.
