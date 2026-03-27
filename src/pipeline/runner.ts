// src/pipeline/runner.ts
import * as fs from 'fs';
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
