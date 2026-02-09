/**
 * Core types for Ally accessibility scanner
 */

export type Severity = 'critical' | 'serious' | 'moderate' | 'minor';

export interface Violation {
  id: string;
  impact: Severity;
  description: string;
  help: string;
  helpUrl: string;
  nodes: ViolationNode[];
  tags: string[];
}

export interface ViolationNode {
  html: string;
  target: string[];
  failureSummary: string;
}

export interface ScanResult {
  url: string;
  file?: string;
  timestamp: string;
  violations: Violation[];
  passes: number;
  incomplete: number;
}

export interface AllyReport {
  version: string;
  scanDate: string;
  totalFiles: number;
  results: ScanResult[];
  summary: ReportSummary;
}

export interface ReportSummary {
  totalViolations: number;
  bySeverity: Record<Severity, number>;
  score: number;
  topIssues: TopIssue[];
}

export interface TopIssue {
  id: string;
  count: number;
  description: string;
  severity: Severity;
}

export interface FixResult {
  file: string;
  line: number;
  violation: string;
  fixed: boolean;
  skipped: boolean;
  diff?: string;
}

export interface ScanOptions {
  path: string;
  include?: string[];
  exclude?: string[];
  standards?: ('wcag2a' | 'wcag2aa' | 'wcag2aaa' | 'wcag21a' | 'wcag21aa' | 'wcag22aa')[];
  output?: string;
}
