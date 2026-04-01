// src/review/server.ts
import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as cheerio from 'cheerio';
import { spawn } from 'child_process';
import { CanonicalTemplate } from '../schemas/canonical-template';
import { parseGuidelines } from './guidelines';

interface PipelineState {
  state: 'idle' | 'running' | 'done' | 'error';
  startedAt?: string;
  finishedAt?: string;
  total?: number;
  ready?: number;
  needsReview?: number;
  blocked?: number;
  error?: string;
}

export interface ReviewServerOptions {
  specsDir: string;
  sourceDir: string;
  port: number;
  skillFile?: string; // defaults to process.cwd()/SKILL.md
}

function loadSpecs(specsDir: string): CanonicalTemplate[] {
  if (!fs.existsSync(specsDir)) return [];
  const results: CanonicalTemplate[] = [];
  for (const f of fs.readdirSync(specsDir).filter(f => f.endsWith('.json')).sort()) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(specsDir, f), 'utf-8'));
      results.push(parsed as CanonicalTemplate);
    } catch (err) {
      console.error(`[review] Failed to load spec file "${f}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return results;
}

function safeSpecPath(specsDir: string, id: string): string | null {
  const resolved = path.resolve(specsDir, `${id}.json`);
  if (!resolved.startsWith(path.resolve(specsDir) + path.sep)) return null;
  return resolved;
}

// KI-001 fix: use safeSpecPath for the write path
function saveSpec(specsDir: string, template: CanonicalTemplate): void {
  const specPath = safeSpecPath(specsDir, template.template_id);
  if (!specPath) throw new Error(`Invalid template_id for write: ${template.template_id}`);
  fs.writeFileSync(specPath, JSON.stringify(template, null, 2), 'utf-8');
}

export function createReviewApp(options: ReviewServerOptions): express.Application {
  const { specsDir, sourceDir } = options;
  const skillFile = options.skillFile ?? path.join(process.cwd(), 'SKILL.md');
  const pipelineState: PipelineState = { state: 'idle' };
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
    const specPath = safeSpecPath(specsDir, req.params.id);
    if (!specPath) return res.status(400).json({ error: 'Invalid id' });
    if (!fs.existsSync(specPath)) {
      return res.status(404).json({ error: 'Template not found' });
    }
    try {
      res.json(JSON.parse(fs.readFileSync(specPath, 'utf-8')));
    } catch {
      res.status(500).json({ error: 'Failed to read spec' });
    }
  });

  // POST /api/templates/:id/approve — approve a template
  app.post('/api/templates/:id/approve', (req, res) => {
    const specPath = safeSpecPath(specsDir, req.params.id);
    if (!specPath) return res.status(400).json({ error: 'Invalid id' });
    if (!fs.existsSync(specPath)) return res.status(404).json({ error: 'Not found' });

    let spec: CanonicalTemplate;
    try {
      spec = CanonicalTemplate.parse(JSON.parse(fs.readFileSync(specPath, 'utf-8')));
    } catch {
      return res.status(500).json({ error: 'Failed to read spec' });
    }
    const updated: CanonicalTemplate = {
      ...spec,
      mapping_results: spec.mapping_results.map(r => ({ ...r, review_status: 'approved' as const })),
    };
    try {
      saveSpec(specsDir, updated);
    } catch {
      return res.status(500).json({ error: 'Failed to write spec' });
    }
    res.json({ ok: true, template_id: req.params.id });
  });

  // POST /api/templates/:id/flag — flag for revision
  app.post('/api/templates/:id/flag', (req, res) => {
    const specPath = safeSpecPath(specsDir, req.params.id);
    if (!specPath) return res.status(400).json({ error: 'Invalid id' });
    if (!fs.existsSync(specPath)) return res.status(404).json({ error: 'Not found' });

    let spec: CanonicalTemplate;
    try {
      spec = CanonicalTemplate.parse(JSON.parse(fs.readFileSync(specPath, 'utf-8')));
    } catch {
      return res.status(500).json({ error: 'Failed to read spec' });
    }
    const { note } = req.body as { note?: string };
    const updated: CanonicalTemplate = {
      ...spec,
      status: 'needs_review',
      review_notes: note ?? spec.review_notes,
    };
    try {
      saveSpec(specsDir, updated);
    } catch {
      return res.status(500).json({ error: 'Failed to write spec' });
    }
    res.json({ ok: true, template_id: req.params.id });
  });

  // POST /api/batch-approve — approve all exact-match + ready templates
  app.post('/api/batch-approve', (_req, res) => {
    const specs = loadSpecs(specsDir);
    let count = 0;

    for (const spec of specs) {
      const allExact = spec.mapping_results.every(r => r.match_type === 'exact' && r.confidence >= 1.0);
      if (allExact || spec.status === 'ready') {
        const updated: CanonicalTemplate = {
          ...spec,
          mapping_results: spec.mapping_results.map(r => ({ ...r, review_status: 'approved' as const })),
        };
        try {
          saveSpec(specsDir, updated);
          count++;
        } catch {
          // skip invalid template_id, continue with others
        }
      }
    }

    res.json({ ok: true, approved: count });
  });

  // GET /dashboard — serve dashboard placeholder
  app.get('/dashboard', (_req, res) => {
    res.sendFile(path.resolve(__dirname, 'ui/dashboard.html'));
  });

  // GET /editor — serve editor placeholder
  app.get('/editor', (_req, res) => {
    res.sendFile(path.resolve(__dirname, 'ui/editor.html'));
  });

  // GET /api/specs — summary list for the dashboard queue
  app.get('/api/specs', (_req, res) => {
    const specs = loadSpecs(specsDir);
    res.json(specs.map(t => ({
      template_id: t.template_id,
      source_file: path.basename(t.source_file),
      status: t.status,
      reviewed_by: t.reviewed_by,
      reviewed_at: t.reviewed_at,
      editor_status: t.editor_status,
    })));
  });

  // GET /api/spec/:id — full spec JSON
  app.get('/api/spec/:id', (req, res) => {
    const specPath = safeSpecPath(specsDir, req.params.id);
    if (!specPath) return res.status(400).json({ error: 'Invalid id' });
    if (!fs.existsSync(specPath)) return res.status(404).json({ error: 'Not found' });
    try {
      res.json(JSON.parse(fs.readFileSync(specPath, 'utf-8')));
    } catch {
      res.status(500).json({ error: 'Failed to read spec' });
    }
  });

  // PATCH /api/spec/:id — save reviewer edits + annotation
  app.patch('/api/spec/:id', (req, res) => {
    const specPath = safeSpecPath(specsDir, req.params.id);
    if (!specPath) return res.status(400).json({ error: 'Invalid id' });
    if (!fs.existsSync(specPath)) return res.status(404).json({ error: 'Not found' });

    let spec: CanonicalTemplate;
    try {
      spec = JSON.parse(fs.readFileSync(specPath, 'utf-8')) as CanonicalTemplate;
    } catch {
      return res.status(500).json({ error: 'Failed to read spec' });
    }

    const { reviewed_by, blocks } = req.body as {
      reviewed_by?: string;
      blocks?: Array<{ id: string; edited_value: string }>;
    };

    // Validate blocks array entries
    if (Array.isArray(blocks)) {
      for (const b of blocks) {
        if (typeof b.id !== 'string' || typeof b.edited_value !== 'string') {
          return res.status(400).json({ error: 'Invalid block entry: id and edited_value must be strings' });
        }
      }
    }

    const now = new Date().toISOString();
    const blockEdits = new Map((blocks ?? []).map(b => [b.id, b.edited_value]));

    const hasEdits = (blocks ?? []).length > 0 || reviewed_by !== undefined;
    const updated: CanonicalTemplate = {
      ...spec,
      reviewed_by: reviewed_by ?? spec.reviewed_by,
      reviewed_at: hasEdits ? now : spec.reviewed_at,
      content_blocks: spec.content_blocks.map(cb => {
        const editedValue = blockEdits.get(cb.id);
        if (editedValue === undefined) return cb;
        return { ...cb, edited_value: editedValue, edited_by: reviewed_by, edited_at: now };
      }),
    };

    try {
      saveSpec(specsDir, updated);
    } catch {
      return res.status(500).json({ error: 'Failed to write spec' });
    }
    res.json({ ok: true, template_id: req.params.id });
  });

  // GET /api/spec/:id/preview — annotated HTML with data-block-id attributes and postMessage script
  app.get('/api/spec/:id/preview', (req, res) => {
    const specPath = safeSpecPath(specsDir, req.params.id);
    if (!specPath) return res.status(400).json({ error: 'Invalid id' });
    if (!fs.existsSync(specPath)) return res.status(404).json({ error: 'Not found' });

    let spec: CanonicalTemplate;
    try {
      spec = JSON.parse(fs.readFileSync(specPath, 'utf-8')) as CanonicalTemplate;
    } catch {
      return res.status(500).json({ error: 'Failed to read spec' });
    }

    const sourceFile = path.join(sourceDir, path.basename(spec.source_file));
    if (!fs.existsSync(sourceFile)) {
      return res.status(404).json({ error: 'Source HTML not found' });
    }

    let html: string;
    try {
      html = fs.readFileSync(sourceFile, 'utf-8');
    } catch {
      return res.status(500).json({ error: 'Failed to read source HTML' });
    }

    const $ = cheerio.load(html);

    for (const cb of spec.content_blocks) {
      const needle = cb.text.trim();
      if (!needle) continue;
      $('body *').each((_i, el) => {
        if (el.type !== 'tag') return;
        const $el = $(el as cheerio.TagElement);
        if ($el.children().length > 0) return;
        const text = $el.text().trim();
        if (text === needle) {
          $el.attr('data-block-id', cb.id);
          $el.css('cursor', 'pointer');
        }
      });
      // Check if annotation was applied (for diagnostic logging)
      const found = $(`[data-block-id="${cb.id}"]`).length > 0;
      if (!found) {
        console.warn(`[preview] No element found for block "${cb.id}" (text: "${needle.slice(0, 40)}")`);
      }
    }

    const script = `<script>
document.addEventListener('click', function(e) {
  var el = e.target;
  while (el && !el.dataset.blockId) el = el.parentElement;
  if (el && el.dataset.blockId) {
    window.parent.postMessage({ type: 'block-click', blockId: el.dataset.blockId }, '*');
  }
});
</script>`;

    let annotated = $.html();
    if (annotated.includes('</body>')) {
      annotated = annotated.replace('</body>', script + '\n</body>');
    } else {
      annotated += script;
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(annotated);
  });

  // GET /api/guidelines — reads SKILL.md at request time, returns parsed guidelines
  app.get('/api/guidelines', (_req, res) => {
    let raw = '';
    if (fs.existsSync(skillFile)) {
      try { raw = fs.readFileSync(skillFile, 'utf-8'); } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code !== 'ENOENT') console.error(`[guidelines] Failed to read ${skillFile}:`, err);
      }
    }
    res.json(parseGuidelines(raw));
  });

  // GET /api/pipeline/status
  app.get('/api/pipeline/status', (_req, res) => {
    res.json(pipelineState);
  });

  // POST /api/pipeline/run — spawn pipeline as child process
  app.post('/api/pipeline/run', (req, res) => {
    if (pipelineState.state === 'running') {
      return res.status(409).json({ error: 'Pipeline already running' });
    }

    pipelineState.state = 'running';
    pipelineState.startedAt = new Date().toISOString();
    pipelineState.finishedAt = undefined;
    pipelineState.total = undefined;
    pipelineState.ready = undefined;
    pipelineState.needsReview = undefined;
    pipelineState.blocked = undefined;
    pipelineState.error = undefined;

    const body = req.body as { sourceDir?: string; specsDir?: string };
    const runSourceDir = body.sourceDir ?? sourceDir;
    const runSpecsDir = body.specsDir ?? specsDir;

    const tsxBin = require.resolve('tsx/cli');
    const cliScript = path.resolve(__dirname, '../cli/index.ts');

    const child = spawn(
      process.execPath,
      [tsxBin, cliScript, 'run', '--source', runSourceDir, '--specs', runSpecsDir],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    const output: string[] = [];
    child.stdout?.on('data', (d: Buffer) => output.push(d.toString()));
    child.stderr?.on('data', (d: Buffer) => output.push(d.toString()));

    child.on('close', (code: number | null) => {
      pipelineState.finishedAt = new Date().toISOString();
      const joined = output.join('');
      const total = parseInt((joined.match(/Total:\s+(\d+)/) ?? [])[1] ?? '0', 10);
      const ready = parseInt((joined.match(/Ready:\s+(\d+)/) ?? [])[1] ?? '0', 10);
      const needsReview = parseInt((joined.match(/Needs review:\s+(\d+)/) ?? [])[1] ?? '0', 10);
      const blocked = parseInt((joined.match(/Blocked:\s+(\d+)/) ?? [])[1] ?? '0', 10);
      if (code === 0 || code === 1) {
        pipelineState.state = 'done';
        pipelineState.total = total;
        pipelineState.ready = ready;
        pipelineState.needsReview = needsReview;
        pipelineState.blocked = blocked;
      } else {
        pipelineState.state = 'error';
        pipelineState.error = joined.slice(-500);
      }
    });

    child.on('error', (err: Error) => {
      pipelineState.state = 'error';
      pipelineState.error = err.message;
      pipelineState.finishedAt = new Date().toISOString();
    });

    res.json({ ok: true, message: 'Pipeline started' });
  });

  return app;
}

export function startReviewServer(options: ReviewServerOptions): void {
  const app = createReviewApp(options);
  app.listen(options.port, () => {
    console.log(`\n✓ Review UI running at http://localhost:${options.port}`);
    console.log(`  Original review:   http://localhost:${options.port}/`);
    console.log(`  Content Designer:  http://localhost:${options.port}/dashboard`);
    console.log(`  Reviewing specs in: ${options.specsDir}`);
    console.log(`  Press Ctrl+C to stop.\n`);
  });
}
