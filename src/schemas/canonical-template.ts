// src/schemas/canonical-template.ts
import { z } from 'zod';

export const ContentBlockType = z.enum([
  'subject_line',
  'preheader',
  'headline',
  'body_text',
  'cta',
  'disclaimer',
  'footer_content',
]);

export const UiModuleType = z.enum([
  'header',
  'hero',
  'text_block',
  'button',
  'divider',
  'footer',
]);

export const MatchType = z.enum([
  'exact',
  'partial',
  'none',
  'manual_review',
]);

export const ReviewStatus = z.enum([
  'pending',
  'approved',
  'rejected',
  'overridden',
]);

export const ContentBlock = z.object({
  id: z.string(),
  type: ContentBlockType,
  order: z.number().int(),
  role: z.string().optional(),
  text: z.string(),
  url: z.string().url().optional(),
  variables: z.array(z.string()),
  condition_ids: z.array(z.string()),
});

export const UiModule = z.object({
  id: z.string(),
  type: UiModuleType,
  order: z.number().int(),
  variant: z.string().optional(),
  content_block_ids: z.array(z.string()),
});

export const Variable = z.object({
  token: z.string(),
  type: z.enum(['string', 'date', 'currency', 'number', 'url']),
});

export const Condition = z.object({
  id: z.string(),
  expression: z.string(),
  affects: z.array(z.string()),
});

export const ComplianceMarker = z.object({
  family: z.string(),
  required: z.boolean(),
  present: z.boolean(),
});

export const MappingResult = z.object({
  component_id: z.string(),
  match_type: MatchType,
  confidence: z.number().min(0).max(1),
  target_module: z.string().optional(),
  reason: z.string(),
  review_status: ReviewStatus,
  reviewer_note: z.string().optional(),
});

export const CanonicalTemplate = z.object({
  template_id: z.string(),
  source_file: z.string(),
  template_family: z.string().optional(),
  message_type: z.string().optional(),
  content_blocks: z.array(ContentBlock),
  ui_modules: z.array(UiModule),
  variables: z.array(Variable),
  conditions: z.array(Condition),
  compliance: z.array(ComplianceMarker),
  mapping_results: z.array(MappingResult).default([]),
  status: z.enum(['ready', 'needs_review', 'blocked']),
  review_notes: z.string().optional(),
  assessed_at: z.string().datetime().optional(),
});

export type ContentBlock = z.infer<typeof ContentBlock>;
export type UiModule = z.infer<typeof UiModule>;
export type Variable = z.infer<typeof Variable>;
export type Condition = z.infer<typeof Condition>;
export type ComplianceMarker = z.infer<typeof ComplianceMarker>;
export type MappingResult = z.infer<typeof MappingResult>;
export type CanonicalTemplate = z.infer<typeof CanonicalTemplate>;
export type ContentBlockType = z.infer<typeof ContentBlockType>;
export type UiModuleType = z.infer<typeof UiModuleType>;
export type MatchType = z.infer<typeof MatchType>;
export type ReviewStatus = z.infer<typeof ReviewStatus>;
