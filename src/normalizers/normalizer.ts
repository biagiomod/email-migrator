// src/normalizers/normalizer.ts
import { z } from 'zod';
import { CanonicalTemplate, ContentBlock, UiModule, Variable, ContentBlockType, UiModuleType } from '../schemas/canonical-template';
import { RawExtractedTemplate } from '../extractors/types';

const VALID_CONTENT_BLOCK_TYPES = new Set(ContentBlockType.options);
const VALID_UI_MODULE_TYPES = new Set(UiModuleType.options);

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
  const rawIndexToId: Record<number, string> = {};

  // Normalize content blocks — skip unknown types with a console warning
  const contentBlocks: ContentBlock[] = [];
  raw.contentBlocks.forEach((rb, index) => {
    if (!VALID_CONTENT_BLOCK_TYPES.has(rb.type)) {
      console.warn(`[normalizer] Skipping unrecognized content block type "${rb.type}" at index ${index}`);
      return;
    }
    cbTypeCounters[rb.type] = cbTypeCounters[rb.type] ?? 0;
    const id = `${templateId}:${rb.type}:${cbTypeCounters[rb.type]++}`;
    rawIndexToId[index] = id;  // record here, before push

    contentBlocks.push({
      id,
      type: rb.type as ContentBlock['type'],
      order: rb.order,
      text: rb.text,
      url: rb.url !== undefined ? (z.string().url().safeParse(rb.url).success ? rb.url : undefined) : undefined,
      variables: rb.variables,
      condition_ids: [],
    });
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
