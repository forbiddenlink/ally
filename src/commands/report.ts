/**
 * ally report command - Generates ACCESSIBILITY.md report
 */

import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, dirname, basename } from 'path';
import chalk from 'chalk';
import {
  printBanner,
  createSpinner,
  printError,
  printInfo,
  printSuccess,
} from '../utils/ui.js';
import { suggestInit, suggestRescan } from '../utils/errors.js';
import { convertToSarif, convertToJunit, convertToCsv } from '../utils/converters.js';
import type { AllyReport, Severity } from '../types/index.js';

type ReportFormat = 'markdown' | 'html' | 'json' | 'sarif' | 'junit' | 'csv' | 'all';

interface ReportOptions {
  input?: string;
  output?: string;
  format?: ReportFormat;
}

export async function reportCommand(options: ReportOptions = {}): Promise<void> {
  printBanner();

  const {
    input = '.ally/scan.json',
    output = 'ACCESSIBILITY.md',
    format = 'markdown',
  } = options;

  // Load scan results
  const spinner = createSpinner('Loading scan results...');
  spinner.start();

  const reportPath = resolve(input);

  if (!existsSync(reportPath)) {
    spinner.stop();
    suggestInit(reportPath);
    return;
  }

  let report: AllyReport;
  try {
    const content = await readFile(reportPath, 'utf-8');
    report = JSON.parse(content) as AllyReport;
    spinner.succeed('Loaded scan results');
  } catch (error) {
    spinner.fail('Failed to load scan results');
    if (error instanceof SyntaxError) {
      suggestRescan(reportPath);
    } else {
      printError(error instanceof Error ? error.message : String(error));
    }
    return;
  }

  // Generate report
  const generateSpinner = createSpinner('Generating report...');
  generateSpinner.start();

  // Handle batch export (--format all)
  if (format === 'all') {
    const outputDir = dirname(resolve(output));
    const generatedFiles: string[] = [];

    try {
      // Generate all formats
      const formats: Array<{ name: string; ext: string; content: string }> = [
        { name: 'ACCESSIBILITY.md', ext: 'md', content: generateMarkdownReport(report) },
        { name: 'accessibility.html', ext: 'html', content: generateHtmlReport(report) },
        { name: 'accessibility.json', ext: 'json', content: JSON.stringify(report, null, 2) },
        { name: 'accessibility.sarif', ext: 'sarif', content: JSON.stringify(convertToSarif(report), null, 2) },
        { name: 'accessibility.junit.xml', ext: 'xml', content: convertToJunit(report) },
        { name: 'accessibility.csv', ext: 'csv', content: convertToCsv(report) },
      ];

      for (const { name, content } of formats) {
        const filePath = resolve(outputDir, name);
        await writeFile(filePath, content);
        generatedFiles.push(name);
      }

      generateSpinner.succeed('Generated all report formats');

      console.log();
      console.log(chalk.green(`\u2713 Generated ${generatedFiles.length} report files:`));
      for (const file of generatedFiles) {
        console.log(chalk.dim(`  \u2022 ${file}`));
      }
    } catch (error) {
      generateSpinner.fail('Failed to write reports');
      printError(error instanceof Error ? error.message : String(error));
      return;
    }
  } else {
    // Single format export
    let reportContent: string;

    switch (format) {
      case 'json':
        reportContent = JSON.stringify(report, null, 2);
        break;
      case 'html':
        reportContent = generateHtmlReport(report);
        break;
      case 'sarif':
        reportContent = JSON.stringify(convertToSarif(report), null, 2);
        break;
      case 'junit':
        reportContent = convertToJunit(report);
        break;
      case 'csv':
        reportContent = convertToCsv(report);
        break;
      case 'markdown':
      default:
        reportContent = generateMarkdownReport(report);
    }

    // Adjust output filename based on format
    let outputPath = resolve(output);
    if (format === 'sarif' && !output.endsWith('.sarif')) {
      outputPath = resolve(dirname(output), 'accessibility.sarif');
    } else if (format === 'junit' && !output.endsWith('.xml')) {
      outputPath = resolve(dirname(output), 'accessibility.junit.xml');
    } else if (format === 'csv' && !output.endsWith('.csv')) {
      outputPath = resolve(dirname(output), 'accessibility.csv');
    } else if (format === 'json' && !output.endsWith('.json')) {
      outputPath = resolve(dirname(output), 'accessibility.json');
    } else if (format === 'html' && !output.endsWith('.html')) {
      outputPath = resolve(dirname(output), 'accessibility.html');
    }

    try {
      await writeFile(outputPath, reportContent);
      generateSpinner.succeed(`Report generated: ${outputPath}`);
    } catch (error) {
      generateSpinner.fail('Failed to write report');
      printError(error instanceof Error ? error.message : String(error));
      return;
    }

    console.log();
    printSuccess('Accessibility report ready!');
    printInfo(`Add ${basename(outputPath)} to your repository to document your a11y compliance`);
  }

  // Generate badge URL
  const badgeColor = report.summary.score >= 90 ? 'brightgreen'
    : report.summary.score >= 75 ? 'green'
    : report.summary.score >= 50 ? 'yellow'
    : 'red';

  console.log();
  console.log(chalk.bold('Badge for README:'));
  console.log(chalk.dim(`![Accessibility Score](https://img.shields.io/badge/a11y_score-${report.summary.score}%25-${badgeColor})`));
}

function generateMarkdownReport(report: AllyReport): string {
  const { summary } = report;
  const scanDate = new Date(report.scanDate).toLocaleDateString();

  // Score emoji
  const scoreEmoji = summary.score >= 90 ? '🌟'
    : summary.score >= 75 ? '✅'
    : summary.score >= 50 ? '⚠️'
    : '❌';

  let md = `# Accessibility Report ${scoreEmoji}

> Generated by [ally](https://github.com/lizthegrey/ally) on ${scanDate}

## Score: ${summary.score}/100

![Accessibility Score](https://img.shields.io/badge/a11y_score-${summary.score}%25-${getScoreColor(summary.score)})

## Summary

| Severity | Count |
|----------|-------|
| 🔴 Critical | ${summary.bySeverity.critical || 0} |
| 🟠 Serious | ${summary.bySeverity.serious || 0} |
| 🟡 Moderate | ${summary.bySeverity.moderate || 0} |
| 🔵 Minor | ${summary.bySeverity.minor || 0} |
| **Total** | **${summary.totalViolations}** |

## Top Issues

`;

  if (summary.topIssues.length > 0) {
    for (const issue of summary.topIssues) {
      const severityIcon = getSeverityIcon(issue.severity);
      md += `### ${severityIcon} ${issue.description}\n\n`;
      md += `- **Occurrences:** ${issue.count}\n`;
      md += `- **Rule ID:** \`${issue.id}\`\n\n`;
    }
  } else {
    md += `No issues found! 🎉\n\n`;
  }

  // Files scanned
  md += `## Files Scanned\n\n`;
  md += `Total: ${report.totalFiles} files\n\n`;

  if (report.results.length > 0) {
    md += `| File | Issues |\n`;
    md += `|------|--------|\n`;

    for (const result of report.results) {
      const fileName = result.file || result.url;
      const issueCount = result.violations.length;
      const icon = issueCount === 0 ? '✅' : issueCount < 5 ? '⚠️' : '❌';
      md += `| ${icon} ${fileName} | ${issueCount} |\n`;
    }
  }

  // WCAG Compliance
  md += `\n## WCAG 2.1 Compliance\n\n`;

  const wcagViolations = new Set<string>();
  for (const result of report.results) {
    for (const violation of result.violations) {
      for (const tag of violation.tags) {
        if (tag.startsWith('wcag')) {
          wcagViolations.add(tag);
        }
      }
    }
  }

  if (wcagViolations.size > 0) {
    md += `The following WCAG criteria have violations:\n\n`;
    for (const criterion of Array.from(wcagViolations).sort()) {
      md += `- \`${criterion}\`\n`;
    }
  } else {
    md += `No WCAG violations detected! ✅\n`;
  }

  // Next steps
  md += `\n## Next Steps\n\n`;

  if (summary.totalViolations > 0) {
    md += `1. Run \`ally explain\` to understand each issue\n`;
    md += `2. Run \`ally fix\` to apply automated fixes\n`;
    md += `3. Re-scan with \`ally scan\` to verify fixes\n`;
  } else {
    md += `Your site is looking great! Consider:\n`;
    md += `- Testing with real screen readers (NVDA, VoiceOver)\n`;
    md += `- Running manual keyboard navigation tests\n`;
    md += `- Getting user feedback from people with disabilities\n`;
  }

  // Footer
  md += `\n---\n\n`;
  md += `*This report was automatically generated. Automated testing can only catch ~50% of accessibility issues. Manual testing is recommended.*\n`;

  return md;
}

function generateHtmlReport(report: AllyReport): string {
  const { summary } = report;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Accessibility Report</title>
  <style>
    :root {
      --critical: #dc2626;
      --serious: #ea580c;
      --moderate: #ca8a04;
      --minor: #2563eb;
      --pass: #16a34a;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
      line-height: 1.6;
    }
    .score {
      font-size: 4rem;
      font-weight: bold;
      text-align: center;
      padding: 2rem;
      border-radius: 1rem;
      background: ${getScoreGradient(summary.score)};
      color: white;
    }
    .severity-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1rem;
      margin: 2rem 0;
    }
    .severity-card {
      padding: 1rem;
      border-radius: 0.5rem;
      text-align: center;
    }
    .severity-card.critical { background: var(--critical); color: white; }
    .severity-card.serious { background: var(--serious); color: white; }
    .severity-card.moderate { background: var(--moderate); color: white; }
    .severity-card.minor { background: var(--minor); color: white; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1rem 0;
    }
    th, td {
      padding: 0.75rem;
      text-align: left;
      border-bottom: 1px solid #e5e7eb;
    }
    th { background: #f9fafb; }
  </style>
</head>
<body>
  <h1>Accessibility Report</h1>
  <div class="score">${summary.score}/100</div>

  <h2>Violations by Severity</h2>
  <div class="severity-grid">
    <div class="severity-card critical">
      <div style="font-size: 2rem;">${summary.bySeverity.critical || 0}</div>
      <div>Critical</div>
    </div>
    <div class="severity-card serious">
      <div style="font-size: 2rem;">${summary.bySeverity.serious || 0}</div>
      <div>Serious</div>
    </div>
    <div class="severity-card moderate">
      <div style="font-size: 2rem;">${summary.bySeverity.moderate || 0}</div>
      <div>Moderate</div>
    </div>
    <div class="severity-card minor">
      <div style="font-size: 2rem;">${summary.bySeverity.minor || 0}</div>
      <div>Minor</div>
    </div>
  </div>

  <h2>Top Issues</h2>
  <table>
    <thead>
      <tr>
        <th>Issue</th>
        <th>Severity</th>
        <th>Count</th>
      </tr>
    </thead>
    <tbody>
      ${summary.topIssues.map(issue => `
        <tr>
          <td>${issue.description}</td>
          <td>${issue.severity}</td>
          <td>${issue.count}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <footer>
    <p><em>Generated by ally on ${new Date(report.scanDate).toLocaleDateString()}</em></p>
  </footer>
</body>
</html>`;
}

function getScoreColor(score: number): string {
  if (score >= 90) return 'brightgreen';
  if (score >= 75) return 'green';
  if (score >= 50) return 'yellow';
  return 'red';
}

function getScoreGradient(score: number): string {
  if (score >= 90) return 'linear-gradient(135deg, #16a34a, #22c55e)';
  if (score >= 75) return 'linear-gradient(135deg, #65a30d, #84cc16)';
  if (score >= 50) return 'linear-gradient(135deg, #ca8a04, #eab308)';
  return 'linear-gradient(135deg, #dc2626, #ef4444)';
}

function getSeverityIcon(severity: Severity): string {
  const icons: Record<Severity, string> = {
    critical: '🔴',
    serious: '🟠',
    moderate: '🟡',
    minor: '🔵',
  };
  return icons[severity] || '⚪';
}

export default reportCommand;
