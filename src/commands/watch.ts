/**
 * ally watch command - Continuous accessibility testing for development
 *
 * Watches a directory for HTML file changes and automatically scans
 * them for accessibility violations.
 */

import { resolve, relative, extname } from 'path';
import { watch, existsSync, statSync } from 'fs';
import { readdir, readFile, writeFile } from 'fs/promises';
import chalk from 'chalk';
import {
  AccessibilityScanner,
  calculateScore,
} from '../utils/scanner.js';
import {
  printBanner,
  printInfo,
  printError,
  printSuccess,
  printWarning,
} from '../utils/ui.js';
import {
  generateSuggestedFix,
  getFixConfidence,
  FIX_CONFIDENCE,
} from '../utils/fix-patterns.js';
import type { ScanResult, Violation, Severity } from '../types/index.js';

interface WatchCommandOptions {
  port?: number;
  debounce?: number;
  clear?: boolean;
  fixOnSave?: boolean;
}

interface WatchStats {
  filesScanned: number;
  totalViolations: number;
  cleanScans: number;
  autoFixed: number;
}

const SUPPORTED_EXTENSIONS = ['.html', '.htm'];

/**
 * Auto-apply high-confidence fixes to a file
 * Returns the number of fixes applied
 */
async function autoFixFile(
  filePath: string,
  violations: Violation[]
): Promise<number> {
  let content = await readFile(filePath, 'utf-8');
  let fixesApplied = 0;

  // Only apply high-confidence fixes (>= 0.9)
  const highConfidenceViolations = violations.filter((v) => {
    const confidence = getFixConfidence(v.id);
    return confidence !== null && confidence >= 0.9;
  });

  for (const violation of highConfidenceViolations) {
    for (const node of violation.nodes) {
      if (node.html) {
        const fixedHtml = generateSuggestedFix(violation, node.html);
        if (fixedHtml && fixedHtml !== node.html) {
          // Apply the fix by replacing the HTML
          content = content.replace(node.html, fixedHtml);
          fixesApplied++;
        }
      }
    }
  }

  if (fixesApplied > 0) {
    await writeFile(filePath, content, 'utf-8');
  }

  return fixesApplied;
}

/**
 * Format time for log output
 */
function formatTime(): string {
  const now = new Date();
  return chalk.dim(
    `[${now.getHours().toString().padStart(2, '0')}:${now
      .getMinutes()
      .toString()
      .padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}]`
  );
}

/**
 * Debounce function to prevent rapid-fire scans
 */
function debounce(
  fn: (filePath: string) => Promise<void>,
  delay: number
): (filePath: string) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return (filePath: string) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => fn(filePath), delay);
  };
}

/**
 * Get severity icon
 */
function getSeverityIcon(severity: Severity): string {
  const icons: Record<Severity, string> = {
    critical: chalk.red('!!!'),
    serious: chalk.red('!!'),
    moderate: chalk.yellow('!'),
    minor: chalk.blue('i'),
  };
  return icons[severity];
}

/**
 * Print compact violation for watch mode
 */
function printCompactViolation(violation: Violation): void {
  const icon = getSeverityIcon(violation.impact);
  const count = violation.nodes.length;
  const countText = count > 1 ? chalk.dim(` (${count} instances)`) : '';
  console.log(`   - ${chalk.cyan(violation.id)}: ${violation.help}${countText}`);
}

/**
 * Print file scan result in watch mode format
 */
function printWatchResult(
  file: string,
  result: ScanResult,
  basePath: string,
  fixesApplied?: number
): void {
  const relPath = relative(basePath, file);
  const score = calculateScore([result]);
  const violations = result.violations;

  console.log();
  console.log(`${formatTime()} ${chalk.bold(relPath)} changed`);

  if (fixesApplied && fixesApplied > 0) {
    const fixText = fixesApplied === 1 ? 'fix' : 'fixes';
    console.log(chalk.green(`   ✓ Auto-applied ${fixesApplied} ${fixText}`));
  }

  if (violations.length === 0) {
    console.log(chalk.green(`   No issues found (score: ${score})`));
  } else {
    const issueText = violations.length === 1 ? 'issue' : 'issues';
    const scoreColor = score >= 75 ? chalk.green : score >= 50 ? chalk.yellow : chalk.red;
    console.log(
      chalk.yellow(`   ${violations.length} ${issueText} found`) +
        ` (score: ${scoreColor(score.toString())})`
    );

    // Group by severity for compact output
    const bySeverity: Partial<Record<Severity, Violation[]>> = {};
    for (const v of violations) {
      if (!bySeverity[v.impact]) {
        bySeverity[v.impact] = [];
      }
      bySeverity[v.impact]!.push(v);
    }

    // Print critical and serious first
    const order: Severity[] = ['critical', 'serious', 'moderate', 'minor'];
    for (const severity of order) {
      const sViolations = bySeverity[severity];
      if (sViolations) {
        for (const v of sViolations) {
          printCompactViolation(v);
        }
      }
    }
  }
}

/**
 * Print watch summary on exit
 */
function printWatchSummary(stats: WatchStats, startTime: Date): void {
  const duration = Math.round((Date.now() - startTime.getTime()) / 1000);
  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;
  const durationStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

  console.log();
  console.log(chalk.bold.cyan('\nWatch Session Summary'));
  console.log(chalk.dim('-'.repeat(40)));
  console.log(`  Duration:        ${durationStr}`);
  console.log(`  Files scanned:   ${stats.filesScanned}`);
  console.log(`  Total violations: ${stats.totalViolations}`);
  console.log(`  Clean scans:     ${stats.cleanScans}`);
  if (stats.autoFixed > 0) {
    console.log(chalk.green(`  Auto-fixed:      ${stats.autoFixed}`));
  }
  console.log();
}

/**
 * Recursively watch a directory
 */
async function watchDirectory(
  dirPath: string,
  callback: (filename: string) => void
): Promise<() => void> {
  const watchers: ReturnType<typeof watch>[] = [];
  const watchedDirs = new Set<string>();

  async function addWatcher(dir: string): Promise<void> {
    if (watchedDirs.has(dir)) return;
    watchedDirs.add(dir);

    try {
      const watcher = watch(dir, { recursive: false }, (eventType, filename) => {
        if (filename && isHtmlFile(filename)) {
          const fullPath = resolve(dir, filename);
          callback(fullPath);
        }
      });
      watchers.push(watcher);

      // Watch subdirectories
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (
          entry.isDirectory() &&
          !entry.name.startsWith('.') &&
          entry.name !== 'node_modules' &&
          entry.name !== 'dist' &&
          entry.name !== 'build'
        ) {
          await addWatcher(resolve(dir, entry.name));
        }
      }
    } catch (error) {
      // Directory might not exist or be inaccessible
    }
  }

  // Use recursive watching on supported platforms
  try {
    const watcher = watch(dirPath, { recursive: true }, (eventType, filename) => {
      if (filename && isHtmlFile(filename)) {
        const fullPath = resolve(dirPath, filename);
        if (existsSync(fullPath)) {
          callback(fullPath);
        }
      }
    });
    watchers.push(watcher);
  } catch (error) {
    // Fall back to manual recursive watching
    await addWatcher(dirPath);
  }

  return () => {
    for (const watcher of watchers) {
      watcher.close();
    }
  };
}

/**
 * Check if file is an HTML file
 */
function isHtmlFile(filename: string): boolean {
  const ext = extname(filename).toLowerCase();
  return SUPPORTED_EXTENSIONS.includes(ext);
}

/**
 * Main watch command
 */
export async function watchCommand(
  targetPath: string = '.',
  options: WatchCommandOptions = {}
): Promise<void> {
  const { debounce: debounceMs = 500, clear = false, fixOnSave = false } = options;

  const absolutePath = resolve(targetPath);

  // Verify path exists
  if (!existsSync(absolutePath)) {
    printError(`Path does not exist: ${absolutePath}`);
    process.exit(1);
  }

  const pathStat = statSync(absolutePath);
  if (!pathStat.isDirectory()) {
    printError(`Path is not a directory: ${absolutePath}`);
    process.exit(1);
  }

  printBanner();

  console.log(chalk.cyan.bold('Watching for accessibility changes...'));
  console.log(chalk.dim(`   Directory: ${absolutePath}`));
  console.log(chalk.dim(`   Debounce: ${debounceMs}ms`));
  if (fixOnSave) {
    console.log(chalk.green('   Auto-fix: ON (confidence ≥ 90%)'));
  }
  console.log(chalk.dim('   Press Ctrl+C to stop\n'));

  // Initialize scanner
  const scanner = new AccessibilityScanner();
  await scanner.init();

  // Track stats
  const stats: WatchStats = {
    filesScanned: 0,
    totalViolations: 0,
    cleanScans: 0,
    autoFixed: 0,
  };
  const startTime = new Date();

  // Scan a file
  const scanFile = async (filePath: string): Promise<void> => {
    if (!existsSync(filePath)) return;

    try {
      if (clear) {
        console.clear();
        console.log(chalk.cyan.bold('Watching for accessibility changes...'));
        console.log(chalk.dim('   Press Ctrl+C to stop\n'));
      }

      const result = await scanner.scanHtmlFile(filePath);
      stats.filesScanned++;
      stats.totalViolations += result.violations.length;
      if (result.violations.length === 0) {
        stats.cleanScans++;
      }

      // Auto-fix if enabled
      let fixesApplied = 0;
      if (fixOnSave && result.violations.length > 0) {
        fixesApplied = await autoFixFile(filePath, result.violations);
        stats.autoFixed += fixesApplied;

        // Rescan after fixes to show updated violations
        if (fixesApplied > 0) {
          const updatedResult = await scanner.scanHtmlFile(filePath);
          printWatchResult(filePath, updatedResult, absolutePath, fixesApplied);
          return;
        }
      }

      printWatchResult(filePath, result, absolutePath);
    } catch (error) {
      console.log();
      console.log(`${formatTime()} ${chalk.red('Error scanning')} ${relative(absolutePath, filePath)}`);
      printError(error instanceof Error ? error.message : String(error));
    }
  };

  // Debounced scan
  const debouncedScan = debounce(scanFile, debounceMs);

  // Set up file watching
  const stopWatching = await watchDirectory(absolutePath, (filename) => {
    debouncedScan(filename);
  });

  // Handle graceful shutdown
  const cleanup = async (): Promise<void> => {
    stopWatching();
    await scanner.close();
    printWatchSummary(stats, startTime);
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Initial message about watching
  printInfo('Waiting for file changes...');

  // Keep the process running
  await new Promise(() => {});
}

export default watchCommand;
