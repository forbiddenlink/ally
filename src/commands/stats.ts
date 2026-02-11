/**
 * ally stats command - Shows accessibility progress over time
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, join } from 'path';
import chalk from 'chalk';
import boxen from 'boxen';
import {
  printBanner,
  printInfo,
  printSuccess,
  printError,
  animateScoreUp,
} from '../utils/ui.js';
import {
  loadHistory,
  calculateTrend,
  formatTrend,
  renderAsciiChart,
  type HistoryEntry,
} from '../utils/history.js';
import type { AllyReport } from '../types/index.js';

// Legacy history entry format (for backward compatibility)
interface LegacyHistoryEntry {
  date: string;
  score: number;
  violations?: number;
  files?: number;
  errors?: number;
  warnings?: number;
  filesScanned?: number;
}

/**
 * Convert legacy history entry to new format
 */
function normalizeHistoryEntry(entry: LegacyHistoryEntry): HistoryEntry {
  return {
    date: entry.date,
    score: entry.score,
    errors: entry.errors ?? entry.violations ?? 0,
    warnings: entry.warnings ?? 0,
    filesScanned: entry.filesScanned ?? entry.files ?? 0,
  };
}

export async function statsCommand(): Promise<void> {
  printBanner();

  const projectPath = resolve('.');
  const allyDir = resolve('.ally');

  if (!existsSync(allyDir)) {
    printError('No ally data found. Run `ally scan` first.');
    return;
  }

  // Load current scan
  const scanPath = join(allyDir, 'scan.json');
  if (!existsSync(scanPath)) {
    printError('No scan results found. Run `ally scan` first.');
    return;
  }

  const scanContent = await readFile(scanPath, 'utf-8');
  const report: AllyReport = JSON.parse(scanContent);

  // Load history (use the utility, but also handle legacy format)
  const historyPath = join(allyDir, 'history.json');
  let history: HistoryEntry[] = [];

  if (existsSync(historyPath)) {
    try {
      const historyContent = await readFile(historyPath, 'utf-8');
      const rawHistory: LegacyHistoryEntry[] = JSON.parse(historyContent);
      history = rawHistory.map(normalizeHistoryEntry);
    } catch {
      history = [];
    }
  }

  // Display current score with animation
  console.log(chalk.bold.cyan('\n📊 Accessibility Dashboard\n'));

  const previousScore = history.length > 0 ? history[history.length - 1].score : 0;
  await animateScoreUp(previousScore, report.summary.score);

  // Show trend information
  if (history.length > 0) {
    const trend = calculateTrend(history, report.summary.score);
    const trendText = formatTrend(trend);
    if (trendText) {
      console.log();
      console.log(chalk.bold('Trend:'));
      console.log(trendText);
    }
  }

  // Show ASCII chart of score history
  if (history.length > 1) {
    console.log();
    console.log(renderAsciiChart(history, report.summary.score));
  }

  // Show recent history entries
  if (history.length > 0) {
    console.log();
    console.log(chalk.bold('📈 Recent History'));
    console.log(chalk.dim('─'.repeat(50)));

    // Show last 5 entries
    const recentHistory = history.slice(-5);
    for (const entry of recentHistory) {
      const date = new Date(entry.date).toLocaleDateString();
      const scoreColor = entry.score >= 75 ? chalk.green : entry.score >= 50 ? chalk.yellow : chalk.red;
      const bar = getSmallBar(entry.score);
      const issues = entry.errors + entry.warnings;
      console.log(`  ${chalk.dim(date)}  ${bar}  ${scoreColor(entry.score.toString().padStart(3))}  (${issues} issues)`);
    }

    // Current
    const currentBar = getSmallBar(report.summary.score);
    const currentColor = report.summary.score >= 75 ? chalk.green : report.summary.score >= 50 ? chalk.yellow : chalk.red;
    console.log(`  ${chalk.bold('Today')}       ${currentBar}  ${currentColor.bold(report.summary.score.toString().padStart(3))}  (${report.summary.totalViolations} issues)`);

    // Calculate improvement from first entry
    const firstScore = history[0].score;
    const improvement = report.summary.score - firstScore;
    if (improvement > 0) {
      console.log();
      console.log(chalk.green.bold(`  🎉 +${improvement} points since you started!`));
    }
  }

  // Quick stats
  console.log();
  console.log(chalk.bold('📋 Current Status'));
  console.log(chalk.dim('─'.repeat(50)));

  const stats = [
    ['Files scanned', report.totalFiles.toString()],
    ['Total violations', report.summary.totalViolations.toString()],
    ['Critical issues', (report.summary.bySeverity.critical || 0).toString()],
    ['Serious issues', (report.summary.bySeverity.serious || 0).toString()],
  ];

  for (const [label, value] of stats) {
    console.log(`  ${chalk.dim(label + ':')} ${value}`);
  }

  // Motivational message
  console.log();
  if (report.summary.score === 100) {
    console.log(boxen(chalk.green.bold('🏆 Perfect Score! Your site is fully accessible.'), {
      padding: { top: 0, bottom: 0, left: 1, right: 1 },
      borderColor: 'green',
      borderStyle: 'round',
    }));
  } else if (report.summary.score >= 90) {
    console.log(chalk.green('Almost there! Just a few more fixes to reach 100%.'));
  } else if (report.summary.score >= 75) {
    console.log(chalk.yellow('Good progress! Focus on critical and serious issues next.'));
  } else {
    console.log(chalk.cyan('Run `ally fix` to start improving your score.'));
  }

  console.log();
}

function getSmallBar(score: number): string {
  const width = 15;
  const filled = Math.round((score / 100) * width);
  const empty = width - filled;

  const color = score >= 75 ? chalk.green : score >= 50 ? chalk.yellow : chalk.red;
  return color('▓'.repeat(filled)) + chalk.gray('░'.repeat(empty));
}

export default statsCommand;
