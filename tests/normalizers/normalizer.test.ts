// tests/normalizers/normalizer.test.ts
import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { HtmlExtractorAdapter } from '../../src/extractors/html-extractor';
import { normalize } from '../../src/normalizers/normalizer';
import { CanonicalTemplate } from '../../src/schemas/canonical-template';

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
