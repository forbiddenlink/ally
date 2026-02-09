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

  async scanHtmlFile(filePath: string): Promise<ScanResult> {
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

      const results = await new AxePuppeteer(page)
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'])
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

  async scanUrl(url: string): Promise<ScanResult> {
    if (!this.browser) {
      throw new Error('Scanner not initialized. Call init() first.');
    }

    const page = await this.browser.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      const results = await new AxePuppeteer(page)
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'])
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

  async scanHtmlString(html: string, identifier: string = 'inline'): Promise<ScanResult> {
    if (!this.browser) {
      throw new Error('Scanner not initialized. Call init() first.');
    }

    const page = await this.browser.newPage();

    try {
      await page.setContent(html, { waitUntil: 'domcontentloaded' });

      const results = await new AxePuppeteer(page)
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'])
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
}

export async function findHtmlFiles(targetPath: string): Promise<string[]> {
  const patterns = SUPPORTED_EXTENSIONS.map((ext) => `**/*${ext}`);
  const files = await glob(patterns, {
    cwd: targetPath,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**'],
    absolute: true,
  });
  return files;
}

export async function findComponentFiles(targetPath: string): Promise<string[]> {
  const patterns = COMPONENT_EXTENSIONS.map((ext) => `**/*${ext}`);
  const files = await glob(patterns, {
    cwd: targetPath,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**'],
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
