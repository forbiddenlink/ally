import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { rmSync } from 'fs';
import { mkdirSync } from 'fs';
import { resolve } from 'path';
import {
  reportToBaseline,
  saveBaseline,
  loadBaseline,
  compareWithBaseline,
  formatRegression,
} from '../src/utils/baseline.js';
import type { AllyReport } from '../src/types/index.js';

// Create mockReport for testing
function createMockReport(violations: number): AllyReport {
  return {
    version: '1.0.0',
    scanDate: new Date().toISOString(),
    totalFiles: 1,
    results: [
      {
        file: '/test/file.html',
        url: undefined,
        timestamp: new Date().toISOString(),
        violations: Array(violations).fill({
          id: 'test-violation',
          impact: 'serious',
          description: 'Test violation',
          help: 'Test violation',
          helpUrl: 'https://example.com',
          tags: ['wcag2a'],
          nodes: [
            {
              target: ['div'],
              html: '<div></div>',
              failureSummary: 'Test failure',
            },
          ],
        }),
        passes: 0,
        incomplete: 0,
      },
    ],
    summary: {
      totalViolations: violations,
      bySeverity: {
        critical: Math.floor(violations * 0.3),
        serious: Math.floor(violations * 0.5),
        moderate: Math.floor(violations * 0.15),
        minor: Math.floor(violations * 0.05),
      },
      score: Math.max(0, 100 - violations * 10),
      topIssues: [
        {
          id: 'test-violation',
          count: violations,
          description: 'Test violation',
          severity: 'serious',
        },
      ],
    },
  };
}

describe('Baseline Management', () => {
  const testDir = resolve('.ally-test');

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch (_) {
      // Ignore cleanup errors
    }
  });

  it('converts report to baseline', () => {
    const report = createMockReport(10);
    const baseline = reportToBaseline(report);

    assert.strictEqual(baseline.summary.totalViolations, 10);
    assert.strictEqual(baseline.violations['/test/file.html'], 10);
    assert.ok(baseline.scores['/test/file.html'] <= 100);
  });

  it('saves and loads baseline', async () => {
    const report = createMockReport(5);
    await saveBaseline(report, testDir);
    const loaded = await loadBaseline(testDir);
    assert.ok(loaded !== null);
    assert.strictEqual(loaded?.summary.totalViolations, 5);
  });

  it('compares reports for improvements', () => {
    const oldReport = createMockReport(10);
    const baseline = reportToBaseline(oldReport);
    const newReport = createMockReport(5);
    const analysis = compareWithBaseline(newReport, baseline);
    assert.ok(analysis.improved > 0);
    assert.strictEqual(analysis.regressed, 0);
  });

  it('detects regressions', () => {
    const oldReport = createMockReport(5);
    const baseline = reportToBaseline(oldReport);
    const newReport = createMockReport(10);
    const analysis = compareWithBaseline(newReport, baseline);
    assert.ok(analysis.regressed > 0);
    assert.strictEqual(analysis.improved, 0);
  });

  it('formats regression analysis', () => {
    const oldReport = createMockReport(10);
    const baseline = reportToBaseline(oldReport);
    const newReport = createMockReport(8);
    const analysis = compareWithBaseline(newReport, baseline);
    const formatted = formatRegression(analysis);
    assert.ok(formatted.includes('Regression Analysis'));
  });

  it('returns null when no baseline exists', async () => {
    const loaded = await loadBaseline(testDir);
    assert.strictEqual(loaded, null);
  });

  it('handles multiple files in comparison', () => {
    const report = {
      version: '1.0.0',
      scanDate: new Date().toISOString(),
      totalFiles: 2,
      results: [
        {
          file: '/test/file1.html',
          url: undefined,
          timestamp: new Date().toISOString(),
          violations: Array(5).fill({ id: 'test', impact: 'serious', description: 'Test', help: 'Test',
            helpUrl: 'https://example.com', tags: ['wcag2a'], nodes: [{ target: ['div'], html: '<div></div>', failureSummary: 'Test' }] }),
          passes: 0,
          incomplete: 0,
        },
        {
          file: '/test/file2.html',
          url: undefined,
          timestamp: new Date().toISOString(),
          violations: Array(3).fill({ id: 'test', impact: 'serious', description: 'Test', help: 'Test',
            helpUrl: 'https://example.com', tags: ['wcag2a'], nodes: [{ target: ['div'], html: '<div></div>', failureSummary: 'Test' }] }),
          passes: 0,
          incomplete: 0,
        },
      ],
      summary: {
        totalViolations: 8,
        bySeverity: { critical: 2, serious: 5, moderate: 1, minor: 0 },
        score: 20,
        topIssues: [{ id: 'test', count: 8, description: 'Test', severity: 'serious' }],
      },
    } as AllyReport;

    const baseline = reportToBaseline(report);
    assert.strictEqual(baseline.violations['/test/file1.html'], 5);
    assert.strictEqual(baseline.violations['/test/file2.html'], 3);
  });

  it('formats output with reasonable line lengths', () => {
    const report = createMockReport(5);
    const baseline = reportToBaseline(report);
    const newReport = createMockReport(3);
    const analysis = compareWithBaseline(newReport, baseline);
    const formatted = formatRegression(analysis);
    const lines = formatted.split('\n');
    lines.forEach((line) => {
      assert.ok(line.length < 120, 'Line should be less than 120 characters');
    });
  });

  it('handles rapid successive saves', async () => {
    const report1 = createMockReport(10);
    await saveBaseline(report1, testDir);

    const loaded1 = await loadBaseline(testDir);
    assert.ok(loaded1 !== null);
    assert.strictEqual(loaded1?.summary.totalViolations, 10);

    const report2 = createMockReport(5);
    await saveBaseline(report2, testDir);

    const loaded2 = await loadBaseline(testDir);
    assert.ok(loaded2 !== null);
    assert.strictEqual(loaded2?.summary.totalViolations, 5);
  });

  it('handles malformed baseline comparison gracefully', () => {
    const report = createMockReport(5);
    const corruptBaseline = {
      summary: { totalViolations: 5, score: 95 },
      violations: {},
      scores: {},
    } as any;

    assert.doesNotThrow(() => {
      compareWithBaseline(report, corruptBaseline);
    });
  });
});
