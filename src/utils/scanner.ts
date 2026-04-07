/**
 * Accessibility scanner using axe-core with Puppeteer or Playwright
 * Also supports Pa11y for alternative WCAG testing
 */

import puppeteer, { type Browser, type Page } from 'puppeteer';
import { AxePuppeteer } from '@axe-core/puppeteer';
import axe from 'axe-core';
import pa11y from 'pa11y';
import { glob } from 'glob';
import { resolve, extname } from 'path';
import { stat } from 'fs/promises';
import type { ScanResult, Violation, Severity, AllyReport, ReportSummary } from '../types/index.js';
import {
  createBrowser,
  type BrowserAdapter,
  type PageAdapter,
  type BrowserType,
} from './browser.js';

// Re-export BrowserType for use in commands
export type { BrowserType } from './browser.js';

const SUPPORTED_EXTENSIONS = ['.html', '.htm'];
const COMPONENT_EXTENSIONS = ['.jsx', '.tsx', '.vue', '.svelte'];

// WCAG standard types
export type WcagStandard =
  | 'wcag2a'
  | 'wcag2aa'
  | 'wcag2aaa'
  | 'wcag21a'
  | 'wcag21aa'
  | 'wcag21aaa'
  | 'wcag22aa'
  | 'section508'
  | 'best-practice';

// Map standard names to axe-core tags
export const standardToTags: Record<WcagStandard, string[]> = {
  'wcag2a': ['wcag2a'],
  'wcag2aa': ['wcag2a', 'wcag2aa'],
  'wcag2aaa': ['wcag2a', 'wcag2aa', 'wcag2aaa'],
  'wcag21a': ['wcag2a', 'wcag21a'],
  'wcag21aa': ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
  'wcag21aaa': ['wcag2a', 'wcag2aa', 'wcag2aaa', 'wcag21a', 'wcag21aa', 'wcag21aaa'],
  'wcag22aa': ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
  'section508': ['section508'],
  'best-practice': ['best-practice'],
};

// Default standard
export const DEFAULT_STANDARD: WcagStandard = 'wcag22aa';

// Color blindness simulation types
export type ColorBlindnessType = 'protanopia' | 'deuteranopia' | 'tritanopia';

// SVG filter matrices for color blindness simulation
// These use feColorMatrix values adapted for CSS filter
const COLOR_BLINDNESS_FILTERS: Record<ColorBlindnessType, string> = {
  // Protanopia (red-blind)
  protanopia: `
    <svg xmlns="http://www.w3.org/2000/svg">
      <filter id="protanopia">
        <feColorMatrix type="matrix" values="
          0.567 0.433 0     0 0
          0.558 0.442 0     0 0
          0     0.242 0.758 0 0
          0     0     0     1 0
        "/>
      </filter>
    </svg>
  `,
  // Deuteranopia (green-blind)
  deuteranopia: `
    <svg xmlns="http://www.w3.org/2000/svg">
      <filter id="deuteranopia">
        <feColorMatrix type="matrix" values="
          0.625 0.375 0   0 0
          0.7   0.3   0   0 0
          0     0.3   0.7 0 0
          0     0     0   1 0
        "/>
      </filter>
    </svg>
  `,
  // Tritanopia (blue-blind)
  tritanopia: `
    <svg xmlns="http://www.w3.org/2000/svg">
      <filter id="tritanopia">
        <feColorMatrix type="matrix" values="
          0.95 0.05  0     0 0
          0    0.433 0.567 0 0
          0    0.475 0.525 0 0
          0    0     0     1 0
        "/>
      </filter>
    </svg>
  `,
};

/** Default page load timeout in milliseconds */
export const DEFAULT_TIMEOUT = 30000;

/** Default batch size for parallel scanning */
export const DEFAULT_BATCH_SIZE = 4;

/**
 * Split an array into chunks of a specified size
 */
function chunk<T>(arr: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size)
  );
}

/**
 * Result from parallel scanning - includes file path for error tracking
 */
export interface ParallelScanResult {
  result?: ScanResult;
  error?: { path: string; error: string };
}

/**
 * Callback for progress updates during parallel scanning
 */
export type ScanProgressCallback = (completed: number, total: number, currentFile?: string) => void;

/**
 * axe-core result types for type safety
 */
interface AxeResults {
  violations: Array<{
    id: string;
    impact?: string;
    description: string;
    help: string;
    helpUrl: string;
    tags: string[];
    nodes: Array<{
      html: string;
      target: Array<string | string[]>;
      failureSummary?: string;
    }>;
  }>;
  passes: unknown[];
  incomplete: unknown[];
}

/**
 * Run axe-core analysis on a Playwright page by injecting axe-core source
 */
async function runAxeOnPlaywrightPage(page: PageAdapter, tags: string[]): Promise<AxeResults> {
  // Get axe-core source code
  const axeSource = axe.source;

  // Get underlying page for direct evaluate access
  const underlyingPage = page.getUnderlyingPage() as {
    evaluate: <T>(fn: string | ((arg: unknown) => T), arg?: unknown) => Promise<T>;
  };

  // Inject axe-core source
  await underlyingPage.evaluate(axeSource);

  // Run axe with tags - pass tags as a single argument object
  const axeResults = await underlyingPage.evaluate((runTags) => {
    const tagsArray = runTags as string[];
    return (window as unknown as { axe: { run: (options: { runOnly: { type: string; values: string[] } }) => Promise<unknown> } }).axe.run({
      runOnly: {
        type: 'tag',
        values: tagsArray,
      },
    });
  }, tags);

  return axeResults as AxeResults;
}

/**
 * Map raw axe violations to our Violation format
 * Shared by both Puppeteer and Playwright code paths
 * Handles axe-core Result type (which may have null impact)
 */
function mapAxeViolations(axeViolations: unknown[]): Violation[] {
  return (axeViolations as Array<{
    id: string;
    impact: string | null | undefined;
    description: string;
    help: string;
    helpUrl: string;
    tags: string[];
    nodes: Array<{
      html: string;
      target: Array<string | string[]>;
      failureSummary?: string;
    }>;
  }>).map((v) => ({
    id: v.id,
    impact: (v.impact || 'minor') as Severity,
    description: v.description,
    help: v.help,
    helpUrl: v.helpUrl,
    tags: v.tags,
    nodes: v.nodes.map((n) => ({
      html: n.html,
      target: n.target.map(t => typeof t === 'string' ? t : t.join(' ')),
      failureSummary: n.failureSummary || '',
    })),
  }));
}

/**
 * Convert axe results to our Violation format
 */
function convertAxeResults(results: AxeResults): {
  violations: Violation[];
  passes: number;
  incomplete: number;
} {
  const violations = mapAxeViolations(results.violations);

  return {
    violations,
    passes: results.passes.length,
    incomplete: results.incomplete.length,
  };
}

export interface ScannerOptions {
  timeout?: number;
  browserType?: BrowserType;
  shadowDom?: boolean;
}

export class AccessibilityScanner {
  private browser: Browser | null = null;
  private browserAdapter: BrowserAdapter | null = null;
  private timeout: number;
  private browserType: BrowserType;
  private usePlaywright: boolean;
  private shadowDom: boolean;

  constructor(options: ScannerOptions | number = {}) {
    // Support both old signature (timeout: number) and new options object
    if (typeof options === 'number') {
      this.timeout = options;
      this.browserType = 'chromium';
      this.shadowDom = false;
    } else {
      this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
      this.browserType = options.browserType ?? 'chromium';
      this.shadowDom = options.shadowDom ?? false;
    }
    // Use Playwright for Firefox and WebKit, Puppeteer for Chromium (default)
    this.usePlaywright = this.browserType !== 'chromium';
  }

  async init(): Promise<void> {
    if (this.usePlaywright) {
      // Use browser abstraction for Playwright browsers
      this.browserAdapter = createBrowser(this.browserType);
      await this.browserAdapter.launch();
    } else {
      // Use Puppeteer directly for Chromium (faster, always available)
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }
  }

  async close(): Promise<void> {
    if (this.browserAdapter) {
      await this.browserAdapter.close();
      this.browserAdapter = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Get the browser type being used
   */
  getBrowserType(): BrowserType {
    return this.browserType;
  }

  async scanHtmlFile(filePath: string, standard: WcagStandard = DEFAULT_STANDARD): Promise<ScanResult> {
    const absolutePath = resolve(filePath);
    const fileUrl = `file://${absolutePath}`;
    const tags = standardToTags[standard];

    if (this.usePlaywright && this.browserAdapter) {
      // Playwright path
      const page = await this.browserAdapter.newPage();
      try {
        await page.goto(fileUrl, { waitUntil: 'load', timeout: this.timeout });
        await page.waitForSelector('body');

        const results = await runAxeOnPlaywrightPage(page, tags);
        const { violations, passes, incomplete } = convertAxeResults(results);

        return {
          url: fileUrl,
          file: filePath,
          timestamp: new Date().toISOString(),
          violations,
          passes,
          incomplete,
        };
      } finally {
        await page.close();
      }
    } else if (this.browser) {
      // Puppeteer path
      const page = await this.browser.newPage();
      try {
        await page.goto(fileUrl, { waitUntil: 'load', timeout: this.timeout });
        await page.waitForSelector('body');

        let axeBuilder = new AxePuppeteer(page).withTags(tags);
        if (this.shadowDom) {
          // Enable iframe scanning and selectors for better Shadow DOM/nested content support
          axeBuilder = axeBuilder.options({ iframes: true, selectors: true });
        }
        const results = await axeBuilder.analyze();

        const violations = mapAxeViolations(results.violations);

        return {
          url: fileUrl,
          file: filePath,
          timestamp: new Date().toISOString(),
          violations,
          passes: results.passes.length,
          incomplete: results.incomplete.length,
        };
      } finally {
        await page.close();
      }
    } else {
      throw new Error('Scanner not initialized. Call init() first.');
    }
  }

  async scanUrl(url: string, standard: WcagStandard = DEFAULT_STANDARD): Promise<ScanResult> {
    const tags = standardToTags[standard];

    if (this.usePlaywright && this.browserAdapter) {
      // Playwright path
      const page = await this.browserAdapter.newPage();
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: this.timeout });

        const results = await runAxeOnPlaywrightPage(page, tags);
        const { violations, passes, incomplete } = convertAxeResults(results);

        return {
          url,
          timestamp: new Date().toISOString(),
          violations,
          passes,
          incomplete,
        };
      } finally {
        await page.close();
      }
    } else if (this.browser) {
      // Puppeteer path
      const page = await this.browser.newPage();
      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: this.timeout });

        let axeBuilder = new AxePuppeteer(page).withTags(tags);
        if (this.shadowDom) {
          axeBuilder = axeBuilder.options({ iframes: true, selectors: true });
        }
        const results = await axeBuilder.analyze();

        const violations = mapAxeViolations(results.violations);

        return {
          url,
          timestamp: new Date().toISOString(),
          violations,
          passes: results.passes.length,
          incomplete: results.incomplete.length,
        };
      } finally {
        await page.close();
      }
    } else {
      throw new Error('Scanner not initialized. Call init() first.');
    }
  }

  async scanHtmlString(html: string, identifier: string = 'inline', standard: WcagStandard = DEFAULT_STANDARD): Promise<ScanResult> {
    const tags = standardToTags[standard];

    if (this.usePlaywright && this.browserAdapter) {
      // Playwright path
      const page = await this.browserAdapter.newPage();
      try {
        await page.setContent(html, { waitUntil: 'domcontentloaded' });

        const results = await runAxeOnPlaywrightPage(page, tags);
        const { violations, passes, incomplete } = convertAxeResults(results);

        return {
          url: identifier,
          file: identifier,
          timestamp: new Date().toISOString(),
          violations,
          passes,
          incomplete,
        };
      } finally {
        await page.close();
      }
    } else if (this.browser) {
      // Puppeteer path
      const page = await this.browser.newPage();
      try {
        await page.setContent(html, { waitUntil: 'domcontentloaded' });

        let axeBuilder = new AxePuppeteer(page).withTags(tags);
        if (this.shadowDom) {
          axeBuilder = axeBuilder.options({ iframes: true, selectors: true });
        }
        const results = await axeBuilder.analyze();

        const violations = mapAxeViolations(results.violations);

        return {
          url: identifier,
          file: identifier,
          timestamp: new Date().toISOString(),
          violations,
          passes: results.passes.length,
          incomplete: results.incomplete.length,
        };
      } finally {
        await page.close();
      }
    } else {
      throw new Error('Scanner not initialized. Call init() first.');
    }
  }

  /**
   * Scan multiple HTML files in parallel batches for improved performance
   * @param files Array of file paths to scan
   * @param standard WCAG standard to use for scanning
   * @param batchSize Number of files to scan concurrently (default: 4)
   * @param onProgress Optional callback for progress updates
   * @returns Array of scan results (successful) and errors (failed)
   */
  async scanHtmlFilesParallel(
    files: string[],
    standard: WcagStandard = DEFAULT_STANDARD,
    batchSize: number = DEFAULT_BATCH_SIZE,
    onProgress?: ScanProgressCallback
  ): Promise<{ results: ScanResult[]; errors: Array<{ path: string; error: string }> }> {
    if (!this.browser && !this.browserAdapter) {
      throw new Error('Scanner not initialized. Call init() first.');
    }

    const results: ScanResult[] = [];
    const errors: Array<{ path: string; error: string }> = [];
    const batches = chunk(files, batchSize);
    let completedCount = 0;

    for (const batch of batches) {
      // Scan files in this batch concurrently
      const batchPromises = batch.map(async (file): Promise<ParallelScanResult> => {
        try {
          const result = await this.scanHtmlFile(file, standard);
          return { result };
        } catch (error) {
          return {
            error: {
              path: file,
              error: error instanceof Error ? error.message : String(error),
            },
          };
        }
      });

      // Wait for all files in the batch to complete
      const batchResults = await Promise.all(batchPromises);

      // Aggregate results and errors
      for (const item of batchResults) {
        if (item.result) {
          results.push(item.result);
        } else if (item.error) {
          errors.push(item.error);
        }
        completedCount++;

        // Report progress after each file completes
        if (onProgress) {
          onProgress(completedCount, files.length, item.result?.file || item.error?.path);
        }
      }
    }

    return { results, errors };
  }

  /**
   * Extract all anchor links from a URL
   * This method provides type-safe access to browser pages for link extraction
   */
  async extractLinks(url: string): Promise<string[]> {
    if (this.usePlaywright && this.browserAdapter) {
      const page = await this.browserAdapter.newPage();
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: this.timeout });
        const underlyingPage = page.getUnderlyingPage() as {
          evaluate: <T>(fn: () => T) => Promise<T>;
        };
        return await underlyingPage.evaluate(() => {
          return Array.from(document.querySelectorAll('a[href]'))
            .map(a => (a as HTMLAnchorElement).href)
            .filter(href => href && !href.startsWith('javascript:'));
        });
      } finally {
        await page.close();
      }
    } else if (this.browser) {
      const page = await this.browser.newPage();
      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: this.timeout });
        return await page.evaluate(() => {
          return Array.from(document.querySelectorAll('a[href]'))
            .map(a => (a as HTMLAnchorElement).href)
            .filter(href => href && !href.startsWith('javascript:'));
        });
      } finally {
        await page.close();
      }
    }
    return [];
  }

  /**
   * Take a screenshot of a URL with color blindness simulation applied
   */
  async simulateColorBlindness(
    url: string,
    type: ColorBlindnessType,
    outputPath: string
  ): Promise<void> {
    if (this.usePlaywright && this.browserAdapter) {
      // Playwright path
      const page = await this.browserAdapter.newPage();
      try {
        await page.setViewport({ width: 1280, height: 800 });
        await page.goto(url, { waitUntil: 'networkidle', timeout: this.timeout });

        const svgFilter = COLOR_BLINDNESS_FILTERS[type];
        await page.addStyleTag({
          content: `
            html::before {
              content: '';
              position: fixed;
              top: 0;
              left: 0;
              width: 0;
              height: 0;
              background-image: url('data:image/svg+xml,${encodeURIComponent(svgFilter.trim())}');
            }
            html {
              filter: url('data:image/svg+xml,${encodeURIComponent(svgFilter.trim())}#${type}');
            }
          `,
        });

        await new Promise(resolve => setTimeout(resolve, 100));
        await page.screenshot({ path: outputPath, fullPage: true });
      } finally {
        await page.close();
      }
    } else if (this.browser) {
      // Puppeteer path
      const page = await this.browser.newPage();
      try {
        await page.setViewport({ width: 1280, height: 800 });
        await page.goto(url, { waitUntil: 'networkidle2', timeout: this.timeout });

        const svgFilter = COLOR_BLINDNESS_FILTERS[type];
        await page.addStyleTag({
          content: `
            html::before {
              content: '';
              position: fixed;
              top: 0;
              left: 0;
              width: 0;
              height: 0;
              background-image: url('data:image/svg+xml,${encodeURIComponent(svgFilter.trim())}');
            }
            html {
              filter: url('data:image/svg+xml,${encodeURIComponent(svgFilter.trim())}#${type}');
            }
          `,
        });

        await new Promise(resolve => setTimeout(resolve, 100));
        await page.screenshot({ path: outputPath, fullPage: true });
      } finally {
        await page.close();
      }
    } else {
      throw new Error('Scanner not initialized. Call init() first.');
    }
  }
}

/** Default ignore patterns applied to all scans */
const DEFAULT_IGNORE = ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**'];

export async function findHtmlFiles(targetPath: string, extraIgnore: string[] = []): Promise<string[]> {
  // Check if targetPath is a file (not a directory)
  try {
    const stats = await stat(targetPath);
    if (stats.isFile()) {
      // If it's a file with a supported extension, return it directly
      const ext = extname(targetPath).toLowerCase();
      if (SUPPORTED_EXTENSIONS.includes(ext)) {
        return [resolve(targetPath)];
      }
      // File exists but not a supported extension
      return [];
    }
  } catch {
    // Path doesn't exist or can't be accessed, fall through to glob
  }

  // It's a directory, use glob to find files
  const patterns = SUPPORTED_EXTENSIONS.map((ext) => `**/*${ext}`);
  const files = await glob(patterns, {
    cwd: targetPath,
    ignore: [...DEFAULT_IGNORE, ...extraIgnore],
    absolute: true,
  });
  return files;
}

export async function findComponentFiles(targetPath: string, extraIgnore: string[] = []): Promise<string[]> {
  // Check if targetPath is a file (not a directory)
  try {
    const stats = await stat(targetPath);
    if (stats.isFile()) {
      // If it's a file with a supported extension, return it directly
      const ext = extname(targetPath).toLowerCase();
      if (COMPONENT_EXTENSIONS.includes(ext)) {
        return [resolve(targetPath)];
      }
      // File exists but not a supported extension
      return [];
    }
  } catch {
    // Path doesn't exist or can't be accessed, fall through to glob
  }

  // It's a directory, use glob to find files
  const patterns = COMPONENT_EXTENSIONS.map((ext) => `**/*${ext}`);
  const files = await glob(patterns, {
    cwd: targetPath,
    ignore: [...DEFAULT_IGNORE, ...extraIgnore],
    absolute: true,
  });
  return files;
}

export function calculateScore(results: ScanResult[]): number {
  if (results.length === 0) return 100;

  const weights: Record<Severity, number> = {
    critical: 25,
    serious: 15,
    moderate: 5,
    minor: 1,
  };

  let totalPenalty = 0;
  let totalPasses = 0;

  for (const result of results) {
    totalPasses += result.passes;

    for (const violation of result.violations) {
      const weight = weights[violation.impact] || 1;
      const nodeCount = Math.min(violation.nodes.length, 10); // Cap at 10 to avoid extreme penalties
      totalPenalty += weight * nodeCount;
    }
  }

  // Score starts at 100 and decreases based on violations
  // Maximum penalty is capped at 100
  const score = Math.max(0, 100 - Math.min(totalPenalty, 100));
  return Math.round(score);
}

export function generateSummary(results: ScanResult[]): ReportSummary {
  const bySeverity: Record<Severity, number> = {
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
  };

  const issueCount: Map<string, { count: number; description: string; severity: Severity }> = new Map();

  let totalViolations = 0;

  for (const result of results) {
    for (const violation of result.violations) {
      totalViolations++;
      bySeverity[violation.impact] = (bySeverity[violation.impact] || 0) + 1;

      const existing = issueCount.get(violation.id);
      if (existing) {
        existing.count++;
      } else {
        issueCount.set(violation.id, {
          count: 1,
          description: violation.help,
          severity: violation.impact,
        });
      }
    }
  }

  // Sort by count and take top 5
  const topIssues = Array.from(issueCount.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([id, data]) => ({
      id,
      count: data.count,
      description: data.description,
      severity: data.severity,
    }));

  return {
    totalViolations,
    bySeverity,
    score: calculateScore(results),
    topIssues,
  };
}

export function createReport(results: ScanResult[]): AllyReport {
  return {
    version: '1.0.0',
    scanDate: new Date().toISOString(),
    totalFiles: results.length,
    results,
    summary: generateSummary(results),
  };
}

// Pa11y standard mapping
export type Pa11yStandard = 'WCAG2A' | 'WCAG2AA' | 'WCAG2AAA' | 'Section508';

/**
 * Map Pa11y issue type to severity
 * Pa11y uses: error, warning, notice
 */
function mapPa11yTypeToSeverity(type: string): Severity {
  switch (type) {
    case 'error':
      return 'serious';
    case 'warning':
      return 'moderate';
    case 'notice':
      return 'minor';
    default:
      return 'minor';
  }
}

/**
 * Convert Pa11y results to our Violation format
 */
function convertPa11yResults(issues: Array<{
  code: string;
  context: string;
  message: string;
  selector: string;
  type: string;
  typeCode: number;
}>): Violation[] {
  // Group issues by code to match axe-core's violation structure
  const groupedIssues = new Map<string, {
    code: string;
    message: string;
    type: string;
    nodes: Array<{ context: string; selector: string }>;
  }>();

  for (const issue of issues) {
    const existing = groupedIssues.get(issue.code);
    if (existing) {
      existing.nodes.push({ context: issue.context, selector: issue.selector });
    } else {
      groupedIssues.set(issue.code, {
        code: issue.code,
        message: issue.message,
        type: issue.type,
        nodes: [{ context: issue.context, selector: issue.selector }],
      });
    }
  }

  return Array.from(groupedIssues.values()).map((group) => ({
    id: group.code,
    impact: mapPa11yTypeToSeverity(group.type),
    description: group.message,
    help: group.message,
    helpUrl: `https://www.w3.org/WAI/WCAG21/Understanding/${group.code.replace(/\./g, '-').toLowerCase()}`,
    tags: [group.type],
    nodes: group.nodes.map((node) => ({
      html: node.context,
      target: [node.selector],
      failureSummary: group.message,
    })),
  }));
}

export interface Pa11yOptions {
  standard?: Pa11yStandard;
  includeWarnings?: boolean;
  includeNotices?: boolean;
  timeout?: number;
}

/**
 * Run Pa11y accessibility audit on a URL
 * Pa11y uses HTML_CodeSniffer under the hood for WCAG testing
 */
export async function runPa11yAudit(
  url: string,
  options: Pa11yOptions = {}
): Promise<ScanResult> {
  const {
    standard = 'WCAG2AA',
    includeWarnings = true,
    includeNotices = false,
    timeout = DEFAULT_TIMEOUT,
  } = options;

  const results = await pa11y(url, {
    standard,
    includeWarnings,
    includeNotices,
    timeout,
  });

  const violations = convertPa11yResults(results.issues);

  return {
    url: results.pageUrl,
    timestamp: new Date().toISOString(),
    violations,
    passes: 0, // Pa11y doesn't report passes
    incomplete: 0, // Pa11y doesn't have incomplete concept
  };
}

/**
 * Run Pa11y accessibility audit on a local HTML file
 */
export async function runPa11yAuditFile(
  filePath: string,
  options: Pa11yOptions = {}
): Promise<ScanResult> {
  const absolutePath = resolve(filePath);
  const fileUrl = `file://${absolutePath}`;

  const result = await runPa11yAudit(fileUrl, options);
  result.file = filePath;

  return result;
}

/**
 * Run Pa11y audits on multiple URLs in sequence
 */
export async function runPa11yAuditBatch(
  urls: string[],
  options: Pa11yOptions = {},
  onProgress?: ScanProgressCallback
): Promise<{ results: ScanResult[]; errors: Array<{ path: string; error: string }> }> {
  const results: ScanResult[] = [];
  const errors: Array<{ path: string; error: string }> = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      const result = await runPa11yAudit(url, options);
      results.push(result);
    } catch (error) {
      errors.push({
        path: url,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (onProgress) {
      onProgress(i + 1, urls.length, url);
    }
  }

  return { results, errors };
}
