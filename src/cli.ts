#!/usr/bin/env node

/**
 * ally - Your codebase's accessibility ally
 *
 * Scans, explains, and fixes accessibility issues using GitHub Copilot CLI.
 */

import { Command } from 'commander';
import { scanCommand } from './commands/scan.js';
import { explainCommand } from './commands/explain.js';
import { fixCommand } from './commands/fix.js';
import { reportCommand } from './commands/report.js';
import { initCommand } from './commands/init.js';
import { statsCommand } from './commands/stats.js';

const program = new Command();

program
  .name('ally')
  .description('Your codebase\'s accessibility ally. Scans, explains, and fixes a11y issues using GitHub Copilot CLI.')
  .version('1.0.0');

// ally scan [path]
program
  .command('scan [path]')
  .description('Scan files for accessibility violations')
  .option('-o, --output <dir>', 'Output directory for results', '.ally')
  .option('-u, --url <url>', 'Scan a URL instead of files')
  .option('-j, --json', 'Output raw JSON results')
  .option('-v, --verbose', 'Show all violations including minor ones')
  .option('-t, --threshold <number>', 'Exit with error if violations exceed threshold (for CI)')
  .option('--ci', 'CI mode: minimal output, exit code based on violations')
  .action(async (path: string | undefined, options) => {
    try {
      // Parse threshold if provided
      if (options.threshold !== undefined) {
        const threshold = parseInt(options.threshold, 10);
        if (isNaN(threshold) || threshold < 0) {
          console.error('Error: --threshold must be a non-negative number');
          process.exit(1);
        }
        options.threshold = threshold;
      }
      const report = await scanCommand(path, options);

      // CI threshold check
      if (options.threshold !== undefined && report) {
        const violations = report.summary.totalViolations;
        if (violations > options.threshold) {
          console.error(`\nCI FAILED: ${violations} violations exceed threshold of ${options.threshold}`);
          process.exit(1);
        }
      }
    } catch (error) {
      console.error('Scan failed:', error);
      process.exit(1);
    }
  });

// ally explain
program
  .command('explain')
  .description('Get plain-language explanations of violations using Copilot')
  .option('-i, --input <file>', 'Path to scan results', '.ally/scan.json')
  .option('-s, --severity <level>', 'Filter by severity (critical, serious, moderate, minor)')
  .option('-l, --limit <number>', 'Maximum number of issues to explain', '10')
  .action(async (options) => {
    try {
      const limit = parseInt(options.limit, 10);
      if (isNaN(limit) || limit < 1) {
        console.error('Error: --limit must be a positive number');
        process.exit(1);
      }
      await explainCommand({
        ...options,
        limit,
      });
    } catch (error) {
      console.error('Explain failed:', error);
      process.exit(1);
    }
  });

// ally fix
program
  .command('fix')
  .description('Fix accessibility issues using Copilot CLI agentic mode')
  .option('-i, --input <file>', 'Path to scan results', '.ally/scan.json')
  .option('-s, --severity <level>', 'Filter by severity (critical, serious, moderate, minor)')
  .option('-a, --auto', 'Automatically apply all fixes without prompting')
  .option('-d, --dry-run', 'Show what would be fixed without making changes')
  .action(async (options) => {
    try {
      await fixCommand(options);
    } catch (error) {
      console.error('Fix failed:', error);
      process.exit(1);
    }
  });

// ally report
program
  .command('report')
  .description('Generate accessibility report (ACCESSIBILITY.md)')
  .option('-i, --input <file>', 'Path to scan results', '.ally/scan.json')
  .option('-o, --output <file>', 'Output file path', 'ACCESSIBILITY.md')
  .option('-f, --format <type>', 'Report format (markdown, json, html)', 'markdown')
  .action(async (options) => {
    try {
      await reportCommand(options);
    } catch (error) {
      console.error('Report generation failed:', error);
      process.exit(1);
    }
  });

// ally init
program
  .command('init')
  .description('Initialize ally in your project')
  .option('-f, --force', 'Overwrite existing configuration')
  .action(async (options) => {
    try {
      await initCommand(options);
    } catch (error) {
      console.error('Initialization failed:', error);
      process.exit(1);
    }
  });

// ally stats
program
  .command('stats')
  .description('Show accessibility progress dashboard')
  .action(async () => {
    try {
      await statsCommand();
    } catch (error) {
      console.error('Stats failed:', error);
      process.exit(1);
    }
  });

// Parse and run
program.parse();
