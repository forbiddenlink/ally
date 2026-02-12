/**
 * ally crawl command - Crawls entire websites by following links
 */

import { resolve } from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { AccessibilityScanner, createReport, calculateScore } from '../utils/scanner.js';
import {
  printBanner,
  createSpinner,
  printSummary,
  printSuccess,
  printError,
  printInfo,
  printWarning,
} from '../utils/ui.js';
import { withRetry, isTransientError } from '../utils/retry.js';
import chalk from 'chalk';
import type { ScanResult, AllyReport } from '../types/index.js';

interface CrawlCommandOptions {
  depth?: number;
  limit?: number;
  sameOrigin?: boolean;
  output?: string;
}

interface CrawlProgress {
  current: number;
  total: number;
  url: string;
  violations: number;
  score: number;
}


/**
 * Normalize URL by removing hash and trailing slash
 */
function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove hash
    parsed.hash = '';
    // Remove trailing slash (except for root)
    let normalized = parsed.toString();
    if (normalized.endsWith('/') && parsed.pathname !== '/') {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return url;
  }
}

/**
 * Check if a URL is same-origin as the base URL
 */
function isSameOrigin(baseUrl: string, targetUrl: string): boolean {
  try {
    const base = new URL(baseUrl);
    const target = new URL(targetUrl);
    return base.origin === target.origin;
  } catch {
    return false;
  }
}

/**
 * Check if a URL should be crawled (is a valid page URL)
 */
function isValidPageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    // Only HTTP/HTTPS
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }

    // Skip common non-page extensions
    const skipExtensions = [
      '.pdf', '.zip', '.tar', '.gz', '.rar',
      '.jpg', '.jpeg', '.png', '.gif', '.svg', '.ico', '.webp',
      '.mp3', '.mp4', '.avi', '.mov', '.wmv',
      '.css', '.js', '.json', '.xml',
      '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    ];

    const pathname = parsed.pathname.toLowerCase();
    for (const ext of skipExtensions) {
      if (pathname.endsWith(ext)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Format a page result line for console output
 */
function formatPageResult(progress: CrawlProgress): string {
  const { current, total, url, violations, score } = progress;

  // Truncate URL if too long
  const maxUrlLength = 50;
  let displayUrl = url;
  if (displayUrl.length > maxUrlLength) {
    displayUrl = displayUrl.slice(0, maxUrlLength - 3) + '...';
  }

  // Color based on score
  let scoreColor = chalk.green;
  if (score < 50) scoreColor = chalk.red;
  else if (score < 75) scoreColor = chalk.yellow;

  const violationText = violations === 0
    ? chalk.green('0 violations')
    : violations === 1
      ? chalk.yellow('1 violation')
      : chalk.yellow(`${violations} violations`);

  return `[${current}/${total}] ${displayUrl} - ${violationText} (score: ${scoreColor(score.toString())})`;
}

export async function crawlCommand(
  startUrl: string,
  options: CrawlCommandOptions = {}
): Promise<AllyReport | null> {
  printBanner();

  const {
    depth = 2,
    limit = 10,
    sameOrigin = true,
    output = '.ally',
  } = options;

  // Validate URL
  let normalizedStartUrl: string;
  try {
    normalizedStartUrl = normalizeUrl(startUrl);
    new URL(normalizedStartUrl);
  } catch {
    printError(`Invalid URL: ${startUrl}`);
    return null;
  }

  console.log(chalk.cyan(`Crawling ${normalizedStartUrl} (depth: ${depth}, limit: ${limit})`));
  console.log();

  const scanner = new AccessibilityScanner();
  const visited = new Set<string>();
  const toVisit: Array<{ url: string; depth: number }> = [{ url: normalizedStartUrl, depth: 0 }];
  const results: ScanResult[] = [];

  try {
    await scanner.init();

    while (toVisit.length > 0 && results.length < limit) {
      const next = toVisit.shift();
      if (!next) break;

      const { url, depth: currentDepth } = next;
      const normalized = normalizeUrl(url);

      // Skip if already visited
      if (visited.has(normalized)) {
        continue;
      }
      visited.add(normalized);

      // Skip if not same origin and sameOrigin is enabled
      if (sameOrigin && !isSameOrigin(normalizedStartUrl, normalized)) {
        continue;
      }

      // Skip if not a valid page URL
      if (!isValidPageUrl(normalized)) {
        continue;
      }

      const pageNum = results.length + 1;
      const spinner = createSpinner(`[${pageNum}/${limit}] Scanning ${normalized}...`);
      spinner.start();

      try {
        // Scan the page for accessibility issues with retry for transient errors
        const result = await withRetry(
          () => scanner.scanUrl(normalized),
          {
            maxRetries: 3,
            baseDelayMs: 1000,
            onRetry: (attempt, error, delayMs) => {
              spinner.stop();
              printWarning(
                `Retry ${attempt}/3 for ${normalized} after ${delayMs / 1000}s (${error.message})`
              );
              spinner.start();
            },
          }
        );
        results.push(result);

        // Calculate score for this single result
        const pageScore = calculateScore([result]);

        spinner.stop();
        console.log(formatPageResult({
          current: pageNum,
          total: limit,
          url: normalized,
          violations: result.violations.length,
          score: pageScore,
        }));

        // Extract links if we haven't reached max depth
        if (currentDepth < depth) {
          const links = await scanner.extractLinks(normalized);

          // Add new links to the queue
          for (const link of links) {
            const normalizedLink = normalizeUrl(link);
            if (!visited.has(normalizedLink) && isValidPageUrl(normalizedLink)) {
              if (!sameOrigin || isSameOrigin(normalizedStartUrl, normalizedLink)) {
                // Check if already in queue
                const alreadyQueued = toVisit.some(item => normalizeUrl(item.url) === normalizedLink);
                if (!alreadyQueued) {
                  toVisit.push({ url: normalizedLink, depth: currentDepth + 1 });
                }
              }
            }
          }
        }
      } catch (error) {
        spinner.fail(`Failed to scan ${normalized}`);
        printError(error instanceof Error ? error.message : String(error));
      }
    }

    console.log();

    if (results.length === 0) {
      printError('No pages were successfully scanned');
      return null;
    }

    // Create combined report
    const report = createReport(results);

    // Print crawl summary
    console.log(chalk.bold(`Crawl complete: ${results.length} page${results.length === 1 ? '' : 's'} scanned`));

    // Calculate totals
    const totalViolations = results.reduce((sum, r) => sum + r.violations.length, 0);
    const avgScore = Math.round(results.reduce((sum, r) => sum + calculateScore([r]), 0) / results.length);

    console.log(chalk.dim(`Total violations: ${totalViolations}`));
    console.log(chalk.dim(`Average score: ${avgScore}`));
    console.log();

    // Print full summary
    printSummary(report.summary);

    // Save report
    await saveReport(report, output, normalizedStartUrl);

    return report;
  } catch (error) {
    printError(`Crawl failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  } finally {
    await scanner.close();
  }
}

async function saveReport(
  report: AllyReport,
  outputDir: string,
  startUrl: string
): Promise<void> {
  try {
    // Ensure output directory exists
    if (!existsSync(outputDir)) {
      await mkdir(outputDir, { recursive: true });
    }

    // Generate filename from URL
    const urlObj = new URL(startUrl);
    const safeHost = urlObj.hostname.replace(/[^a-z0-9]/gi, '-');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    // Save crawl report
    const reportPath = resolve(outputDir, `crawl-${safeHost}-${timestamp}.json`);
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    printSuccess(`Crawl report saved to ${reportPath}`);

    // Also save as the default scan.json for compatibility with other commands
    const defaultPath = resolve(outputDir, 'scan.json');
    await writeFile(defaultPath, JSON.stringify(report, null, 2));
    printInfo(`Also saved to ${defaultPath} for use with other ally commands`);
  } catch (error) {
    printError(`Failed to save report: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export default crawlCommand;
