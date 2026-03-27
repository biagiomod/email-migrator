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

  it('returns none match for an unknown content block type', () => {
    const block: ContentBlock = {
      id: 'test-01:unknown:0',
      type: 'headline' as ContentBlock['type'], // use type cast to simulate unknown
      order: 0,
      text: '',
      variables: [],
      condition_ids: [],
    };
    // Override the type after construction to simulate unknown type reaching the mapper
    const unknownBlock = { ...block, type: 'unknown_type' } as unknown as ContentBlock;
    const result = mapper.mapBlock(unknownBlock, minimalTemplate);
    expect(result.match_type).toBe('none');
    expect(result.confidence).toBe(0);
    expect(result.target_module).toBeUndefined();
    expect(result.component_id).toBe('test-01:unknown:0');
  });

  it('returns none match for an unknown UI module type', () => {
    const unknownMod = { id: 'test-01:unknown:0', type: 'unknown_module', order: 0, content_block_ids: [] } as unknown as UiModule;
    const result = mapper.mapModule(unknownMod, minimalTemplate);
    expect(result.match_type).toBe('none');
    expect(result.confidence).toBe(0);
    expect(result.target_module).toBeUndefined();
    expect(result.component_id).toBe('test-01:unknown:0');
  });
});
