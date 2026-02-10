/**
 * ally learn command - Educational command that explains WCAG criteria in depth
 */

import chalk from 'chalk';
import boxen from 'boxen';
import {
  printBanner,
  printInfo,
  printError,
  printSuccess,
} from '../utils/ui.js';

interface ViolationInfo {
  id: string;
  name: string;
  wcagCriterion: string;
  wcagName: string;
  level: 'A' | 'AA' | 'AAA';
  explanation: string;
  whyItMatters: string;
  commonFixes: string[];
  codeExample?: {
    bad: string;
    good: string;
  };
  wcagUrl: string;
  dequeUrl: string;
}

// Built-in knowledge base for top 15 accessibility violations
const VIOLATIONS_DB: Record<string, ViolationInfo> = {
  'image-alt': {
    id: 'image-alt',
    name: 'Image Alternative Text',
    wcagCriterion: '1.1.1',
    wcagName: 'Non-text Content',
    level: 'A',
    explanation:
      'Images must have alternative text that describes their content or purpose. ' +
      'This text is read aloud by screen readers and displayed when images fail to load. ' +
      'The alt text should convey the same information or function as the image.',
    whyItMatters:
      'Screen reader users cannot see images. Without alt text, they miss critical information ' +
      'or context. This affects approximately 2.2 billion people with visual impairments worldwide. ' +
      'Alt text also helps when images fail to load due to slow connections or technical issues.',
    commonFixes: [
      'Add descriptive alt text that conveys the image\'s meaning',
      'For decorative images, use alt="" (empty alt)',
      'For complex images like charts, provide detailed descriptions',
      'Avoid phrases like "image of" or "picture of" - screen readers already announce it\'s an image',
    ],
    codeExample: {
      bad: '<img src="logo.png">',
      good: '<img src="logo.png" alt="Acme Corporation logo">',
    },
    wcagUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/non-text-content.html',
    dequeUrl: 'https://dequeuniversity.com/rules/axe/4.8/image-alt',
  },

  'button-name': {
    id: 'button-name',
    name: 'Button Accessible Name',
    wcagCriterion: '4.1.2',
    wcagName: 'Name, Role, Value',
    level: 'A',
    explanation:
      'Buttons must have an accessible name that describes their purpose. ' +
      'This can come from visible text, aria-label, aria-labelledby, or the button\'s title attribute. ' +
      'Icon-only buttons are especially prone to this issue.',
    whyItMatters:
      'When a button lacks an accessible name, screen reader users hear only "button" with no indication ' +
      'of what clicking it will do. This makes the interface unusable for keyboard and screen reader users.',
    commonFixes: [
      'Add visible text inside the button',
      'Use aria-label for icon-only buttons',
      'Use aria-labelledby to reference existing text',
      'Ensure button images have alt text',
    ],
    codeExample: {
      bad: '<button><svg class="icon-search"></svg></button>',
      good: '<button aria-label="Search"><svg class="icon-search"></svg></button>',
    },
    wcagUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/name-role-value.html',
    dequeUrl: 'https://dequeuniversity.com/rules/axe/4.8/button-name',
  },

  'link-name': {
    id: 'link-name',
    name: 'Link Accessible Name',
    wcagCriterion: '2.4.4',
    wcagName: 'Link Purpose (In Context)',
    level: 'A',
    explanation:
      'Links must have text that describes where they lead. The link text should make sense ' +
      'even when read out of context, as screen reader users often navigate by links alone. ' +
      'Links wrapped around images need alt text to serve as the link name.',
    whyItMatters:
      'Screen reader users can pull up a list of all links on a page to quickly navigate. ' +
      'If links say "click here" or "read more," users have no idea where each link leads. ' +
      'Descriptive link text benefits everyone by clearly indicating destinations.',
    commonFixes: [
      'Use descriptive text that indicates the link destination',
      'Avoid generic phrases like "click here," "learn more," or "read more"',
      'For image links, ensure the image has descriptive alt text',
      'If context is needed, use aria-label or visually-hidden text',
    ],
    codeExample: {
      bad: '<a href="/pricing">Click here</a> for pricing.',
      good: '<a href="/pricing">View our pricing plans</a>',
    },
    wcagUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/link-purpose-in-context.html',
    dequeUrl: 'https://dequeuniversity.com/rules/axe/4.8/link-name',
  },

  'label': {
    id: 'label',
    name: 'Form Input Labels',
    wcagCriterion: '1.3.1',
    wcagName: 'Info and Relationships',
    level: 'A',
    explanation:
      'Every form input needs a label that describes what information should be entered. ' +
      'Labels must be programmatically associated with their inputs using for/id attributes ' +
      'or by wrapping the input inside the label element.',
    whyItMatters:
      'Without labels, screen reader users hear only "edit text" or "checkbox" with no context. ' +
      'They cannot know what information to enter. Labels also increase the clickable area for ' +
      'the input, helping users with motor impairments.',
    commonFixes: [
      'Add a <label> element with for="input-id" matching the input\'s id',
      'Wrap the input inside the label: <label>Email <input type="email"></label>',
      'Use aria-label or aria-labelledby for complex UI patterns',
      'Placeholder text alone is NOT sufficient - it disappears when typing',
    ],
    codeExample: {
      bad: '<input type="email" placeholder="Email">',
      good: '<label for="email">Email address</label>\n<input type="email" id="email">',
    },
    wcagUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/info-and-relationships.html',
    dequeUrl: 'https://dequeuniversity.com/rules/axe/4.8/label',
  },

  'color-contrast': {
    id: 'color-contrast',
    name: 'Color Contrast',
    wcagCriterion: '1.4.3',
    wcagName: 'Contrast (Minimum)',
    level: 'AA',
    explanation:
      'Text must have sufficient contrast against its background. Normal text requires ' +
      'at least 4.5:1 contrast ratio, while large text (18pt or 14pt bold) requires 3:1. ' +
      'This ensures text is readable for people with low vision or color blindness.',
    whyItMatters:
      'Approximately 300 million people have color blindness. Many more have low vision or ' +
      'read in challenging lighting conditions. Insufficient contrast makes text difficult ' +
      'or impossible to read, excluding these users from your content.',
    commonFixes: [
      'Use a contrast checker tool to verify your color combinations',
      'Increase the difference between text and background colors',
      'Avoid light gray text on white backgrounds',
      'Be careful with text over images - consider adding a semi-transparent overlay',
    ],
    codeExample: {
      bad: 'color: #767676; background: #ffffff; /* 4.48:1 - fails WCAG AA */',
      good: 'color: #595959; background: #ffffff; /* 7:1 - passes WCAG AA */',
    },
    wcagUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html',
    dequeUrl: 'https://dequeuniversity.com/rules/axe/4.8/color-contrast',
  },

  'html-has-lang': {
    id: 'html-has-lang',
    name: 'HTML Language Attribute',
    wcagCriterion: '3.1.1',
    wcagName: 'Language of Page',
    level: 'A',
    explanation:
      'The <html> element must have a lang attribute that identifies the page\'s primary language. ' +
      'This helps screen readers use the correct pronunciation rules and helps browsers offer translation. ' +
      'Use standard language codes like "en" for English, "es" for Spanish, "fr" for French.',
    whyItMatters:
      'Screen readers use the language attribute to switch pronunciation. Without it, an English screen ' +
      'reader might try to read French text with English pronunciation rules, making content unintelligible. ' +
      'This is critical for multilingual sites and users.',
    commonFixes: [
      'Add lang="en" (or appropriate code) to the <html> element',
      'Use valid IETF language tags (en, en-US, es, fr, de, zh, etc.)',
      'For content in multiple languages, use lang on specific elements',
    ],
    codeExample: {
      bad: '<!DOCTYPE html>\n<html>',
      good: '<!DOCTYPE html>\n<html lang="en">',
    },
    wcagUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/language-of-page.html',
    dequeUrl: 'https://dequeuniversity.com/rules/axe/4.8/html-has-lang',
  },

  'document-title': {
    id: 'document-title',
    name: 'Document Title',
    wcagCriterion: '2.4.2',
    wcagName: 'Page Titled',
    level: 'A',
    explanation:
      'Every page needs a <title> element that describes its topic or purpose. ' +
      'The title appears in browser tabs, bookmarks, and search results. ' +
      'It\'s the first thing screen readers announce when a page loads.',
    whyItMatters:
      'Screen reader users rely on page titles to know what page they\'ve landed on. ' +
      'When users have many tabs open, descriptive titles help everyone find the right one. ' +
      'Search engines also use titles to understand and rank your content.',
    commonFixes: [
      'Add a unique, descriptive <title> element to every page',
      'Put the most specific info first: "Product Name - Company Name"',
      'Avoid titles like "Untitled" or just your company name',
      'Update titles dynamically for SPAs when content changes',
    ],
    codeExample: {
      bad: '<title>Page</title>',
      good: '<title>Contact Us - Acme Corporation</title>',
    },
    wcagUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/page-titled.html',
    dequeUrl: 'https://dequeuniversity.com/rules/axe/4.8/document-title',
  },

  'list': {
    id: 'list',
    name: 'List Structure',
    wcagCriterion: '1.3.1',
    wcagName: 'Info and Relationships',
    level: 'A',
    explanation:
      '<ul> and <ol> elements must only contain <li>, <script>, or <template> elements. ' +
      'Lists provide semantic structure that helps assistive technology communicate the ' +
      'number of items and navigate between them.',
    whyItMatters:
      'Screen readers announce lists with item counts like "list, 5 items". Users can jump ' +
      'between list items quickly. Invalid list structure breaks this functionality and makes ' +
      'navigation confusing.',
    commonFixes: [
      'Ensure only <li> elements are direct children of <ul> or <ol>',
      'Move any wrapper divs inside the <li> elements, not between them',
      'Use proper list markup for navigation menus, not just styled divs',
    ],
    codeExample: {
      bad: '<ul>\n  <div><li>Item 1</li></div>\n  <div><li>Item 2</li></div>\n</ul>',
      good: '<ul>\n  <li>Item 1</li>\n  <li>Item 2</li>\n</ul>',
    },
    wcagUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/info-and-relationships.html',
    dequeUrl: 'https://dequeuniversity.com/rules/axe/4.8/list',
  },

  'listitem': {
    id: 'listitem',
    name: 'List Item Structure',
    wcagCriterion: '1.3.1',
    wcagName: 'Info and Relationships',
    level: 'A',
    explanation:
      '<li> elements must be contained within a <ul> or <ol> parent element. ' +
      'Orphaned list items lose their semantic meaning and are not announced ' +
      'properly by screen readers.',
    whyItMatters:
      'Without the proper parent container, screen readers cannot convey that items are ' +
      'part of a list. Users miss important context about content relationships and cannot ' +
      'use list navigation features.',
    commonFixes: [
      'Wrap <li> elements in a <ul> (unordered) or <ol> (ordered) list',
      'Use <ul> for items without sequence, <ol> for numbered/ordered items',
      'Check that no <li> elements are placed outside list containers',
    ],
    codeExample: {
      bad: '<div>\n  <li>Orphaned item</li>\n</div>',
      good: '<ul>\n  <li>Properly nested item</li>\n</ul>',
    },
    wcagUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/info-and-relationships.html',
    dequeUrl: 'https://dequeuniversity.com/rules/axe/4.8/listitem',
  },

  'frame-title': {
    id: 'frame-title',
    name: 'Frame Title',
    wcagCriterion: '4.1.2',
    wcagName: 'Name, Role, Value',
    level: 'A',
    explanation:
      '<iframe> and <frame> elements must have a title attribute that describes their content. ' +
      'This helps users understand what content is embedded without having to enter the frame. ' +
      'The title should be concise but descriptive.',
    whyItMatters:
      'Screen reader users encounter iframes as navigation landmarks. Without a title, users hear ' +
      'just "frame" with no indication of its content. They may waste time entering frames that ' +
      'don\'t interest them or miss important embedded content.',
    commonFixes: [
      'Add a title attribute describing the iframe\'s content',
      'Use descriptive titles like "Product demo video" not "iframe"',
      'For decorative iframes, consider if they should be hidden from screen readers',
    ],
    codeExample: {
      bad: '<iframe src="https://www.youtube.com/embed/xyz"></iframe>',
      good: '<iframe src="https://www.youtube.com/embed/xyz" title="Product demonstration video"></iframe>',
    },
    wcagUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/name-role-value.html',
    dequeUrl: 'https://dequeuniversity.com/rules/axe/4.8/frame-title',
  },

  'input-image-alt': {
    id: 'input-image-alt',
    name: 'Image Button Alternative Text',
    wcagCriterion: '1.1.1',
    wcagName: 'Non-text Content',
    level: 'A',
    explanation:
      '<input type="image"> elements must have an alt attribute that describes the button\'s ' +
      'action. These are submit buttons that use images, and the alt text serves as both the ' +
      'accessible name and description of what happens when clicked.',
    whyItMatters:
      'Screen reader users need to know what action an image button performs. Without alt text, ' +
      'they only hear "image button" with no indication of its purpose, making forms unusable.',
    commonFixes: [
      'Add alt attribute describing the button\'s action',
      'Use action words like "Search," "Submit," or "Add to cart"',
      'Consider using <button> with an <img> inside for more flexibility',
    ],
    codeExample: {
      bad: '<input type="image" src="search-icon.png">',
      good: '<input type="image" src="search-icon.png" alt="Search">',
    },
    wcagUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/non-text-content.html',
    dequeUrl: 'https://dequeuniversity.com/rules/axe/4.8/input-image-alt',
  },

  'meta-viewport': {
    id: 'meta-viewport',
    name: 'Viewport Zoom',
    wcagCriterion: '1.4.4',
    wcagName: 'Resize Text',
    level: 'AA',
    explanation:
      'The viewport meta tag must not prevent users from zooming. Settings like ' +
      'user-scalable="no" or maximum-scale=1.0 disable pinch-to-zoom functionality. ' +
      'Users must be able to zoom to at least 200%.',
    whyItMatters:
      'Many users with low vision rely on zooming to read text comfortably. Disabling zoom ' +
      'forces them to use external tools or leaves them unable to read content at all. ' +
      'Mobile users especially depend on pinch-to-zoom.',
    commonFixes: [
      'Remove user-scalable="no" from viewport meta tag',
      'Remove or increase maximum-scale (allow at least 2.0)',
      'Set initial-scale=1.0 but allow user scaling',
    ],
    codeExample: {
      bad: '<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no, maximum-scale=1.0">',
      good: '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    },
    wcagUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/resize-text.html',
    dequeUrl: 'https://dequeuniversity.com/rules/axe/4.8/meta-viewport',
  },

  'region': {
    id: 'region',
    name: 'Page Regions',
    wcagCriterion: '1.3.1',
    wcagName: 'Info and Relationships',
    level: 'A',
    explanation:
      'All page content should be contained within landmark regions. Landmarks include ' +
      '<header>, <nav>, <main>, <aside>, <footer>, and elements with ARIA roles like ' +
      'role="banner", role="navigation", role="main", etc.',
    whyItMatters:
      'Screen reader users can navigate directly between landmark regions, skipping repetitive ' +
      'content. Without landmarks, users must read through the entire page linearly to find ' +
      'what they need. This is like having a book with no chapters or table of contents.',
    commonFixes: [
      'Wrap header content in <header> element',
      'Use <nav> for navigation menus',
      'Put main content in <main> element (only one per page)',
      'Use <aside> for sidebar content',
      'Wrap footer content in <footer> element',
    ],
    codeExample: {
      bad: '<div class="header">...</div>\n<div class="content">...</div>\n<div class="footer">...</div>',
      good: '<header>...</header>\n<main>...</main>\n<footer>...</footer>',
    },
    wcagUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/info-and-relationships.html',
    dequeUrl: 'https://dequeuniversity.com/rules/axe/4.8/region',
  },

  'aria-required-children': {
    id: 'aria-required-children',
    name: 'ARIA Required Children',
    wcagCriterion: '1.3.1',
    wcagName: 'Info and Relationships',
    level: 'A',
    explanation:
      'Certain ARIA roles require specific child roles to function properly. For example, ' +
      'role="list" requires children with role="listitem", role="menu" requires role="menuitem", ' +
      'and role="tablist" requires role="tab". Missing required children break the pattern.',
    whyItMatters:
      'When ARIA patterns are incomplete, assistive technology cannot convey the correct structure. ' +
      'Users expect certain behaviors from ARIA roles - a list should have items, a menu should ' +
      'have menu items. Missing pieces create confusion.',
    commonFixes: [
      'Add the required child roles to parent elements',
      'For role="list", ensure children have role="listitem"',
      'For role="menu", children need role="menuitem", "menuitemcheckbox", or "menuitemradio"',
      'Consider using native HTML elements instead of ARIA when possible',
    ],
    codeExample: {
      bad: '<div role="list">\n  <div>Item 1</div>\n  <div>Item 2</div>\n</div>',
      good: '<div role="list">\n  <div role="listitem">Item 1</div>\n  <div role="listitem">Item 2</div>\n</div>',
    },
    wcagUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/info-and-relationships.html',
    dequeUrl: 'https://dequeuniversity.com/rules/axe/4.8/aria-required-children',
  },

  'aria-required-parent': {
    id: 'aria-required-parent',
    name: 'ARIA Required Parent',
    wcagCriterion: '1.3.1',
    wcagName: 'Info and Relationships',
    level: 'A',
    explanation:
      'Certain ARIA roles must be contained within specific parent roles. For example, ' +
      'role="listitem" must be inside role="list", role="tab" must be inside role="tablist", ' +
      'and role="menuitem" must be inside role="menu" or role="menubar".',
    whyItMatters:
      'Child roles without proper parents are orphaned and lose their semantic meaning. ' +
      'A listitem outside a list isn\'t announced as a list item. Screen reader users miss ' +
      'the relationship between elements.',
    commonFixes: [
      'Wrap elements in the required parent role container',
      'For role="listitem", parent needs role="list" or role="listbox"',
      'For role="tab", parent needs role="tablist"',
      'Consider using native HTML elements that have built-in relationships',
    ],
    codeExample: {
      bad: '<div role="listitem">Orphaned item</div>',
      good: '<div role="list">\n  <div role="listitem">Nested item</div>\n</div>',
    },
    wcagUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/info-and-relationships.html',
    dequeUrl: 'https://dequeuniversity.com/rules/axe/4.8/aria-required-parent',
  },
};

interface LearnOptions {
  list?: boolean;
}

/**
 * Check if GitHub Copilot CLI is available
 */
async function isCopilotAvailable(): Promise<boolean> {
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    await execAsync('which gh');
    // Check if copilot extension is available
    const result = await execAsync('gh copilot --help 2>&1').catch(() => null);
    return result !== null;
  } catch {
    return false;
  }
}

export async function learnCommand(violationId?: string, options: LearnOptions = {}): Promise<void> {
  printBanner();

  // Handle --list flag
  if (options.list) {
    printViolationList();
    return;
  }

  // No violation ID provided
  if (!violationId) {
    printInfo('Usage: ally learn <violation-id>');
    console.log();
    console.log(chalk.dim('Learn about a specific accessibility violation in depth.'));
    console.log();
    console.log(chalk.bold('Examples:'));
    console.log(chalk.cyan('  ally learn image-alt'));
    console.log(chalk.cyan('  ally learn color-contrast'));
    console.log(chalk.cyan('  ally learn --list'));
    console.log();
    printInfo('Run ally learn --list to see all available violations.');
    return;
  }

  // Normalize the violation ID (lowercase, handle common aliases)
  const normalizedId = normalizeViolationId(violationId);

  // Look up the violation
  const violation = VIOLATIONS_DB[normalizedId];

  if (!violation) {
    printError(`Unknown violation: ${violationId}`);
    console.log();
    printInfo('Did you mean one of these?');
    const suggestions = findSimilarViolations(violationId);
    for (const suggestion of suggestions) {
      console.log(chalk.cyan(`  ally learn ${suggestion}`));
    }
    console.log();
    printInfo('Run ally learn --list to see all available violations.');
    return;
  }

  // Display violation information
  await displayViolationInfo(violation);
}

function normalizeViolationId(id: string): string {
  // Common aliases
  const aliases: Record<string, string> = {
    'alt': 'image-alt',
    'img-alt': 'image-alt',
    'alt-text': 'image-alt',
    'contrast': 'color-contrast',
    'lang': 'html-has-lang',
    'language': 'html-has-lang',
    'title': 'document-title',
    'page-title': 'document-title',
    'input-label': 'label',
    'form-label': 'label',
    'labels': 'label',
    'iframe-title': 'frame-title',
    'viewport': 'meta-viewport',
    'zoom': 'meta-viewport',
    'landmarks': 'region',
  };

  const lower = id.toLowerCase();
  return aliases[lower] || lower;
}

function findSimilarViolations(id: string): string[] {
  const violations = Object.keys(VIOLATIONS_DB);
  const lower = id.toLowerCase();

  // Find violations that contain the search term
  const matches = violations.filter(v =>
    v.includes(lower) || lower.includes(v.split('-')[0])
  );

  if (matches.length > 0) {
    return matches.slice(0, 3);
  }

  // Return some popular ones as fallback
  return ['image-alt', 'color-contrast', 'button-name'];
}

function printViolationList(): void {
  console.log(chalk.bold.cyan('Available Violation Types'));
  console.log(chalk.dim('=' .repeat(60)));
  console.log();

  // Group by WCAG level
  const byLevel: Record<string, ViolationInfo[]> = { A: [], AA: [], AAA: [] };

  for (const violation of Object.values(VIOLATIONS_DB)) {
    byLevel[violation.level].push(violation);
  }

  for (const level of ['A', 'AA', 'AAA'] as const) {
    const violations = byLevel[level];
    if (violations.length === 0) continue;

    const levelColor = level === 'A' ? chalk.green :
                       level === 'AA' ? chalk.yellow :
                       chalk.red;

    console.log(levelColor.bold(`WCAG Level ${level}`));
    console.log(chalk.dim('-'.repeat(60)));

    for (const v of violations) {
      const idPadded = v.id.padEnd(25);
      console.log(
        chalk.cyan(idPadded) +
        chalk.dim(`${v.wcagCriterion} `) +
        v.name
      );
    }
    console.log();
  }

  console.log(chalk.dim('─'.repeat(60)));
  console.log();
  printInfo('Learn about a violation:');
  console.log(chalk.cyan('  ally learn <violation-id>'));
  console.log();
  console.log(chalk.dim('Example: ally learn image-alt'));
}

async function displayViolationInfo(violation: ViolationInfo): Promise<void> {
  // Header box with violation name and WCAG criterion
  const levelColor = violation.level === 'A' ? chalk.green :
                     violation.level === 'AA' ? chalk.yellow :
                     chalk.red;

  const header = `${violation.name}

${chalk.bold('WCAG Criterion:')} ${violation.wcagCriterion} ${violation.wcagName}
${chalk.bold('Level:')} ${levelColor.bold(violation.level)}`;

  console.log(
    boxen(header, {
      padding: 1,
      margin: { top: 0, bottom: 1, left: 0, right: 0 },
      borderStyle: 'round',
      borderColor: 'cyan',
      title: violation.id,
      titleAlignment: 'center',
    })
  );

  // What is this?
  console.log(chalk.bold.white('What is this?'));
  console.log(chalk.dim('─'.repeat(60)));
  console.log(wrapText(violation.explanation, 60));
  console.log();

  // Why it matters
  console.log(chalk.bold.white('Why it matters'));
  console.log(chalk.dim('─'.repeat(60)));
  console.log(wrapText(violation.whyItMatters, 60));
  console.log();

  // Common fixes
  console.log(chalk.bold.white('How to fix'));
  console.log(chalk.dim('─'.repeat(60)));
  for (const fix of violation.commonFixes) {
    console.log(chalk.green('  • ') + fix);
  }
  console.log();

  // Code example
  if (violation.codeExample) {
    console.log(chalk.bold.white('Code example'));
    console.log(chalk.dim('─'.repeat(60)));
    console.log();
    console.log(chalk.red.bold('  ✗ Bad:'));
    for (const line of violation.codeExample.bad.split('\n')) {
      console.log(chalk.red(`    ${line}`));
    }
    console.log();
    console.log(chalk.green.bold('  ✓ Good:'));
    for (const line of violation.codeExample.good.split('\n')) {
      console.log(chalk.green(`    ${line}`));
    }
    console.log();
  }

  // Resources
  console.log(chalk.bold.white('Learn more'));
  console.log(chalk.dim('─'.repeat(60)));
  console.log(chalk.blue('  WCAG: ') + chalk.underline(violation.wcagUrl));
  console.log(chalk.blue('  Deque: ') + chalk.underline(violation.dequeUrl));
  console.log();

  // Copilot integration hint
  const hasCopilot = await isCopilotAvailable();
  if (hasCopilot) {
    console.log(
      boxen(
        chalk.cyan('Tip: ') + 'Get context-specific guidance with Copilot:\n\n' +
        chalk.dim(`  gh copilot explain "How do I fix ${violation.id} violations in my React app?"`) + '\n' +
        chalk.dim(`  gh copilot explain "Best practices for ${violation.name.toLowerCase()}"`)
      , {
        padding: { top: 0, bottom: 0, left: 1, right: 1 },
        borderStyle: 'round',
        borderColor: 'blue',
        dimBorder: true,
      })
    );
  } else {
    printInfo(
      'Install GitHub Copilot CLI for context-specific guidance: ' +
      chalk.cyan('gh extension install github/gh-copilot')
    );
  }
}

function wrapText(text: string, width: number): string {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length <= width) {
      currentLine = (currentLine + ' ' + word).trim();
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines.join('\n');
}

export default learnCommand;
