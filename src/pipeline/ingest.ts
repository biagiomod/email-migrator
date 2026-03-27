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

  const entries = fs.readdirSync(sourceDir)
    .filter(f => f.endsWith('.html') || f.endsWith('.htm'))
    .sort()
    .map(fileName => ({
      filePath: path.resolve(sourceDir, fileName),
      templateId: slugify(path.basename(fileName, path.extname(fileName))),
      fileName,
    }));

  const seen = new Set<string>();
  for (const entry of entries) {
    if (!entry.templateId) {
      throw new Error(
        `Cannot derive a valid templateId from filename "${entry.fileName}". Rename the file to use alphanumeric characters.`
      );
    }
    if (seen.has(entry.templateId)) {
      throw new Error(
        `templateId collision: "${entry.templateId}" produced by "${entry.fileName}". Rename the source file to avoid ambiguity.`
      );
    }
    seen.add(entry.templateId);
  }

  return entries;
}
