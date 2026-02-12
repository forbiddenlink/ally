/**
 * ally scan command - Scans files for accessibility violations
 */

import { resolve, relative } from 'path';
import { mkdir, writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import cliProgress from 'cli-progress';
import {
  AccessibilityScanner,
  findHtmlFiles,
  findComponentFiles,
  createReport,
  type ColorBlindnessType,
  type WcagStandard,
  type BrowserType,
  DEFAULT_STANDARD,
  DEFAULT_TIMEOUT,
  DEFAULT_BATCH_SIZE,
  standardToTags,
} from '../utils/scanner.js';
import {
  getCachedResult,
  cacheResult,
  clearCache,
} from '../utils/cache.js';
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
  detectProject,
  countProjectFiles,
  getProjectDescription,
  type ProjectInfo,
} from '../utils/detect.js';
import {
  suggestUrl,
  formatScanError,
  isPuppeteerError,
} from '../utils/errors.js';
import {
  handleErrorWithEnhancement,
  throwEnhancedError,
} from '../utils/enhanced-errors.js';
import { loadConfig, loadIgnorePatterns, type AllyConfig } from '../utils/config.js';
import {
  saveHistoryEntry as saveHistoryTracking,
} from '../utils/history-tracking.js';
import {
  sortByImpact,
  groupByImpact,
  detectPageContext,
  type ImpactScore,
} from '../utils/impact-scores.js';
import type { ScanResult, AllyReport, Violation, Severity } from '../types/index.js';

/**
 * Check if colors should be disabled (for CI environments or NO_COLOR)
 */
function isNoColor(): boolean {
  return !!(process.env.NO_COLOR || process.env.CI || !process.stdout.isTTY);
}

type OutputFormat = 'json' | 'sarif' | 'junit' | 'csv';

/**
 * Print CI-friendly summary line
 * Errors = critical + serious, Warnings = moderate + minor
 */
function printCiSummary(summary: { bySeverity: Record<string, number> }): void {
  const errors = (summary.bySeverity.critical ?? 0) + (summary.bySeverity.serious ?? 0);
  const warnings = (summary.bySeverity.moderate ?? 0) + (summary.bySeverity.minor ?? 0);
  const symbol = errors > 0 ? '\u2717' : '\u2713';
  console.log(`${symbol} ${errors} error${errors !== 1 ? 's' : ''}, ${warnings} warning${warnings !== 1 ? 's' : ''}`);
}

interface ScanCommandOptions {
  output?: string;
  url?: string;
  json?: boolean;
  verbose?: boolean;
  format?: OutputFormat;
  simulate?: ColorBlindnessType;
  standard?: WcagStandard;
  timeout?: number;
  noCache?: boolean;
  ci?: boolean;
  browser?: BrowserType;
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
  const ci = options.ci ?? false;

  if (!ci) {
    printBanner();
  }

  // Load config file (if exists)
  let config: AllyConfig = {};
  try {
    const { config: loadedConfig, configPath } = await loadConfig();
    config = loadedConfig;
    if (configPath && !ci) {
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

  // Load ignore patterns from .allyignore
  const { patterns: ignorePatterns, ignorePath } = await loadIgnorePatterns();
  // Merge with config ignore patterns
  const allIgnorePatterns = [...ignorePatterns, ...(config.scan?.ignore ?? [])];
  if (ignorePath && !ci) {
    printInfo(`Using ignore patterns from ${ignorePath}`);
  }

  const { url, json = false, verbose = false, simulate, timeout, browser = 'chromium' } = options;
  const mergedTimeout = timeout ?? DEFAULT_TIMEOUT;
  const mergedBrowser = browser;

  // URL scanning mode
  if (url) {
    return await scanUrl(url, mergedOutput, json, verbose, mergedFormat, simulate, mergedStandard, mergedTimeout, ci, mergedBrowser);
  }

  // File scanning mode
  const noCache = options.noCache ?? false;

  // Auto-detect project type when using default path
  let projectInfo: ProjectInfo | null = null;
  if (targetPath === '.') {
    const absolutePath = resolve(targetPath);
    projectInfo = await detectProject(absolutePath);

    if (!ci && projectInfo.type !== 'unknown') {
      const description = getProjectDescription(projectInfo.type);
      const fileCount = await countProjectFiles(absolutePath, projectInfo.patterns);

      printSuccess(`Detected: ${description}`);
      printInfo(`Scanning: ${projectInfo.patterns.join(', ')}`);
      printInfo(`Found: ${fileCount} ${projectInfo.type === 'html' ? 'HTML' : 'component'} files`);
      console.log();
    }
  }

  return await scanFiles(targetPath, mergedOutput, json, verbose, mergedFormat, mergedStandard, allIgnorePatterns, mergedTimeout, noCache, ci, projectInfo, mergedBrowser);
}

async function scanUrl(
  url: string,
  outputDir: string,
  json: boolean,
  verbose: boolean,
  format?: OutputFormat,
  simulate?: ColorBlindnessType,
  standard: WcagStandard = DEFAULT_STANDARD,
  timeout: number = DEFAULT_TIMEOUT,
  ci: boolean = false,
  browser: BrowserType = 'chromium'
): Promise<AllyReport | null> {
  let spinner: ReturnType<typeof createSpinner> | null = null;
  const browserLabel = browser !== 'chromium' ? ` [${browser}]` : '';
  if (!ci) {
    spinner = createSpinner(`Scanning ${url} (${standard})${browserLabel}...`);
    spinner.start();
  }

  const scanner = new AccessibilityScanner(timeout, browser);

  try {
    await scanner.init();
    const result = await scanner.scanUrl(url, standard);

    if (spinner) {
      spinner.succeed(`Scanned ${url} using ${standard}`);
    }

    const report = createReport([result]);

    // Save to history for progress tracking
    await saveHistoryTracking(report, 'scan');

    if (ci) {
      // CI mode: only print summary line
      printCiSummary(report.summary);
    } else {
      // Print violations sorted by impact
      if (result.violations.length > 0) {
        console.log();
        
        // Sort violations by impact score
        const sortedViolations = sortByImpact(result.violations);
        
        for (const { violation, impact } of sortedViolations) {
          if (verbose || violation.impact === 'critical' || violation.impact === 'serious') {
            printViolation(violation, undefined, undefined, impact);
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
    }

    return report;
  } catch (error) {
    if (spinner) {
      spinner.fail(`Failed to scan ${url}`);
    }
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
  standard: WcagStandard = DEFAULT_STANDARD,
  ignorePatterns: string[] = [],
  timeout: number = DEFAULT_TIMEOUT,
  noCache: boolean = false,
  ci: boolean = false,
  projectInfo: ProjectInfo | null = null,
  browser: BrowserType = 'chromium'
): Promise<AllyReport | null> {
  const absolutePath = resolve(targetPath);
  const browserLabel = browser !== 'chromium' ? ` [${browser}]` : '';

  // Find files
  let findSpinner: ReturnType<typeof createSpinner> | null = null;
  if (!ci) {
    findSpinner = createSpinner(`Finding files to scan (${standard})${browserLabel}...`);
    findSpinner.start();
  }

  const htmlFiles = await findHtmlFiles(absolutePath, ignorePatterns);
  const componentFiles = await findComponentFiles(absolutePath, ignorePatterns);
  const allFiles = [...htmlFiles];

  if (allFiles.length === 0) {
    if (findSpinner) {
      findSpinner.stop();
    }
    if (!ci) {
      throwEnhancedError('NO_FILES_FOUND');
    }
    return null;
  }

  if (findSpinner) {
    findSpinner.succeed(`Found ${allFiles.length} HTML file${allFiles.length === 1 ? '' : 's'} (using ${standard})`);
  }

  if (!ci && componentFiles.length > 0) {
    printInfo(`Also found ${componentFiles.length} component files (use --url to scan rendered output)`);
  }

  // Scan files
  const scanner = new AccessibilityScanner(timeout, browser);
  const results: ScanResult[] = [];
  const errors: Array<{ path: string; error: string }> = [];
  let skippedCount = 0;

  // Use progress bar for multi-file scanning, or simple text for NO_COLOR
  // In CI mode, skip all progress indicators
  const useProgressBar = !ci && !isNoColor() && allFiles.length > 1;
  let progressBar: cliProgress.SingleBar | null = null;
  let scanSpinner: ReturnType<typeof createSpinner> | null = null;

  if (!ci) {
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
  }

  try {
    await scanner.init();

    // Phase 1: Check cache for all files (unless --no-cache)
    const filesToScan: string[] = [];
    if (!noCache) {
      for (const file of allFiles) {
        const cachedResult = await getCachedResult(file, standard);
        if (cachedResult) {
          results.push(cachedResult);
          skippedCount++;
        } else {
          filesToScan.push(file);
        }
      }
    } else {
      filesToScan.push(...allFiles);
    }

    // Phase 2: Scan uncached files in parallel batches
    if (filesToScan.length > 0) {
      let scannedCount = 0;
      const { results: scanResults, errors: scanErrors } = await scanner.scanHtmlFilesParallel(
        filesToScan,
        standard,
        DEFAULT_BATCH_SIZE,
        (completed, total, currentFile) => {
          scannedCount = completed;
          const relPath = currentFile ? relative(absolutePath, currentFile) : '';
          if (progressBar) {
            progressBar.update(skippedCount + completed, { filename: relPath });
          } else if (scanSpinner) {
            scanSpinner.text = `Scanning ${relPath} (${skippedCount + completed}/${allFiles.length})`;
          }
        }
      );

      // Add scan results
      results.push(...scanResults);

      // Add scan errors
      for (const err of scanErrors) {
        errors.push({ path: relative(absolutePath, err.path), error: err.error });
      }

      // Phase 3: Cache new results
      if (!noCache) {
        for (const result of scanResults) {
          if (result.file) {
            await cacheResult(result.file, result, standard);
          }
        }
      }
    }

    // Finish progress bar
    if (progressBar) {
      progressBar.update(allFiles.length, { filename: 'Done' });
      progressBar.stop();
    } else if (scanSpinner) {
      scanSpinner.succeed(`Scanned ${results.length} files`);
    }

    // Create report
    const report = createReport(results);

    // Save to history for progress tracking
    await saveHistoryTracking(report, 'scan');

    if (ci) {
      // CI mode: only print summary line
      printCiSummary(report.summary);
    } else {
      // Print any errors that occurred
      for (const err of errors) {
        printError(`Failed to scan ${err.path}: ${err.error}`);
      }

      console.log();
      const scannedCount = results.length - skippedCount;
      if (skippedCount > 0) {
        printSuccess(`Scanned ${scannedCount} files (${skippedCount} skipped, unchanged)`);
      } else {
        printSuccess(`Scanned ${results.length} files`);
      }

      // Print per-file results with impact scoring
      console.log();
      for (const result of results) {
        if (!result.file) continue;

        const relPath = relative(absolutePath, result.file);
        // Pass absolute path for clickable hyperlinks
        printFileHeader(relPath, result.violations.length, result.file);

        if (result.violations.length > 0) {
          // Detect page context from file content
          let pageContext = {};
          try {
            const fileContent = await readFile(result.file, 'utf-8');
            pageContext = detectPageContext(fileContent);
          } catch {
            // If file read fails, use empty context
          }
          
          // Sort violations by impact score
          const sortedViolations = sortByImpact(result.violations, pageContext);
          
          for (const { violation, impact } of sortedViolations) {
            if (verbose || violation.impact === 'critical' || violation.impact === 'serious') {
              printViolation(violation, relPath, result.file, impact);
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
  format?: OutputFormat,
  ci: boolean = false
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

    // Note: History tracking is now handled by saveHistoryTracking() after createReport()
  } catch (error) {
    printError(`Failed to save report: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export default scanCommand;
