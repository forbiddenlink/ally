/**
 * Tests for the accessibility scanner
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { resolve } from 'path';
import {
  AccessibilityScanner,
  calculateScore,
  generateSummary,
  createReport,
  findHtmlFiles,
} from '../dist/utils/scanner.js';
import type { ScanResult, Violation } from '../dist/types/index.js';

describe('AccessibilityScanner', () => {
  let scanner: AccessibilityScanner;

  before(async () => {
    scanner = new AccessibilityScanner();
    await scanner.init();
  });

  after(async () => {
    await scanner.close();
  });

  it('should scan HTML file with violations', async () => {
    const testFile = resolve(process.cwd(), 'test-fixtures/bad-a11y.html');
    const result = await scanner.scanHtmlFile(testFile);

    assert.ok(result.violations.length > 0, 'Should find violations');
    assert.ok(result.timestamp, 'Should have timestamp');
    assert.ok(result.passes > 0, 'Should have some passing rules');
  });

  it('should scan clean HTML file', async () => {
    const testFile = resolve(process.cwd(), 'test-fixtures/good-a11y.html');
    const result = await scanner.scanHtmlFile(testFile);

    assert.strictEqual(result.violations.length, 0, 'Should find no violations');
  });

  it('should scan HTML string', async () => {
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head><title>Test</title></head>
      <body><main><h1>Test</h1></main></body>
      </html>
    `;
    const result = await scanner.scanHtmlString(html, 'test-string');

    assert.ok(result, 'Should return result');
    assert.strictEqual(result.file, 'test-string');
  });
});

describe('calculateScore', () => {
  it('should return 100 for no violations', () => {
    const results: ScanResult[] = [{
      url: 'test',
      timestamp: new Date().toISOString(),
      violations: [],
      passes: 50,
      incomplete: 0,
    }];

    const score = calculateScore(results);
    assert.strictEqual(score, 100);
  });

  it('should penalize critical violations heavily', () => {
    const criticalViolation: Violation = {
      id: 'test',
      impact: 'critical',
      description: 'Test',
      help: 'Test help',
      helpUrl: 'https://example.com',
      tags: [],
      nodes: [{ html: '<div>', target: ['div'], failureSummary: '' }],
    };

    const results: ScanResult[] = [{
      url: 'test',
      timestamp: new Date().toISOString(),
      violations: [criticalViolation],
      passes: 50,
      incomplete: 0,
    }];

    const score = calculateScore(results);
    assert.ok(score < 100, 'Score should be reduced');
    assert.ok(score <= 75, 'Critical violation should reduce score significantly');
  });

  it('should penalize minor violations lightly', () => {
    const minorViolation: Violation = {
      id: 'test',
      impact: 'minor',
      description: 'Test',
      help: 'Test help',
      helpUrl: 'https://example.com',
      tags: [],
      nodes: [{ html: '<div>', target: ['div'], failureSummary: '' }],
    };

    const results: ScanResult[] = [{
      url: 'test',
      timestamp: new Date().toISOString(),
      violations: [minorViolation],
      passes: 50,
      incomplete: 0,
    }];

    const score = calculateScore(results);
    assert.ok(score >= 95, 'Minor violation should only reduce score slightly');
  });
});

describe('generateSummary', () => {
  it('should count violations by severity', () => {
    const results: ScanResult[] = [{
      url: 'test',
      timestamp: new Date().toISOString(),
      violations: [
        { id: 'a', impact: 'critical', description: '', help: '', helpUrl: '', tags: [], nodes: [] },
        { id: 'b', impact: 'serious', description: '', help: '', helpUrl: '', tags: [], nodes: [] },
        { id: 'c', impact: 'serious', description: '', help: '', helpUrl: '', tags: [], nodes: [] },
      ],
      passes: 0,
      incomplete: 0,
    }];

    const summary = generateSummary(results);

    assert.strictEqual(summary.bySeverity.critical, 1);
    assert.strictEqual(summary.bySeverity.serious, 2);
    assert.strictEqual(summary.totalViolations, 3);
  });

  it('should identify top issues', () => {
    const results: ScanResult[] = [{
      url: 'test',
      timestamp: new Date().toISOString(),
      violations: [
        { id: 'image-alt', impact: 'critical', description: '', help: 'Images need alt', helpUrl: '', tags: [], nodes: [] },
        { id: 'image-alt', impact: 'critical', description: '', help: 'Images need alt', helpUrl: '', tags: [], nodes: [] },
        { id: 'button-name', impact: 'critical', description: '', help: 'Buttons need name', helpUrl: '', tags: [], nodes: [] },
      ],
      passes: 0,
      incomplete: 0,
    }];

    const summary = generateSummary(results);

    assert.ok(summary.topIssues.length > 0);
    assert.strictEqual(summary.topIssues[0].id, 'image-alt');
    assert.strictEqual(summary.topIssues[0].count, 2);
  });
});

describe('findHtmlFiles', () => {
  it('should find HTML files in test-fixtures', async () => {
    const files = await findHtmlFiles(resolve(process.cwd(), 'test-fixtures'));

    assert.ok(files.length >= 2, 'Should find at least 2 HTML files');
    assert.ok(files.some(f => f.includes('bad-a11y.html')));
    assert.ok(files.some(f => f.includes('good-a11y.html')));
  });

  it('should ignore node_modules', async () => {
    const files = await findHtmlFiles(process.cwd());

    const inNodeModules = files.filter(f => f.includes('node_modules'));
    assert.strictEqual(inNodeModules.length, 0, 'Should not include node_modules');
  });
});

describe('createReport', () => {
  it('should create valid report structure', () => {
    const results: ScanResult[] = [{
      url: 'test.html',
      file: 'test.html',
      timestamp: new Date().toISOString(),
      violations: [],
      passes: 10,
      incomplete: 0,
    }];

    const report = createReport(results);

    assert.ok(report.version);
    assert.ok(report.scanDate);
    assert.strictEqual(report.totalFiles, 1);
    assert.ok(report.summary);
    assert.strictEqual(report.summary.score, 100);
  });
});
