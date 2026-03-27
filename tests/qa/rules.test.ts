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
