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
