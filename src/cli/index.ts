// src/cli/index.ts
import { Command } from 'commander';
import * as path from 'path';
import { runPipeline } from '../pipeline/runner';

const program = new Command();
program.name('migrator').description('Email template migration tool').version('1.0.0');

program
  .command('run')
  .description('Run the full pipeline: INGEST → EXTRACT → NORMALIZE → MAP → ASSESS')
  .requiredOption('--source <dir>', 'Directory containing source HTML email templates')
  .option('--specs <dir>', 'Directory to write migration spec JSON files', './specs')
  .action((options) => {
    const sourceDir = path.resolve(options.source);
    const specsDir = path.resolve(options.specs);

    console.log(`\nStarting migration pipeline`);
    console.log(`Source: ${sourceDir}`);
    console.log(`Specs:  ${specsDir}\n`);

    const result = runPipeline({ sourceDir, specsDir });

    console.log(`\n--- Pipeline complete ---`);
    console.log(`Total:        ${result.total}`);
    console.log(`Ready:        ${result.ready}`);
    console.log(`Needs review: ${result.needsReview}`);
    console.log(`Blocked:      ${result.blocked}`);

    if (result.blocked > 0) {
      console.error(`\n✗ ${result.blocked} template(s) are BLOCKED. Review spec files in ${specsDir} for error details.`);
      process.exit(1);
    }

    console.log(`\n✓ Specs written to ${specsDir}`);
    console.log(`  Run: migrator review --specs ${specsDir} --source ${sourceDir}`);
  });

program
  .command('review')
  .description('Launch the local review UI')
  .requiredOption('--specs <dir>', 'Directory containing migration spec JSON files')
  .requiredOption('--source <dir>', 'Directory containing source HTML email templates')
  .option('--port <number>', 'Port for the review server', '3000')
  .action(async (options) => {
    const { startReviewServer } = await import('../review/server');
    const specsDir = path.resolve(options.specs);
    const sourceDir = path.resolve(options.source);
    const port = parseInt(options.port, 10);
    startReviewServer({ specsDir, sourceDir, port });
  });

program
  .command('export')
  .description('Export approved templates (gated: all must be approved first)')
  .requiredOption('--specs <dir>', 'Directory containing migration spec JSON files')
  .requiredOption('--output <dir>', 'Directory to write target artifacts')
  .action((options) => {
    const specsDir = path.resolve(options.specs);
    const outputDir = path.resolve(options.output);
    console.log(`Export is not implemented in Phase 1.`);
    console.log(`Specs dir: ${specsDir}`);
    console.log(`Output dir: ${outputDir}`);
    console.log(`Implement ExportAdapter in src/export/ when TargetSystem structure is known.`);
  });

program.parse(process.argv);
