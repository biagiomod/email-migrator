// src/pipeline/ingest.ts
import * as fs from 'fs';
import * as path from 'path';

export interface TemplateEntry {
  filePath: string;
  templateId: string;
  fileName: string;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function ingest(sourceDir: string): TemplateEntry[] {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Source directory not found: ${sourceDir}`);
  }

  return fs.readdirSync(sourceDir)
    .filter(f => f.endsWith('.html') || f.endsWith('.htm'))
    .sort()
    .map(fileName => ({
      filePath: path.resolve(sourceDir, fileName),
      templateId: slugify(path.basename(fileName, path.extname(fileName))),
      fileName,
    }));
}
