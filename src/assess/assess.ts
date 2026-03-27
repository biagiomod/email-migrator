// src/assess/assess.ts
import * as fs from 'fs';
import * as path from 'path';
import { CanonicalTemplate } from '../schemas/canonical-template';
import { runAllRules, QaIssue } from '../qa/rules';
import { GenericRuleMapper } from '../mappers/generic-rule-mapper';

const AUTO_APPROVE_THRESHOLD = 1.0;
const mapper = new GenericRuleMapper();

export function computeStatus(
  template: CanonicalTemplate,
  issues: QaIssue[],
): 'ready' | 'needs_review' | 'blocked' {
  if (issues.some(i => i.severity === 'error')) return 'blocked';

  const allExact = template.mapping_results.every(
    r => r.match_type === 'exact' && r.confidence >= AUTO_APPROVE_THRESHOLD,
  );

  if (issues.some(i => i.severity === 'warning') || !allExact) {
    return 'needs_review';
  }

  return 'ready';
}

export function assess(templates: CanonicalTemplate[], specsDir: string): CanonicalTemplate[] {
  fs.mkdirSync(specsDir, { recursive: true });

  return templates.map(template => {
    // Run mapper on all components
    const blockResults = template.content_blocks.map(b => mapper.mapBlock(b, template));
    const moduleResults = template.ui_modules.map(m => mapper.mapModule(m, template));
    const mappingResults = [...blockResults, ...moduleResults];

    const withMappings: CanonicalTemplate = { ...template, mapping_results: mappingResults };

    // Run QA rules
    const issues = runAllRules(withMappings);

    // Compute status
    const status = computeStatus(withMappings, issues);
    const reviewNotes = issues.map(i => `[${i.severity.toUpperCase()}] ${i.code}: ${i.message}`).join('\n') || undefined;

    const assessed: CanonicalTemplate = {
      ...withMappings,
      status,
      review_notes: reviewNotes,
      assessed_at: new Date().toISOString(),
    };

    // Write migration spec to disk (ASSESS is the only stage that writes to disk)
    const specPath = path.join(specsDir, `${template.template_id}.json`);
    fs.writeFileSync(specPath, JSON.stringify(assessed, null, 2), 'utf-8');

    return assessed;
  });
}
