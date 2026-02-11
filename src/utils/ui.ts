/**
 * Terminal UI utilities for polished output
 */

import chalk from 'chalk';
import boxen from 'boxen';
import ora, { type Ora } from 'ora';
import type { Severity, ReportSummary, Violation } from '../types/index.js';

// Honor NO_COLOR environment variable (https://no-color.org/)
const noColor = process.env.NO_COLOR !== undefined || process.env.ALLY_NO_COLOR !== undefined;
if (noColor) {
  chalk.level = 0;
}

/**
 * Check if terminal hyperlinks should be disabled
 * Disabled in NO_COLOR mode, CI environments, or non-TTY
 */
function supportsHyperlinks(): boolean {
  if (noColor) return false;
  if (process.env.CI) return false;
  if (!process.stdout.isTTY) return false;
  // Some terminals advertise hyperlink support
  if (process.env.TERM_PROGRAM === 'vscode') return true;
  if (process.env.TERM_PROGRAM === 'iTerm.app') return true;
  if (process.env.WT_SESSION) return true; // Windows Terminal
  if (process.env.KONSOLE_VERSION) return true;
  // Default to true for modern terminals
  return true;
}

/**
 * Create a terminal hyperlink using OSC 8 escape sequences
 * Format: \x1b]8;;URL\x07TEXT\x1b]8;;\x07
 *
 * For VS Code and other editors, use file:// URLs with line and column:
 * file://path/to/file:line:column
 *
 * @param text - The visible text to display
 * @param url - The URL to link to
 * @returns The text wrapped in hyperlink escape sequences, or plain text if unsupported
 */
export function hyperlink(text: string, url: string): string {
  if (!supportsHyperlinks()) {
    return text;
  }
  return `\x1b]8;;${url}\x07${text}\x1b]8;;\x07`;
}

/**
 * Create a clickable file path link that opens in the editor
 *
 * @param filePath - Absolute or relative path to the file
 * @param line - Optional line number (1-indexed)
 * @param column - Optional column number (1-indexed)
 * @returns Hyperlinked file path or plain text if unsupported
 */
export function fileLink(filePath: string, line?: number, column?: number): string {
  // Build the file URL with optional line and column
  let url = `file://${filePath}`;
  if (line !== undefined) {
    url += `:${line}`;
    if (column !== undefined) {
      url += `:${column}`;
    }
  }

  // Build the display text
  let displayText = filePath;
  if (line !== undefined) {
    displayText += `:${line}`;
    if (column !== undefined) {
      displayText += `:${column}`;
    }
  }

  return hyperlink(displayText, url);
}

// Severity colors
const severityColors: Record<Severity, (text: string) => string> = {
  critical: chalk.red.bold,
  serious: chalk.red,
  moderate: chalk.yellow,
  minor: chalk.blue,
};

const severityIcons: Record<Severity, string> = {
  critical: '!!!',
  serious: '!!',
  moderate: '!',
  minor: 'i',
};

export function printBanner(): void {
  const banner = chalk.cyan.bold(`
   __ _  | | _   _
  / _\` | | || | | |
 | (_| | | || |_| |
  \\__,_| |_| \\__, |
             |___/  v1.0.0
`);
  console.log(banner);
  console.log(chalk.dim('  Your codebase\'s accessibility ally\n'));
}

export function createSpinner(text: string): Ora {
  return ora({
    text,
    color: 'cyan',
    spinner: 'dots',
  });
}

export function printViolation(violation: Violation, file?: string, absolutePath?: string): void {
  const color = severityColors[violation.impact];
  const icon = severityIcons[violation.impact];

  console.log(color(`  [${icon}] ${violation.impact.toUpperCase()}`));
  console.log(chalk.white(`      ${violation.help}`));

  if (file) {
    // Use absolute path for the hyperlink if available, display relative path
    const linkPath = absolutePath || file;
    const linkedFile = fileLink(linkPath);
    // Apply dim styling to the linked text
    console.log(chalk.dim(`      File: `) + chalk.dim(linkedFile));
  }

  violation.nodes.forEach((node, i) => {
    if (i < 3) { // Limit to 3 nodes for readability
      const target = node.target.join(' > ');
      console.log(chalk.dim(`      → ${target}`));
    }
  });

  if (violation.nodes.length > 3) {
    console.log(chalk.dim(`      ... and ${violation.nodes.length - 3} more occurrences`));
  }

  // Make the help URL clickable too
  const helpLink = hyperlink(violation.helpUrl, violation.helpUrl);
  console.log(chalk.dim(`      Learn more: `) + chalk.dim(helpLink));
  console.log();
}

export function printSummary(summary: ReportSummary): void {
  const { totalViolations, bySeverity, score } = summary;

  // Score color
  let scoreColor = chalk.green;
  if (score < 50) scoreColor = chalk.red;
  else if (score < 75) scoreColor = chalk.yellow;

  const summaryText = `
${chalk.bold('Accessibility Score:')} ${scoreColor.bold(`${score}/100`)}

${chalk.red.bold(`!!! CRITICAL: ${bySeverity.critical || 0}`)}
${chalk.red(`!!  SERIOUS:  ${bySeverity.serious || 0}`)}
${chalk.yellow(`!   MODERATE: ${bySeverity.moderate || 0}`)}
${chalk.blue(`i   MINOR:    ${bySeverity.minor || 0}`)}

${chalk.dim(`Total issues: ${totalViolations}`)}
`;

  console.log(
    boxen(summaryText.trim(), {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: score >= 75 ? 'green' : score >= 50 ? 'yellow' : 'red',
      title: 'Scan Results',
      titleAlignment: 'center',
    })
  );
}

export function printSuccess(message: string): void {
  console.log(chalk.green('✓ ') + message);
}

export function printError(message: string): void {
  console.log(chalk.red('✗ ') + message);
}

export function printWarning(message: string): void {
  console.log(chalk.yellow('⚠ ') + message);
}

export function printInfo(message: string): void {
  console.log(chalk.blue('ℹ ') + message);
}

export function printDiff(oldCode: string, newCode: string): void {
  console.log(chalk.red(`  - ${oldCode}`));
  console.log(chalk.green(`  + ${newCode}`));
}

export function printFixPrompt(file: string, line: number, issue: string): void {
  console.log();
  console.log(chalk.cyan.bold(`📝 Fixing: ${file}:${line}`));
  console.log(chalk.dim(`   Issue: ${issue}`));
  console.log();
}

export function printScoreChange(before: number, after: number): void {
  const diff = after - before;
  const diffStr = diff > 0 ? chalk.green(`+${diff}`) : chalk.red(`${diff}`);
  console.log(
    boxen(
      `Score: ${before} → ${chalk.bold(after.toString())} (${diffStr})`,
      {
        padding: { top: 0, bottom: 0, left: 1, right: 1 },
        borderStyle: 'round',
        borderColor: diff > 0 ? 'green' : 'red',
      }
    )
  );
}

/**
 * Animate score counting up - creates memorable visual feedback
 */
export async function animateScoreUp(from: number, to: number): Promise<void> {
  if (noColor || from >= to) {
    // No animation in no-color mode or if score didn't improve
    printScoreBadge(to);
    return;
  }

  const frames = Math.min(to - from, 20); // Max 20 frames
  const step = (to - from) / frames;
  const delay = 50; // 50ms per frame

  for (let i = 0; i <= frames; i++) {
    const current = Math.round(from + (step * i));
    process.stdout.write(`\r${getScoreBar(current)}`);
    await sleep(delay);
  }

  console.log(); // New line after animation
  printScoreBadge(to);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getScoreBar(score: number): string {
  const width = 30;
  const filled = Math.round((score / 100) * width);
  const empty = width - filled;

  const color = score >= 90 ? chalk.green
    : score >= 75 ? chalk.yellow
    : score >= 50 ? chalk.hex('#FFA500')
    : chalk.red;

  const bar = color('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
  const scoreText = color.bold(`${score}%`);

  return `  ${bar} ${scoreText}`;
}

export function printScoreBadge(score: number): void {
  const emoji = score >= 90 ? '🌟'
    : score >= 75 ? '✅'
    : score >= 50 ? '⚠️'
    : '❌';

  const color = score >= 90 ? chalk.green
    : score >= 75 ? chalk.yellow
    : score >= 50 ? chalk.hex('#FFA500')
    : chalk.red;

  console.log(
    boxen(
      `${emoji} Accessibility Score: ${color.bold(`${score}/100`)}`,
      {
        padding: { top: 0, bottom: 0, left: 1, right: 1 },
        borderStyle: 'round',
        borderColor: score >= 75 ? 'green' : score >= 50 ? 'yellow' : 'red',
      }
    )
  );
}

export function printFileHeader(file: string, violationCount: number, absolutePath?: string): void {
  const color = violationCount > 0 ? chalk.yellow : chalk.green;
  // Use absolute path for the hyperlink if available
  const linkPath = absolutePath || file;
  const linkedFile = fileLink(linkPath);
  console.log(color.bold(`\n📄 `) + color.bold(linkedFile));
  if (violationCount > 0) {
    console.log(chalk.dim(`   ${violationCount} issue${violationCount === 1 ? '' : 's'} found`));
  } else {
    console.log(chalk.green.dim('   No issues found'));
  }
}
