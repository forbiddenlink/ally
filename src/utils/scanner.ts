/**
 * Accessibility scanner using axe-core and Puppeteer
 */

import puppeteer, { type Browser, type Page } from 'puppeteer';
import { AxePuppeteer } from '@axe-core/puppeteer';
import { glob } from 'glob';
import { readFile } from 'fs/promises';
import { resolve, extname } from 'path';
import type { ScanResult, Violation, Severity, AllyReport, ReportSummary } from '../types/index.js';

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

export class AccessibilityScanner {
  private browser: Browser | null = null;

  async init(): Promise<void> {
    this.browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async scanHtmlFile(filePath: string, standard: WcagStandard = DEFAULT_STANDARD): Promise<ScanResult> {
    if (!this.browser) {
      throw new Error('Scanner not initialized. Call init() first.');
    }

    const page = await this.browser.newPage();

    try {
      const absolutePath = resolve(filePath);
      const fileUrl = `file://${absolutePath}`;

      await page.goto(fileUrl, { waitUntil: 'load', timeout: 30000 });

      // Wait for page to be ready
      await page.waitForSelector('body');

      const tags = standardToTags[standard];
      const results = await new AxePuppeteer(page)
        .withTags(tags)
        .analyze();

      const violations: Violation[] = results.violations.map((v) => ({
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
  }

  async scanUrl(url: string, standard: WcagStandard = DEFAULT_STANDARD): Promise<ScanResult> {
    if (!this.browser) {
      throw new Error('Scanner not initialized. Call init() first.');
    }

    const page = await this.browser.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      const tags = standardToTags[standard];
      const results = await new AxePuppeteer(page)
        .withTags(tags)
        .analyze();

      const violations: Violation[] = results.violations.map((v) => ({
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
  }

  async scanHtmlString(html: string, identifier: string = 'inline', standard: WcagStandard = DEFAULT_STANDARD): Promise<ScanResult> {
    if (!this.browser) {
      throw new Error('Scanner not initialized. Call init() first.');
    }

    const page = await this.browser.newPage();

    try {
      await page.setContent(html, { waitUntil: 'domcontentloaded' });

      const tags = standardToTags[standard];
      const results = await new AxePuppeteer(page)
        .withTags(tags)
        .analyze();

      const violations: Violation[] = results.violations.map((v) => ({
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
  }

  /**
   * Take a screenshot of a URL with color blindness simulation applied
   */
  async simulateColorBlindness(
    url: string,
    type: ColorBlindnessType,
    outputPath: string
  ): Promise<void> {
    if (!this.browser) {
      throw new Error('Scanner not initialized. Call init() first.');
    }

    const page = await this.browser.newPage();

    try {
      // Set a reasonable viewport size
      await page.setViewport({ width: 1280, height: 800 });

      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      // Get the SVG filter for the specified color blindness type
      const svgFilter = COLOR_BLINDNESS_FILTERS[type];

      // Inject the SVG filter and apply it to the entire page
      await page.addStyleTag({
        content: `
          /* Inject SVG filter as data URI */
          html::before {
            content: '';
            position: fixed;
            top: 0;
            left: 0;
            width: 0;
            height: 0;
            background-image: url('data:image/svg+xml,${encodeURIComponent(svgFilter.trim())}');
          }

          /* Apply filter to the entire page */
          html {
            filter: url('data:image/svg+xml,${encodeURIComponent(svgFilter.trim())}#${type}');
          }
        `,
      });

      // Give the filter a moment to apply
      await new Promise(resolve => setTimeout(resolve, 100));

      // Take screenshot
      await page.screenshot({
        path: outputPath,
        fullPage: true,
      });
    } finally {
      await page.close();
    }
  }
}

/** Default ignore patterns applied to all scans */
const DEFAULT_IGNORE = ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**'];

export async function findHtmlFiles(targetPath: string, extraIgnore: string[] = []): Promise<string[]> {
  const patterns = SUPPORTED_EXTENSIONS.map((ext) => `**/*${ext}`);
  const files = await glob(patterns, {
    cwd: targetPath,
    ignore: [...DEFAULT_IGNORE, ...extraIgnore],
    absolute: true,
  });
  return files;
}

export async function findComponentFiles(targetPath: string, extraIgnore: string[] = []): Promise<string[]> {
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
