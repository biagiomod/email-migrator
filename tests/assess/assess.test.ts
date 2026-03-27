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
