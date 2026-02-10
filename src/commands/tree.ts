/**
 * ally tree command - Visualize accessibility tree for a URL
 */

import puppeteer, { type Browser, type Page, type SerializedAXNode } from 'puppeteer';
import chalk from 'chalk';
import boxen from 'boxen';
import {
  printBanner,
  createSpinner,
  printError,
  printWarning,
  printInfo,
} from '../utils/ui.js';

interface TreeCommandOptions {
  depth?: number;
  role?: string;
  json?: boolean;
}

// Tree drawing characters
const TREE_CHARS = {
  pipe: '\u2502',     // │
  tee: '\u251C',      // ├
  elbow: '\u2514',    // └
  dash: '\u2500',     // ─
  space: ' ',
};

// Role categories for coloring and summary
const LANDMARK_ROLES = new Set([
  'banner', 'main', 'contentinfo', 'navigation', 'complementary',
  'region', 'search', 'form', 'application'
]);

const HEADING_ROLES = new Set(['heading']);

const INTERACTIVE_ROLES = new Set([
  'link', 'button', 'textbox', 'checkbox', 'radio', 'combobox',
  'listbox', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
  'option', 'searchbox', 'slider', 'spinbutton', 'switch', 'tab',
  'treeitem', 'gridcell'
]);

// Summary tracking interface
interface TreeSummary {
  landmarks: Map<string, number>;
  headings: Map<number, number>;
  links: number;
  images: number;
  forms: number;
  buttons: number;
  textboxes: number;
  lists: number;
  tables: number;
}

interface AXNode {
  role: string;
  name?: string;
  children?: AXNode[];
  // Common properties
  level?: number;
  checked?: boolean | 'mixed';
  pressed?: boolean | 'mixed';
  selected?: boolean;
  expanded?: boolean;
  disabled?: boolean;
  required?: boolean;
  invalid?: boolean | string;
  focused?: boolean;
  modal?: boolean;
  multiselectable?: boolean;
  readonly?: boolean;
  value?: string | number;
  valuemin?: number;
  valuemax?: number;
  valuetext?: string;
  keyshortcuts?: string;
  roledescription?: string;
  autocomplete?: string;
  haspopup?: string;
  orientation?: string;
}

/**
 * Create an empty summary object
 */
function createSummary(): TreeSummary {
  return {
    landmarks: new Map(),
    headings: new Map(),
    links: 0,
    images: 0,
    forms: 0,
    buttons: 0,
    textboxes: 0,
    lists: 0,
    tables: 0,
  };
}

/**
 * Update summary based on node
 */
function updateSummary(summary: TreeSummary, node: AXNode): void {
  const role = node.role;

  if (LANDMARK_ROLES.has(role)) {
    summary.landmarks.set(role, (summary.landmarks.get(role) || 0) + 1);
  }

  if (role === 'heading' && node.level !== undefined) {
    summary.headings.set(node.level, (summary.headings.get(node.level) || 0) + 1);
  }

  switch (role) {
    case 'link':
      summary.links++;
      break;
    case 'img':
    case 'image':
      summary.images++;
      break;
    case 'form':
      summary.forms++;
      break;
    case 'button':
      summary.buttons++;
      break;
    case 'textbox':
    case 'searchbox':
      summary.textboxes++;
      break;
    case 'list':
      summary.lists++;
      break;
    case 'table':
      summary.tables++;
      break;
  }
}

/**
 * Colorize role based on category
 */
function colorizeRole(role: string): string {
  if (LANDMARK_ROLES.has(role)) {
    return chalk.blue(role);
  }
  if (HEADING_ROLES.has(role)) {
    return chalk.yellow(role);
  }
  if (INTERACTIVE_ROLES.has(role)) {
    return chalk.green(role);
  }
  return chalk.cyan(role);
}

/**
 * Format node for display (role + optional level + name)
 */
function formatNodeDisplay(node: AXNode): string {
  let display = colorizeRole(node.role);

  // Add level info for headings
  if (node.role === 'heading' && node.level !== undefined) {
    display += chalk.dim(` (level ${node.level})`);
  }

  // Add name if present
  if (node.name && node.name.trim()) {
    display += ` ${chalk.white(`"${node.name}"`)}`;
  }

  return display;
}

/**
 * Format node properties for display (e.g., [level=2], [checked], [disabled])
 */
function formatProperties(node: AXNode): string {
  const props: string[] = [];

  if (node.level !== undefined) {
    props.push(`level=${node.level}`);
  }
  if (node.checked !== undefined) {
    props.push(node.checked === 'mixed' ? 'checked=mixed' : (node.checked ? 'checked' : 'unchecked'));
  }
  if (node.pressed !== undefined) {
    props.push(node.pressed === 'mixed' ? 'pressed=mixed' : (node.pressed ? 'pressed' : 'not pressed'));
  }
  if (node.selected) {
    props.push('selected');
  }
  if (node.expanded !== undefined) {
    props.push(node.expanded ? 'expanded' : 'collapsed');
  }
  if (node.disabled) {
    props.push('disabled');
  }
  if (node.required) {
    props.push('required');
  }
  if (node.invalid) {
    props.push(typeof node.invalid === 'string' ? `invalid=${node.invalid}` : 'invalid');
  }
  if (node.focused) {
    props.push('focused');
  }
  if (node.modal) {
    props.push('modal');
  }
  if (node.readonly) {
    props.push('readonly');
  }
  if (node.value !== undefined) {
    const valueStr = typeof node.value === 'string' ? `"${node.value}"` : String(node.value);
    props.push(`value=${valueStr}`);
  }

  return props.length > 0 ? ` [${props.join(', ')}]` : '';
}

/**
 * Print a single tree node with proper formatting
 */
function printNode(
  node: AXNode,
  prefix: string,
  isLast: boolean,
  currentDepth: number,
  maxDepth: number,
  filterRole?: string
): number {
  // Check role filter
  if (filterRole && node.role !== filterRole) {
    // Still process children to find matching roles
    let count = 0;
    if (node.children && currentDepth < maxDepth) {
      const childCount = node.children.length;
      node.children.forEach((child, index) => {
        count += printNode(
          child as AXNode,
          prefix,
          index === childCount - 1,
          currentDepth + 1,
          maxDepth,
          filterRole
        );
      });
    }
    return count;
  }

  // Build the tree prefix
  const connector = isLast
    ? `${TREE_CHARS.elbow}${TREE_CHARS.dash}${TREE_CHARS.dash} `
    : `${TREE_CHARS.tee}${TREE_CHARS.dash}${TREE_CHARS.dash} `;

  // Format the node
  const role = chalk.cyan(node.role);
  const name = node.name ? chalk.white(` "${node.name}"`) : '';
  const props = chalk.gray(formatProperties(node));

  // Print the node
  if (currentDepth === 0) {
    console.log(`${role}${name}${props}`);
  } else {
    console.log(`${prefix}${connector}${role}${name}${props}`);
  }

  let nodeCount = 1;

  // Process children
  if (node.children && node.children.length > 0) {
    if (currentDepth >= maxDepth) {
      // Indicate there are more children but we're at max depth
      const childPrefix = isLast
        ? `${prefix}    `
        : `${prefix}${TREE_CHARS.pipe}   `;
      console.log(`${childPrefix}${chalk.gray(`... ${node.children.length} more children`)}`);
    } else {
      const childPrefix = isLast
        ? `${prefix}    `
        : `${prefix}${TREE_CHARS.pipe}   `;

      const childCount = node.children.length;
      node.children.forEach((child, index) => {
        nodeCount += printNode(
          child as AXNode,
          childPrefix,
          index === childCount - 1,
          currentDepth + 1,
          maxDepth,
          filterRole
        );
      });
    }
  }

  return nodeCount;
}

/**
 * Count total nodes in the tree
 */
function countNodes(node: AXNode): number {
  let count = 1;
  if (node.children) {
    for (const child of node.children) {
      count += countNodes(child as AXNode);
    }
  }
  return count;
}

/**
 * Find the maximum depth of the tree
 */
function getMaxTreeDepth(node: AXNode, currentDepth = 0): number {
  if (!node.children || node.children.length === 0) {
    return currentDepth;
  }

  let maxChildDepth = currentDepth;
  for (const child of node.children) {
    const childDepth = getMaxTreeDepth(child as AXNode, currentDepth + 1);
    if (childDepth > maxChildDepth) {
      maxChildDepth = childDepth;
    }
  }

  return maxChildDepth;
}

/**
 * Filter tree to only include nodes with a specific role
 */
function filterByRole(node: AXNode, role: string): AXNode[] {
  const matches: AXNode[] = [];

  if (node.role === role) {
    matches.push(node);
  }

  if (node.children) {
    for (const child of node.children) {
      matches.push(...filterByRole(child as AXNode, role));
    }
  }

  return matches;
}

export async function treeCommand(
  url: string,
  options: TreeCommandOptions = {}
): Promise<void> {
  printBanner();

  const { depth = 5, role, json = false } = options;

  // Validate URL
  let targetUrl = url;
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = `https://${targetUrl}`;
  }

  const spinner = createSpinner(`Fetching accessibility tree from ${targetUrl}...`);
  spinner.start();

  let browser: Browser | null = null;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();

    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // Get the accessibility tree
    const snapshot = await page.accessibility.snapshot({
      interestingOnly: false, // Get all nodes, not just interesting ones
    });

    await page.close();

    if (!snapshot) {
      spinner.fail('Failed to get accessibility tree');
      printError('The page may not have any accessible content.');
      return;
    }

    spinner.succeed('Accessibility tree retrieved');

    // Calculate tree stats
    const totalNodes = countNodes(snapshot as AXNode);
    const actualDepth = getMaxTreeDepth(snapshot as AXNode);

    // JSON output mode
    if (json) {
      if (role) {
        const filtered = filterByRole(snapshot as AXNode, role);
        console.log(JSON.stringify(filtered, null, 2));
      } else {
        console.log(JSON.stringify(snapshot, null, 2));
      }
      return;
    }

    // Print header
    console.log();
    console.log(
      boxen(
        `Accessibility Tree for ${chalk.cyan(targetUrl)}\n${chalk.dim(`${totalNodes} nodes, depth: ${actualDepth}`)}`,
        {
          padding: { top: 0, bottom: 0, left: 1, right: 1 },
          borderStyle: 'round',
          borderColor: 'cyan',
        }
      )
    );
    console.log();

    // Show warning if tree is deep
    if (actualDepth > depth) {
      printWarning(`Tree depth (${actualDepth}) exceeds display limit (${depth}). Use --depth to show more.`);
      console.log();
    }

    // Filter mode
    if (role) {
      const matches = filterByRole(snapshot as AXNode, role);
      if (matches.length === 0) {
        printInfo(`No nodes found with role "${role}"`);
        return;
      }

      console.log(chalk.dim(`Found ${matches.length} node(s) with role "${role}":\n`));

      for (const match of matches) {
        printNode(match, '', true, 0, depth);
        console.log();
      }
    } else {
      // Print full tree
      printNode(snapshot as AXNode, '', true, 0, depth);
    }

    console.log();

    // Print legend
    console.log(chalk.dim('Legend:'));
    console.log(chalk.dim(`  ${chalk.cyan('role')} ${chalk.white('"name"')} ${chalk.gray('[properties]')}`));
    console.log();
  } catch (error) {
    spinner.fail(`Failed to fetch accessibility tree`);
    if (error instanceof Error) {
      if (error.message.includes('net::ERR_NAME_NOT_RESOLVED')) {
        printError(`Could not resolve hostname: ${targetUrl}`);
      } else if (error.message.includes('net::ERR_CONNECTION_REFUSED')) {
        printError(`Connection refused: ${targetUrl}`);
      } else if (error.message.includes('Timeout')) {
        printError(`Request timed out for: ${targetUrl}`);
      } else {
        printError(error.message);
      }
    } else {
      printError(String(error));
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

export default treeCommand;
