/**
 * ally scan command - Scans files for accessibility violations
 */

import { resolve, relative } from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import cliProgress from 'cli-progress';
import {
  AccessibilityScanner,
  findHtmlFiles,
  findComponentFiles,
  createReport,
  type ColorBlindnessType,
  type WcagStandard,
  DEFAULT_STANDARD,
  standardToTags,
} from '../utils/scanner.js';
import {
  printBanner,
  createSpinner,
  printViolation,
  printSummary,
  printSuccess,
  printError,
  printInfo,
  printFileHeader,
} from '../utils/ui.js';
import {
  suggestUrl,
  formatScanError,
  isPuppeteerError,
} from '../utils/errors.js';
import { loadConfig, type AllyConfig } from '../utils/config.js';
import type { ScanResult, AllyReport, Violation, Severity } from '../types/index.js';

/**
 * Check if colors should be disabled (for CI environments or NO_COLOR)
 */
function isNoColor(): boolean {
  return !!(process.env.NO_COLOR || process.env.CI || !process.stdout.isTTY);
}

type OutputFormat = 'json' | 'sarif' | 'junit' | 'csv';

interface ScanCommandOptions {
  output?: string;
  url?: string;
  json?: boolean;
  verbose?: boolean;
  format?: OutputFormat;
  simulate?: ColorBlindnessType;
  standard?: WcagStandard;
}

// SARIF 2.1.0 types
interface SarifReport {
  $schema: string;
  version: string;
  runs: SarifRun[];
}

interface SarifRun {
  tool: {
    driver: {
      name: string;
      version: string;
      informationUri: string;
      rules: SarifRule[];
    };
  };
  results: SarifResult[];
}

interface SarifRule {
  id: string;
  name: string;
  shortDescription: { text: string };
  fullDescription: { text: string };
  helpUri: string;
  defaultConfiguration: {
    level: 'error' | 'warning' | 'note';
  };
  properties?: {
    tags?: string[];
  };
}

interface SarifResult {
  ruleId: string;
  ruleIndex: number;
  level: 'error' | 'warning' | 'note';
  message: { text: string };
  locations: SarifLocation[];
}

interface SarifLocation {
  physicalLocation: {
    artifactLocation: {
      uri: string;
      uriBaseId?: string;
    };
    region?: {
      startLine?: number;
      startColumn?: number;
      snippet?: { text: string };
    };
  };
}

export async function scanCommand(
  targetPath: string = '.',
  options: ScanCommandOptions = {}
): Promise<AllyReport | null> {
  printBanner();

  // Load config file (if exists)
  let config: AllyConfig = {};
  try {
    const { config: loadedConfig, configPath } = await loadConfig();
    config = loadedConfig;
    if (configPath) {
      printInfo(`Using config from ${configPath}`);
    }
  } catch (error) {
    printError(`Config error: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }

  // Merge config with CLI options (CLI takes precedence)
  const mergedOutput = options.output ?? config.report?.output ?? '.ally';
  const mergedFormat = options.format ?? (config.report?.format as OutputFormat | undefined);
  const mergedStandard = options.standard ?? (config.scan?.standard as WcagStandard | undefined) ?? DEFAULT_STANDARD;

  const { url, json = false, verbose = false, simulate } = options;

  // URL scanning mode
  if (url) {
    return await scanUrl(url, mergedOutput, json, verbose, mergedFormat, simulate, mergedStandard);
  }

  // File scanning mode
  return await scanFiles(targetPath, mergedOutput, json, verbose, mergedFormat, mergedStandard);
}

async function scanUrl(
  url: string,
  outputDir: string,
  json: boolean,
  verbose: boolean,
  format?: OutputFormat,
  simulate?: ColorBlindnessType,
  standard: WcagStandard = DEFAULT_STANDARD
): Promise<AllyReport | null> {
  const spinner = createSpinner(`Scanning ${url} (${standard})...`);
  spinner.start();

  const scanner = new AccessibilityScanner();

  try {
    await scanner.init();
    const result = await scanner.scanUrl(url, standard);

    spinner.succeed(`Scanned ${url} using ${standard}`);

    const report = createReport([result]);

    // Print violations
    if (result.violations.length > 0) {
      console.log();
      for (const violation of result.violations) {
        if (verbose || violation.impact === 'critical' || violation.impact === 'serious') {
          printViolation(violation);
        }
      }
    }

    // Print summary
    printSummary(report.summary);

    // Save report
    await saveReport(report, outputDir, format);

    // Color blindness simulation
    if (simulate) {
      const simSpinner = createSpinner(`Generating ${simulate} simulation...`);
      simSpinner.start();

      try {
        // Ensure output directory exists
        if (!existsSync(outputDir)) {
          await mkdir(outputDir, { recursive: true });
        }

        const screenshotPath = resolve(outputDir, `simulation-${simulate}.png`);
        await scanner.simulateColorBlindness(url, simulate, screenshotPath);
        simSpinner.succeed(`Color blindness simulation saved`);
        printInfo(`Screenshot saved to: ${screenshotPath}`);
      } catch (simError) {
        simSpinner.fail(`Failed to generate simulation`);
        printError(simError instanceof Error ? simError.message : String(simError));
      }
    }

    // Output to stdout if requested
    if (format === 'sarif') {
      const sarifReport = convertToSarif(report);
      console.log(JSON.stringify(sarifReport, null, 2));
    } else if (format === 'junit') {
      const junitReport = convertToJunit(report);
      console.log(junitReport);
    } else if (format === 'csv') {
      const csvReport = convertToCsv(report);
      console.log(csvReport);
    } else if (json) {
      console.log(JSON.stringify(report, null, 2));
    }

    return report;
  } catch (error) {
    spinner.fail(`Failed to scan ${url}`);
    const err = error instanceof Error ? error : new Error(String(error));
    if (isPuppeteerError(err)) {
      formatScanError(err, url);
    } else {
      printError(err.message);
    }
    return null;
  } finally {
    await scanner.close();
  }
}

async function scanFiles(
  targetPath: string,
  outputDir: string,
  json: boolean,
  verbose: boolean,
  format?: OutputFormat,
  standard: WcagStandard = DEFAULT_STANDARD
): Promise<AllyReport | null> {
  const absolutePath = resolve(targetPath);

  // Find files
  const findSpinner = createSpinner(`Finding files to scan (${standard})...`);
  findSpinner.start();

  const htmlFiles = await findHtmlFiles(absolutePath);
  const componentFiles = await findComponentFiles(absolutePath);
  const allFiles = [...htmlFiles];

  if (allFiles.length === 0) {
    findSpinner.stop();
    suggestUrl();
    return null;
  }

  findSpinner.succeed(`Found ${allFiles.length} HTML file${allFiles.length === 1 ? '' : 's'} (using ${standard})`);

  if (componentFiles.length > 0) {
    printInfo(`Also found ${componentFiles.length} component files (use --url to scan rendered output)`);
  }

  // Scan files
  const scanner = new AccessibilityScanner();
  const results: ScanResult[] = [];
  const errors: Array<{ path: string; error: string }> = [];

  // Use progress bar for multi-file scanning, or simple text for NO_COLOR
  const useProgressBar = !isNoColor() && allFiles.length > 1;
  let progressBar: cliProgress.SingleBar | null = null;
  let scanSpinner: ReturnType<typeof createSpinner> | null = null;

  if (useProgressBar) {
    progressBar = new cliProgress.SingleBar({
      format: 'Scanning |{bar}| {percentage}% | {value}/{total} files | {filename}',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true,
      clearOnComplete: true,
    }, cliProgress.Presets.shades_classic);
    progressBar.start(allFiles.length, 0, { filename: '' });
  } else {
    scanSpinner = createSpinner(`Scanning ${allFiles.length} files...`);
    scanSpinner.start();
  }

  try {
    await scanner.init();

    for (let i = 0; i < allFiles.length; i++) {
      const file = allFiles[i];
      const relPath = relative(absolutePath, file);

      if (progressBar) {
        progressBar.update(i, { filename: relPath });
      } else if (scanSpinner) {
        scanSpinner.text = `Scanning ${relPath} (${i + 1}/${allFiles.length})`;
      }

      try {
        const result = await scanner.scanHtmlFile(file, standard);
        results.push(result);
      } catch (error) {
        errors.push({ path: relPath, error: error instanceof Error ? error.message : String(error) });
      }
    }

    // Finish progress bar
    if (progressBar) {
      progressBar.update(allFiles.length, { filename: 'Done' });
      progressBar.stop();
    } else if (scanSpinner) {
      scanSpinner.succeed(`Scanned ${results.length} files`);
    }

    // Print any errors that occurred
    for (const err of errors) {
      printError(`Failed to scan ${err.path}: ${err.error}`);
    }

    console.log();
    printSuccess(`Scanned ${results.length} files`);

    // Create report
    const report = createReport(results);

    // Print per-file results
    console.log();
    for (const result of results) {
      if (!result.file) continue;

      const relPath = relative(absolutePath, result.file);
      printFileHeader(relPath, result.violations.length);

      if (result.violations.length > 0) {
        for (const violation of result.violations) {
          if (verbose || violation.impact === 'critical' || violation.impact === 'serious') {
            printViolation(violation, relPath);
          }
        }
      }
    }

    // Print summary
    printSummary(report.summary);

    // Save report
    await saveReport(report, outputDir, format);

    // Output to stdout if requested
    if (format === 'sarif') {
      const sarifReport = convertToSarif(report);
      console.log(JSON.stringify(sarifReport, null, 2));
    } else if (format === 'junit') {
      const junitReport = convertToJunit(report);
      console.log(junitReport);
    } else if (format === 'csv') {
      const csvReport = convertToCsv(report);
      console.log(csvReport);
    } else if (json) {
      console.log(JSON.stringify(report, null, 2));
    }

    return report;
  } catch (error) {
    // Clean up progress indicators on error
    if (progressBar) {
      progressBar.stop();
    } else if (scanSpinner) {
      scanSpinner.fail('Scan failed');
    }
    printError(error instanceof Error ? error.message : String(error));
    return null;
  } finally {
    await scanner.close();
  }
}

interface HistoryEntry {
  date: string;
  score: number;
  violations: number;
  files: number;
}

/**
 * Map axe-core severity to SARIF level
 */
function severityToSarifLevel(severity: Severity): 'error' | 'warning' | 'note' {
  switch (severity) {
    case 'critical':
    case 'serious':
      return 'error';
    case 'moderate':
      return 'warning';
    case 'minor':
    default:
      return 'note';
  }
}

/**
 * Convert AllyReport to SARIF 2.1.0 format for GitHub Code Scanning integration
 */
function convertToSarif(report: AllyReport): SarifReport {
  // Collect unique rules from all violations
  const ruleMap = new Map<string, { violation: Violation; severity: Severity }>();

  for (const result of report.results) {
    for (const violation of result.violations) {
      if (!ruleMap.has(violation.id)) {
        ruleMap.set(violation.id, { violation, severity: violation.impact });
      }
    }
  }

  // Build rules array
  const rules: SarifRule[] = [];
  const ruleIndexMap = new Map<string, number>();

  Array.from(ruleMap.entries()).forEach(([ruleId, { violation, severity }]) => {
    ruleIndexMap.set(ruleId, rules.length);
    rules.push({
      id: ruleId,
      name: ruleId,
      shortDescription: { text: violation.help },
      fullDescription: { text: violation.description },
      helpUri: violation.helpUrl,
      defaultConfiguration: {
        level: severityToSarifLevel(severity),
      },
      properties: {
        tags: violation.tags,
      },
    });
  });

  // Build results array
  const results: SarifResult[] = [];

  for (const scanResult of report.results) {
    const fileUri = scanResult.file
      ? relative(process.cwd(), scanResult.file)
      : scanResult.url;

    for (const violation of scanResult.violations) {
      const ruleIndex = ruleIndexMap.get(violation.id) ?? 0;

      // Create a result for each affected node
      for (const node of violation.nodes) {
        const locations: SarifLocation[] = [
          {
            physicalLocation: {
              artifactLocation: {
                uri: fileUri,
                uriBaseId: '%SRCROOT%',
              },
              region: {
                startLine: 1, // Line info not available from axe-core
                snippet: { text: node.html },
              },
            },
          },
        ];

        results.push({
          ruleId: violation.id,
          ruleIndex,
          level: severityToSarifLevel(violation.impact),
          message: {
            text: `${violation.help}. ${node.failureSummary}`,
          },
          locations,
        });
      }
    }
  }

  return {
    $schema:
      'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'ally',
            version: '1.0.0',
            informationUri: 'https://github.com/lizthegrey/ally',
            rules,
          },
        },
        results,
      },
    ],
  };
}

/**
 * Escape XML special characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Convert AllyReport to JUnit XML format for CI/CD tools (Jenkins, GitLab, etc.)
 * Each violation is represented as a test failure
 */
function convertToJunit(report: AllyReport): string {
  // Count total tests (violations) and failures
  let totalTests = 0;
  let totalFailures = 0;

  // Collect all violations with their file context
  const testcases: string[] = [];

  for (const result of report.results) {
    const fileUri = result.file
      ? relative(process.cwd(), result.file)
      : result.url || 'unknown';

    for (const violation of result.violations) {
      for (const node of violation.nodes) {
        totalTests++;
        totalFailures++;

        const wcagTags = violation.tags.filter(t => t.startsWith('wcag')).join(', ');
        const failureMessage = escapeXml(`${violation.help}. ${node.failureSummary || ''}`);
        const failureDetails = escapeXml(
          `File: ${fileUri}\n` +
          `Selector: ${node.target.join(' > ')}\n` +
          `HTML: ${node.html}\n` +
          `WCAG: ${wcagTags}\n` +
          `Help: ${violation.helpUrl}`
        );

        testcases.push(
          `    <testcase name="${escapeXml(violation.id)}" classname="${escapeXml(violation.impact)}" time="0">\n` +
          `      <failure message="${failureMessage}" type="${escapeXml(violation.impact)}">\n` +
          `${failureDetails}\n` +
          `      </failure>\n` +
          `    </testcase>`
        );
      }
    }
  }

  // Build the JUnit XML
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites name="ally-a11y" tests="${totalTests}" failures="${totalFailures}" errors="0" time="0">`,
    `  <testsuite name="accessibility" tests="${totalTests}" failures="${totalFailures}" errors="0" skipped="0" time="0">`,
    ...testcases,
    '  </testsuite>',
    '</testsuites>',
  ].join('\n');

  return xml;
}

/**
 * Escape a value for CSV output
 */
function escapeCsv(value: string): string {
  // If value contains comma, quote, or newline, wrap in quotes and escape internal quotes
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

/**
 * Convert AllyReport to CSV format
 * Headers: file,violation_id,impact,description,selector,wcag,help_url
 */
function convertToCsv(report: AllyReport): string {
  const headers = ['file', 'violation_id', 'impact', 'description', 'selector', 'wcag', 'help_url'];
  const rows: string[] = [headers.join(',')];

  for (const result of report.results) {
    const fileUri = result.file
      ? relative(process.cwd(), result.file)
      : result.url || 'unknown';

    for (const violation of result.violations) {
      const wcagTags = violation.tags.filter(t => t.startsWith('wcag')).join('; ');

      for (const node of violation.nodes) {
        const row = [
          escapeCsv(fileUri),
          escapeCsv(violation.id),
          escapeCsv(violation.impact),
          escapeCsv(violation.help),
          escapeCsv(node.target.join(' > ')),
          escapeCsv(wcagTags),
          escapeCsv(violation.helpUrl),
        ];
        rows.push(row.join(','));
      }
    }
  }

  return rows.join('\n');
}

async function saveReport(
  report: AllyReport,
  outputDir: string,
  format?: OutputFormat
): Promise<void> {
  try {
    // Ensure output directory exists
    if (!existsSync(outputDir)) {
      await mkdir(outputDir, { recursive: true });
    }

    // Always save the JSON report
    const reportPath = resolve(outputDir, 'scan.json');
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    printSuccess(`Report saved to ${reportPath}`);

    // Save format-specific reports if requested
    if (format === 'sarif') {
      const sarifReport = convertToSarif(report);
      const sarifPath = resolve(outputDir, 'scan.sarif');
      await writeFile(sarifPath, JSON.stringify(sarifReport, null, 2));
      printSuccess(`SARIF report saved to ${sarifPath}`);
    } else if (format === 'junit') {
      const junitReport = convertToJunit(report);
      const junitPath = resolve(outputDir, 'scan.xml');
      await writeFile(junitPath, junitReport);
      printSuccess(`JUnit report saved to ${junitPath}`);
    } else if (format === 'csv') {
      const csvReport = convertToCsv(report);
      const csvPath = resolve(outputDir, 'scan.csv');
      await writeFile(csvPath, csvReport);
      printSuccess(`CSV report saved to ${csvPath}`);
    }

    // Update history for progress tracking
    await updateHistory(outputDir, report);
  } catch (error) {
    printError(`Failed to save report: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function updateHistory(outputDir: string, report: AllyReport): Promise<void> {
  const historyPath = resolve(outputDir, 'history.json');
  let history: HistoryEntry[] = [];

  // Load existing history
  if (existsSync(historyPath)) {
    try {
      const content = await import('fs/promises').then(fs => fs.readFile(historyPath, 'utf-8'));
      history = JSON.parse(content);
    } catch {
      history = [];
    }
  }

  // Add new entry (limit to last 30 entries)
  const entry: HistoryEntry = {
    date: new Date().toISOString(),
    score: report.summary.score,
    violations: report.summary.totalViolations,
    files: report.totalFiles,
  };

  history.push(entry);
  if (history.length > 30) {
    history = history.slice(-30);
  }

  await writeFile(historyPath, JSON.stringify(history, null, 2));
}

export default scanCommand;
