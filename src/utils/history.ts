/**
 * History management utilities for tracking accessibility progress over time
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, join } from 'path';
import chalk from 'chalk';

export interface HistoryEntry {
  date: string;  // ISO date
  score: number;
  errors: number;    // critical + serious
  warnings: number;  // moderate + minor
  filesScanned: number;
}

// Path to history file relative to project
const HISTORY_FILE = 'history.json';
const ALLY_DIR = '.ally';

/**
 * Get the path to the history file for a project
 */
function getHistoryPath(projectPath: string): string {
  return resolve(projectPath, ALLY_DIR, HISTORY_FILE);
}

/**
 * Save a new history entry
 */
export async function saveHistoryEntry(projectPath: string, entry: HistoryEntry): Promise<void> {
  const allyDir = resolve(projectPath, ALLY_DIR);
  const historyPath = getHistoryPath(projectPath);

  // Ensure .ally directory exists
  if (!existsSync(allyDir)) {
    await mkdir(allyDir, { recursive: true });
  }

  // Load existing history
  let history: HistoryEntry[] = [];
  if (existsSync(historyPath)) {
    try {
      const content = await readFile(historyPath, 'utf-8');
      history = JSON.parse(content);
    } catch {
      history = [];
    }
  }

  // Add new entry (limit to last 90 days of entries)
  history.push(entry);
  if (history.length > 90) {
    history = history.slice(-90);
  }

  await writeFile(historyPath, JSON.stringify(history, null, 2));
}

/**
 * Load history entries (last N days by default)
 */
export async function loadHistory(projectPath: string, days: number = 30): Promise<HistoryEntry[]> {
  const historyPath = getHistoryPath(projectPath);

  if (!existsSync(historyPath)) {
    return [];
  }

  try {
    const content = await readFile(historyPath, 'utf-8');
    const history: HistoryEntry[] = JSON.parse(content);

    // Filter to last N days
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    return history.filter(entry => new Date(entry.date) >= cutoff);
  } catch {
    return [];
  }
}

/**
 * Calculate trend information from history
 */
export interface TrendInfo {
  lastWeekChange: number | null;  // Change from last week
  lastScanChange: number | null;  // Change from last scan
  periodChange: number | null;    // Change over the entire history period
  direction: 'up' | 'down' | 'stable';
  periodDays: number;
}

export function calculateTrend(history: HistoryEntry[], currentScore: number): TrendInfo {
  if (history.length === 0) {
    return {
      lastWeekChange: null,
      lastScanChange: null,
      periodChange: null,
      direction: 'stable',
      periodDays: 0,
    };
  }

  // Change from last scan
  const lastEntry = history[history.length - 1];
  const lastScanChange = currentScore - lastEntry.score;

  // Change from one week ago
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const weekOldEntry = history.find(entry => new Date(entry.date) >= oneWeekAgo);
  const lastWeekChange = weekOldEntry ? currentScore - weekOldEntry.score : null;

  // Change over entire period
  const firstEntry = history[0];
  const periodChange = currentScore - firstEntry.score;
  const firstDate = new Date(firstEntry.date);
  const periodDays = Math.ceil((Date.now() - firstDate.getTime()) / (1000 * 60 * 60 * 24));

  // Determine direction
  let direction: 'up' | 'down' | 'stable' = 'stable';
  if (lastScanChange > 0) direction = 'up';
  else if (lastScanChange < 0) direction = 'down';

  return {
    lastWeekChange,
    lastScanChange,
    periodChange,
    direction,
    periodDays,
  };
}

/**
 * Format trend string with arrow and color
 */
export function formatTrend(trend: TrendInfo): string {
  const lines: string[] = [];

  if (trend.lastScanChange !== null && trend.lastScanChange !== 0) {
    const arrow = trend.lastScanChange > 0 ? '\u2191' : '\u2193';
    const sign = trend.lastScanChange > 0 ? '+' : '';
    const color = trend.lastScanChange > 0 ? chalk.green : chalk.red;
    lines.push(color(`${arrow} ${sign}${trend.lastScanChange} from last scan`));
  }

  if (trend.lastWeekChange !== null && trend.lastWeekChange !== 0) {
    const arrow = trend.lastWeekChange > 0 ? '\u2191' : '\u2193';
    const sign = trend.lastWeekChange > 0 ? '+' : '';
    const color = trend.lastWeekChange > 0 ? chalk.green : chalk.red;
    lines.push(color(`${arrow} ${sign}${trend.lastWeekChange} from last week`));
  }

  if (trend.periodChange !== null && trend.periodDays > 7 && trend.periodChange !== 0) {
    const arrow = trend.periodChange > 0 ? '\u2191' : '\u2193';
    const sign = trend.periodChange > 0 ? '+' : '';
    const color = trend.periodChange > 0 ? chalk.green : chalk.red;
    lines.push(color(`${arrow} ${sign}${trend.periodChange} points over ${trend.periodDays} days`));
  }

  return lines.join('\n');
}

/**
 * Render an ASCII chart of score history
 * Uses block characters for a more polished look
 */
export function renderAsciiChart(
  history: HistoryEntry[],
  currentScore: number,
  width: number = 50,
  height: number = 8
): string {
  if (history.length === 0) {
    return chalk.dim('  No history data available yet.');
  }

  // Include current score in the data
  const scores = [...history.map(h => h.score), currentScore];
  const dates = [...history.map(h => h.date), new Date().toISOString()];

  // Calculate min/max for scaling
  const minScore = Math.min(...scores, 0);
  const maxScore = Math.max(...scores, 100);
  const range = maxScore - minScore || 1;

  // Y-axis labels
  const yAxisWidth = 4;
  const chartWidth = width - yAxisWidth - 1;

  // Sample data points to fit chart width
  const step = Math.max(1, Math.floor(scores.length / chartWidth));
  const sampledScores: number[] = [];
  const sampledDates: string[] = [];

  for (let i = 0; i < scores.length; i += step) {
    sampledScores.push(scores[i]);
    sampledDates.push(dates[i]);
  }

  // Ensure we include the last point
  if (sampledScores[sampledScores.length - 1] !== scores[scores.length - 1]) {
    sampledScores.push(scores[scores.length - 1]);
    sampledDates.push(dates[dates.length - 1]);
  }

  const lines: string[] = [];

  // Header
  lines.push(chalk.bold.cyan('Score History (last 30 days):'));
  lines.push('');

  // Chart area - build from top to bottom
  for (let row = height - 1; row >= 0; row--) {
    const threshold = minScore + (range * (row + 1) / height);
    const prevThreshold = minScore + (range * row / height);

    // Y-axis label (only show a few)
    let yLabel = '';
    if (row === height - 1) {
      yLabel = maxScore.toString().padStart(yAxisWidth - 1) + '\u2502';
    } else if (row === 0) {
      yLabel = minScore.toString().padStart(yAxisWidth - 1) + '\u2502';
    } else if (row === Math.floor(height / 2)) {
      const midVal = Math.round((minScore + maxScore) / 2);
      yLabel = midVal.toString().padStart(yAxisWidth - 1) + '\u2502';
    } else {
      yLabel = ' '.repeat(yAxisWidth - 1) + '\u2502';
    }

    // Chart line
    let chartLine = '';
    for (let col = 0; col < sampledScores.length; col++) {
      const score = sampledScores[col];

      if (score >= threshold) {
        // Full block
        chartLine += getBlockChar(score, true);
      } else if (score > prevThreshold) {
        // Partial block (top)
        chartLine += getBlockChar(score, false);
      } else {
        // Empty
        chartLine += ' ';
      }
    }

    lines.push(yLabel + chartLine);
  }

  // X-axis
  const xAxisLine = ' '.repeat(yAxisWidth - 1) + '\u2514' + '\u2500'.repeat(sampledScores.length);
  lines.push(xAxisLine);

  // X-axis labels (dates)
  if (sampledDates.length > 0) {
    const firstDate = formatDateShort(sampledDates[0]);
    const lastDate = formatDateShort(sampledDates[sampledDates.length - 1]);
    const midIdx = Math.floor(sampledDates.length / 2);
    const midDate = sampledDates[midIdx] ? formatDateShort(sampledDates[midIdx]) : '';

    // Calculate positions
    const spacing = sampledScores.length - firstDate.length - lastDate.length;
    let dateLabel = ' '.repeat(yAxisWidth) + firstDate;

    if (spacing > midDate.length + 4) {
      // Add middle date
      const midPos = Math.floor(sampledScores.length / 2) - Math.floor(midDate.length / 2);
      const leftPad = midPos - firstDate.length;
      const rightPad = sampledScores.length - midPos - midDate.length - lastDate.length;
      dateLabel = ' '.repeat(yAxisWidth) + firstDate + ' '.repeat(Math.max(1, leftPad)) + midDate + ' '.repeat(Math.max(1, rightPad)) + lastDate;
    } else {
      dateLabel = ' '.repeat(yAxisWidth) + firstDate + ' '.repeat(Math.max(1, spacing)) + lastDate;
    }

    lines.push(chalk.dim(dateLabel));
  }

  return lines.join('\n');
}

/**
 * Get block character for chart based on score
 */
function getBlockChar(score: number, full: boolean): string {
  const color = score >= 75 ? chalk.green
    : score >= 50 ? chalk.yellow
    : chalk.red;

  // Use full or partial blocks
  return color(full ? '\u2588' : '\u2584');
}

/**
 * Format date for X-axis labels
 */
function formatDateShort(isoDate: string): string {
  const date = new Date(isoDate);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

/**
 * Create a history entry from scan results
 */
export function createHistoryEntry(
  score: number,
  bySeverity: Record<string, number>,
  filesScanned: number
): HistoryEntry {
  return {
    date: new Date().toISOString(),
    score,
    errors: (bySeverity.critical ?? 0) + (bySeverity.serious ?? 0),
    warnings: (bySeverity.moderate ?? 0) + (bySeverity.minor ?? 0),
    filesScanned,
  };
}
