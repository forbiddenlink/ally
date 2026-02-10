/**
 * ally badge command - Generates accessibility score badges for README files
 */

import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';
import {
  printBanner,
  createSpinner,
  printError,
  printSuccess,
  printInfo,
} from '../utils/ui.js';
import type { AllyReport } from '../types/index.js';

type BadgeFormat = 'url' | 'markdown' | 'svg';

interface BadgeOptions {
  input?: string;
  format?: BadgeFormat;
  output?: string;
}

/**
 * Get badge color based on accessibility score
 * - green (80+)
 * - yellow (60-79)
 * - orange (40-59)
 * - red (<40)
 */
function getScoreColor(score: number): string {
  if (score >= 80) return 'green';
  if (score >= 60) return 'yellow';
  if (score >= 40) return 'orange';
  return 'red';
}

/**
 * Get hex color for SVG badge based on score
 */
function getScoreHexColor(score: number): string {
  if (score >= 80) return '#4c1';     // green
  if (score >= 60) return '#dfb317';  // yellow
  if (score >= 40) return '#fe7d37';  // orange
  return '#e05d44';                   // red
}

/**
 * Generate shields.io badge URL
 */
function generateBadgeUrl(score: number): string {
  const color = getScoreColor(score);
  const encodedLabel = encodeURIComponent('a11y score');
  const encodedValue = encodeURIComponent(`${score}%`);
  return `https://img.shields.io/badge/${encodedLabel}-${encodedValue}-${color}`;
}

/**
 * Generate markdown badge syntax
 */
function generateMarkdownBadge(score: number): string {
  const url = generateBadgeUrl(score);
  return `![A11y Score](${url})`;
}

/**
 * Generate SVG badge content
 */
function generateSvgBadge(score: number): string {
  const color = getScoreHexColor(score);
  const labelText = 'a11y score';
  const valueText = `${score}%`;

  // Calculate widths (approximate character widths)
  const labelWidth = labelText.length * 6.5 + 10;
  const valueWidth = valueText.length * 7 + 10;
  const totalWidth = labelWidth + valueWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${totalWidth}" height="20" role="img" aria-label="${labelText}: ${valueText}">
  <title>${labelText}: ${valueText}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="110">
    <text aria-hidden="true" x="${(labelWidth / 2) * 10}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${(labelWidth - 10) * 10}">${labelText}</text>
    <text x="${(labelWidth / 2) * 10}" y="140" transform="scale(.1)" fill="#fff" textLength="${(labelWidth - 10) * 10}">${labelText}</text>
    <text aria-hidden="true" x="${(labelWidth + valueWidth / 2) * 10}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${(valueWidth - 10) * 10}">${valueText}</text>
    <text x="${(labelWidth + valueWidth / 2) * 10}" y="140" transform="scale(.1)" fill="#fff" textLength="${(valueWidth - 10) * 10}">${valueText}</text>
  </g>
</svg>`;
}

export async function badgeCommand(options: BadgeOptions = {}): Promise<void> {
  printBanner();

  const {
    input = '.ally/scan.json',
    format = 'url',
    output,
  } = options;

  // Load scan results
  const spinner = createSpinner('Loading scan results...');
  spinner.start();

  const reportPath = resolve(input);

  if (!existsSync(reportPath)) {
    spinner.fail('No scan results found');
    printError(`Run 'ally scan' first to generate accessibility report`);
    return;
  }

  let report: AllyReport;
  try {
    const content = await readFile(reportPath, 'utf-8');
    report = JSON.parse(content) as AllyReport;
    spinner.succeed('Loaded scan results');
  } catch (error) {
    spinner.fail('Failed to load scan results');
    printError(error instanceof Error ? error.message : String(error));
    return;
  }

  const score = report.summary.score;
  let badgeOutput: string;

  switch (format) {
    case 'markdown':
      badgeOutput = generateMarkdownBadge(score);
      break;
    case 'svg':
      badgeOutput = generateSvgBadge(score);
      break;
    case 'url':
    default:
      badgeOutput = generateBadgeUrl(score);
  }

  // If output file specified (for SVG), write to file
  if (output) {
    if (format !== 'svg') {
      printInfo('Note: --output option is primarily intended for SVG format');
    }
    try {
      await writeFile(resolve(output), badgeOutput);
      printSuccess(`Badge saved to: ${output}`);
    } catch (error) {
      printError(`Failed to write badge: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
  } else {
    // Print badge to console
    console.log();
    console.log(badgeOutput);
  }

  console.log();
  printInfo(`Score: ${score}/100 (${getScoreColor(score)})`);
}

export default badgeCommand;
