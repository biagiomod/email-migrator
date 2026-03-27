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
