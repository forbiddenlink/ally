#!/usr/bin/env node
/**
 * Benchmark ally against pa11y and axe-cli
 *
 * Tests scan performance on demo-site.html
 *
 * Results will show:
 * - Time to first result
 * - Total scan time
 * - Memory usage
 * - Issues found
 *
 * CI mode (--json --threshold):
 * - Outputs JSON for parsing
 * - Exits with code 1 if performance degrades beyond threshold
 */

import { performance } from 'perf_hooks';
import { spawn } from 'child_process';
import { resolve } from 'path';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import chalk from 'chalk';

// Parse CLI arguments
const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const thresholdIdx = args.indexOf('--threshold');
const threshold = thresholdIdx !== -1 ? parseInt(args[thresholdIdx + 1], 10) : null;

const DEMO_FILE = resolve(process.cwd(), 'demo/demo-site.html');
const ITERATIONS = 3;

interface BenchmarkResult {
  tool: string;
  avgTime: number;
  minTime: number;
  maxTime: number;
  issues: number;
  available: boolean;
  error?: string;
}

/**
 * Run a command and measure execution time
 */
async function runCommand(
  command: string,
  args: string[],
  extractIssueCount: (output: string) => number
): Promise<{ time: number; issues: number; error?: string }> {
  return new Promise((resolve) => {
    const start = performance.now();
    let stdout = '';
    let stderr = '';
    
    const proc = spawn(command, args, { stdio: 'pipe' });
    
    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('close', (code) => {
      const end = performance.now();
      const time = end - start;
      
      if (code !== 0 && code !== null) {
        resolve({ time, issues: 0, error: stderr || 'Command failed' });
        return;
      }
      
      try {
        const issues = extractIssueCount(stdout + stderr);
        resolve({ time, issues });
      } catch (error) {
        resolve({ time, issues: 0, error: error instanceof Error ? error.message : String(error) });
      }
    });
    
    proc.on('error', (error) => {
      const end = performance.now();
      resolve({ time: end - start, issues: 0, error: error.message });
    });
  });
}

/**
 * Check if a command is available
 */
async function isCommandAvailable(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('which', [command], { stdio: 'pipe' });
    proc.on('close', (code) => {
      resolve(code === 0);
    });
    proc.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Benchmark ally
 */
async function benchmarkAlly(): Promise<BenchmarkResult> {
  const times: number[] = [];
  let issues = 0;
  
  console.log(chalk.dim('Running ally...'));
  
  for (let i = 0; i < ITERATIONS; i++) {
    const result = await runCommand(
      'node',
      ['dist/cli.js', 'scan', DEMO_FILE, '--json'],
      (output) => {
        try {
          const data = JSON.parse(output);
          return data.files[0]?.violations?.length || 0;
        } catch {
          return 0;
        }
      }
    );
    
    if (result.error) {
      return { tool: 'ally', avgTime: 0, minTime: 0, maxTime: 0, issues: 0, available: false, error: result.error };
    }
    
    times.push(result.time);
    issues = result.issues;
  }
  
  return {
    tool: 'ally',
    avgTime: times.reduce((a, b) => a + b, 0) / times.length,
    minTime: Math.min(...times),
    maxTime: Math.max(...times),
    issues,
    available: true,
  };
}

/**
 * Benchmark pa11y
 */
async function benchmarkPa11y(): Promise<BenchmarkResult> {
  const available = await isCommandAvailable('pa11y');
  
  if (!available) {
    return {
      tool: 'pa11y',
      avgTime: 0,
      minTime: 0,
      maxTime: 0,
      issues: 0,
      available: false,
      error: 'Not installed (npm install -g pa11y)',
    };
  }
  
  const times: number[] = [];
  let issues = 0;
  
  console.log(chalk.dim('Running pa11y...'));
  
  for (let i = 0; i < ITERATIONS; i++) {
    const result = await runCommand(
      'pa11y',
      [DEMO_FILE, '--reporter', 'json'],
      (output) => {
        try {
          const data = JSON.parse(output);
          return Array.isArray(data) ? data.length : 0;
        } catch {
          return 0;
        }
      }
    );
    
    if (result.error) {
      return { tool: 'pa11y', avgTime: 0, minTime: 0, maxTime: 0, issues: 0, available: false, error: result.error };
    }
    
    times.push(result.time);
    issues = result.issues;
  }
  
  return {
    tool: 'pa11y',
    avgTime: times.reduce((a, b) => a + b, 0) / times.length,
    minTime: Math.min(...times),
    maxTime: Math.max(...times),
    issues,
    available: true,
  };
}

/**
 * Benchmark axe-cli
 */
async function benchmarkAxe(): Promise<BenchmarkResult> {
  const available = await isCommandAvailable('axe');
  
  if (!available) {
    return {
      tool: 'axe-cli',
      avgTime: 0,
      minTime: 0,
      maxTime: 0,
      issues: 0,
      available: false,
      error: 'Not installed (npm install -g @axe-core/cli)',
    };
  }
  
  const times: number[] = [];
  let issues = 0;
  
  console.log(chalk.dim('Running axe-cli...'));
  
  for (let i = 0; i < ITERATIONS; i++) {
    const result = await runCommand(
      'axe',
      [DEMO_FILE, '--reporter', 'json'],
      (output) => {
        try {
          const data = JSON.parse(output);
          return data[0]?.violations?.length || 0;
        } catch {
          return 0;
        }
      }
    );
    
    if (result.error) {
      return { tool: 'axe-cli', avgTime: 0, minTime: 0, maxTime: 0, issues: 0, available: false, error: result.error };
    }
    
    times.push(result.time);
    issues = result.issues;
  }
  
  return {
    tool: 'axe-cli',
    avgTime: times.reduce((a, b) => a + b, 0) / times.length,
    minTime: Math.min(...times),
    maxTime: Math.max(...times),
    issues,
    available: true,
  };
}

/**
 * Print benchmark results
 */
function printResults(results: BenchmarkResult[]): void {
  console.log();
  console.log(chalk.bold.cyan('Accessibility Scanner Benchmark'));
  console.log(chalk.dim('='.repeat(60)));
  console.log(chalk.dim(`Target: ${DEMO_FILE}`));
  console.log(chalk.dim(`Iterations: ${ITERATIONS}\n`));
  
  // Find fastest available tool
  const available = results.filter((r) => r.available);
  const fastest = available.reduce((a, b) => (a.avgTime < b.avgTime ? a : b), available[0]);
  
  // Print table header
  console.log(chalk.bold('Tool       Avg Time    Min Time    Max Time    Issues   Status'));
  console.log(chalk.dim('-'.repeat(70)));
  
  for (const result of results) {
    const name = result.tool.padEnd(10);
    
    if (!result.available) {
      console.log(
        `${name} ${chalk.red('Not available')}          ${chalk.dim(result.error || 'Command not found')}`
      );
      continue;
    }
    
    const avgTime = `${result.avgTime.toFixed(0)}ms`.padEnd(11);
    const minTime = `${result.minTime.toFixed(0)}ms`.padEnd(11);
    const maxTime = `${result.maxTime.toFixed(0)}ms`.padEnd(11);
    const issues = result.issues.toString().padEnd(8);
    
    const isFastest = result.tool === fastest.tool;
    const timeColor = isFastest ? chalk.green : chalk.white;
    
    const status = isFastest ? chalk.green('✓ Fastest') : '';
    
    console.log(
      `${name} ${timeColor(avgTime)} ${timeColor(minTime)} ${timeColor(maxTime)} ${issues} ${status}`
    );
  }
  
  // Calculate speedup
  if (fastest.tool === 'ally' && available.length > 1) {
    console.log();
    console.log(chalk.green.bold(`ally is the fastest tool!`));
    
    for (const result of available) {
      if (result.tool !== 'ally') {
        const speedup = result.avgTime / fastest.avgTime;
        console.log(chalk.dim(`  ${speedup.toFixed(1)}x faster than ${result.tool}`));
      }
    }
  }
  
  console.log();
}

const BASELINE_FILE = resolve(process.cwd(), '.ally/benchmark-baseline.json');

interface BenchmarkBaseline {
  timestamp: string;
  allyAvgTime: number;
}

/**
 * Load baseline from previous run
 */
async function loadBaseline(): Promise<BenchmarkBaseline | null> {
  if (!existsSync(BASELINE_FILE)) {
    return null;
  }
  try {
    const content = await readFile(BASELINE_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Save baseline for future comparisons
 */
async function saveBaseline(allyAvgTime: number): Promise<void> {
  const baselineDir = resolve(process.cwd(), '.ally');
  if (!existsSync(baselineDir)) {
    await mkdir(baselineDir, { recursive: true });
  }
  const baseline: BenchmarkBaseline = {
    timestamp: new Date().toISOString(),
    allyAvgTime,
  };
  await writeFile(BASELINE_FILE, JSON.stringify(baseline, null, 2));
}

/**
 * Output results as JSON for CI parsing
 */
function printJsonResults(
  results: BenchmarkResult[],
  baseline: BenchmarkBaseline | null,
  regressionPercent: number | null
): void {
  const output = {
    timestamp: new Date().toISOString(),
    target: DEMO_FILE,
    iterations: ITERATIONS,
    results: results.map((r) => ({
      tool: r.tool,
      available: r.available,
      avgTimeMs: r.avgTime,
      minTimeMs: r.minTime,
      maxTimeMs: r.maxTime,
      issues: r.issues,
      error: r.error,
    })),
    baseline: baseline
      ? {
          timestamp: baseline.timestamp,
          allyAvgTimeMs: baseline.allyAvgTime,
        }
      : null,
    regression: regressionPercent !== null
      ? {
          percent: regressionPercent,
          threshold: threshold,
          passed: threshold === null || regressionPercent <= threshold,
        }
      : null,
  };
  console.log(JSON.stringify(output, null, 2));
}

/**
 * Main benchmark runner
 */
async function main(): Promise<void> {
  if (!jsonMode) {
    console.log(chalk.cyan.bold('\nBenchmarking accessibility scanners...\n'));
  }

  // Run benchmarks
  const results = await Promise.all([
    benchmarkAlly(),
    benchmarkPa11y(),
    benchmarkAxe(),
  ]);

  // Load baseline for regression detection
  const baseline = await loadBaseline();
  const allyResult = results.find((r) => r.tool === 'ally');
  let regressionPercent: number | null = null;

  if (allyResult?.available && baseline) {
    regressionPercent =
      ((allyResult.avgTime - baseline.allyAvgTime) / baseline.allyAvgTime) * 100;
  }

  // Save new baseline if ally ran successfully
  if (allyResult?.available) {
    await saveBaseline(allyResult.avgTime);
  }

  if (jsonMode) {
    printJsonResults(results, baseline, regressionPercent);
  } else {
    printResults(results);

    // Print regression info
    if (regressionPercent !== null) {
      console.log(chalk.dim('Baseline comparison:'));
      if (regressionPercent > 0) {
        console.log(
          chalk.yellow(
            `  Performance degraded by ${regressionPercent.toFixed(1)}% vs baseline`
          )
        );
      } else {
        console.log(
          chalk.green(
            `  Performance improved by ${Math.abs(regressionPercent).toFixed(1)}% vs baseline`
          )
        );
      }
      console.log();
    }
  }

  // Check threshold and exit with error if exceeded
  if (threshold !== null && regressionPercent !== null && regressionPercent > threshold) {
    if (!jsonMode) {
      console.log(
        chalk.red.bold(
          `Performance regression (${regressionPercent.toFixed(1)}%) exceeds threshold (${threshold}%)`
        )
      );
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Benchmark failed:', error);
  process.exit(1);
});
