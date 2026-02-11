/**
 * ally health command - Quick accessibility overview like npm audit
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';
import chalk from 'chalk';
import boxen from 'boxen';
import {
  printBanner,
  createSpinner,
  printError,
  printInfo,
} from '../utils/ui.js';
import {
  AccessibilityScanner,
  findHtmlFiles,
  createReport,
  type WcagStandard,
  DEFAULT_STANDARD,
  DEFAULT_TIMEOUT,
  DEFAULT_BATCH_SIZE,
} from '../utils/scanner.js';
import { loadConfig, loadIgnorePatterns } from '../utils/config.js';
import type { AllyReport, Violation, Severity } from '../types/index.js';

/**
 * Category definitions for grouping accessibility rules
 */
type Category = 'html-structure' | 'color-contrast' | 'keyboard-nav' | 'aria-usage' | 'forms' | 'images';

interface CategoryConfig {
  name: string;
  icon: string;
  patterns: RegExp[];
}

const CATEGORY_CONFIG: Record<Category, CategoryConfig> = {
  'html-structure': {
    name: 'HTML Structure',
    icon: '1',
    patterns: [
      /^heading-order$/,
      /^document-title$/,
      /^html-has-lang$/,
      /^html-lang-valid$/,
      /^bypass$/,
      /^landmark-/,
      /^region$/,
      /^page-has-heading-one$/,
      /^meta-viewport$/,
      /^frame-title$/,
      /^valid-lang$/,
    ],
  },
  'color-contrast': {
    name: 'Color Contrast',
    icon: '2',
    patterns: [
      /^color-contrast/,
      /^link-in-text-block$/,
    ],
  },
  'keyboard-nav': {
    name: 'Keyboard Nav',
    icon: '3',
    patterns: [
      /^tabindex$/,
      /^focus-/,
      /^scrollable-region-focusable$/,
      /^accesskey/,
      /^skip-link$/,
    ],
  },
  'aria-usage': {
    name: 'ARIA Usage',
    icon: '4',
    patterns: [
      /^aria-/,
      /^role-/,
    ],
  },
  'forms': {
    name: 'Forms',
    icon: '5',
    patterns: [
      /^label$/,
      /^label-/,
      /^autocomplete-valid$/,
      /^input-/,
      /^select-/,
      /^form-field-multiple-labels$/,
    ],
  },
  'images': {
    name: 'Images',
    icon: '6',
    patterns: [
      /^image-alt$/,
      /^svg-img-alt$/,
      /^image-redundant-alt$/,
      /^object-alt$/,
      /^area-alt$/,
    ],
  },
};

/**
 * Severity penalty points
 */
const SEVERITY_PENALTY: Record<Severity, number> = {
  critical: 25,
  serious: 15,
  moderate: 10,
  minor: 5,
};

interface CategoryScore {
  category: Category;
  name: string;
  score: number;
  violations: number;
  icon: string;
}

interface HealthOptions {
  path?: string;
  standard?: WcagStandard;
  input?: string;
}

interface Recommendation {
  message: string;
  category: Category;
  count: number;
}

/**
 * Determine which category a violation belongs to based on its ID
 */
function categorizeViolation(violationId: string): Category | null {
  for (const [category, config] of Object.entries(CATEGORY_CONFIG)) {
    for (const pattern of config.patterns) {
      if (pattern.test(violationId)) {
        return category as Category;
      }
    }
  }
  return null;
}

/**
 * Calculate scores by category from violations
 */
function calculateCategoryScores(violations: Violation[]): CategoryScore[] {
  // Initialize category data
  const categoryData: Record<Category, { penalty: number; violations: number }> = {
    'html-structure': { penalty: 0, violations: 0 },
    'color-contrast': { penalty: 0, violations: 0 },
    'keyboard-nav': { penalty: 0, violations: 0 },
    'aria-usage': { penalty: 0, violations: 0 },
    'forms': { penalty: 0, violations: 0 },
    'images': { penalty: 0, violations: 0 },
  };

  // Process each violation
  for (const violation of violations) {
    const category = categorizeViolation(violation.id);
    if (category) {
      const penalty = SEVERITY_PENALTY[violation.impact] || 5;
      // Count each node instance, capped at 10 per violation
      const nodeCount = Math.min(violation.nodes.length, 10);
      categoryData[category].penalty += penalty * nodeCount;
      categoryData[category].violations += nodeCount;
    }
  }

  // Convert to scores
  const categoryOrder: Category[] = ['html-structure', 'color-contrast', 'keyboard-nav', 'aria-usage', 'forms', 'images'];

  return categoryOrder.map((category) => {
    const config = CATEGORY_CONFIG[category];
    const data = categoryData[category];
    // Score starts at 100, subtract penalties, minimum 0
    const score = Math.max(0, 100 - Math.min(data.penalty, 100));

    return {
      category,
      name: config.name,
      score: Math.round(score),
      violations: data.violations,
      icon: config.icon,
    };
  });
}

/**
 * Get score label based on value
 */
function getScoreLabel(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 50) return 'Needs Work';
  return 'Poor';
}

/**
 * Get score icon based on value
 */
function getScoreIcon(score: number): string {
  if (score >= 75) return chalk.green('\u2713'); // checkmark
  if (score >= 50) return chalk.yellow('\u26A0'); // warning
  return chalk.red('\u2717'); // x mark
}

/**
 * Generate top recommendations from violations
 */
function generateRecommendations(violations: Violation[], categoryScores: CategoryScore[]): Recommendation[] {
  // Group violations by category and count
  const categoryViolations: Map<Category, Map<string, { count: number; description: string }>> = new Map();

  for (const violation of violations) {
    const category = categorizeViolation(violation.id);
    if (!category) continue;

    if (!categoryViolations.has(category)) {
      categoryViolations.set(category, new Map());
    }

    const catMap = categoryViolations.get(category)!;
    const existing = catMap.get(violation.id);
    const nodeCount = violation.nodes.length;

    if (existing) {
      existing.count += nodeCount;
    } else {
      catMap.set(violation.id, { count: nodeCount, description: violation.help });
    }
  }

  // Sort categories by score (lowest first) to prioritize recommendations
  const sortedCategories = [...categoryScores].sort((a, b) => a.score - b.score);

  const recommendations: Recommendation[] = [];

  for (const catScore of sortedCategories) {
    if (catScore.score >= 90) continue; // Skip excellent categories

    const catViolations = categoryViolations.get(catScore.category);
    if (!catViolations) continue;

    // Get the most common violation in this category
    let topViolation: { id: string; count: number; description: string } | null = null;
    for (const [id, data] of catViolations.entries()) {
      if (!topViolation || data.count > topViolation.count) {
        topViolation = { id, count: data.count, description: data.description };
      }
    }

    if (topViolation) {
      recommendations.push({
        message: `Fix ${topViolation.count} ${topViolation.description.toLowerCase()}`,
        category: catScore.category,
        count: topViolation.count,
      });
    }

    if (recommendations.length >= 3) break; // Limit to 3 recommendations
  }

  return recommendations;
}

/**
 * Get the lowest scoring category for the fix command suggestion
 */
function getWorstCategory(categoryScores: CategoryScore[]): Category {
  let worst = categoryScores[0];
  for (const score of categoryScores) {
    if (score.score < worst.score) {
      worst = score;
    }
  }
  return worst.category;
}

/**
 * Render the health check box
 */
function renderHealthBox(
  overallScore: number,
  categoryScores: CategoryScore[],
  recommendations: Recommendation[]
): string {
  const boxWidth = 48;
  const scoreLabel = getScoreLabel(overallScore);
  const scoreColor = overallScore >= 75 ? chalk.green : overallScore >= 50 ? chalk.yellow : chalk.red;

  // Build content lines
  const lines: string[] = [];

  // Header
  lines.push(chalk.bold('  Accessibility Health Check'));
  lines.push('');

  // Overall score
  lines.push(`  Overall Score: ${scoreColor.bold(`${overallScore}/100`)} (${scoreLabel})`);
  lines.push('');

  // Category scores
  for (const cat of categoryScores) {
    const icon = getScoreIcon(cat.score);
    const nameWidth = 18;
    const paddedName = cat.name.padEnd(nameWidth);
    const scoreStr = `${cat.score}/100`;
    lines.push(`  ${icon} ${paddedName} ${chalk.dim('|')} ${scoreStr}`);
  }

  lines.push('');

  // Recommendations
  if (recommendations.length > 0) {
    lines.push(chalk.bold('  Top Recommendations:'));
    recommendations.forEach((rec, i) => {
      lines.push(`  ${i + 1}. ${rec.message}`);
    });
    lines.push('');
  }

  // Fix command suggestion
  const worstCategory = getWorstCategory(categoryScores);
  lines.push(chalk.dim(`  Run: ally fix --category ${worstCategory}`));

  return lines.join('\n');
}

export async function healthCommand(options: HealthOptions = {}): Promise<void> {
  printBanner();

  const {
    path: targetPath = '.',
    standard = DEFAULT_STANDARD,
    input,
  } = options;

  let report: AllyReport | null = null;

  // Check if we should use existing scan results
  if (input) {
    const inputPath = resolve(input);
    if (!existsSync(inputPath)) {
      printError(`Input file not found: ${input}`);
      return;
    }

    const spinner = createSpinner('Loading scan results...');
    spinner.start();

    try {
      const content = await readFile(inputPath, 'utf-8');
      report = JSON.parse(content) as AllyReport;
      spinner.succeed('Loaded existing scan results');
    } catch (error) {
      spinner.fail('Failed to load scan results');
      printError(error instanceof Error ? error.message : String(error));
      return;
    }
  } else {
    // Check for existing .ally/scan.json
    const defaultScanPath = resolve(targetPath, '.ally', 'scan.json');
    if (existsSync(defaultScanPath)) {
      const spinner = createSpinner('Loading existing scan results...');
      spinner.start();

      try {
        const content = await readFile(defaultScanPath, 'utf-8');
        report = JSON.parse(content) as AllyReport;
        spinner.succeed('Using existing scan from .ally/scan.json');
        printInfo('Run `ally scan` to update results');
      } catch {
        // Fall through to new scan
      }
    }

    // If no existing results, run a scan
    if (!report) {
      const spinner = createSpinner('Scanning project for accessibility issues...');
      spinner.start();

      try {
        // Load config
        const { config } = await loadConfig();
        const { patterns: ignorePatterns } = await loadIgnorePatterns();
        const allIgnorePatterns = [...ignorePatterns, ...(config.scan?.ignore ?? [])];

        // Find HTML files
        const absolutePath = resolve(targetPath);
        const htmlFiles = await findHtmlFiles(absolutePath, allIgnorePatterns);

        if (htmlFiles.length === 0) {
          spinner.fail('No HTML files found');
          printInfo('Use `ally scan --url <url>` to scan a live URL');
          return;
        }

        spinner.text = `Scanning ${htmlFiles.length} files...`;

        // Scan files
        const scanner = new AccessibilityScanner(DEFAULT_TIMEOUT);
        await scanner.init();

        try {
          const { results } = await scanner.scanHtmlFilesParallel(
            htmlFiles,
            standard,
            DEFAULT_BATCH_SIZE
          );

          report = createReport(results);
          spinner.succeed(`Scanned ${results.length} files`);
        } finally {
          await scanner.close();
        }
      } catch (error) {
        spinner.fail('Scan failed');
        printError(error instanceof Error ? error.message : String(error));
        return;
      }
    }
  }

  if (!report) {
    printError('No scan results available');
    return;
  }

  // Collect all violations from the report
  const allViolations: Violation[] = [];
  for (const result of report.results) {
    allViolations.push(...result.violations);
  }

  // Calculate category scores
  const categoryScores = calculateCategoryScores(allViolations);

  // Calculate overall score (average of category scores)
  const overallScore = Math.round(
    categoryScores.reduce((sum, cat) => sum + cat.score, 0) / categoryScores.length
  );

  // Generate recommendations
  const recommendations = generateRecommendations(allViolations, categoryScores);

  // Render the health box
  const content = renderHealthBox(overallScore, categoryScores, recommendations);

  const borderColor = overallScore >= 75 ? 'green' : overallScore >= 50 ? 'yellow' : 'red';

  console.log(
    boxen(content, {
      padding: { top: 1, bottom: 1, left: 0, right: 0 },
      borderStyle: 'round',
      borderColor,
    })
  );

  console.log();
}

export default healthCommand;
