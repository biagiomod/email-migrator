import { describe, it, expect } from 'vitest';
import { parseGuidelines } from '../../src/review/guidelines';

describe('parseGuidelines', () => {
  it('parses char-limits block', () => {
    const raw = `
# Content Guidelines

Some prose.

\`\`\`char-limits
headline: 80
cta: 30
subject_line: 60
\`\`\`
`;
    const result = parseGuidelines(raw);
    expect(result.charLimits).toEqual({ headline: 80, cta: 30, subject_line: 60 });
  });

  it('parses forbidden-terms block', () => {
    const raw = `
\`\`\`forbidden-terms
synergy
leverage
please be advised
\`\`\`
`;
    const result = parseGuidelines(raw);
    expect(result.forbiddenTerms).toEqual(['synergy', 'leverage', 'please be advised']);
  });

  it('returns empty objects when blocks are absent', () => {
    const result = parseGuidelines('# Just prose, no special blocks.');
    expect(result.charLimits).toEqual({});
    expect(result.forbiddenTerms).toEqual([]);
  });

  it('preserves raw string', () => {
    const raw = '# Hello\n\nSome content.';
    expect(parseGuidelines(raw).raw).toBe(raw);
  });

  it('skips malformed char-limit lines (no colon)', () => {
    const raw = `\`\`\`char-limits\nheadline 80\ncta: 30\n\`\`\``;
    expect(parseGuidelines(raw).charLimits).toEqual({ cta: 30 });
  });

  it('skips blank lines in forbidden-terms', () => {
    const raw = `\`\`\`forbidden-terms\nsynergy\n\nleverage\n\`\`\``;
    expect(parseGuidelines(raw).forbiddenTerms).toEqual(['synergy', 'leverage']);
  });

  it('returns empty objects when raw is empty string', () => {
    const result = parseGuidelines('');
    expect(result.charLimits).toEqual({});
    expect(result.forbiddenTerms).toEqual([]);
  });

  it('handles CRLF line endings', () => {
    const raw = '```char-limits\r\nheadline: 80\r\ncta: 30\r\n```';
    expect(parseGuidelines(raw).charLimits).toEqual({ headline: 80, cta: 30 });
  });
});
