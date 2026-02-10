/**
 * ally explain command - Uses Copilot to explain violations in plain language
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';
import chalk from 'chalk';
import {
  printBanner,
  createSpinner,
  printError,
  printInfo,
  printWarning,
} from '../utils/ui.js';
import { suggestInit, suggestRescan } from '../utils/errors.js';
import type { AllyReport, Violation, Severity } from '../types/index.js';

interface ExplainOptions {
  input?: string;
  severity?: Severity;
  limit?: number;
}

export async function explainCommand(options: ExplainOptions = {}): Promise<void> {
  printBanner();

  const { input = '.ally/scan.json', severity, limit = 10 } = options;

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
    spinner.succeed(`Loaded ${report.summary.totalViolations} violations from scan`);
  } catch (error) {
    spinner.fail('Failed to load scan results');
    if (error instanceof SyntaxError) {
      suggestRescan(reportPath);
    } else {
      printError(error instanceof Error ? error.message : String(error));
    }
    return;
  }

  // Collect and deduplicate violations
  const uniqueViolations = new Map<string, Violation>();

  for (const result of report.results) {
    for (const violation of result.violations) {
      if (severity && violation.impact !== severity) continue;
      if (!uniqueViolations.has(violation.id)) {
        uniqueViolations.set(violation.id, violation);
      }
    }
  }

  const violations = Array.from(uniqueViolations.values()).slice(0, limit);

  if (violations.length === 0) {
    printInfo('No violations to explain');
    return;
  }

  console.log();
  console.log(chalk.bold.cyan('Accessibility Issues Explained'));
  console.log(chalk.dim('━'.repeat(50)));
  console.log();

  // Generate explanations for each violation
  for (let i = 0; i < violations.length; i++) {
    const violation = violations[i];
    await printExplanation(violation, i + 1);
  }

  // Print Copilot CLI instruction
  console.log();
  console.log(chalk.dim('━'.repeat(50)));
  console.log();
  printInfo('To get AI-powered explanations, run:');
  console.log(chalk.cyan(`  copilot -p "Explain these accessibility issues in plain language: ${reportPath}"`));
  console.log();
  printInfo('Or fix issues directly:');
  console.log(chalk.cyan(`  ally fix`));
}

async function printExplanation(violation: Violation, index: number): Promise<void> {
  const severityColors: Record<Severity, (text: string) => string> = {
    critical: chalk.red.bold,
    serious: chalk.red,
    moderate: chalk.yellow,
    minor: chalk.blue,
  };

  const color = severityColors[violation.impact];

  console.log(chalk.bold(`${index}. ${violation.help}`));
  console.log(color(`   Severity: ${violation.impact.toUpperCase()}`));
  console.log();

  // Plain language explanation based on rule ID
  const explanation = getPlainLanguageExplanation(violation);
  console.log(chalk.white(`   What's wrong:`));
  console.log(chalk.dim(`   ${explanation.problem}`));
  console.log();

  console.log(chalk.white(`   Who it affects:`));
  console.log(chalk.dim(`   ${explanation.impact}`));
  console.log();

  console.log(chalk.white(`   How to fix:`));
  console.log(chalk.dim(`   ${explanation.fix}`));
  console.log();

  // WCAG reference
  const wcagTags = violation.tags.filter((t) => t.startsWith('wcag'));
  if (wcagTags.length > 0) {
    console.log(chalk.dim(`   WCAG: ${wcagTags.join(', ')}`));
  }

  console.log(chalk.dim(`   Learn more: ${violation.helpUrl}`));
  console.log();
  console.log(chalk.dim('   ' + '─'.repeat(45)));
  console.log();
}

interface PlainExplanation {
  problem: string;
  impact: string;
  fix: string;
}

function getPlainLanguageExplanation(violation: Violation): PlainExplanation {
  // Common accessibility issues with plain language explanations
  const explanations: Record<string, PlainExplanation> = {
    'image-alt': {
      problem: 'Images are missing alt text, which describes the image content.',
      impact: 'Screen reader users cannot understand what the image shows. They only hear "image" with no context.',
      fix: 'Add an alt attribute to each image describing its content. For decorative images, use alt="".',
    },
    'button-name': {
      problem: 'Buttons don\'t have accessible names that describe their purpose.',
      impact: 'Screen reader users hear "button" but don\'t know what the button does.',
      fix: 'Add visible text inside the button, or use aria-label to provide a description.',
    },
    'link-name': {
      problem: 'Links don\'t have text that describes where they go.',
      impact: 'Screen reader users hear "link" but don\'t know where clicking will take them.',
      fix: 'Add descriptive text inside the link. Avoid "click here" or "read more".',
    },
    'color-contrast': {
      problem: 'Text doesn\'t have enough contrast against its background.',
      impact: 'People with low vision or color blindness struggle to read the text.',
      fix: 'Use colors with at least 4.5:1 contrast ratio for normal text, 3:1 for large text.',
    },
    'html-has-lang': {
      problem: 'The HTML document doesn\'t specify a language.',
      impact: 'Screen readers may pronounce words incorrectly if they don\'t know the language.',
      fix: 'Add lang="en" (or appropriate language code) to the <html> element.',
    },
    'label': {
      problem: 'Form inputs are missing labels that describe what to enter.',
      impact: 'Screen reader users don\'t know what information to type in the field.',
      fix: 'Add a <label> element connected to the input via for/id attributes.',
    },
    'landmark-one-main': {
      problem: 'The page doesn\'t have a main landmark to identify primary content.',
      impact: 'Screen reader users can\'t quickly navigate to the main content of the page.',
      fix: 'Wrap your main content in a <main> element.',
    },
    'region': {
      problem: 'Content exists outside of landmark regions.',
      impact: 'Screen reader users have difficulty understanding the page structure.',
      fix: 'Organize content into semantic landmarks: header, nav, main, aside, footer.',
    },
    'aria-required-attr': {
      problem: 'ARIA roles are missing required attributes.',
      impact: 'Assistive technology may not correctly interpret the element\'s purpose.',
      fix: 'Add the required ARIA attributes for the role being used.',
    },
    'tabindex': {
      problem: 'Elements have tabindex greater than 0, which disrupts natural focus order.',
      impact: 'Keyboard users experience confusing, unpredictable navigation.',
      fix: 'Use tabindex="0" to make elements focusable, or tabindex="-1" to remove from tab order.',
    },
  };

  return explanations[violation.id] || {
    problem: violation.description,
    impact: 'Users with disabilities may have difficulty using this part of the page.',
    fix: violation.help,
  };
}

export default explainCommand;
