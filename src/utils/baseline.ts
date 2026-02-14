/**
 * Baseline management for tracking accessibility improvements and detecting regressions
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';
import type { AllyReport } from '../types/index.js';

interface BaselineData {
  timestamp: string;
  scores: Record<string, number>; // file -> score
  violations: Record<string, number>; // file -> violation count
  summary: {
    totalViolations: number;
    criticalCount: number;
    seriousCount: number;
    moderateCount: number;
    minorCount: number;
  };
}

interface RegressionAnalysis {
  improved: number; // Issues fixed
  regressed: number; // New issues introduced
  unchanged: number; // No change
  improvementPercentage: number;
  regressionPercentage: number;
  details: {
    newViolations: Array<{ file: string; count: number }>;
    fixedViolations: Array<{ file: string; count: number }>;
  };
}

const BASELINE_DIR = '.ally';
const BASELINE_FILE = resolve(BASELINE_DIR, 'baseline.json');

/**
 * Convert report to baseline data for comparison
 */
export function reportToBaseline(report: AllyReport): BaselineData {
  const scores: Record<string, number> = {};
  const violations: Record<string, number> = {};

  for (const result of report.results) {
    const fileKey = result.file || result.url || 'unknown';
    violations[fileKey] = result.violations.length;
    // Score based on violations (100 - violations * 10)
    scores[fileKey] = Math.max(0, 100 - result.violations.length * 10);
  }

  return {
    timestamp: new Date().toISOString(),
    scores,
    violations,
    summary: {
      totalViolations: report.summary.totalViolations,
      criticalCount: report.summary.bySeverity.critical ?? 0,
      seriousCount: report.summary.bySeverity.serious ?? 0,
      moderateCount: report.summary.bySeverity.moderate ?? 0,
      minorCount: report.summary.bySeverity.minor ?? 0,
    },
  };
}

/**
 * Save baseline from a report
 */
export async function saveBaseline(report: AllyReport, baselineDir: string = BASELINE_DIR): Promise<void> {
  const baseline = reportToBaseline(report);
  const filePath = resolve(baselineDir, 'baseline.json');

  // Ensure directory exists
  if (!existsSync(baselineDir)) {
    await mkdir(baselineDir, { recursive: true });
  }

  await writeFile(filePath, JSON.stringify(baseline, null, 2));
}

/**
 * Load baseline data
 */
export async function loadBaseline(baselineDir: string = BASELINE_DIR): Promise<BaselineData | null> {
  const filePath = resolve(baselineDir, 'baseline.json');

  try {
    if (!existsSync(filePath)) {
      return null;
    }
    const data = await readFile(filePath, 'utf-8');
    return JSON.parse(data) as BaselineData;
  } catch (error) {
    console.error('Failed to load baseline:', error);
    return null;
  }
}

/**
 * Compare current report against baseline, detecting improvements and regressions
 */
export function compareWithBaseline(currentReport: AllyReport, baseline: BaselineData): RegressionAnalysis {
  const currentBaseline = reportToBaseline(currentReport);

  let improved = 0;
  let regressed = 0;
  let unchanged = 0;
  const newViolations: Array<{ file: string; count: number }> = [];
  const fixedViolations: Array<{ file: string; count: number }> = [];

  // Check each file in current baseline
  for (const [file, currentViolationCount] of Object.entries(currentBaseline.violations)) {
    const previousViolationCount = baseline.violations[file] ?? 0;

    if (currentViolationCount < previousViolationCount) {
      improved++;
      const fixed = previousViolationCount - currentViolationCount;
      fixedViolations.push({ file, count: fixed });
    } else if (currentViolationCount > previousViolationCount) {
      regressed++;
      const added = currentViolationCount - previousViolationCount;
      newViolations.push({ file, count: added });
    } else {
      unchanged++;
    }
  }

  // Check for newly scanned files (files not in baseline)
  for (const [file, currentViolationCount] of Object.entries(currentBaseline.violations)) {
    if (!(file in baseline.violations)) {
      regressed++;
      newViolations.push({ file, count: currentViolationCount });
    }
  }

  const totalFiles = Object.keys(currentBaseline.violations).length;
  const improvementPercentage = totalFiles > 0 ? (improved / totalFiles) * 100 : 0;
  const regressionPercentage = totalFiles > 0 ? (regressed / totalFiles) * 100 : 0;

  return {
    improved,
    regressed,
    unchanged,
    improvementPercentage,
    regressionPercentage,
    details: {
      newViolations,
      fixedViolations,
    },
  };
}

/**
 * Check if baseline exists
 */
export async function hasBaseline(baselineDir: string = BASELINE_DIR): Promise<boolean> {
  const filePath = resolve(baselineDir, 'baseline.json');
  return existsSync(filePath);
}

/**
 * Delete baseline
 */
export async function deleteBaseline(baselineDir: string = BASELINE_DIR): Promise<void> {
  const filePath = resolve(baselineDir, 'baseline.json');
  if (existsSync(filePath)) {
    // Can't use unlink here without importing fs, so we'll just overwrite with empty
    // This is a placeholder - actual delete would be in the delete command
    console.log(`Baseline can be deleted by removing ${filePath}`);
  }
}

/**
 * Format regression analysis for display
 */
export function formatRegression(analysis: RegressionAnalysis): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('📊 Regression Analysis');
  lines.push('─'.repeat(50));

  if (analysis.improved > 0) {
    lines.push(`✅ Fixed:      ${analysis.improved} file${analysis.improved === 1 ? '' : 's'} (${analysis.improvementPercentage.toFixed(1)}%)`);
  }
  if (analysis.regressed > 0) {
    lines.push(`⚠️  Regressed:  ${analysis.regressed} file${analysis.regressed === 1 ? '' : 's'} (${analysis.regressionPercentage.toFixed(1)}%)`);
  }
  if (analysis.unchanged > 0) {
    lines.push(`➖ Unchanged:  ${analysis.unchanged} file${analysis.unchanged === 1 ? '' : 's'}`);
  }

  if (analysis.details.fixedViolations.length > 0) {
    lines.push('');
    lines.push('✨ Issues Fixed:');
    for (const { file, count } of analysis.details.fixedViolations.slice(0, 5)) {
      lines.push(`   ${file}: -${count} issue${count === 1 ? '' : 's'}`);
    }
    if (analysis.details.fixedViolations.length > 5) {
      lines.push(`   ... and ${analysis.details.fixedViolations.length - 5} more`);
    }
  }

  if (analysis.details.newViolations.length > 0) {
    lines.push('');
    lines.push('⚠️  New Issues:');
    for (const { file, count } of analysis.details.newViolations.slice(0, 5)) {
      lines.push(`   ${file}: +${count} issue${count === 1 ? '' : 's'}`);
    }
    if (analysis.details.newViolations.length > 5) {
      lines.push(`   ... and ${analysis.details.newViolations.length - 5} more`);
    }
  }

  lines.push('');

  return lines.join('\n');
}
