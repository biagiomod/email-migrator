export interface RawContentBlock {
  type: string;
  text: string;
  url?: string;
  variables: string[];
  order: number;
}

export interface RawUiModule {
  type: string;
  order: number;
  variant?: string;
  contentBlockIndices: number[];
}

export interface RawCondition {
  expression: string;
  affectedBlockIndices: number[];
}

export interface RawExtractedTemplate {
  sourceFile: string;
  suggestedTemplateId: string;
  contentBlocks: RawContentBlock[];
  uiModules: RawUiModule[];
  variables: string[];
  conditions: RawCondition[];
}

export interface ExtractorAdapter {
  name: string;
  canHandle(filePath: string): boolean;
  extract(html: string, filePath: string, templateId: string): RawExtractedTemplate;
}
