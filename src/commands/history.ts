/**
 * ally history command - View scan history and progress
 */

import chalk from 'chalk';
import boxen from 'boxen';
import {
  loadHistory,
  getStats,
  getRecentEntries,
  timeAgo,
  type HistoryEntry,
  type HistoryStats,
} from '../utils/history-tracking.js';
import { printError, printInfo } from '../utils/ui.js';

interface HistoryCommandOptions {
  limit?: number;
  branch?: string;
  verbose?: boolean;
}

/**
 * Display a single history entry
 */
function printEntry(entry: HistoryEntry, index: number, total: number): void {
  const num = total - index;
  const scoreColor = 
    entry.score >= 90 ? chalk.green :
    entry.score >= 75 ? chalk.yellow :
    entry.score >= 50 ? chalk.yellow.dim :
    chalk.red;

  const branchInfo = entry.branch ? chalk.dim(` [${entry.branch}`) + (entry.commit ? chalk.dim(`@${entry.commit}]`) : chalk.dim(']')) : '';
  
  console.log(
    chalk.dim(`#${num}`) + 
    ' ' +
    chalk.cyan(timeAgo(entry.timestamp)) +
    ' ' +
    scoreColor(`${entry.score}/100`) +
    ' ' +
    chalk.dim(`(${entry.totalViolations} issues, ${entry.filesScanned} files)`) +
    branchInfo
  );
}

/**
 * Display stats summary
 */
function printStats(stats: HistoryStats): void {
  const scoreColor = 
    stats.currentScore >= 90 ? chalk.green.bold :
    stats.currentScore >= 75 ? chalk.yellow.bold :
    stats.currentScore >= 50 ? chalk.yellow :
    chalk.red.bold;

  const trendIcon = 
    stats.trend === 'improving' ? chalk.green('↗ improving') :
    stats.trend === 'declining' ? chalk.red('↘ declining') :
    chalk.blue('→ stable');

  const changeText = stats.scoreChange !== null
    ? stats.scoreChange > 0
      ? chalk.green(`+${stats.scoreChange}`)
      : stats.scoreChange < 0
      ? chalk.red(`${stats.scoreChange}`)
      : chalk.dim('no change')
    : chalk.dim('first scan');

  const fixedText = stats.totalFixed !== null
    ? stats.totalFixed > 0
      ? chalk.green(`${stats.totalFixed} fixed`)
      : stats.totalFixed < 0
      ? chalk.red(`${Math.abs(stats.totalFixed)} added`)
      : chalk.dim('no change')
    : chalk.dim('no data');

  const streakText = stats.streak > 0
    ? chalk.green(`${stats.streak} scan${stats.streak === 1 ? '' : 's'}`)
    : chalk.dim('0 scans');

  const summary = `
${chalk.bold('Current Score:')} ${scoreColor(stats.currentScore.toString())}${chalk.dim('/100')} ${changeText}

${chalk.bold('Trend:')} ${trendIcon}
${chalk.bold('Streak:')} ${streakText} improving/stable

${chalk.bold('Statistics:')}
  Best:    ${chalk.green(stats.bestScore?.toString() ?? 'N/A')}${stats.bestScore ? '/100' : ''}
  Average: ${chalk.yellow(stats.averageScore?.toString() ?? 'N/A')}${stats.averageScore ? '/100' : ''}
  Worst:   ${chalk.red(stats.worstScore?.toString() ?? 'N/A')}${stats.worstScore ? '/100' : ''}

${chalk.bold('Progress:')}
  Total scans: ${chalk.cyan(stats.totalScans.toString())}
  Issues fixed: ${fixedText}
  First scan: ${chalk.dim(timeAgo(stats.firstScan))}
  Last scan: ${chalk.dim(timeAgo(stats.lastScan))}
`;

  console.log(
    boxen(summary.trim(), {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: stats.currentScore >= 75 ? 'green' : stats.currentScore >= 50 ? 'yellow' : 'red',
      title: '📊 Accessibility Progress',
      titleAlignment: 'center',
    })
  );
}

/**
 * Create ASCII sparkline from scores
 */
function createSparkline(entries: HistoryEntry[], width: number = 50): string {
  if (entries.length === 0) return '';

  const scores = entries.map(e => e.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min || 1;

  const bars = '▁▂▃▄▅▆▇█';
  
  // Sample scores to fit width
  const step = Math.max(1, Math.ceil(scores.length / width));
  const sampledScores: number[] = [];
  
  for (let i = 0; i < scores.length; i += step) {
    sampledScores.push(scores[i]);
  }

  return sampledScores
    .map(score => {
      const normalized = (score - min) / range;
      const index = Math.min(bars.length - 1, Math.floor(normalized * bars.length));
      const char = bars[index];
      
      // Color based on score
      if (score >= 90) return chalk.green(char);
      if (score >= 75) return chalk.yellow(char);
      if (score >= 50) return chalk.yellow.dim(char);
      return chalk.red(char);
    })
    .join('');
}

export async function historyCommand(options: HistoryCommandOptions = {}): Promise<void> {
  const { limit = 10, branch, verbose = false } = options;

  // Load history
  const history = await loadHistory();

  if (history.entries.length === 0) {
    printInfo('No scan history yet. Run `ally scan` to start tracking progress.');
    return;
  }

  // Get stats
  const stats = getStats(history);
  if (!stats) {
    printError('Unable to calculate statistics');
    return;
  }

  // Print stats summary
  printStats(stats);

  // Filter by branch if requested
  let entries = history.entries;
  if (branch) {
    entries = entries.filter(e => e.branch === branch);
    if (entries.length === 0) {
      printError(`No scans found for branch: ${branch}`);
      return;
    }
    printInfo(`Showing scans for branch: ${branch}`);
  }

  // Print sparkline
  if (entries.length > 1) {
    console.log();
    console.log(chalk.bold('Score History:'));
    console.log(createSparkline(entries));
    console.log(chalk.dim(`${entries[0].score}${' '.repeat(42)}${entries[entries.length - 1].score}`));
    console.log();
  }

  // Print recent entries
  console.log(chalk.bold(`Recent Scans (last ${Math.min(limit, entries.length)}):`));
  console.log();

  const recentEntries = entries.slice(-limit).reverse();
  recentEntries.forEach((entry, index) => {
    printEntry(entry, index, entries.length);
  });

  // Motivational message
  console.log();
  const motivation = getMotivationalMessage(stats);
  if (motivation) {
    console.log(chalk.cyan('💡 ' + motivation));
  }
}

/**
 * Get motivational message based on stats
 */
function getMotivationalMessage(stats: HistoryStats): string | null {
  if (stats.currentScore === 100) {
    return 'Perfect score! Your site is fully accessible. 🎉';
  }

  if (stats.trend === 'improving' && stats.streak >= 3) {
    return `Great momentum! You've improved for ${stats.streak} consecutive scans. Keep it up!`;
  }

  if (stats.trend === 'improving') {
    return 'You\'re on the right track! Keep fixing those issues.';
  }

  if (stats.trend === 'declining') {
    return 'Score is declining. Time to address those new violations!';
  }

  if (stats.totalFixed && stats.totalFixed > 10) {
    return `Awesome! You've fixed ${stats.totalFixed} violations since starting.`;
  }

  if (stats.currentScore >= 90) {
    return 'Almost perfect! Just a few more fixes to go.';
  }

  if (stats.currentScore >= 75) {
    return 'Good accessibility! Focus on critical and serious issues.';
  }

  if (stats.currentScore >= 50) {
    return 'Making progress! Prioritize high-impact violations first.';
  }

  return 'Start by fixing critical violations - they block the most users.';
}
