// src/mappers/types.ts
import { ContentBlock, UiModule, MappingResult, CanonicalTemplate } from '../schemas/canonical-template';

export interface MapperAdapter {
  name: string;
  mapBlock(block: ContentBlock, template: CanonicalTemplate): MappingResult;
  mapModule(mod: UiModule, template: CanonicalTemplate): MappingResult;
}
