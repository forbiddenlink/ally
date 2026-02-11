/**
 * ally scan-storybook command - Scans Storybook stories for accessibility issues
 */

import { resolve } from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import chalk from 'chalk';
import {
  AccessibilityScanner,
  createReport,
  calculateScore,
  DEFAULT_STANDARD,
  DEFAULT_TIMEOUT,
  type WcagStandard,
} from '../utils/scanner.js';
import {
  printBanner,
  createSpinner,
  printSuccess,
  printError,
  printInfo,
  printWarning,
  printSummary,
} from '../utils/ui.js';
import { withRetry } from '../utils/retry.js';
import type { ScanResult, AllyReport, Severity } from '../types/index.js';

/**
 * Storybook story index format (Storybook 7+)
 */
interface StorybookIndex {
  v: number;
  entries: Record<string, StorybookEntry>;
}

/**
 * Storybook story entry
 */
interface StorybookEntry {
  id: string;
  title: string;
  name: string;
  type: 'story' | 'docs';
  importPath?: string;
  tags?: string[];
}

/**
 * Legacy Storybook 6 stories.json format
 */
interface StorybookStoriesJson {
  v: number;
  stories: Record<string, {
    id: string;
    title: string;
    name: string;
    kind: string;
    story: string;
    parameters?: Record<string, unknown>;
  }>;
}

/**
 * Result for a single story
 */
interface StoryResult {
  storyId: string;
  storyName: string;
  componentTitle: string;
  scanResult: ScanResult | null;
  error?: string;
}

/**
 * Grouped results by component
 */
interface ComponentResults {
  title: string;
  stories: StoryResult[];
  totalErrors: number;
  totalWarnings: number;
}

interface ScanStorybookOptions {
  url?: string;
  timeout?: number;
  filter?: string;
  format?: 'default' | 'json' | 'csv';
  output?: string;
  standard?: WcagStandard;
}

/**
 * Fetch the Storybook stories index
 * Tries Storybook 7+ format first, then falls back to Storybook 6
 */
async function fetchStoriesIndex(storybookUrl: string): Promise<StorybookEntry[]> {
  const baseUrl = storybookUrl.replace(/\/$/, '');

  // Try Storybook 7+ index.json first
  try {
    const indexResponse = await fetch(`${baseUrl}/index.json`);
    if (indexResponse.ok) {
      const index = await indexResponse.json() as StorybookIndex;
      const entries = Object.values(index.entries)
        .filter(entry => entry.type === 'story'); // Filter out docs
      return entries;
    }
  } catch {
    // Fall through to try stories.json
  }

  // Try Storybook 6 stories.json
  try {
    const storiesResponse = await fetch(`${baseUrl}/stories.json`);
    if (storiesResponse.ok) {
      const storiesJson = await storiesResponse.json() as StorybookStoriesJson;
      // Convert to common format
      return Object.values(storiesJson.stories).map(story => ({
        id: story.id,
        title: story.title || story.kind,
        name: story.name || story.story,
        type: 'story' as const,
      }));
    }
  } catch {
    // Fall through to error
  }

  throw new Error(
    `Could not fetch Storybook stories index from ${baseUrl}. ` +
    `Tried /index.json (Storybook 7+) and /stories.json (Storybook 6). ` +
    `Make sure Storybook is running and accessible.`
  );
}

/**
 * Build the iframe URL for a story
 */
function getStoryIframeUrl(storybookUrl: string, storyId: string): string {
  const baseUrl = storybookUrl.replace(/\/$/, '');
  return `${baseUrl}/iframe.html?viewMode=story&id=${encodeURIComponent(storyId)}`;
}

/**
 * Group stories by component title
 */
function groupStoriesByComponent(stories: StorybookEntry[]): Map<string, StorybookEntry[]> {
  const groups = new Map<string, StorybookEntry[]>();

  for (const story of stories) {
    const existing = groups.get(story.title) || [];
    existing.push(story);
    groups.set(story.title, existing);
  }

  return groups;
}

/**
 * Filter stories by pattern (matches against component title or story name)
 */
function filterStories(stories: StorybookEntry[], pattern: string): StorybookEntry[] {
  const regex = new RegExp(pattern, 'i');
  return stories.filter(story =>
    regex.test(story.title) || regex.test(story.name) || regex.test(story.id)
  );
}

/**
 * Count errors and warnings from a scan result
 */
function countIssues(result: ScanResult | null): { errors: number; warnings: number } {
  if (!result) {
    return { errors: 0, warnings: 0 };
  }

  let errors = 0;
  let warnings = 0;

  for (const violation of result.violations) {
    if (violation.impact === 'critical' || violation.impact === 'serious') {
      errors++;
    } else {
      warnings++;
    }
  }

  return { errors, warnings };
}

/**
 * Get status icon for a story result
 */
function getStatusIcon(errors: number, warnings: number): string {
  if (errors > 0) return chalk.red('X');
  if (warnings > 0) return chalk.yellow('!');
  return chalk.green('v');
}

/**
 * Format a single story result line
 */
function formatStoryLine(
  storyName: string,
  errors: number,
  warnings: number,
  isLast: boolean,
  issueDetails?: string
): string {
  const prefix = isLast ? '`-- ' : '|-- ';
  const icon = getStatusIcon(errors, warnings);

  let status: string;
  if (errors > 0) {
    const details = issueDetails ? ` (${issueDetails})` : '';
    status = chalk.red(`${errors} error${errors !== 1 ? 's' : ''}${details}`);
  } else if (warnings > 0) {
    const details = issueDetails ? ` (${issueDetails})` : '';
    status = chalk.yellow(`${warnings} warning${warnings !== 1 ? 's' : ''}${details}`);
  } else {
    status = chalk.green('0 issues');
  }

  return `   ${prefix}${storyName}: ${icon} ${status}`;
}

/**
 * Get the first issue ID from violations for display
 */
function getFirstIssueId(result: ScanResult | null): string | undefined {
  if (!result || result.violations.length === 0) return undefined;
  return result.violations[0].id;
}

/**
 * Print tree-style component results
 */
function printComponentTree(componentResults: ComponentResults[]): void {
  console.log(chalk.bold('\nComponent Results:'));

  for (let i = 0; i < componentResults.length; i++) {
    const component = componentResults[i];
    const isLastComponent = i === componentResults.length - 1;
    const componentPrefix = isLastComponent ? '`-- ' : '|-- ';

    // Component header
    console.log(chalk.cyan.bold(`${componentPrefix}${component.title}`));

    // Stories
    for (let j = 0; j < component.stories.length; j++) {
      const story = component.stories[j];
      const isLastStory = j === component.stories.length - 1;
      const { errors, warnings } = countIssues(story.scanResult);
      const issueId = getFirstIssueId(story.scanResult);

      console.log(formatStoryLine(story.storyName, errors, warnings, isLastStory, issueId));
    }
  }
}

/**
 * Print summary statistics
 */
function printStorybookSummary(
  componentResults: ComponentResults[],
  totalStories: number,
  passingStories: number,
  totalErrors: number,
  totalWarnings: number
): void {
  const withIssues = totalStories - passingStories;
  const passingPercent = totalStories > 0 ? Math.round((passingStories / totalStories) * 100) : 0;
  const issuesPercent = totalStories > 0 ? Math.round((withIssues / totalStories) * 100) : 0;

  console.log(chalk.bold('\nSummary:'));
  console.log(`  Components: ${componentResults.length}`);
  console.log(`  Stories: ${totalStories}`);
  console.log(`  Passing: ${chalk.green(passingStories.toString())} (${passingPercent}%)`);
  console.log(`  With issues: ${chalk[withIssues > 0 ? 'yellow' : 'green'](withIssues.toString())} (${issuesPercent}%)`);
  console.log();
  console.log(`Total: ${chalk.red(`${totalErrors} error${totalErrors !== 1 ? 's' : ''}`)}, ${chalk.yellow(`${totalWarnings} warning${totalWarnings !== 1 ? 's' : ''}`)}`);
}

/**
 * Convert results to CSV format
 */
function convertToCsv(componentResults: ComponentResults[]): string {
  const headers = ['component', 'story', 'story_id', 'errors', 'warnings', 'issues'];
  const rows: string[] = [headers.join(',')];

  for (const component of componentResults) {
    for (const story of component.stories) {
      const { errors, warnings } = countIssues(story.scanResult);
      const issues = story.scanResult?.violations.map(v => v.id).join('; ') || '';

      const row = [
        escapeCsv(component.title),
        escapeCsv(story.storyName),
        escapeCsv(story.storyId),
        errors.toString(),
        warnings.toString(),
        escapeCsv(issues),
      ];
      rows.push(row.join(','));
    }
  }

  return rows.join('\n');
}

/**
 * Escape a value for CSV output
 */
function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

/**
 * Main scan-storybook command
 */
export async function scanStorybookCommand(
  options: ScanStorybookOptions = {}
): Promise<AllyReport | null> {
  printBanner();

  const {
    url = 'http://localhost:6006',
    timeout = 10000,
    filter,
    format = 'default',
    output = '.ally',
    standard = DEFAULT_STANDARD,
  } = options;

  console.log(chalk.cyan(`Scanning Storybook at ${url}...`));
  console.log();

  // Fetch stories index
  const fetchSpinner = createSpinner('Fetching stories index...');
  fetchSpinner.start();

  let stories: StorybookEntry[];
  try {
    stories = await fetchStoriesIndex(url);
    fetchSpinner.succeed(`Found ${stories.length} stories`);
  } catch (error) {
    fetchSpinner.fail('Failed to fetch stories index');
    printError(error instanceof Error ? error.message : String(error));
    return null;
  }

  // Apply filter if provided
  if (filter) {
    const originalCount = stories.length;
    stories = filterStories(stories, filter);
    printInfo(`Filtered to ${stories.length} stories matching "${filter}" (from ${originalCount})`);
  }

  if (stories.length === 0) {
    printWarning('No stories found to scan');
    return null;
  }

  // Group by component
  const groupedStories = groupStoriesByComponent(stories);

  // Initialize scanner
  const scanner = new AccessibilityScanner(timeout);
  const componentResults: ComponentResults[] = [];
  const allScanResults: ScanResult[] = [];

  try {
    await scanner.init();

    let scannedCount = 0;
    const totalStories = stories.length;

    // Scan each component's stories
    for (const [componentTitle, componentStories] of groupedStories) {
      const storyResults: StoryResult[] = [];

      for (const story of componentStories) {
        scannedCount++;
        const storyUrl = getStoryIframeUrl(url, story.id);

        const scanSpinner = createSpinner(
          `[${scannedCount}/${totalStories}] Scanning ${componentTitle}/${story.name}...`
        );
        scanSpinner.start();

        try {
          // Scan with retry for transient errors
          const result = await withRetry(
            () => scanner.scanUrl(storyUrl, standard),
            {
              maxRetries: 2,
              baseDelayMs: 500,
              onRetry: (attempt, error, delayMs) => {
                scanSpinner.stop();
                printWarning(
                  `Retry ${attempt}/2 for ${story.name} after ${delayMs / 1000}s (${error.message})`
                );
                scanSpinner.start();
              },
            }
          );

          // Tag the result with story metadata
          result.url = storyUrl;
          result.file = `${componentTitle}/${story.name}`;

          storyResults.push({
            storyId: story.id,
            storyName: story.name,
            componentTitle: componentTitle,
            scanResult: result,
          });

          allScanResults.push(result);

          const { errors, warnings } = countIssues(result);
          if (errors > 0) {
            scanSpinner.fail(`${componentTitle}/${story.name}: ${errors} errors, ${warnings} warnings`);
          } else if (warnings > 0) {
            scanSpinner.warn(`${componentTitle}/${story.name}: ${warnings} warnings`);
          } else {
            scanSpinner.succeed(`${componentTitle}/${story.name}: No issues`);
          }
        } catch (error) {
          scanSpinner.fail(`${componentTitle}/${story.name}: Failed to scan`);
          const errorMessage = error instanceof Error ? error.message : String(error);
          printError(`  ${errorMessage}`);

          storyResults.push({
            storyId: story.id,
            storyName: story.name,
            componentTitle: componentTitle,
            scanResult: null,
            error: errorMessage,
          });
        }
      }

      // Calculate component totals
      let componentErrors = 0;
      let componentWarnings = 0;
      for (const storyResult of storyResults) {
        const { errors, warnings } = countIssues(storyResult.scanResult);
        componentErrors += errors;
        componentWarnings += warnings;
      }

      componentResults.push({
        title: componentTitle,
        stories: storyResults,
        totalErrors: componentErrors,
        totalWarnings: componentWarnings,
      });
    }

    // Calculate overall totals
    let totalErrors = 0;
    let totalWarnings = 0;
    let passingStories = 0;

    for (const component of componentResults) {
      totalErrors += component.totalErrors;
      totalWarnings += component.totalWarnings;
      for (const story of component.stories) {
        const { errors, warnings } = countIssues(story.scanResult);
        if (errors === 0 && warnings === 0 && story.scanResult) {
          passingStories++;
        }
      }
    }

    // Output results based on format
    if (format === 'json') {
      const report = createReport(allScanResults);
      console.log(JSON.stringify(report, null, 2));
      return report;
    } else if (format === 'csv') {
      const csvOutput = convertToCsv(componentResults);
      console.log(csvOutput);
      // Still create and return the report
      const report = createReport(allScanResults);
      return report;
    } else {
      // Default tree format
      printComponentTree(componentResults);
      printStorybookSummary(
        componentResults,
        stories.length,
        passingStories,
        totalErrors,
        totalWarnings
      );

      // Create and save the report
      const report = createReport(allScanResults);

      // Print the standard summary box
      if (allScanResults.length > 0) {
        printSummary(report.summary);
      }

      // Save report
      await saveReport(report, output, componentResults);

      return report;
    }
  } catch (error) {
    printError(`Scan failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  } finally {
    await scanner.close();
  }
}

/**
 * Save the scan report to disk
 */
async function saveReport(
  report: AllyReport,
  outputDir: string,
  componentResults: ComponentResults[]
): Promise<void> {
  try {
    // Ensure output directory exists
    if (!existsSync(outputDir)) {
      await mkdir(outputDir, { recursive: true });
    }

    // Save standard JSON report
    const reportPath = resolve(outputDir, 'storybook-scan.json');
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    printSuccess(`Report saved to ${reportPath}`);

    // Also save as scan.json for compatibility with other commands
    const defaultPath = resolve(outputDir, 'scan.json');
    await writeFile(defaultPath, JSON.stringify(report, null, 2));
    printInfo(`Also saved to ${defaultPath} for use with other ally commands`);

    // Save component summary
    const summaryPath = resolve(outputDir, 'storybook-summary.json');
    const summary = {
      scanDate: report.scanDate,
      components: componentResults.map(c => ({
        title: c.title,
        stories: c.stories.map(s => ({
          id: s.storyId,
          name: s.storyName,
          errors: countIssues(s.scanResult).errors,
          warnings: countIssues(s.scanResult).warnings,
          issues: s.scanResult?.violations.map(v => v.id) || [],
        })),
        totalErrors: c.totalErrors,
        totalWarnings: c.totalWarnings,
      })),
    };
    await writeFile(summaryPath, JSON.stringify(summary, null, 2));
    printInfo(`Component summary saved to ${summaryPath}`);
  } catch (error) {
    printError(`Failed to save report: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export default scanStorybookCommand;
