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
    result.contentBlocks.forEach((block) => {
      expect(typeof block.order).toBe('number');
    });
  });

  it('canHandle accepts uppercase .HTML extension', () => {
    expect(extractor.canHandle('templates/welcome.HTML')).toBe(true);
    expect(extractor.canHandle('templates/welcome.HTM')).toBe(true);
  });

  it('extracts href-only tokens from footer anchor elements', () => {
    const result = extractor.extract(fixtureHtml, fixturePath, 'sample-welcome');
    expect(result.variables).toContain('{{unsubscribeUrl}}');
    expect(result.variables).toContain('{{privacyUrl}}');
  });
});
