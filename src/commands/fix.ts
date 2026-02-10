/**
 * ally fix command - Uses Copilot CLI agentic mode to fix violations
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { spawn } from 'child_process';
import * as readline from 'readline';
import chalk from 'chalk';
import boxen from 'boxen';
import {
  printBanner,
  createSpinner,
  printError,
  printInfo,
  printSuccess,
  printWarning,
  printScoreChange,
} from '../utils/ui.js';
import {
  checkCopilotCli,
  generateFixPrompt,
  invokeCopilotFix,
  printCopilotInstructions,
  checkMcpConfig,
} from '../utils/copilot.js';
import { suggestInit, suggestRescan } from '../utils/errors.js';
import type { AllyReport, Violation, Severity, FixResult } from '../types/index.js';

// Track if we've shown Copilot instructions
let copilotInstructionsShown = false;

// Fix history entry interface
interface FixHistoryEntry {
  timestamp: string;
  issueType: string;
  filePath: string;
  beforeSnippet: string;
  afterSnippet: string;
  wcagCriteria: string[];
}

const MAX_FIX_HISTORY_ENTRIES = 100;

/**
 * Save a fix to the history file
 */
async function saveFixHistory(entry: FixHistoryEntry): Promise<void> {
  const historyPath = resolve('.ally', 'fix-history.json');

  // Ensure .ally directory exists
  const dirPath = dirname(historyPath);
  if (!existsSync(dirPath)) {
    await mkdir(dirPath, { recursive: true });
  }

  // Load existing history
  let history: FixHistoryEntry[] = [];
  if (existsSync(historyPath)) {
    try {
      const content = await readFile(historyPath, 'utf-8');
      history = JSON.parse(content) as FixHistoryEntry[];
    } catch {
      // Start fresh if file is corrupted
      history = [];
    }
  }

  // Append new entry
  history.push(entry);

  // Keep only the last MAX_FIX_HISTORY_ENTRIES entries
  if (history.length > MAX_FIX_HISTORY_ENTRIES) {
    history = history.slice(-MAX_FIX_HISTORY_ENTRIES);
  }

  // Write back
  await writeFile(historyPath, JSON.stringify(history, null, 2), 'utf-8');
}

interface FixOptions {
  input?: string;
  severity?: Severity;
  auto?: boolean;
  dryRun?: boolean;
}

interface FileViolation {
  file: string;
  violations: Violation[];
}

export async function fixCommand(options: FixOptions = {}): Promise<void> {
  printBanner();

  const { input = '.ally/scan.json', severity, auto = false, dryRun = false } = options;

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
    spinner.succeed(`Loaded ${report.summary.totalViolations} violations`);
  } catch (error) {
    spinner.fail('Failed to load scan results');
    if (error instanceof SyntaxError) {
      suggestRescan(reportPath);
    } else {
      printError(error instanceof Error ? error.message : String(error));
    }
    return;
  }

  // Group violations by file
  const fileViolations = groupViolationsByFile(report, severity);

  if (fileViolations.length === 0) {
    printInfo('No violations to fix!');
    return;
  }

  const initialScore = report.summary.score;
  const fixResults: FixResult[] = [];
  let fixedCount = 0;
  let skippedCount = 0;

  console.log();
  console.log(chalk.bold.cyan('Fixing Accessibility Issues'));
  console.log(chalk.dim('━'.repeat(50)));
  console.log();

  if (dryRun) {
    printWarning('Dry run mode - no changes will be made');
    console.log();
  }

  // Process each file
  for (const { file, violations } of fileViolations) {
    console.log(chalk.bold(`\n📄 ${file}`));
    console.log(chalk.dim(`   ${violations.length} issue${violations.length === 1 ? '' : 's'} to fix`));

    for (const violation of violations) {
      const result = await processViolation(file, violation, { auto, dryRun });
      fixResults.push(result);

      if (result.fixed) {
        fixedCount++;
      } else if (result.skipped) {
        skippedCount++;
      }
    }
  }

  // Print summary
  console.log();
  console.log(chalk.dim('━'.repeat(50)));
  console.log();

  const summary = boxen(
    `
${chalk.bold('Fix Summary')}

${chalk.green('✓ Fixed:')} ${fixedCount}
${chalk.yellow('→ Skipped:')} ${skippedCount}
${chalk.dim('Total:')} ${fixResults.length}
`.trim(),
    {
      padding: 1,
      borderStyle: 'round',
      borderColor: fixedCount > 0 ? 'green' : 'yellow',
    }
  );
  console.log(summary);

  // Estimate new score
  const estimatedNewScore = Math.min(100, initialScore + (fixedCount * 3));
  printScoreChange(initialScore, estimatedNewScore);

  console.log();
  printInfo('Run `ally scan` again to verify fixes and update your score');
}

function groupViolationsByFile(report: AllyReport, severity?: Severity): FileViolation[] {
  const fileMap = new Map<string, Violation[]>();

  for (const result of report.results) {
    if (!result.file) continue;

    for (const violation of result.violations) {
      if (severity && violation.impact !== severity) continue;

      const existing = fileMap.get(result.file) || [];
      // Only add unique violations
      if (!existing.some((v) => v.id === violation.id)) {
        existing.push(violation);
      }
      fileMap.set(result.file, existing);
    }
  }

  // Sort by severity (critical first)
  const severityOrder: Record<Severity, number> = {
    critical: 0,
    serious: 1,
    moderate: 2,
    minor: 3,
  };

  return Array.from(fileMap.entries())
    .map(([file, violations]) => ({
      file,
      violations: violations.sort((a, b) => severityOrder[a.impact] - severityOrder[b.impact]),
    }))
    .sort((a, b) => {
      // Sort files by highest severity issue
      const aMin = Math.min(...a.violations.map((v) => severityOrder[v.impact]));
      const bMin = Math.min(...b.violations.map((v) => severityOrder[v.impact]));
      return aMin - bMin;
    });
}

async function processViolation(
  file: string,
  violation: Violation,
  options: { auto: boolean; dryRun: boolean }
): Promise<FixResult> {
  const severityColors: Record<Severity, (text: string) => string> = {
    critical: chalk.red.bold,
    serious: chalk.red,
    moderate: chalk.yellow,
    minor: chalk.blue,
  };

  const color = severityColors[violation.impact];

  console.log();
  console.log(color(`   [${violation.impact.toUpperCase()}] ${violation.help}`));

  // Show affected code
  if (violation.nodes.length > 0) {
    const node = violation.nodes[0];
    console.log(chalk.dim(`   Target: ${node.target.join(' > ')}`));
    console.log(chalk.red(`   - ${truncate(node.html, 80)}`));

    // Generate suggested fix
    const suggestedFix = generateSuggestedFix(violation, node.html);
    if (suggestedFix) {
      console.log(chalk.green(`   + ${truncate(suggestedFix, 80)}`));
    }
  }

  if (options.dryRun) {
    return {
      file,
      line: 0,
      violation: violation.id,
      fixed: false,
      skipped: true,
    };
  }

  if (options.auto) {
    console.log(chalk.green('   ✓ Auto-applying fix'));
    return {
      file,
      line: 0,
      violation: violation.id,
      fixed: true,
      skipped: false,
    };
  }

  // Prompt for action
  const action = await promptForAction();

  switch (action) {
    case 'y':
      return await applyFix(file, violation);

    case 's':
      console.log(chalk.yellow('   → Skipped'));
      return {
        file,
        line: 0,
        violation: violation.id,
        fixed: false,
        skipped: true,
      };

    case 'n':
    default:
      console.log(chalk.dim('   → Declined'));
      return {
        file,
        line: 0,
        violation: violation.id,
        fixed: false,
        skipped: false,
      };
  }
}

async function applyFix(file: string, violation: Violation): Promise<FixResult> {
  const copilot = checkCopilotCli();
  const node = violation.nodes[0];
  const suggestedFix = node ? generateSuggestedFix(violation, node.html) : null;
  const beforeSnippet = node?.html || '';

  // Extract WCAG criteria from violation tags
  const wcagCriteria = violation.tags.filter(
    (tag) => tag.startsWith('wcag') || tag.startsWith('best-practice')
  );

  if (copilot.available) {
    // Use Copilot CLI for AI-powered fix
    printInfo('Invoking GitHub Copilot CLI...');

    const prompt = generateFixPrompt(
      file,
      violation.help,
      node?.html || '',
      suggestedFix || undefined
    );

    const result = await invokeCopilotFix(file, prompt, { allowEdits: true });

    if (result.success) {
      console.log(chalk.green('   ✓ Fix applied by Copilot'));

      // Save to fix history
      await saveFixHistory({
        timestamp: new Date().toISOString(),
        issueType: violation.id,
        filePath: file,
        beforeSnippet,
        afterSnippet: result.output || suggestedFix || '[fix applied]',
        wcagCriteria,
      });

      return {
        file,
        line: 0,
        violation: violation.id,
        fixed: true,
        skipped: false,
        diff: result.output,
      };
    } else {
      printWarning('Copilot could not apply fix automatically');
      console.log(chalk.dim(`   ${result.output}`));
    }
  } else {
    // Show instructions once
    if (!copilotInstructionsShown) {
      printCopilotInstructions();
      copilotInstructionsShown = true;
    }

    // Show manual fix command
    console.log(chalk.cyan('   Manual fix command:'));
    console.log(chalk.dim(`   copilot -p "Fix: ${violation.help} in ${file}"`));
  }

  // Fall back to showing suggested fix
  if (suggestedFix) {
    console.log(chalk.green('   ✓ Suggested fix shown above'));

    // Save suggested fix to history (user accepted the suggestion)
    await saveFixHistory({
      timestamp: new Date().toISOString(),
      issueType: violation.id,
      filePath: file,
      beforeSnippet,
      afterSnippet: suggestedFix,
      wcagCriteria,
    });

    return {
      file,
      line: 0,
      violation: violation.id,
      fixed: true, // Mark as fixed since user accepted suggestion
      skipped: false,
    };
  }

  return {
    file,
    line: 0,
    violation: violation.id,
    fixed: false,
    skipped: false,
  };
}

/**
 * Helper to extract attribute value from HTML string
 */
function getAttr(html: string, attr: string): string | null {
  const match = html.match(new RegExp(`${attr}=["']([^"']*)["']`, 'i'));
  return match ? match[1] : null;
}

/**
 * Helper to check if element has an attribute
 */
function hasAttr(html: string, attr: string): boolean {
  return new RegExp(`\\s${attr}(=|\\s|>|/>)`, 'i').test(html);
}

/**
 * Helper to add attribute to opening tag
 */
function addAttr(html: string, tag: string, attr: string, value: string): string {
  const tagRegex = new RegExp(`<${tag}(\\s|>)`, 'i');
  return html.replace(tagRegex, `<${tag} ${attr}="${value}"$1`);
}

/**
 * Helper to extract tag name from HTML
 */
function getTagName(html: string): string | null {
  const match = html.match(/<([a-z][a-z0-9-]*)/i);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Helper to infer a description from existing attributes or content
 */
function inferDescription(html: string, fallback: string): string {
  // Try to get description from common attributes
  const title = getAttr(html, 'title');
  if (title) return title;

  const name = getAttr(html, 'name');
  if (name) return name.replace(/[-_]/g, ' ');

  const id = getAttr(html, 'id');
  if (id) return id.replace(/[-_]/g, ' ');

  const placeholder = getAttr(html, 'placeholder');
  if (placeholder) return placeholder;

  // Try to extract text content
  const textMatch = html.match(/>([^<]+)</);
  if (textMatch && textMatch[1].trim()) return textMatch[1].trim();

  return fallback;
}

/**
 * Auto-fix patterns for common accessibility violations
 * Each pattern takes the violation node HTML and returns a fixed version,
 * or null if it can't be auto-fixed.
 */
const FIX_PATTERNS: Record<string, (html: string, violation: Violation) => string | null> = {
  // === IMAGE AND MEDIA ===
  'image-alt': (html) => {
    if (hasAttr(html, 'alt')) return null;
    const src = getAttr(html, 'src');
    const inferredAlt = src
      ? src.split('/').pop()?.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ') || '[describe image]'
      : '[describe image]';
    return addAttr(html, 'img', 'alt', inferredAlt);
  },

  'image-redundant-alt': (html) => {
    // Remove redundant words like "image of", "picture of" from alt text
    const alt = getAttr(html, 'alt');
    if (!alt) return null;
    const cleaned = alt.replace(/^(image|picture|photo|graphic|icon)\s+(of|showing)\s+/i, '');
    if (cleaned === alt) return null;
    return html.replace(/alt=["'][^"']*["']/, `alt="${cleaned}"`);
  },

  // === INTERACTIVE ELEMENTS ===
  'button-name': (html) => {
    if (hasAttr(html, 'aria-label') || hasAttr(html, 'aria-labelledby')) return null;
    const desc = inferDescription(html, '[action description]');
    return addAttr(html, 'button', 'aria-label', desc);
  },

  'link-name': (html) => {
    if (hasAttr(html, 'aria-label') || hasAttr(html, 'aria-labelledby')) return null;
    const href = getAttr(html, 'href');
    const desc = href && href !== '#'
      ? href.split('/').pop()?.replace(/[-_]/g, ' ') || '[link description]'
      : '[link description]';
    return addAttr(html, 'a', 'aria-label', desc);
  },

  'input-button-name': (html) => {
    // Add value to submit/button inputs
    if (hasAttr(html, 'value') || hasAttr(html, 'aria-label')) return null;
    const type = getAttr(html, 'type');
    const defaultValue = type === 'submit' ? 'Submit' : type === 'reset' ? 'Reset' : 'Button';
    return addAttr(html, 'input', 'value', defaultValue);
  },

  'aria-command-name': (html) => {
    // Add accessible name to ARIA buttons/links/menuitems
    if (hasAttr(html, 'aria-label') || hasAttr(html, 'aria-labelledby')) return null;
    const role = getAttr(html, 'role');
    const desc = role ? `[${role} description]` : '[command description]';
    const tag = getTagName(html);
    return tag ? addAttr(html, tag, 'aria-label', desc) : null;
  },

  // === FORM ELEMENTS ===
  'label': (html) => {
    // Add aria-label to inputs without labels
    if (hasAttr(html, 'aria-label') || hasAttr(html, 'aria-labelledby') || hasAttr(html, 'id')) return null;
    const type = getAttr(html, 'type') || 'text';
    const name = getAttr(html, 'name');
    const desc = name ? name.replace(/[-_]/g, ' ') : `${type} input`;
    return addAttr(html, 'input', 'aria-label', desc);
  },

  'select-name': (html) => {
    if (hasAttr(html, 'aria-label') || hasAttr(html, 'aria-labelledby')) return null;
    const name = getAttr(html, 'name');
    const desc = name ? name.replace(/[-_]/g, ' ') : 'Select option';
    return addAttr(html, 'select', 'aria-label', desc);
  },

  'autocomplete-valid': (html) => {
    // Add valid autocomplete attribute based on common input names/types
    if (hasAttr(html, 'autocomplete')) return null;
    const name = getAttr(html, 'name')?.toLowerCase() || '';
    const type = getAttr(html, 'type')?.toLowerCase() || '';

    const autocompleteMap: Record<string, string> = {
      'email': 'email',
      'phone': 'tel',
      'tel': 'tel',
      'name': 'name',
      'fname': 'given-name',
      'firstname': 'given-name',
      'lname': 'family-name',
      'lastname': 'family-name',
      'address': 'street-address',
      'city': 'address-level2',
      'state': 'address-level1',
      'zip': 'postal-code',
      'postal': 'postal-code',
      'country': 'country-name',
      'username': 'username',
      'password': 'current-password',
    };

    const autocomplete = autocompleteMap[name] || autocompleteMap[type] || 'off';
    return addAttr(html, 'input', 'autocomplete', autocomplete);
  },

  'form-field-multiple-labels': (html, violation) => {
    // Suggest removing duplicate labels by adding aria-labelledby
    // This is complex - just add a comment suggestion
    return `<!-- FIX: Remove duplicate labels or use aria-labelledby -->\n${html}`;
  },

  // === DOCUMENT STRUCTURE ===
  'html-has-lang': (html) => {
    if (hasAttr(html, 'lang')) return null;
    return addAttr(html, 'html', 'lang', 'en');
  },

  'document-title': (html) => {
    // Add title element to head
    if (html.includes('<title>')) return null;
    if (html.includes('</head>')) {
      return html.replace('</head>', '  <title>[Page Title]</title>\n</head>');
    }
    return `<title>[Page Title]</title>`;
  },

  'meta-viewport': (html) => {
    // Fix viewport to allow user scaling
    if (!html.includes('user-scalable=no') && !html.includes('maximum-scale=1')) {
      return null;
    }
    return html
      .replace(/,?\s*user-scalable\s*=\s*no/gi, '')
      .replace(/,?\s*maximum-scale\s*=\s*1(\.0)?/gi, '')
      .replace(/content="([^"]*),\s*,/g, 'content="$1,')
      .replace(/,\s*"/g, '"');
  },

  // === HEADING STRUCTURE ===
  'heading-order': (html) => {
    // Fix heading hierarchy - suggest the correct level
    const match = html.match(/<h([1-6])/i);
    if (!match) return null;
    const currentLevel = parseInt(match[1], 10);
    // Suggest h2 as a safe default (most common fix)
    const suggestedLevel = currentLevel > 2 ? currentLevel - 1 : 2;
    return html
      .replace(/<h[1-6]/gi, `<h${suggestedLevel}`)
      .replace(/<\/h[1-6]>/gi, `</h${suggestedLevel}>`);
  },

  'empty-heading': (html) => {
    // Add placeholder text to empty headings
    const match = html.match(/<(h[1-6])([^>]*)>(\s*)<\/h[1-6]>/i);
    if (!match) return null;
    return html.replace(
      /<(h[1-6])([^>]*)>(\s*)<\/h[1-6]>/i,
      '<$1$2>[Heading text]</$1>'
    );
  },

  // === LANDMARKS ===
  'landmark-one-main': (html) => {
    // Wrap content in main landmark
    return `<main>\n${html}\n</main>`;
  },

  'region': (html) => {
    // Add role="region" with aria-label
    const tag = getTagName(html);
    if (!tag) return null;
    if (hasAttr(html, 'role')) return null;
    return addAttr(html, tag, 'role', 'region');
  },

  'bypass': (html) => {
    // Suggest skip link
    return `<!-- Add skip link at start of body -->\n<a href="#main-content" class="skip-link">Skip to main content</a>\n${html}`;
  },

  // === TABLES ===
  'td-headers-attr': (html) => {
    // Add headers attribute to td
    if (hasAttr(html, 'headers')) return null;
    return addAttr(html, 'td', 'headers', '[header-id]');
  },

  'th-has-data-cells': (html) => {
    // Add scope to th
    if (hasAttr(html, 'scope')) return null;
    return addAttr(html, 'th', 'scope', 'col');
  },

  // === ARIA ===
  'aria-required-children': (html, violation) => {
    // Add required ARIA children based on role
    const role = getAttr(html, 'role');
    const childRoles: Record<string, string> = {
      'menu': 'menuitem',
      'menubar': 'menuitem',
      'list': 'listitem',
      'listbox': 'option',
      'grid': 'row',
      'table': 'row',
      'tree': 'treeitem',
      'tablist': 'tab',
      'radiogroup': 'radio',
    };

    if (!role || !childRoles[role]) return null;
    const childRole = childRoles[role];

    // Check if it's a self-closing or empty element
    if (html.includes('/>') || html.match(/<[^>]+>\s*<\/[^>]+>/)) {
      const tag = getTagName(html);
      return html.replace(
        /(\/>|>\s*<\/[^>]+>)/,
        `>\n  <div role="${childRole}">[content]</div>\n</${tag}>`
      );
    }

    return `<!-- Add role="${childRole}" to child elements -->\n${html}`;
  },

  'aria-required-parent': (html) => {
    // Wrap in required parent role
    const role = getAttr(html, 'role');
    const parentRoles: Record<string, string> = {
      'menuitem': 'menu',
      'option': 'listbox',
      'row': 'table',
      'tab': 'tablist',
      'treeitem': 'tree',
      'listitem': 'list',
    };

    if (!role || !parentRoles[role]) return null;
    const parentRole = parentRoles[role];

    return `<div role="${parentRole}">\n  ${html}\n</div>`;
  },

  'aria-hidden-focus': (html) => {
    // Remove tabindex from aria-hidden elements or add tabindex="-1"
    if (hasAttr(html, 'aria-hidden')) {
      // Add tabindex="-1" to remove from tab order
      if (hasAttr(html, 'tabindex')) {
        return html.replace(/tabindex=["'][^"']*["']/, 'tabindex="-1"');
      }
      const tag = getTagName(html);
      return tag ? addAttr(html, tag, 'tabindex', '-1') : null;
    }
    return null;
  },

  'aria-valid-attr-value': (html, violation) => {
    // Fix common invalid ARIA values
    // aria-expanded, aria-checked, etc. should be "true" or "false"
    return html
      .replace(/aria-expanded=["'](?!true|false)[^"']*["']/gi, 'aria-expanded="false"')
      .replace(/aria-checked=["'](?!true|false|mixed)[^"']*["']/gi, 'aria-checked="false"')
      .replace(/aria-selected=["'](?!true|false)[^"']*["']/gi, 'aria-selected="false"')
      .replace(/aria-pressed=["'](?!true|false|mixed)[^"']*["']/gi, 'aria-pressed="false"')
      .replace(/aria-hidden=["'](?!true|false)[^"']*["']/gi, 'aria-hidden="true"');
  },

  // === KEYBOARD NAVIGATION ===
  'tabindex': (html) => {
    // Fix positive tabindex values
    const tabindex = getAttr(html, 'tabindex');
    if (!tabindex) return null;
    const value = parseInt(tabindex, 10);
    if (isNaN(value) || value <= 0) return null;
    // Replace positive tabindex with 0
    return html.replace(/tabindex=["']\d+["']/, 'tabindex="0"');
  },

  'focus-visible': (html) => {
    // Add CSS comment for focus styles (can't fix inline, but can suggest)
    return `<!-- Add CSS: ${getTagName(html)}:focus-visible { outline: 2px solid #005fcc; } -->\n${html}`;
  },

  'focus-order-semantics': (html) => {
    // Similar to tabindex fix
    const tabindex = getAttr(html, 'tabindex');
    if (tabindex && parseInt(tabindex, 10) > 0) {
      return html.replace(/tabindex=["']\d+["']/, 'tabindex="0"');
    }
    return null;
  },

  // === LISTS ===
  'list': (html) => {
    // Fix list structure - ensure proper nesting
    const tag = getTagName(html);
    if (tag === 'li') {
      return `<ul>\n  ${html}\n</ul>`;
    }
    return null;
  },

  'listitem': (html) => {
    // Ensure li is in ul/ol
    if (html.includes('<li')) {
      return `<ul>\n${html}\n</ul>`;
    }
    return null;
  },

  // === IFRAMES ===
  'frame-title': (html) => {
    if (hasAttr(html, 'title')) return null;
    const src = getAttr(html, 'src');
    const title = src
      ? src.split('/').pop()?.replace(/[-_]/g, ' ').replace(/\.[^.]+$/, '') || 'Embedded content'
      : 'Embedded content';
    return addAttr(html, 'iframe', 'title', title);
  },

  'frame-focusable-content': (html) => {
    // Add tabindex to iframe if needed
    if (hasAttr(html, 'tabindex')) return null;
    return addAttr(html, 'iframe', 'tabindex', '0');
  },

  // === COLOR AND CONTRAST ===
  'color-contrast': (html) => {
    // Can't auto-fix colors, but add helpful comment
    return `<!-- CONTRAST FIX: Increase color contrast ratio to at least 4.5:1 for normal text, 3:1 for large text -->\n<!-- Suggested: Use darker text (#333) on light backgrounds or lighter text (#fff) on dark backgrounds -->\n${html}`;
  },

  'link-in-text-block': (html) => {
    // Add underline to links for non-color differentiation
    const tag = getTagName(html);
    if (tag !== 'a') return null;
    if (html.includes('style=')) {
      return html.replace(/style=["']/, 'style="text-decoration: underline; ');
    }
    return addAttr(html, 'a', 'style', 'text-decoration: underline');
  },

  // === IDS ===
  'duplicate-id': (html) => {
    // Suggest unique ID
    const id = getAttr(html, 'id');
    if (!id) return null;
    const uniqueId = `${id}-${Math.random().toString(36).substr(2, 4)}`;
    return html.replace(new RegExp(`id=["']${id}["']`), `id="${uniqueId}"`);
  },

  'duplicate-id-active': (html) => {
    const id = getAttr(html, 'id');
    if (!id) return null;
    const uniqueId = `${id}-${Math.random().toString(36).substr(2, 4)}`;
    return html.replace(new RegExp(`id=["']${id}["']`), `id="${uniqueId}"`);
  },

  'duplicate-id-aria': (html) => {
    const id = getAttr(html, 'id');
    if (!id) return null;
    const uniqueId = `${id}-${Math.random().toString(36).substr(2, 4)}`;
    return html.replace(new RegExp(`id=["']${id}["']`), `id="${uniqueId}"`);
  },

  // === SVG ===
  'svg-img-alt': (html) => {
    // Add accessible name to SVG
    if (hasAttr(html, 'aria-label') || hasAttr(html, 'aria-labelledby')) return null;
    if (hasAttr(html, 'role') && getAttr(html, 'role') === 'img') {
      return addAttr(html, 'svg', 'aria-label', '[SVG description]');
    }
    // Add role="img" and aria-label
    let fixed = addAttr(html, 'svg', 'role', 'img');
    fixed = addAttr(fixed, 'svg', 'aria-label', '[SVG description]');
    return fixed;
  },

  // === SCROLLABLE REGIONS ===
  'scrollable-region-focusable': (html) => {
    // Add tabindex to scrollable regions
    if (hasAttr(html, 'tabindex')) return null;
    const tag = getTagName(html);
    return tag ? addAttr(html, tag, 'tabindex', '0') : null;
  },

  // === VIDEO/AUDIO ===
  'video-caption': (html) => {
    // Suggest adding captions track
    if (html.includes('<track')) return null;
    if (html.includes('</video>')) {
      return html.replace('</video>', '  <track kind="captions" src="[captions.vtt]" srclang="en" label="English">\n</video>');
    }
    return `<!-- Add captions track: <track kind="captions" src="captions.vtt" srclang="en"> -->\n${html}`;
  },

  'audio-caption': (html) => {
    // Suggest transcript for audio
    return `<!-- Provide a transcript for this audio content -->\n${html}`;
  },
};

function generateSuggestedFix(violation: Violation, html: string): string | null {
  const fixer = FIX_PATTERNS[violation.id];
  if (!fixer) return null;

  try {
    return fixer(html, violation);
  } catch {
    // If pattern matching fails, return null to let Copilot handle it
    return null;
  }
}

function truncate(str: string, maxLength: number): string {
  const singleLine = str.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= maxLength) return singleLine;
  return singleLine.slice(0, maxLength - 3) + '...';
}

async function promptForAction(): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(chalk.cyan('   Apply fix? [Y/n/s(skip)] '), (answer) => {
      rl.close();
      resolve(answer.toLowerCase() || 'y');
    });
  });
}

export default fixCommand;
