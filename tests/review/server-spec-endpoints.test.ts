import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';
import { createReviewApp } from '../../src/review/server';

let tmpDir: string;
let specsDir: string;
let sourceDir: string;

const sampleSpec = {
  template_id: 'payment-reminder',
  source_file: 'payment-reminder.html',
  content_blocks: [
    { id: 'payment-reminder:headline:0', type: 'headline', order: 0, text: 'Pay now', variables: [], condition_ids: [] },
    { id: 'payment-reminder:cta:0', type: 'cta', order: 1, text: 'Make a payment', variables: [], condition_ids: [] },
  ],
  ui_modules: [],
  variables: [],
  conditions: [],
  compliance: [],
  mapping_results: [],
  status: 'needs_review',
};

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-endpoints-test-'));
  specsDir = path.join(tmpDir, 'specs');
  sourceDir = path.join(tmpDir, 'source');
  fs.mkdirSync(specsDir);
  fs.mkdirSync(sourceDir);
  fs.writeFileSync(path.join(specsDir, 'payment-reminder.json'), JSON.stringify(sampleSpec, null, 2));
  fs.writeFileSync(path.join(sourceDir, 'payment-reminder.html'), '<html><body><h1>Pay now</h1><a>Make a payment</a></body></html>');
  fs.writeFileSync(path.join(tmpDir, 'SKILL.md'), '');
});

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

const makeApp = () => createReviewApp({ specsDir, sourceDir, port: 0, skillFile: path.join(tmpDir, 'SKILL.md') });

describe('GET /api/specs', () => {
  it('returns array of spec summaries', async () => {
    const res = await request(makeApp()).get('/api/specs');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].template_id).toBe('payment-reminder');
    expect(res.body[0].status).toBe('needs_review');
    expect(res.body[0]).not.toHaveProperty('content_blocks');
  });
});

describe('GET /api/spec/:id', () => {
  it('returns full spec', async () => {
    const res = await request(makeApp()).get('/api/spec/payment-reminder');
    expect(res.status).toBe(200);
    expect(res.body.template_id).toBe('payment-reminder');
    expect(res.body.content_blocks).toHaveLength(2);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(makeApp()).get('/api/spec/no-such-template');
    expect(res.status).toBe(404);
  });

  it('returns 400 for path-traversal attempt', async () => {
    const res = await request(makeApp()).get('/api/spec/..%2Fpasswd');
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/spec/:id', () => {
  it('saves edited values and reviewer annotation', async () => {
    const payload = {
      reviewed_by: 'Jane Smith',
      blocks: [
        { id: 'payment-reminder:headline:0', edited_value: 'Pay before due date' },
      ],
    };
    const res = await request(makeApp()).patch('/api/spec/payment-reminder').send(payload);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const saved = JSON.parse(fs.readFileSync(path.join(specsDir, 'payment-reminder.json'), 'utf-8'));
    expect(saved.reviewed_by).toBe('Jane Smith');
    expect(typeof saved.reviewed_at).toBe('string');
    const editedBlock = saved.content_blocks.find((b: { id: string }) => b.id === 'payment-reminder:headline:0');
    expect(editedBlock.edited_value).toBe('Pay before due date');
    expect(editedBlock.edited_by).toBe('Jane Smith');
    expect(typeof editedBlock.edited_at).toBe('string');
    expect(editedBlock.text).toBe('Pay now'); // original not overwritten
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(makeApp()).patch('/api/spec/ghost').send({ reviewed_by: 'x', blocks: [] });
    expect(res.status).toBe(404);
  });

  it('returns 400 for path-traversal attempt', async () => {
    const res = await request(makeApp()).patch('/api/spec/..%2Fpasswd').send({ reviewed_by: 'x', blocks: [] });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/spec/:id/preview', () => {
  it('returns HTML with data-block-id spans and inline script', async () => {
    const res = await request(makeApp()).get('/api/spec/payment-reminder/preview');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('data-block-id="payment-reminder:headline:0"');
    expect(res.text).toContain('data-block-id="payment-reminder:cta:0"');
    expect(res.text).toContain('postMessage');
  });
});
