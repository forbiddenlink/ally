/**
 * ally scan command - Scans files for accessibility violations
 */

import { resolve, relative } from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import {
  AccessibilityScanner,
  findHtmlFiles,
  findComponentFiles,
  createReport,
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
import type { ScanResult, AllyReport } from '../types/index.js';

interface ScanCommandOptions {
  output?: string;
  url?: string;
  json?: boolean;
  verbose?: boolean;
}

export async function scanCommand(
  targetPath: string = '.',
  options: ScanCommandOptions = {}
): Promise<AllyReport | null> {
  printBanner();

  const { output = '.ally', url, json = false, verbose = false } = options;

  // URL scanning mode
  if (url) {
    return await scanUrl(url, output, json, verbose);
  }

  // File scanning mode
  return await scanFiles(targetPath, output, json, verbose);
}

async function scanUrl(
  url: string,
  outputDir: string,
  json: boolean,
  verbose: boolean
): Promise<AllyReport | null> {
  const spinner = createSpinner(`Scanning ${url}...`);
  spinner.start();

  const scanner = new AccessibilityScanner();

  try {
    await scanner.init();
    const result = await scanner.scanUrl(url);

    spinner.succeed(`Scanned ${url}`);

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
    await saveReport(report, outputDir);

    if (json) {
      console.log(JSON.stringify(report, null, 2));
    }

    return report;
  } catch (error) {
    spinner.fail(`Failed to scan ${url}`);
    printError(error instanceof Error ? error.message : String(error));
    return null;
  } finally {
    await scanner.close();
  }
}

async function scanFiles(
  targetPath: string,
  outputDir: string,
  json: boolean,
  verbose: boolean
): Promise<AllyReport | null> {
  const absolutePath = resolve(targetPath);

  // Find files
  const findSpinner = createSpinner('Finding files to scan...');
  findSpinner.start();

  const htmlFiles = await findHtmlFiles(absolutePath);
  const componentFiles = await findComponentFiles(absolutePath);
  const allFiles = [...htmlFiles];

  if (allFiles.length === 0) {
    findSpinner.warn('No HTML files found to scan');
    printInfo('Tip: ally scan works best with HTML files. For React/Vue components, run your dev server and use: ally scan --url http://localhost:3000');
    return null;
  }

  findSpinner.succeed(`Found ${allFiles.length} HTML file${allFiles.length === 1 ? '' : 's'}`);

  if (componentFiles.length > 0) {
    printInfo(`Also found ${componentFiles.length} component files (use --url to scan rendered output)`);
  }

  // Scan files
  const scanSpinner = createSpinner(`Scanning ${allFiles.length} files...`);
  scanSpinner.start();

  const scanner = new AccessibilityScanner();
  const results: ScanResult[] = [];

  try {
    await scanner.init();

    for (let i = 0; i < allFiles.length; i++) {
      const file = allFiles[i];
      const relPath = relative(absolutePath, file);
      scanSpinner.text = `Scanning ${relPath} (${i + 1}/${allFiles.length})`;

      try {
        const result = await scanner.scanHtmlFile(file);
        results.push(result);
      } catch (error) {
        printError(`Failed to scan ${relPath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    scanSpinner.succeed(`Scanned ${results.length} files`);

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
    await saveReport(report, outputDir);

    if (json) {
      console.log(JSON.stringify(report, null, 2));
    }

    return report;
  } catch (error) {
    scanSpinner.fail('Scan failed');
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

async function saveReport(report: AllyReport, outputDir: string): Promise<void> {
  try {
    // Ensure output directory exists
    if (!existsSync(outputDir)) {
      await mkdir(outputDir, { recursive: true });
    }

    const reportPath = resolve(outputDir, 'scan.json');
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    printSuccess(`Report saved to ${reportPath}`);

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
