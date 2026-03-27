import * as cheerio from 'cheerio';
import { ExtractorAdapter, RawContentBlock, RawExtractedTemplate, RawUiModule } from './types';

const TOKEN_PATTERN = /\{\{([^}]+)\}\}|\[\[([^\]]+)\]\]|\[([A-Z_]{2,})\]/g;

function extractTokens(text: string): string[] {
  const tokens: string[] = [];
  let match: RegExpExecArray | null;
  TOKEN_PATTERN.lastIndex = 0;
  while ((match = TOKEN_PATTERN.exec(text)) !== null) {
    tokens.push(match[0]);
  }
  return tokens;
}

export class HtmlExtractorAdapter implements ExtractorAdapter {
  name = 'html';

  canHandle(filePath: string): boolean {
    return filePath.endsWith('.html') || filePath.endsWith('.htm');
  }

  extract(html: string, filePath: string, templateId: string): RawExtractedTemplate {
    const $ = cheerio.load(html);
    const contentBlocks: RawContentBlock[] = [];
    let order = 0;

    // Preheader: hidden div at top of body
    const preheaderEl = $('[class*="preheader"], [class*="preview"]').first();
    if (preheaderEl.length) {
      const text = preheaderEl.text().trim();
      if (text) {
        contentBlocks.push({ type: 'preheader', text, variables: extractTokens(text), order: order++ });
      }
    }

    // Headline: first h1 or h2 not in footer
    const headlineEl = $('h1, h2').not('[class*="footer"] h1, [class*="footer"] h2').first();
    if (headlineEl.length) {
      const text = headlineEl.text().trim();
      if (text) {
        contentBlocks.push({ type: 'headline', text, variables: extractTokens(text), order: order++ });
      }
    }

    // Body text: p tags in text-block or main content area, excluding footer
    $('[class*="text-block"] p, [class*="content"] p, td > p')
      .not('[class*="footer"] p, [class*="disclaimer"] p')
      .each((_, el) => {
        const text = $(el).text().trim();
        if (text && text.length > 10) {
          contentBlocks.push({ type: 'body_text', text, variables: extractTokens(text), order: order++ });
        }
      });

    // CTA: anchor tags styled as buttons
    $('a[class*="button"], a[class*="cta"], a[class*="btn"]').each((_, el) => {
      const text = $(el).text().trim();
      const href = $(el).attr('href') || '';
      if (text) {
        contentBlocks.push({
          type: 'cta',
          text,
          url: href || undefined,
          variables: [...extractTokens(text), ...extractTokens(href)],
          order: order++,
        });
      }
    });

    // Disclaimer: elements with disclaimer/legal class
    $('[class*="disclaimer"], [class*="legal"]').each((_, el) => {
      const text = $(el).text().trim();
      if (text) {
        contentBlocks.push({ type: 'disclaimer', text, variables: extractTokens(text), order: order++ });
      }
    });

    // Footer content: remaining text in footer (excluding disclaimer already captured)
    $('[class*="footer"] p').not('[class*="disclaimer"]').each((_, el) => {
      const text = $(el).text().trim();
      if (text) {
        contentBlocks.push({ type: 'footer_content', text, variables: extractTokens(text), order: order++ });
      }
    });

    // ---- UI Modules ----
    const uiModules: RawUiModule[] = [];
    let moduleOrder = 0;

    if ($('[class*="header"]').length) {
      uiModules.push({ type: 'header', order: moduleOrder++, contentBlockIndices: [] });
    }

    if ($('[class*="hero"]').length) {
      uiModules.push({ type: 'hero', order: moduleOrder++, contentBlockIndices: [] });
    }

    const textBlockIndices = contentBlocks.reduce<number[]>((acc, b, i) => {
      if (['headline', 'body_text', 'cta'].includes(b.type)) acc.push(i);
      return acc;
    }, []);
    if (textBlockIndices.length > 0) {
      uiModules.push({ type: 'text_block', order: moduleOrder++, contentBlockIndices: textBlockIndices });
    }

    contentBlocks.forEach((b, i) => {
      if (b.type === 'cta') {
        uiModules.push({ type: 'button', order: moduleOrder++, contentBlockIndices: [i] });
      }
    });

    if ($('hr, [class*="divider"]').length) {
      uiModules.push({ type: 'divider', order: moduleOrder++, contentBlockIndices: [] });
    }

    if ($('[class*="footer"]').length) {
      const footerIndices = contentBlocks.reduce<number[]>((acc, b, i) => {
        if (['disclaimer', 'footer_content'].includes(b.type)) acc.push(i);
        return acc;
      }, []);
      uiModules.push({ type: 'footer', order: moduleOrder++, contentBlockIndices: footerIndices });
    }

    // Variables (deduplicated from all content blocks)
    const allTokens = contentBlocks.flatMap(b => b.variables);
    const variables = [...new Set(allTokens)];

    return {
      sourceFile: filePath,
      suggestedTemplateId: templateId,
      contentBlocks,
      uiModules,
      variables,
      conditions: [],
    };
  }
}
