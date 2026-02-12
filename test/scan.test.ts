/**
 * Tests for the scan command
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { resolve, join } from 'path';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { existsSync } from 'fs';
import { scanCommand } from '../dist/commands/scan.js';
import type { AllyReport } from '../dist/types/index.js';

describe('scan command', () => {
  let tempDir: string;
  let outputDir: string;
  const testFixturesDir = resolve(process.cwd(), 'test-fixtures');

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'ally-scan-test-'));
    outputDir = join(tempDir, 'output');
    await mkdir(outputDir, { recursive: true });
  });

  afterEach(async () => {
    if (existsSync(tempDir)) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('file scanning', () => {
    it('should scan a directory of HTML files', async () => {
      const report = await scanCommand(testFixturesDir, { output: outputDir, ci: true });

      assert.ok(report, 'Should return a report');
      assert.ok(report.totalFiles >= 2, 'Should scan at least 2 files');
    });

    it('should find violations in bad HTML', async () => {
      const report = await scanCommand(testFixturesDir, { output: outputDir, ci: true });

      assert.ok(report, 'Should return a report');
      assert.ok(report.summary.totalViolations > 0, 'Should find violations from bad-a11y.html');
    });

    it('should handle missing directory gracefully', async () => {
      const report = await scanCommand('/nonexistent/path', { output: outputDir, ci: true });

      // Should return null when no files found
      assert.strictEqual(report, null, 'Should return null for nonexistent path');
    });

    it('should save report to output directory', async () => {
      // Note: In CI mode, reports are not saved. Use non-CI mode for this test.
      await scanCommand(testFixturesDir, { output: outputDir, ci: false });

      const reportPath = join(outputDir, 'scan.json');
      assert.ok(existsSync(reportPath), 'Report file should exist');

      const reportContent = await readFile(reportPath, 'utf-8');
      const report = JSON.parse(reportContent) as AllyReport;
      assert.ok(report.version, 'Report should have version');
      assert.ok(report.scanDate, 'Report should have scan date');
    });
  });

  describe('output formats', () => {
    // Note: In CI mode, reports are not saved to files. Use non-CI mode for these tests.
    it('should generate SARIF format', async () => {
      await scanCommand(testFixturesDir, { output: outputDir, format: 'sarif', ci: false });

      const sarifPath = join(outputDir, 'scan.sarif');
      assert.ok(existsSync(sarifPath), 'SARIF file should exist');

      const sarifContent = await readFile(sarifPath, 'utf-8');
      const sarif = JSON.parse(sarifContent);
      assert.strictEqual(sarif.version, '2.1.0', 'Should be SARIF 2.1.0');
      assert.ok(sarif.runs, 'Should have runs array');
      assert.ok(sarif.runs[0].tool, 'Should have tool info');
    });

    it('should generate JUnit format', async () => {
      await scanCommand(testFixturesDir, { output: outputDir, format: 'junit', ci: false });

      const junitPath = join(outputDir, 'scan.xml');
      assert.ok(existsSync(junitPath), 'JUnit file should exist');

      const junitContent = await readFile(junitPath, 'utf-8');
      assert.ok(junitContent.includes('<?xml version="1.0"'), 'Should be valid XML');
      assert.ok(junitContent.includes('<testsuites'), 'Should have testsuites element');
    });

    it('should generate CSV format', async () => {
      await scanCommand(testFixturesDir, { output: outputDir, format: 'csv', ci: false });

      const csvPath = join(outputDir, 'scan.csv');
      assert.ok(existsSync(csvPath), 'CSV file should exist');

      const csvContent = await readFile(csvPath, 'utf-8');
      const lines = csvContent.trim().split('\n');
      assert.ok(lines.length >= 1, 'Should have at least header row');
      assert.ok(lines[0].includes('file,violation_id'), 'Should have expected headers');
    });
  });

  describe('WCAG standards', () => {
    it('should respect --standard flag', async () => {
      // Scan with different standards - results may vary
      const reportWcag2a = await scanCommand(testFixturesDir, {
        output: outputDir,
        standard: 'wcag2a',
        ci: true
      });

      assert.ok(reportWcag2a, 'Should return report with wcag2a');
    });
  });

  describe('caching', () => {
    it('should use cache by default', async () => {
      // First scan
      const report1 = await scanCommand(testFixturesDir, { output: outputDir, ci: true });
      assert.ok(report1, 'First scan should succeed');

      // Second scan (should use cache)
      const report2 = await scanCommand(testFixturesDir, { output: outputDir, ci: true });
      assert.ok(report2, 'Second scan should succeed');

      // Results should be equivalent
      assert.strictEqual(report1.summary.score, report2.summary.score, 'Scores should match');
    });

    it('should skip cache with --no-cache', async () => {
      const report = await scanCommand(testFixturesDir, {
        output: outputDir,
        noCache: true,
        ci: true
      });

      assert.ok(report, 'Should return report without cache');
    });
  });

  describe('report structure', () => {
    it('should include all required fields', async () => {
      const report = await scanCommand(testFixturesDir, { output: outputDir, ci: true });

      assert.ok(report, 'Report should exist');
      assert.ok(report.version, 'Should have version');
      assert.ok(report.scanDate, 'Should have scanDate');
      assert.ok(typeof report.totalFiles === 'number', 'Should have totalFiles');
      assert.ok(Array.isArray(report.results), 'Should have results array');
      assert.ok(report.summary, 'Should have summary');
      assert.ok(typeof report.summary.score === 'number', 'Summary should have score');
      assert.ok(report.summary.bySeverity, 'Summary should have bySeverity');
    });

    it('should categorize violations by severity', async () => {
      const report = await scanCommand(testFixturesDir, { output: outputDir, ci: true });

      assert.ok(report, 'Report should exist');
      const { bySeverity } = report.summary;

      // All severity levels should be defined
      assert.ok('critical' in bySeverity, 'Should have critical count');
      assert.ok('serious' in bySeverity, 'Should have serious count');
      assert.ok('moderate' in bySeverity, 'Should have moderate count');
      assert.ok('minor' in bySeverity, 'Should have minor count');
    });
  });
});

describe('scan command - URL mode', () => {
  // URL scanning tests are more integration-like and may be slow
  // Keep them minimal for unit testing

  it('should validate URL format', async () => {
    // Invalid URL should be handled gracefully
    const report = await scanCommand('.', {
      url: 'not-a-valid-url',
      ci: true
    });

    // Should fail gracefully
    assert.strictEqual(report, null, 'Should return null for invalid URL');
  });
});
