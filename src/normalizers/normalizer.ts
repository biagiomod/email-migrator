// src/normalizers/normalizer.ts
import { CanonicalTemplate, ContentBlock, UiModule, Variable } from '../schemas/canonical-template';
import { RawExtractedTemplate } from '../extractors/types';

const VALID_CONTENT_BLOCK_TYPES = new Set([
  'subject_line', 'preheader', 'headline', 'body_text',
  'cta', 'disclaimer', 'footer_content',
]);

const VALID_UI_MODULE_TYPES = new Set([
  'header', 'hero', 'text_block', 'button', 'divider', 'footer',
]);

function isValidUrl(urlString: string): boolean {
  try {
    new URL(urlString);
    return true;
  } catch {
    return false;
  }
}

function inferVariableType(token: string): Variable['type'] {
  const lower = token.toLowerCase();
  if (lower.includes('date') || lower.includes('time')) return 'date';
  if (lower.includes('amount') || lower.includes('balance') || lower.includes('price')) return 'currency';
  if (lower.includes('count') || lower.includes('number') || lower.includes('qty')) return 'number';
  if (lower.includes('url') || lower.includes('link') || lower.includes('href')) return 'url';
  return 'string';
}

export function normalize(raw: RawExtractedTemplate, templateId: string): CanonicalTemplate {
  const cbTypeCounters: Record<string, number> = {};
  const modTypeCounters: Record<string, number> = {};

  // Normalize content blocks — skip unknown types with a console warning
  const contentBlocks: ContentBlock[] = [];
  raw.contentBlocks.forEach((rb, index) => {
    if (!VALID_CONTENT_BLOCK_TYPES.has(rb.type)) {
      console.warn(`[normalizer] Skipping unrecognized content block type "${rb.type}" at index ${index}`);
      return;
    }
    cbTypeCounters[rb.type] = cbTypeCounters[rb.type] ?? 0;
    const id = `${templateId}:${rb.type}:${cbTypeCounters[rb.type]++}`;

    // Filter out invalid URLs (e.g., template variables like {{ctaUrl}})
    let url = rb.url;
    if (url && !isValidUrl(url)) {
      url = undefined;
    }

    contentBlocks.push({
      id,
      type: rb.type as ContentBlock['type'],
      order: rb.order,
      text: rb.text,
      url,
      variables: rb.variables,
      condition_ids: [],
    });
  });

  // Build index: raw content block array position → canonical ID
  // (needed to resolve contentBlockIndices in ui modules)
  const rawIndexToId: Record<number, string> = {};
  raw.contentBlocks.forEach((rb, index) => {
    if (VALID_CONTENT_BLOCK_TYPES.has(rb.type)) {
      const canonicalBlock = contentBlocks.find(
        b => b.type === rb.type && b.text === rb.text
      );
      if (canonicalBlock) rawIndexToId[index] = canonicalBlock.id;
    }
  });

  // Normalize UI modules
  const uiModules: UiModule[] = raw.uiModules
    .filter(rm => {
      if (!VALID_UI_MODULE_TYPES.has(rm.type)) {
        console.warn(`[normalizer] Skipping unrecognized UI module type "${rm.type}"`);
        return false;
      }
      return true;
    })
    .map(rm => {
      modTypeCounters[rm.type] = modTypeCounters[rm.type] ?? 0;
      const id = `${templateId}:${rm.type}:${modTypeCounters[rm.type]++}`;
      const contentBlockIds = rm.contentBlockIndices
        .map(i => rawIndexToId[i])
        .filter((id): id is string => id !== undefined);

      return {
        id,
        type: rm.type as UiModule['type'],
        order: rm.order,
        variant: rm.variant,
        content_block_ids: contentBlockIds,
      };
    });

  // Build deduplicated template-level variables from all block-level variables
  const allTokens = contentBlocks.flatMap(b => b.variables);
  const uniqueTokens = [...new Set(allTokens)];
  const variables: Variable[] = uniqueTokens.map(token => ({
    token,
    type: inferVariableType(token),
  }));

  return {
    template_id: templateId,
    source_file: raw.sourceFile,
    content_blocks: contentBlocks,
    ui_modules: uiModules,
    variables,
    conditions: [],
    compliance: [],
    mapping_results: [],
    status: 'needs_review',
  };
}
