/**
 * Tests for the report command
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { resolve, join } from 'path';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { existsSync } from 'fs';
import { reportCommand } from '../dist/commands/report.js';
import { convertToSarif, convertToJunit, convertToCsv } from '../dist/utils/converters.js';
import type { AllyReport, Violation } from '../dist/types/index.js';

// Sample report for testing
function createSampleReport(score: number = 75, violations: number = 5): AllyReport {
  const sampleViolations: Violation[] = [];

  for (let i = 0; i < violations; i++) {
    sampleViolations.push({
      id: `violation-${i}`,
      impact: i % 4 === 0 ? 'critical' : i % 4 === 1 ? 'serious' : i % 4 === 2 ? 'moderate' : 'minor',
      description: `Test violation ${i}`,
      help: `Fix violation ${i}`,
      helpUrl: `https://example.com/help/${i}`,
      tags: ['wcag2a', 'wcag111'],
      nodes: [{ html: '<div>', target: ['div'], failureSummary: '' }]
    });
  }

  return {
    version: '1.0.0',
    scanDate: new Date().toISOString(),
    totalFiles: 2,
    results: [
      {
        url: 'file:///test/good.html',
        file: 'test/good.html',
        timestamp: new Date().toISOString(),
        violations: [],
        passes: 50,
        incomplete: 0
      },
      {
        url: 'file:///test/bad.html',
        file: 'test/bad.html',
        timestamp: new Date().toISOString(),
        violations: sampleViolations,
        passes: 40,
        incomplete: 2
      }
    ],
    summary: {
      totalViolations: violations,
      bySeverity: {
        critical: Math.ceil(violations / 4),
        serious: Math.ceil(violations / 4),
        moderate: Math.ceil(violations / 4),
        minor: Math.ceil(violations / 4)
      },
      score,
      topIssues: sampleViolations.slice(0, 3).map((v, i) => ({
        id: v.id,
        count: 3 - i,
        description: v.help,
        severity: v.impact
      }))
    }
  };
}

describe('report command', () => {
  let tempDir: string;
  const originalCwd = process.cwd();

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'ally-report-test-'));
    process.chdir(tempDir);

    // Create .ally directory with scan.json
    await mkdir(join(tempDir, '.ally'), { recursive: true });
    const report = createSampleReport();
    await writeFile(join(tempDir, '.ally', 'scan.json'), JSON.stringify(report, null, 2));
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    if (existsSync(tempDir)) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should generate markdown report by default', async () => {
    await reportCommand({ output: 'ACCESSIBILITY.md' });

    const reportPath = join(tempDir, 'ACCESSIBILITY.md');
    assert.ok(existsSync(reportPath), 'Markdown report should exist');

    const content = await readFile(reportPath, 'utf-8');
    assert.ok(content.includes('# Accessibility Report'), 'Should have title');
    assert.ok(content.includes('Score:'), 'Should have score');
    assert.ok(content.includes('Summary'), 'Should have summary section');
  });

  it('should generate HTML report', async () => {
    await reportCommand({ format: 'html' });

    const reportPath = join(tempDir, 'accessibility.html');
    assert.ok(existsSync(reportPath), 'HTML report should exist');

    const content = await readFile(reportPath, 'utf-8');
    assert.ok(content.includes('<!DOCTYPE html>'), 'Should be valid HTML');
    assert.ok(content.includes('<title>Accessibility Report</title>'), 'Should have title');
  });

  it('should generate JSON report', async () => {
    await reportCommand({ format: 'json' });

    const reportPath = join(tempDir, 'accessibility.json');
    assert.ok(existsSync(reportPath), 'JSON report should exist');

    const content = await readFile(reportPath, 'utf-8');
    const json = JSON.parse(content) as AllyReport;
    assert.ok(json.version, 'Should have version');
    assert.ok(json.summary, 'Should have summary');
  });

  it('should generate SARIF report', async () => {
    await reportCommand({ format: 'sarif' });

    const reportPath = join(tempDir, 'accessibility.sarif');
    assert.ok(existsSync(reportPath), 'SARIF report should exist');

    const content = await readFile(reportPath, 'utf-8');
    const sarif = JSON.parse(content);
    assert.strictEqual(sarif.version, '2.1.0', 'Should be SARIF 2.1.0');
    assert.ok(sarif.runs, 'Should have runs');
  });

  it('should generate JUnit report', async () => {
    await reportCommand({ format: 'junit' });

    const reportPath = join(tempDir, 'accessibility.junit.xml');
    assert.ok(existsSync(reportPath), 'JUnit report should exist');

    const content = await readFile(reportPath, 'utf-8');
    assert.ok(content.includes('<?xml version="1.0"'), 'Should be valid XML');
    assert.ok(content.includes('<testsuites'), 'Should have testsuites element');
  });

  it('should generate CSV report', async () => {
    await reportCommand({ format: 'csv' });

    const reportPath = join(tempDir, 'accessibility.csv');
    assert.ok(existsSync(reportPath), 'CSV report should exist');

    const content = await readFile(reportPath, 'utf-8');
    const lines = content.trim().split('\n');
    assert.ok(lines.length >= 1, 'Should have header row');
    assert.ok(lines[0].includes('file'), 'Should have file column');
  });

  it('should handle missing scan results', async () => {
    // Remove scan.json
    await rm(join(tempDir, '.ally', 'scan.json'));

    // This should not throw
    await reportCommand({});

    // Report should not be generated
    assert.ok(!existsSync(join(tempDir, 'ACCESSIBILITY.md')), 'Report should not exist');
  });
});

describe('report converters', () => {
  const sampleReport = createSampleReport(80, 3);

  describe('convertToSarif', () => {
    it('should create valid SARIF structure', () => {
      const sarif = convertToSarif(sampleReport);

      assert.strictEqual(sarif.version, '2.1.0');
      assert.ok(sarif.$schema, 'Should have schema');
      assert.ok(Array.isArray(sarif.runs), 'Should have runs array');
      assert.strictEqual(sarif.runs.length, 1, 'Should have one run');
    });

    it('should include tool information', () => {
      const sarif = convertToSarif(sampleReport);
      const tool = sarif.runs[0].tool;

      assert.ok(tool.driver.name, 'Should have driver name');
      assert.ok(tool.driver.version, 'Should have driver version');
    });

    it('should include rules for each violation type', () => {
      const sarif = convertToSarif(sampleReport);
      const rules = sarif.runs[0].tool.driver.rules;

      assert.ok(rules.length > 0, 'Should have rules');
      assert.ok(rules[0].id, 'Rule should have id');
      assert.ok(rules[0].shortDescription, 'Rule should have description');
    });

    it('should include results for violations', () => {
      const sarif = convertToSarif(sampleReport);
      const results = sarif.runs[0].results;

      assert.ok(results.length > 0, 'Should have results');
      assert.ok(results[0].ruleId, 'Result should have ruleId');
      assert.ok(results[0].message, 'Result should have message');
    });
  });

  describe('convertToJunit', () => {
    it('should create valid XML', () => {
      const junit = convertToJunit(sampleReport);

      assert.ok(junit.includes('<?xml version="1.0"'), 'Should have XML declaration');
      assert.ok(junit.includes('<testsuites'), 'Should have testsuites element');
      assert.ok(junit.includes('</testsuites>'), 'Should close testsuites');
    });

    it('should include test counts', () => {
      const junit = convertToJunit(sampleReport);

      assert.ok(junit.includes('tests="'), 'Should have tests count');
      assert.ok(junit.includes('failures="'), 'Should have failures count');
    });

    it('should include failure details', () => {
      const junit = convertToJunit(sampleReport);

      assert.ok(junit.includes('<testcase'), 'Should have testcase elements');
      assert.ok(junit.includes('<failure'), 'Should have failure elements');
    });
  });

  describe('convertToCsv', () => {
    it('should have correct headers', () => {
      const csv = convertToCsv(sampleReport);
      const lines = csv.trim().split('\n');

      assert.ok(lines[0].includes('file'), 'Should have file header');
      assert.ok(lines[0].includes('violation_id'), 'Should have violation_id header');
      assert.ok(lines[0].includes('impact'), 'Should have impact header');
    });

    it('should include violation data', () => {
      const csv = convertToCsv(sampleReport);
      const lines = csv.trim().split('\n');

      // Should have header + data rows
      assert.ok(lines.length > 1, 'Should have data rows');
    });

    it('should escape special characters', () => {
      const reportWithCommas = createSampleReport();
      reportWithCommas.results[1].violations[0].help = 'Fix this, please';

      const csv = convertToCsv(reportWithCommas);

      // Values with commas should be quoted
      assert.ok(csv.includes('"Fix this, please"'), 'Should quote values with commas');
    });
  });
});

describe('report score display', () => {
  it('should display correct emoji for high score', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'ally-report-score-'));
    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await mkdir(join(tempDir, '.ally'), { recursive: true });
      const report = createSampleReport(95, 0); // High score
      await writeFile(join(tempDir, '.ally', 'scan.json'), JSON.stringify(report, null, 2));

      await reportCommand({ output: 'ACCESSIBILITY.md' });

      const content = await readFile(join(tempDir, 'ACCESSIBILITY.md'), 'utf-8');
      assert.ok(content.includes('🌟'), 'Should have star emoji for score >= 90');
    } finally {
      process.chdir(originalCwd);
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should display correct emoji for medium score', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'ally-report-score-'));
    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await mkdir(join(tempDir, '.ally'), { recursive: true });
      const report = createSampleReport(80, 2); // Medium-high score
      await writeFile(join(tempDir, '.ally', 'scan.json'), JSON.stringify(report, null, 2));

      await reportCommand({ output: 'ACCESSIBILITY.md' });

      const content = await readFile(join(tempDir, 'ACCESSIBILITY.md'), 'utf-8');
      assert.ok(content.includes('✅'), 'Should have checkmark for score 75-89');
    } finally {
      process.chdir(originalCwd);
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should display correct badge color based on score', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'ally-report-badge-'));
    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await mkdir(join(tempDir, '.ally'), { recursive: true });
      const report = createSampleReport(60, 4); // Medium score
      await writeFile(join(tempDir, '.ally', 'scan.json'), JSON.stringify(report, null, 2));

      await reportCommand({ output: 'ACCESSIBILITY.md' });

      const content = await readFile(join(tempDir, 'ACCESSIBILITY.md'), 'utf-8');
      assert.ok(content.includes('-yellow)'), 'Should have yellow badge for score 50-74');
    } finally {
      process.chdir(originalCwd);
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
