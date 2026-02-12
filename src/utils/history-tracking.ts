/**
 * Historical Tracking System
 * 
 * Tracks scan history over time to show progress and trends.
 * Quick win: 3 days effort, HIGH ROI - shows teams their improvement.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';
import type { AllyReport } from '../types/index.js';

export interface HistoryEntry {
  timestamp: string;
  score: number;
  totalViolations: number;
  bySeverity: {
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
  };
  filesScanned: number;
  command: string;
  branch?: string;
  commit?: string;
}

export interface HistoryData {
  entries: HistoryEntry[];
  firstScan: string;
  lastScan: string;
  totalScans: number;
}

const HISTORY_FILE = '.ally/history.json';
const MAX_ENTRIES = 100; // Keep last 100 scans

/**
 * Load history from file
 */
export async function loadHistory(): Promise<HistoryData> {
  if (!existsSync(HISTORY_FILE)) {
    return {
      entries: [],
      firstScan: new Date().toISOString(),
      lastScan: new Date().toISOString(),
      totalScans: 0,
    };
  }

  try {
    const content = await readFile(HISTORY_FILE, 'utf-8');
    const data = JSON.parse(content);
    
    // Ensure entries is an array
    if (!Array.isArray(data.entries)) {
      data.entries = [];
    }
    
    return data;
  } catch {
    return {
      entries: [],
      firstScan: new Date().toISOString(),
      lastScan: new Date().toISOString(),
      totalScans: 0,
    };
  }
}

/**
 * Save history entry
 */
export async function saveHistoryEntry(
  report: AllyReport,
  command: string = 'scan'
): Promise<void> {
  const history = await loadHistory();

  // Get git info if available
  let branch: string | undefined;
  let commit: string | undefined;
  
  try {
    const { execSync } = await import('child_process');
    branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
    commit = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    // Git not available or not a git repo
  }

  const entry: HistoryEntry = {
    timestamp: report.scanDate,
    score: report.summary.score,
    totalViolations: report.summary.totalViolations,
    bySeverity: report.summary.bySeverity,
    filesScanned: report.totalFiles,
    command,
    branch,
    commit,
  };

  history.entries.push(entry);

  // Keep only last MAX_ENTRIES
  if (history.entries.length > MAX_ENTRIES) {
    history.entries = history.entries.slice(-MAX_ENTRIES);
  }

  // Update metadata
  if (history.entries.length === 1) {
    history.firstScan = entry.timestamp;
  }
  history.lastScan = entry.timestamp;
  history.totalScans = history.entries.length;

  // Ensure directory exists
  const dir = resolve('.ally');
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  // Save to file
  await writeFile(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8');
}

/**
 * Get trend direction (improving, declining, stable)
 */
export function getTrend(history: HistoryData, lookback: number = 5): 'improving' | 'declining' | 'stable' {
  if (history.entries.length < 2) {
    return 'stable';
  }

  const recentEntries = history.entries.slice(-lookback);
  const scores = recentEntries.map(e => e.score);
  
  // Calculate average of first half vs second half
  const midpoint = Math.floor(scores.length / 2);
  const firstHalf = scores.slice(0, midpoint);
  const secondHalf = scores.slice(midpoint);
  
  const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  
  const diff = avgSecond - avgFirst;
  
  if (diff > 2) return 'improving';
  if (diff < -2) return 'declining';
  return 'stable';
}

/**
 * Get score change from previous scan
 */
export function getScoreChange(history: HistoryData): number | null {
  if (history.entries.length < 2) {
    return null;
  }

  const latest = history.entries[history.entries.length - 1];
  const previous = history.entries[history.entries.length - 2];
  
  return latest.score - previous.score;
}

/**
 * Get best score ever achieved
 */
export function getBestScore(history: HistoryData): number | null {
  if (history.entries.length === 0) {
    return null;
  }

  return Math.max(...history.entries.map(e => e.score));
}

/**
 * Get worst score ever recorded
 */
export function getWorstScore(history: HistoryData): number | null {
  if (history.entries.length === 0) {
    return null;
  }

  return Math.min(...history.entries.map(e => e.score));
}

/**
 * Get average score over time
 */
export function getAverageScore(history: HistoryData): number | null {
  if (history.entries.length === 0) {
    return null;
  }

  const sum = history.entries.reduce((acc, e) => acc + e.score, 0);
  return Math.round(sum / history.entries.length);
}

/**
 * Get total violations fixed since first scan
 */
export function getTotalFixed(history: HistoryData): number | null {
  if (history.entries.length < 2) {
    return null;
  }

  const first = history.entries[0];
  const latest = history.entries[history.entries.length - 1];
  
  return first.totalViolations - latest.totalViolations;
}

/**
 * Get streak (consecutive scans with improving or stable scores)
 */
export function getStreak(history: HistoryData): number {
  if (history.entries.length < 2) {
    return 0;
  }

  let streak = 0;
  
  for (let i = history.entries.length - 1; i > 0; i--) {
    const current = history.entries[i];
    const previous = history.entries[i - 1];
    
    if (current.score >= previous.score) {
      streak++;
    } else {
      break;
    }
  }
  
  return streak;
}

/**
 * Format time ago (e.g., "2 hours ago", "3 days ago")
 */
export function timeAgo(timestamp: string): string {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days} day${days === 1 ? '' : 's'} ago`;
  if (hours > 0) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  if (minutes > 0) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  return 'just now';
}

/**
 * Get recent entries (last N scans)
 */
export function getRecentEntries(history: HistoryData, count: number = 10): HistoryEntry[] {
  return history.entries.slice(-count);
}

/**
 * Get entries by branch
 */
export function getEntriesByBranch(history: HistoryData, branch: string): HistoryEntry[] {
  return history.entries.filter(e => e.branch === branch);
}

/**
 * Get summary stats for display
 */
export interface HistoryStats {
  currentScore: number;
  previousScore: number | null;
  scoreChange: number | null;
  trend: 'improving' | 'declining' | 'stable';
  bestScore: number | null;
  worstScore: number | null;
  averageScore: number | null;
  totalScans: number;
  totalFixed: number | null;
  streak: number;
  lastScan: string;
  firstScan: string;
}

export function getStats(history: HistoryData): HistoryStats | null {
  if (history.entries.length === 0) {
    return null;
  }

  const latest = history.entries[history.entries.length - 1];
  const previous = history.entries.length > 1 ? history.entries[history.entries.length - 2] : null;

  return {
    currentScore: latest.score,
    previousScore: previous?.score ?? null,
    scoreChange: getScoreChange(history),
    trend: getTrend(history),
    bestScore: getBestScore(history),
    worstScore: getWorstScore(history),
    averageScore: getAverageScore(history),
    totalScans: history.totalScans,
    totalFixed: getTotalFixed(history),
    streak: getStreak(history),
    lastScan: latest.timestamp,
    firstScan: history.firstScan,
  };
}
