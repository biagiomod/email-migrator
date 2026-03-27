// src/export/types.ts
import { CanonicalTemplate } from '../schemas/canonical-template';

/**
 * ExportAdapter — Phase 1 stub.
 * Implement this when TargetSystem module structure is known.
 * Only called by the EXPORT stage after all required reviews are approved.
 */
export interface ExportAdapter {
  name: string;
  /** Returns the file path of the generated artifact. */
  export(template: CanonicalTemplate, outputDir: string): Promise<string>;
}
