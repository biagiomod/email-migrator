// src/review/guidelines.ts

export interface Guidelines {
  raw: string;
  charLimits: Record<string, number>;
  forbiddenTerms: string[];
}

/**
 * Parse SKILL.md content into structured guidelines.
 * Two optional fenced blocks are recognised:
 *   ```char-limits       — colon-separated "field: maxChars" pairs
 *   ```forbidden-terms   — one term per line
 * Everything else is passed through as raw prose.
 */
export function parseGuidelines(raw: string): Guidelines {
  const charLimits: Record<string, number> = {};
  const forbiddenTerms: string[] = [];

  const fenceRe = /```(\S+)\r?\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = fenceRe.exec(raw)) !== null) {
    const lang = match[1].trim();
    const body = match[2];

    if (lang === 'char-limits') {
      for (const line of body.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const colonIdx = trimmed.indexOf(':');
        if (colonIdx === -1) continue;
        const key = trimmed.slice(0, colonIdx).trim();
        const val = parseInt(trimmed.slice(colonIdx + 1).trim(), 10);
        if (key && !isNaN(val)) charLimits[key] = val;
      }
    } else if (lang === 'forbidden-terms') {
      for (const line of body.split('\n')) {
        const trimmed = line.trim();
        if (trimmed) forbiddenTerms.push(trimmed);
      }
    }
  }

  return { raw, charLimits, forbiddenTerms };
}
