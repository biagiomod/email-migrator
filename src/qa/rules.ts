// src/qa/rules.ts
import { CanonicalTemplate } from '../schemas/canonical-template';

export interface QaIssue {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  componentId?: string;
}

export function checkEmptyTemplate(template: CanonicalTemplate): QaIssue[] {
  if (template.content_blocks.length === 0) {
    return [{
      code: 'EMPTY_TEMPLATE',
      severity: 'error',
      message: 'Template has no content blocks. The extractor may have failed to parse this file.',
    }];
  }
  return [];
}

export function checkRequiredCompliance(template: CanonicalTemplate): QaIssue[] {
  return template.compliance
    .filter(marker => marker.required && !marker.present)
    .map(marker => ({
      code: 'MISSING_REQUIRED_COMPLIANCE',
      severity: 'error' as const,
      message: `Required compliance family "${marker.family}" is not present in this template.`,
    }));
}

export function checkVariableConsistency(template: CanonicalTemplate): QaIssue[] {
  const templateTokens = new Set(template.variables.map(v => v.token));
  const blockTokens = new Set(template.content_blocks.flatMap(b => b.variables));
  const issues: QaIssue[] = [];

  // Block-level tokens missing from template-level declaration
  template.content_blocks.forEach(block => {
    block.variables.forEach(token => {
      if (!templateTokens.has(token)) {
        issues.push({
          code: 'VARIABLE_INCONSISTENCY',
          severity: 'warning',
          message: `Token "${token}" found in block "${block.id}" but not listed in template-level variables.`,
          componentId: block.id,
        });
      }
    });
  });

  // Template-level variables not referenced in any block
  template.variables.forEach(variable => {
    if (!blockTokens.has(variable.token)) {
      issues.push({
        code: 'UNUSED_TEMPLATE_VARIABLE',
        severity: 'warning',
        message: `Token "${variable.token}" declared in template variables but not referenced in any content block.`,
      });
    }
  });

  return issues;
}

export function checkDanglingContentBlockRefs(template: CanonicalTemplate): QaIssue[] {
  const blockIds = new Set(template.content_blocks.map(b => b.id));
  const issues: QaIssue[] = [];

  template.ui_modules.forEach(mod => {
    mod.content_block_ids.forEach(cbId => {
      if (!blockIds.has(cbId)) {
        issues.push({
          code: 'DANGLING_CONTENT_BLOCK_REF',
          severity: 'warning',
          message: `UI module "${mod.id}" references content block "${cbId}" which does not exist.`,
          componentId: mod.id,
        });
      }
    });
  });

  return issues;
}

export function runAllRules(template: CanonicalTemplate): QaIssue[] {
  return [
    ...checkEmptyTemplate(template),
    ...checkRequiredCompliance(template),
    ...checkVariableConsistency(template),
    ...checkDanglingContentBlockRefs(template),
  ];
}
