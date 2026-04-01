import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';
import { createReviewApp } from '../../src/review/server';

let tmpDir: string;
let specsDir: string;
let sourceDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-test-'));
  specsDir = path.join(tmpDir, 'specs');
  sourceDir = path.join(tmpDir, 'source');
  fs.mkdirSync(specsDir);
  fs.mkdirSync(sourceDir);
  fs.writeFileSync(path.join(tmpDir, 'SKILL.md'), `# Guidelines\n\n\`\`\`char-limits\nheadline: 80\n\`\`\`\n\n\`\`\`forbidden-terms\nsynergy\n\`\`\`\n`);
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('GET /api/guidelines', () => {
  it('returns 200 with parsed guidelines', async () => {
    const app = createReviewApp({ specsDir, sourceDir, port: 0, skillFile: path.join(tmpDir, 'SKILL.md') });
    const res = await request(app).get('/api/guidelines');
    expect(res.status).toBe(200);
    expect(res.body.charLimits).toEqual({ headline: 80 });
    expect(res.body.forbiddenTerms).toEqual(['synergy']);
    expect(typeof res.body.raw).toBe('string');
  });

  it('returns empty guidelines when SKILL.md is absent', async () => {
    const app = createReviewApp({ specsDir, sourceDir, port: 0, skillFile: path.join(tmpDir, 'no-such-file.md') });
    const res = await request(app).get('/api/guidelines');
    expect(res.status).toBe(200);
    expect(res.body.charLimits).toEqual({});
    expect(res.body.forbiddenTerms).toEqual([]);
  });
});

describe('GET /dashboard', () => {
  it('returns 200 HTML', async () => {
    const app = createReviewApp({ specsDir, sourceDir, port: 0, skillFile: path.join(tmpDir, 'SKILL.md') });
    const res = await request(app).get('/dashboard');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
  });
});

describe('GET /editor', () => {
  it('returns 200 HTML', async () => {
    const app = createReviewApp({ specsDir, sourceDir, port: 0, skillFile: path.join(tmpDir, 'SKILL.md') });
    const res = await request(app).get('/editor');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
  });
});
