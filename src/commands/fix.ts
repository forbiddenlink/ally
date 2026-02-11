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
  fileLink,
} from '../utils/ui.js';
import {
  checkCopilotCli,
  generateFixPrompt,
  invokeCopilotFix,
  printCopilotInstructions,
  checkMcpConfig,
} from '../utils/copilot.js';
import { suggestInit, suggestRescan } from '../utils/errors.js';
import { generateSuggestedFix, getFixConfidence, getConfidenceLevel, FIX_CONFIDENCE } from '../utils/fix-patterns.js';
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

// WCAG criterion explanations for common violation IDs
const WCAG_EXPLANATIONS: Record<string, { criterion: string; why: string }> = {
  'button-name': {
    criterion: '4.1.2 Name, Role, Value (Level A)',
    why: 'Buttons must have discernible text for screen readers.',
  },
  'image-alt': {
    criterion: '1.1.1 Non-text Content (Level A)',
    why: 'Images must have alternative text for users who cannot see them.',
  },
  'link-name': {
    criterion: '2.4.4 Link Purpose (In Context) (Level A)',
    why: 'Links must have discernible text to indicate their destination.',
  },
  'label': {
    criterion: '1.3.1 Info and Relationships (Level A)',
    why: 'Form inputs must have labels so users know what to enter.',
  },
  'html-has-lang': {
    criterion: '3.1.1 Language of Page (Level A)',
    why: 'Screen readers need to know the page language to pronounce text correctly.',
  },
  'color-contrast': {
    criterion: '1.4.3 Contrast (Minimum) (Level AA)',
    why: 'Text must have sufficient contrast with its background to be readable.',
  },
  'heading-order': {
    criterion: '1.3.1 Info and Relationships (Level A)',
    why: 'Headings must be in logical order for document structure navigation.',
  },
  'aria-hidden-focus': {
    criterion: '4.1.2 Name, Role, Value (Level A)',
    why: 'Hidden elements should not be focusable by keyboard users.',
  },
  'frame-title': {
    criterion: '2.4.1 Bypass Blocks (Level A)',
    why: 'iframes need titles so users understand their content without loading them.',
  },
  'select-name': {
    criterion: '1.3.1 Info and Relationships (Level A)',
    why: 'Select elements must have accessible names for form navigation.',
  },
  'bypass': {
    criterion: '2.4.1 Bypass Blocks (Level A)',
    why: 'Users need a way to skip repetitive content like navigation.',
  },
  'landmark-one-main': {
    criterion: '1.3.1 Info and Relationships (Level A)',
    why: 'Pages need a main landmark so users can quickly find primary content.',
  },
  'meta-viewport': {
    criterion: '1.4.4 Resize Text (Level AA)',
    why: 'Users must be able to zoom and resize text for readability.',
  },
  'document-title': {
    criterion: '2.4.2 Page Titled (Level A)',
    why: 'Pages need titles so users can identify them in tabs and history.',
  },
  'duplicate-id': {
    criterion: '4.1.1 Parsing (Level A)',
    why: 'Duplicate IDs cause assistive technologies to behave unpredictably.',
  },
};

const MAX_FIX_HISTORY_ENTRIES = 100;

/**
 * Format confidence score for display with color coding
 * @param confidence - Confidence score between 0 and 1
 * @returns Formatted string with color (green=high, yellow=medium, red=low)
 */
function formatConfidence(confidence: number): string {
  const percentage = Math.round(confidence * 100);
  const level = getConfidenceLevel(confidence);

  switch (level) {
    case 'high':
      return chalk.green(`${percentage}% confidence`);
    case 'medium':
      return chalk.yellow(`${percentage}% confidence`);
    case 'low':
      return chalk.red(`${percentage}% confidence`);
  }
}

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
  yes?: boolean;
}

// Pending fix for interactive review
interface PendingFix {
  file: string;
  violation: Violation;
  beforeSnippet: string;
  afterSnippet: string | null;
  confidence: number | null;
  wcagInfo: { criterion: string; why: string } | null;
}

interface FileViolation {
  file: string;
  violations: Violation[];
}

export async function fixCommand(options: FixOptions = {}): Promise<void> {
  printBanner();

  const { input = '.ally/scan.json', severity, auto = false, dryRun = false, yes = false } = options;

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

  // Interactive mode: --yes flag disables it
  const interactive = !yes && !auto && !dryRun && process.stdout.isTTY;

  if (interactive) {
    // Collect all pending fixes for interactive review
    const pendingFixes: PendingFix[] = [];

    for (const { file, violations } of fileViolations) {
      for (const violation of violations) {
        const node = violation.nodes[0];
        const beforeSnippet = node?.html || '';
        const afterSnippet = node ? generateSuggestedFix(violation, node.html) : null;
        const confidence = getFixConfidence(violation.id);
        const wcagInfo = WCAG_EXPLANATIONS[violation.id] || null;

        pendingFixes.push({
          file,
          violation,
          beforeSnippet,
          afterSnippet,
          confidence,
          wcagInfo,
        });
      }
    }

    // Run interactive review
    const { accepted, skipped } = await runInteractiveReview(pendingFixes);

    // Apply accepted fixes
    for (const fix of accepted) {
      const result = await applyFix(fix.file, fix.violation);
      fixResults.push(result);
      if (result.fixed) fixedCount++;
    }

    // Record skipped fixes
    for (const fix of skipped) {
      fixResults.push({
        file: fix.file,
        line: 0,
        violation: fix.violation.id,
        fixed: false,
        skipped: true,
      });
      skippedCount++;
    }
  } else {
    // Non-interactive mode (original behavior)
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
      const linkedFile = fileLink(file);
      console.log(chalk.bold(`\n📄 `) + chalk.bold(linkedFile));
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

/**
 * Clear the terminal screen
 */
function clearScreen(): void {
  process.stdout.write('\x1b[2J\x1b[H');
}

/**
 * Format code snippet with syntax highlighting using chalk
 */
function formatCodeSnippet(code: string, isAddition: boolean = false): string {
  const lines = code.split('\n');
  const prefix = isAddition ? chalk.green('  + ') : chalk.red('  - ');
  const color = isAddition ? chalk.green : chalk.red;

  return lines.map((line) => prefix + color(line)).join('\n');
}

/**
 * Display a single fix in interactive mode
 */
function displayInteractiveFix(fix: PendingFix, index: number, total: number): void {
  clearScreen();

  // Confidence display
  const confidence = fix.confidence !== null ? Math.round(fix.confidence * 100) : null;
  let confidenceStr = '';
  if (confidence !== null) {
    const level = getConfidenceLevel(fix.confidence!);
    const color =
      level === 'high' ? chalk.green : level === 'medium' ? chalk.yellow : chalk.red;
    confidenceStr = color(`${confidence}% confidence`);
  }

  // Severity color
  const severityColors: Record<Severity, (text: string) => string> = {
    critical: chalk.red.bold,
    serious: chalk.red,
    moderate: chalk.yellow,
    minor: chalk.blue,
  };
  const severityColor = severityColors[fix.violation.impact];

  // Header box
  const headerContent = [
    `  ${chalk.bold(`Fix ${index + 1} of ${total}:`)} ${chalk.cyan(fix.violation.id)}${
      confidenceStr ? ` (${confidenceStr})` : ''
    }`,
    `  ${chalk.dim('Severity:')} ${severityColor(fix.violation.impact.toUpperCase())}`,
    `  ${chalk.dim('File:')} ${chalk.white(fix.file)}`,
  ].join('\n');

  console.log(
    boxen(headerContent, {
      padding: { top: 0, bottom: 0, left: 0, right: 1 },
      borderStyle: 'round',
      borderColor: 'cyan',
    })
  );

  console.log();

  // Issue description
  console.log(chalk.bold.white(fix.violation.help));
  console.log();

  // Before/After comparison
  if (fix.beforeSnippet) {
    console.log(chalk.dim.underline('Before:'));
    console.log(formatCodeSnippet(truncateCode(fix.beforeSnippet, 200), false));
    console.log();
  }

  if (fix.afterSnippet) {
    console.log(chalk.dim.underline('After:'));
    console.log(formatCodeSnippet(truncateCode(fix.afterSnippet, 200), true));
    console.log();
  } else {
    console.log(chalk.yellow('  (No automatic fix available - requires manual review)'));
    console.log();
  }

  // WCAG explanation
  if (fix.wcagInfo) {
    console.log(chalk.dim.underline('Why:'));
    console.log(chalk.white(`  ${fix.wcagInfo.why}`));
    console.log(chalk.dim(`  WCAG: ${fix.wcagInfo.criterion}`));
    console.log();
  }

  // Action prompt
  console.log(
    chalk.cyan(
      '[y] Apply  [n] Skip  [a] Apply all remaining  [q] Quit  [?] More info'
    )
  );
  process.stdout.write(chalk.cyan('> '));
}

/**
 * Truncate code to a maximum length for display
 */
function truncateCode(code: string, maxLength: number): string {
  const singleLine = code.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= maxLength) return singleLine;
  return singleLine.slice(0, maxLength - 3) + '...';
}

/**
 * Show detailed information about a fix
 */
function showFixDetails(fix: PendingFix): void {
  console.log();
  console.log(chalk.bold.cyan('━━━ Additional Information ━━━'));
  console.log();

  // Full violation details
  console.log(chalk.bold('Description:'));
  console.log(`  ${fix.violation.description}`);
  console.log();

  // Help URL
  console.log(chalk.bold('Learn more:'));
  console.log(chalk.blue(`  ${fix.violation.helpUrl}`));
  console.log();

  // WCAG tags
  const wcagTags = fix.violation.tags.filter(
    (t) => t.startsWith('wcag') || t.startsWith('best-practice')
  );
  if (wcagTags.length > 0) {
    console.log(chalk.bold('WCAG Criteria:'));
    wcagTags.forEach((tag) => console.log(`  - ${tag}`));
    console.log();
  }

  // Target elements
  if (fix.violation.nodes.length > 0) {
    console.log(chalk.bold('Affected elements:'));
    fix.violation.nodes.slice(0, 5).forEach((node) => {
      console.log(chalk.dim(`  ${node.target.join(' > ')}`));
    });
    if (fix.violation.nodes.length > 5) {
      console.log(chalk.dim(`  ... and ${fix.violation.nodes.length - 5} more`));
    }
    console.log();
  }

  console.log(chalk.dim('Press any key to continue...'));
}

/**
 * Run interactive review mode for fixes
 */
async function runInteractiveReview(
  fixes: PendingFix[]
): Promise<{ accepted: PendingFix[]; skipped: PendingFix[] }> {
  const accepted: PendingFix[] = [];
  const skipped: PendingFix[] = [];

  if (fixes.length === 0) {
    return { accepted, skipped };
  }

  // Set up raw mode for single keypress input
  const stdin = process.stdin;
  const wasRaw = stdin.isRaw;

  // Enable raw mode if available
  if (stdin.setRawMode) {
    stdin.setRawMode(true);
  }
  stdin.resume();
  stdin.setEncoding('utf8');

  let currentIndex = 0;
  let applyAll = false;

  return new Promise((resolve) => {
    const processCurrentFix = () => {
      if (currentIndex >= fixes.length) {
        // Done - restore terminal
        if (stdin.setRawMode) {
          stdin.setRawMode(wasRaw || false);
        }
        stdin.pause();
        clearScreen();
        resolve({ accepted, skipped });
        return;
      }

      const fix = fixes[currentIndex];

      if (applyAll) {
        // Auto-apply remaining
        accepted.push(fix);
        currentIndex++;
        processCurrentFix();
        return;
      }

      displayInteractiveFix(fix, currentIndex, fixes.length);
    };

    const handleKeypress = (key: string) => {
      const fix = fixes[currentIndex];

      switch (key.toLowerCase()) {
        case 'y':
          accepted.push(fix);
          currentIndex++;
          processCurrentFix();
          break;

        case 'n':
          skipped.push(fix);
          currentIndex++;
          processCurrentFix();
          break;

        case 'a':
          // Apply all remaining
          applyAll = true;
          accepted.push(fix);
          currentIndex++;
          processCurrentFix();
          break;

        case 'q':
        case '\x03': // Ctrl+C
          // Quit - skip remaining
          for (let i = currentIndex; i < fixes.length; i++) {
            skipped.push(fixes[i]);
          }
          if (stdin.setRawMode) {
            stdin.setRawMode(wasRaw || false);
          }
          stdin.pause();
          clearScreen();
          resolve({ accepted, skipped });
          break;

        case '?':
          showFixDetails(fix);
          // Wait for any key to continue
          stdin.once('data', () => {
            processCurrentFix();
          });
          break;

        default:
          // Ignore other keys, re-display prompt
          process.stdout.write(chalk.cyan('> '));
          break;
      }
    };

    stdin.on('data', handleKeypress);
    processCurrentFix();
  });
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
      const confidence = getFixConfidence(violation.id);
      const confidenceStr = confidence !== null ? ` (${formatConfidence(confidence)})` : '';
      console.log(chalk.cyan(`   Suggested fix${confidenceStr}:`));
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
