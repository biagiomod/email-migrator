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

  it('accepts a content block with all edited annotation fields', () => {
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
