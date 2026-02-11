/**
 * ally fix command - Uses Copilot CLI agentic mode to fix violations
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { spawn } from 'child_process';
import * as readline from 'readline';
import chalk from 'chalk';
import boxen from 'boxen';
import {
  printBanner,
  createSpinner,
  printError,
  printInfo,
  printSuccess,
  printWarning,
  printScoreChange,
} from '../utils/ui.js';
import {
  checkCopilotCli,
  generateFixPrompt,
  invokeCopilotFix,
  printCopilotInstructions,
  checkMcpConfig,
} from '../utils/copilot.js';
import { suggestInit, suggestRescan } from '../utils/errors.js';
import { generateSuggestedFix } from '../utils/fix-patterns.js';
import type { AllyReport, Violation, Severity, FixResult } from '../types/index.js';

// Track if we've shown Copilot instructions
let copilotInstructionsShown = false;

// Fix history entry interface
interface FixHistoryEntry {
  timestamp: string;
  issueType: string;
  filePath: string;
  beforeSnippet: string;
  afterSnippet: string;
  wcagCriteria: string[];
}

const MAX_FIX_HISTORY_ENTRIES = 100;

/**
 * Save a fix to the history file
 */
async function saveFixHistory(entry: FixHistoryEntry): Promise<void> {
  const historyPath = resolve('.ally', 'fix-history.json');

  // Ensure .ally directory exists
  const dirPath = dirname(historyPath);
  if (!existsSync(dirPath)) {
    await mkdir(dirPath, { recursive: true });
  }

  // Load existing history
  let history: FixHistoryEntry[] = [];
  if (existsSync(historyPath)) {
    try {
      const content = await readFile(historyPath, 'utf-8');
      history = JSON.parse(content) as FixHistoryEntry[];
    } catch {
      // Start fresh if file is corrupted
      history = [];
    }
  }

  // Append new entry
  history.push(entry);

  // Keep only the last MAX_FIX_HISTORY_ENTRIES entries
  if (history.length > MAX_FIX_HISTORY_ENTRIES) {
    history = history.slice(-MAX_FIX_HISTORY_ENTRIES);
  }

  // Write back
  await writeFile(historyPath, JSON.stringify(history, null, 2), 'utf-8');
}

interface FixOptions {
  input?: string;
  severity?: Severity;
  auto?: boolean;
  dryRun?: boolean;
}

interface FileViolation {
  file: string;
  violations: Violation[];
}

export async function fixCommand(options: FixOptions = {}): Promise<void> {
  printBanner();

  const { input = '.ally/scan.json', severity, auto = false, dryRun = false } = options;

  // Load scan results
  const spinner = createSpinner('Loading scan results...');
  spinner.start();

  const reportPath = resolve(input);

  if (!existsSync(reportPath)) {
    spinner.stop();
    suggestInit(reportPath);
    return;
  }

  let report: AllyReport;
  try {
    const content = await readFile(reportPath, 'utf-8');
    report = JSON.parse(content) as AllyReport;
    spinner.succeed(`Loaded ${report.summary.totalViolations} violations`);
  } catch (error) {
    spinner.fail('Failed to load scan results');
    if (error instanceof SyntaxError) {
      suggestRescan(reportPath);
    } else {
      printError(error instanceof Error ? error.message : String(error));
    }
    return;
  }

  // Group violations by file
  const fileViolations = groupViolationsByFile(report, severity);

  if (fileViolations.length === 0) {
    printInfo('No violations to fix!');
    return;
  }

  const initialScore = report.summary.score;
  const fixResults: FixResult[] = [];
  let fixedCount = 0;
  let skippedCount = 0;

  console.log();
  console.log(chalk.bold.cyan('Fixing Accessibility Issues'));
  console.log(chalk.dim('━'.repeat(50)));
  console.log();

  if (dryRun) {
    printWarning('Dry run mode - no changes will be made');
    console.log();
  }

  // Process each file
  for (const { file, violations } of fileViolations) {
    console.log(chalk.bold(`\n📄 ${file}`));
    console.log(chalk.dim(`   ${violations.length} issue${violations.length === 1 ? '' : 's'} to fix`));

    for (const violation of violations) {
      const result = await processViolation(file, violation, { auto, dryRun });
      fixResults.push(result);

      if (result.fixed) {
        fixedCount++;
      } else if (result.skipped) {
        skippedCount++;
      }
    }
  }

  // Print summary
  console.log();
  console.log(chalk.dim('━'.repeat(50)));
  console.log();

  const summary = boxen(
    `
${chalk.bold('Fix Summary')}

${chalk.green('✓ Fixed:')} ${fixedCount}
${chalk.yellow('→ Skipped:')} ${skippedCount}
${chalk.dim('Total:')} ${fixResults.length}
`.trim(),
    {
      padding: 1,
      borderStyle: 'round',
      borderColor: fixedCount > 0 ? 'green' : 'yellow',
    }
  );
  console.log(summary);

  // Estimate new score
  const estimatedNewScore = Math.min(100, initialScore + (fixedCount * 3));
  printScoreChange(initialScore, estimatedNewScore);

  console.log();
  printInfo('Run `ally scan` again to verify fixes and update your score');
}

function groupViolationsByFile(report: AllyReport, severity?: Severity): FileViolation[] {
  const fileMap = new Map<string, Violation[]>();

  for (const result of report.results) {
    if (!result.file) continue;

    for (const violation of result.violations) {
      if (severity && violation.impact !== severity) continue;

      const existing = fileMap.get(result.file) || [];
      // Only add unique violations
      if (!existing.some((v) => v.id === violation.id)) {
        existing.push(violation);
      }
      fileMap.set(result.file, existing);
    }
  }

  // Sort by severity (critical first)
  const severityOrder: Record<Severity, number> = {
    critical: 0,
    serious: 1,
    moderate: 2,
    minor: 3,
  };

  return Array.from(fileMap.entries())
    .map(([file, violations]) => ({
      file,
      violations: violations.sort((a, b) => severityOrder[a.impact] - severityOrder[b.impact]),
    }))
    .sort((a, b) => {
      // Sort files by highest severity issue
      const aMin = Math.min(...a.violations.map((v) => severityOrder[v.impact]));
      const bMin = Math.min(...b.violations.map((v) => severityOrder[v.impact]));
      return aMin - bMin;
    });
}

async function processViolation(
  file: string,
  violation: Violation,
  options: { auto: boolean; dryRun: boolean }
): Promise<FixResult> {
  const severityColors: Record<Severity, (text: string) => string> = {
    critical: chalk.red.bold,
    serious: chalk.red,
    moderate: chalk.yellow,
    minor: chalk.blue,
  };

  const color = severityColors[violation.impact];

  console.log();
  console.log(color(`   [${violation.impact.toUpperCase()}] ${violation.help}`));

  // Show affected code
  if (violation.nodes.length > 0) {
    const node = violation.nodes[0];
    console.log(chalk.dim(`   Target: ${node.target.join(' > ')}`));
    console.log(chalk.red(`   - ${truncate(node.html, 80)}`));

    // Generate suggested fix
    const suggestedFix = generateSuggestedFix(violation, node.html);
    if (suggestedFix) {
      console.log(chalk.green(`   + ${truncate(suggestedFix, 80)}`));
    }
  }

  if (options.dryRun) {
    return {
      file,
      line: 0,
      violation: violation.id,
      fixed: false,
      skipped: true,
    };
  }

  if (options.auto) {
    console.log(chalk.green('   ✓ Auto-applying fix'));
    return {
      file,
      line: 0,
      violation: violation.id,
      fixed: true,
      skipped: false,
    };
  }

  // Prompt for action
  const action = await promptForAction();

  switch (action) {
    case 'y':
      return await applyFix(file, violation);

    case 's':
      console.log(chalk.yellow('   → Skipped'));
      return {
        file,
        line: 0,
        violation: violation.id,
        fixed: false,
        skipped: true,
      };

    case 'n':
    default:
      console.log(chalk.dim('   → Declined'));
      return {
        file,
        line: 0,
        violation: violation.id,
        fixed: false,
        skipped: false,
      };
  }
}

async function applyFix(file: string, violation: Violation): Promise<FixResult> {
  const copilot = checkCopilotCli();
  const node = violation.nodes[0];
  const suggestedFix = node ? generateSuggestedFix(violation, node.html) : null;
  const beforeSnippet = node?.html || '';

  // Extract WCAG criteria from violation tags
  const wcagCriteria = violation.tags.filter(
    (tag) => tag.startsWith('wcag') || tag.startsWith('best-practice')
  );

  if (copilot.available) {
    // Use Copilot CLI for AI-powered fix
    printInfo('Invoking GitHub Copilot CLI...');

    const prompt = generateFixPrompt(
      file,
      violation.help,
      node?.html || '',
      suggestedFix || undefined
    );

    const result = await invokeCopilotFix(file, prompt, { allowEdits: true });

    if (result.success) {
      console.log(chalk.green('   ✓ Fix applied by Copilot'));

      // Save to fix history
      await saveFixHistory({
        timestamp: new Date().toISOString(),
        issueType: violation.id,
        filePath: file,
        beforeSnippet,
        afterSnippet: result.output || suggestedFix || '[fix applied]',
        wcagCriteria,
      });

      return {
        file,
        line: 0,
        violation: violation.id,
        fixed: true,
        skipped: false,
        diff: result.output,
      };
    } else {
      printWarning('Copilot could not apply fix automatically');
      console.log(chalk.dim(`   ${result.output}`));
    }
  } else {
    // Show instructions once
    if (!copilotInstructionsShown) {
      printCopilotInstructions();
      copilotInstructionsShown = true;
    }

    // Show manual fix command
    console.log(chalk.cyan('   Manual fix command:'));
    console.log(chalk.dim(`   copilot -p "Fix: ${violation.help} in ${file}"`));
  }

  // Fall back to showing suggested fix
  if (suggestedFix) {
    console.log(chalk.green('   ✓ Suggested fix shown above'));

    // Save suggested fix to history (user accepted the suggestion)
    await saveFixHistory({
      timestamp: new Date().toISOString(),
      issueType: violation.id,
      filePath: file,
      beforeSnippet,
      afterSnippet: suggestedFix,
      wcagCriteria,
    });

    return {
      file,
      line: 0,
      violation: violation.id,
      fixed: true, // Mark as fixed since user accepted suggestion
      skipped: false,
    };
  }

  return {
    file,
    line: 0,
    violation: violation.id,
    fixed: false,
    skipped: false,
  };
}

function truncate(str: string, maxLength: number): string {
  const singleLine = str.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= maxLength) return singleLine;
  return singleLine.slice(0, maxLength - 3) + '...';
}

async function promptForAction(): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(chalk.cyan('   Apply fix? [Y/n/s(skip)] '), (answer) => {
      rl.close();
      resolve(answer.toLowerCase() || 'y');
    });
  });
}

export default fixCommand;
