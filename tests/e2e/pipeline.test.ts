// tests/e2e/pipeline.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runPipeline } from '../../src/pipeline/runner';
import { CanonicalTemplate } from '../../src/schemas/canonical-template';

const FIXTURES_DIR = path.resolve(__dirname, '../../fixtures');
const TEMPLATE_ID = 'sample-welcome';

let specsDir: string;
let result: ReturnType<typeof runPipeline>;

beforeAll(() => {
  specsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrator-e2e-test-'));
  result = runPipeline({ sourceDir: FIXTURES_DIR, specsDir });
});

afterAll(() => {
  fs.rmSync(specsDir, { recursive: true });
});

describe('End-to-end pipeline smoke tests', () => {
  it('processes sample-welcome.html without throwing', () => {
    // If runPipeline threw, beforeAll would have failed and this would not reach here.
    // We assert result is defined as a proxy for no-throw.
    expect(result).toBeDefined();
  });

  it('writes a spec file for sample-welcome', () => {
    const expectedFile = path.join(specsDir, `${TEMPLATE_ID}.json`);
    expect(fs.existsSync(expectedFile)).toBe(true);
  });

  it('written spec passes CanonicalTemplate Zod validation', () => {
    const specPath = path.join(specsDir, `${TEMPLATE_ID}.json`);
    const raw = fs.readFileSync(specPath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(() => CanonicalTemplate.parse(parsed)).not.toThrow();
  });

  it('spec has content blocks with stable canonical IDs', () => {
    const specPath = path.join(specsDir, `${TEMPLATE_ID}.json`);
    const raw = fs.readFileSync(specPath, 'utf-8');
    const parsed = CanonicalTemplate.parse(JSON.parse(raw));

    expect(parsed.content_blocks.length).toBeGreaterThan(0);

    // Each block ID must match pattern: templateId:type:index
    // e.g. "sample-welcome:headline:0"
    const idPattern = /^[a-z0-9-]+:[a-z_]+:\d+$/;
    for (const block of parsed.content_blocks) {
      expect(block.id).toMatch(idPattern);
      // The ID must start with the template ID
      expect(block.id.startsWith(`${TEMPLATE_ID}:`)).toBe(true);
    }
  });

  it('spec has mapping results for all components', () => {
    const specPath = path.join(specsDir, `${TEMPLATE_ID}.json`);
    const raw = fs.readFileSync(specPath, 'utf-8');
    const parsed = CanonicalTemplate.parse(JSON.parse(raw));

    const expectedCount = parsed.content_blocks.length + parsed.ui_modules.length;
    expect(parsed.mapping_results.length).toBeGreaterThan(0);
    expect(parsed.mapping_results.length).toBe(expectedCount);

    // Every content block and UI module should have a corresponding mapping result
    const mappedIds = new Set(parsed.mapping_results.map(r => r.component_id));
    for (const block of parsed.content_blocks) {
      expect(mappedIds.has(block.id)).toBe(true);
    }
    for (const mod of parsed.ui_modules) {
      expect(mappedIds.has(mod.id)).toBe(true);
    }
  });

  it('returns summary with no blocked templates for the fixture', () => {
    expect(result.total).toBe(1);
    expect(result.blocked).toBe(0);
  });
});
