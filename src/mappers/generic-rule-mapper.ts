// src/mappers/generic-rule-mapper.ts
import { ContentBlock, UiModule, MappingResult, CanonicalTemplate, MatchType } from '../schemas/canonical-template';
import { MapperAdapter } from './types';

// Rule tables: componentType → { targetModule, matchType, confidence, reason }
type MappingRule = {
  targetModule: string;
  matchType: MatchType;
  confidence: number;
  reason: string;
};

const CONTENT_BLOCK_RULES: Record<string, MappingRule> = {
  subject_line:   { targetModule: 'TargetSystem/SubjectLine',   matchType: 'exact',   confidence: 1.0, reason: 'Subject line maps directly by type.' },
  preheader:      { targetModule: 'TargetSystem/Preheader',     matchType: 'exact',   confidence: 1.0, reason: 'Preheader maps directly by type.' },
  headline:       { targetModule: 'TargetSystem/Headline',      matchType: 'exact',   confidence: 1.0, reason: 'Headline maps directly by type.' },
  body_text:      { targetModule: 'TargetSystem/BodyText',      matchType: 'exact',   confidence: 1.0, reason: 'Body text maps directly by type.' },
  cta:            { targetModule: 'TargetSystem/CTA',           matchType: 'partial', confidence: 0.8, reason: 'CTA content mapped; button variant requires manual confirmation.' },
  disclaimer:     { targetModule: 'TargetSystem/Disclaimer',    matchType: 'exact',   confidence: 1.0, reason: 'Disclaimer maps directly by type.' },
  footer_content: { targetModule: 'TargetSystem/FooterContent', matchType: 'exact',   confidence: 1.0, reason: 'Footer content maps directly by type.' },
};

const UI_MODULE_RULES: Record<string, MappingRule> = {
  header:     { targetModule: 'TargetSystem/Header',     matchType: 'exact',   confidence: 1.0, reason: 'Header module maps directly by type.' },
  hero:       { targetModule: 'TargetSystem/Hero',       matchType: 'exact',   confidence: 1.0, reason: 'Hero module maps directly by type.' },
  text_block: { targetModule: 'TargetSystem/TextBlock',  matchType: 'exact',   confidence: 1.0, reason: 'Text block maps directly by type.' },
  button:     { targetModule: 'TargetSystem/CTAButton',  matchType: 'partial', confidence: 0.7, reason: 'Button module mapped; variant (primary/secondary) unconfirmed — no style tokens available.' },
  divider:    { targetModule: 'TargetSystem/Divider',    matchType: 'exact',   confidence: 1.0, reason: 'Divider maps directly by type.' },
  footer:     { targetModule: 'TargetSystem/Footer',     matchType: 'exact',   confidence: 1.0, reason: 'Footer module maps directly by type.' },
};

export class GenericRuleMapper implements MapperAdapter {
  name = 'generic-rule-mapper';

  mapBlock(block: ContentBlock, _template: CanonicalTemplate): MappingResult {
    const rule = CONTENT_BLOCK_RULES[block.type];
    if (!rule) {
      return {
        component_id: block.id,
        match_type: 'none',
        confidence: 0,
        reason: `No rule defined for content block type "${block.type}".`,
        review_status: 'pending',
      };
    }
    return {
      component_id: block.id,
      match_type: rule.matchType,
      confidence: rule.confidence,
      target_module: rule.targetModule,
      reason: rule.reason,
      review_status: 'pending',
    };
  }

  mapModule(mod: UiModule, _template: CanonicalTemplate): MappingResult {
    const rule = UI_MODULE_RULES[mod.type];
    if (!rule) {
      return {
        component_id: mod.id,
        match_type: 'none',
        confidence: 0,
        reason: `No rule defined for UI module type "${mod.type}".`,
        review_status: 'pending',
      };
    }
    return {
      component_id: mod.id,
      match_type: rule.matchType,
      confidence: rule.confidence,
      target_module: rule.targetModule,
      reason: rule.reason,
      review_status: 'pending',
    };
  }
}
