/**
 * E2E tests for the full scan → fix → report workflow
 *
 * These tests verify the complete user workflow using real browser automation.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { resolve, join } from 'path';
import { mkdtemp, rm, writeFile, mkdir, readFile, copyFile } from 'fs/promises';
import { tmpdir } from 'os';
import { existsSync } from 'fs';
import { execSync, spawn } from 'child_process';

const CLI_PATH = resolve(process.cwd(), 'dist/cli.js');
const FIXTURES_DIR = resolve(process.cwd(), 'test-fixtures');

/**
 * Run ally CLI command and return output
 */
async function runAlly(args: string[], options?: { cwd?: string }): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const proc = spawn('node', [CLI_PATH, ...args], {
      stdio: 'pipe',
      cwd: options?.cwd || process.cwd(),
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({ stdout, stderr, code: code ?? 1 });
    });

    proc.on('error', (error) => {
      resolve({ stdout, stderr: error.message, code: 1 });
    });
  });
}

describe('E2E: Scan Workflow', () => {
  let tempDir: string;
  let outputDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'ally-e2e-'));
    outputDir = join(tempDir, '.ally');
    await mkdir(outputDir, { recursive: true });
  });

  afterEach(async () => {
    if (existsSync(tempDir)) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('scan command', () => {
    it('should scan HTML files and output JSON', async () => {
      // Note: --ci mode skips file output, so we run without it for this test
      const result = await runAlly(['scan', FIXTURES_DIR, '-o', outputDir]);

      // Should complete (exit code doesn't matter as long as files are created)
      // Check JSON output was created
      const scanFile = join(outputDir, 'scan.json');
      assert.ok(existsSync(scanFile), 'scan.json should be created');

      const scanData = JSON.parse(await readFile(scanFile, 'utf-8'));
      assert.ok(scanData.version, 'Should have version field');
      assert.ok(scanData.results, 'Should have results array');
      assert.ok(scanData.summary, 'Should have summary');
    });

    it('should generate SARIF output for GitHub Code Scanning', async () => {
      const result = await runAlly(['scan', FIXTURES_DIR, '-o', outputDir, '--format', 'sarif']);

      const sarifFile = join(outputDir, 'scan.sarif');
      assert.ok(existsSync(sarifFile), 'SARIF file should be created');

      const sarifData = JSON.parse(await readFile(sarifFile, 'utf-8'));
      assert.strictEqual(sarifData.version, '2.1.0', 'Should be SARIF 2.1.0');
      assert.ok(sarifData.runs, 'Should have runs array');
      assert.ok(sarifData.runs[0]?.tool?.driver, 'Should have tool driver info');
    });
  });

  describe('report command', () => {
    it('should generate markdown report from scan results', async () => {
      // First, run a scan (without --ci so files are saved)
      await runAlly(['scan', FIXTURES_DIR, '-o', outputDir]);

      // Then generate report
      const reportFile = join(tempDir, 'ACCESSIBILITY.md');
      const result = await runAlly(['report', '-o', reportFile], { cwd: tempDir });

      // Report should be created
      assert.ok(existsSync(reportFile), 'Report file should be created');

      const reportContent = await readFile(reportFile, 'utf-8');
      assert.ok(reportContent.includes('Accessibility'), 'Report should contain Accessibility heading');
      assert.ok(reportContent.includes('Score'), 'Report should contain score');
    });
  });

  describe('fix command', () => {
    it('should apply fixes with --dry-run without modifying files', async () => {
      // Copy a fixable file to temp dir
      const testFile = join(tempDir, 'fixable.html');
      await copyFile(join(FIXTURES_DIR, 'auto-fix-test.html'), testFile);

      const originalContent = await readFile(testFile, 'utf-8');

      // Run fix in dry-run mode
      const result = await runAlly(['scan', testFile, '-o', outputDir], { cwd: tempDir });
      const fixResult = await runAlly(['fix', '--dry-run', '-o', outputDir], { cwd: tempDir });

      // File should not be modified
      const afterContent = await readFile(testFile, 'utf-8');
      assert.strictEqual(originalContent, afterContent, 'File should not be modified in dry-run mode');
    });
  });

  describe('score calculation', () => {
    it('should return score between 0 and 100', async () => {
      await runAlly(['scan', FIXTURES_DIR, '-o', outputDir]);

      const scanFile = join(outputDir, 'scan.json');
      const scanData = JSON.parse(await readFile(scanFile, 'utf-8'));

      assert.ok(typeof scanData.summary.score === 'number', 'Score should be a number');
      assert.ok(scanData.summary.score >= 0, 'Score should be >= 0');
      assert.ok(scanData.summary.score <= 100, 'Score should be <= 100');
    });

    it('should categorize violations by severity', async () => {
      await runAlly(['scan', FIXTURES_DIR, '-o', outputDir]);

      const scanFile = join(outputDir, 'scan.json');
      const scanData = JSON.parse(await readFile(scanFile, 'utf-8'));

      const { bySeverity } = scanData.summary;
      assert.ok('critical' in bySeverity, 'Should have critical count');
      assert.ok('serious' in bySeverity, 'Should have serious count');
      assert.ok('moderate' in bySeverity, 'Should have moderate count');
      assert.ok('minor' in bySeverity, 'Should have minor count');
    });
  });
});

describe('E2E: Multi-file workflow', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'ally-e2e-multi-'));

    // Create multiple HTML files with different issues
    await writeFile(join(tempDir, 'page1.html'), `
      <!DOCTYPE html>
      <html>
        <head><title>Page 1</title></head>
        <body>
          <img src="image.png">
          <button></button>
        </body>
      </html>
    `);

    await writeFile(join(tempDir, 'page2.html'), `
      <!DOCTYPE html>
      <html lang="en">
        <head><title>Page 2</title></head>
        <body>
          <main>
            <h1>Accessible Page</h1>
            <p>This page is better.</p>
            <img src="logo.png" alt="Company logo">
          </main>
        </body>
      </html>
    `);
  });

  afterEach(async () => {
    if (existsSync(tempDir)) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should scan multiple files and aggregate results', async () => {
    const outputDir = join(tempDir, '.ally');
    await mkdir(outputDir, { recursive: true });

    await runAlly(['scan', tempDir, '-o', outputDir]);

    const scanFile = join(outputDir, 'scan.json');
    assert.ok(existsSync(scanFile), 'scan.json should be created');

    const scanData = JSON.parse(await readFile(scanFile, 'utf-8'));
    assert.ok(scanData.totalFiles >= 2, 'Should scan at least 2 files');
  });
});
