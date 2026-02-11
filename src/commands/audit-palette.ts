/**
 * ally audit-palette command - Audits a design system color palette for contrast issues
 *
 * Supports:
 * - Tailwind config files (tailwind.config.js, tailwind.config.ts)
 * - CSS variable files (*.css)
 * - JSON palette files (*.json)
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, extname } from 'path';
import chalk from 'chalk';
import boxen from 'boxen';
import {
  printBanner,
  createSpinner,
  printError,
  printSuccess,
  printInfo,
  printWarning,
} from '../utils/ui.js';

// ============================================================================
// Types
// ============================================================================

interface Color {
  name: string;
  hex: string;
  rgb: { r: number; g: number; b: number };
}

interface ContrastResult {
  background: Color;
  foreground: Color;
  wcagRatio: number;
  wcagAA: boolean;
  wcagAAA: boolean;
  apcaLc: number;
}

interface PaletteAuditResult {
  totalColors: number;
  totalCombinations: number;
  wcagAAPassing: number;
  wcagAAAPassing: number;
  failing: ContrastResult[];
  passing: ContrastResult[];
  suggestions: Suggestion[];
}

interface Suggestion {
  background: string;
  foreground: string;
  suggestedForeground: string;
  originalRatio: number;
  newRatio: number;
}

type OutputFormat = 'default' | 'json' | 'csv';
type WcagLevel = 'aa' | 'aaa';

interface AuditPaletteOptions {
  format?: OutputFormat;
  level?: WcagLevel;
  largeText?: boolean;
  apca?: boolean;
}

// ============================================================================
// Color Parsing Utilities
// ============================================================================

/**
 * Parse a hex color string to RGB values
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  // Remove # if present
  const cleanHex = hex.replace(/^#/, '');

  // Support 3-char and 6-char hex
  let fullHex: string;
  if (cleanHex.length === 3) {
    fullHex = cleanHex
      .split('')
      .map((c) => c + c)
      .join('');
  } else if (cleanHex.length === 6) {
    fullHex = cleanHex;
  } else {
    return null;
  }

  const num = parseInt(fullHex, 16);
  if (isNaN(num)) return null;

  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

/**
 * Convert RGB to hex string
 */
function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) =>
    Math.round(Math.max(0, Math.min(255, n)))
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

/**
 * Check if a string looks like a valid hex color
 */
function isValidHexColor(value: string): boolean {
  return /^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(value);
}

/**
 * Normalize hex color to uppercase with #
 */
function normalizeHex(hex: string): string {
  const cleanHex = hex.replace(/^#/, '').toUpperCase();
  if (cleanHex.length === 3) {
    return (
      '#' +
      cleanHex
        .split('')
        .map((c) => c + c)
        .join('')
    );
  }
  return '#' + cleanHex;
}

// ============================================================================
// Contrast Calculation (WCAG 2.x)
// ============================================================================

/**
 * Calculate relative luminance per WCAG 2.x spec
 * https://www.w3.org/WAI/GL/wiki/Relative_luminance
 */
function relativeLuminance(r: number, g: number, b: number): number {
  const sRGB = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
}

/**
 * Calculate WCAG 2.x contrast ratio between two colors
 */
function wcagContrastRatio(
  fg: { r: number; g: number; b: number },
  bg: { r: number; g: number; b: number }
): number {
  const l1 = relativeLuminance(fg.r, fg.g, fg.b);
  const l2 = relativeLuminance(bg.r, bg.g, bg.b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ============================================================================
// APCA Contrast Calculation
// ============================================================================

/**
 * APCA (Accessible Perceptual Contrast Algorithm) calculation
 * Based on APCA W3 specification
 * https://github.com/Myndex/SAPC-APCA
 *
 * Returns Lc value (Lightness contrast):
 * - Positive values: light text on dark background
 * - Negative values: dark text on light background
 * - Magnitude indicates contrast level (higher = more contrast)
 * - |Lc| >= 60 is recommended for body text
 * - |Lc| >= 45 is recommended for large text
 */
function calcAPCA(
  fg: { r: number; g: number; b: number },
  bg: { r: number; g: number; b: number }
): number {
  // sRGB to Y (luminance) conversion with APCA coefficients
  const sRGBtoY = (rgb: { r: number; g: number; b: number }): number => {
    // Piecewise sRGB decode
    const mainTRC = 2.4;

    const decode = (c: number): number => {
      const s = c / 255;
      return s <= 0.04045
        ? s / 12.92
        : Math.pow((s + 0.055) / 1.055, mainTRC);
    };

    // APCA uses slightly different coefficients than WCAG
    const Rco = 0.2126729;
    const Gco = 0.7151522;
    const Bco = 0.0721750;

    return Rco * decode(rgb.r) + Gco * decode(rgb.g) + Bco * decode(rgb.b);
  };

  // Soft clamp function
  const softClamp = (y: number): number => {
    const blkThrs = 0.022;
    const blkClmp = 1.414;
    return y > blkThrs ? y : y + Math.pow(blkThrs - y, blkClmp);
  };

  // Calculate luminance values
  let Ytxt = sRGBtoY(fg);
  let Ybg = sRGBtoY(bg);

  // Apply soft clamp
  Ytxt = softClamp(Ytxt);
  Ybg = softClamp(Ybg);

  // APCA constants for contrast calculation
  const normBG = 0.56;
  const normTXT = 0.57;
  const revTXT = 0.62;
  const revBG = 0.65;

  const scaleBoW = 1.14;
  const scaleWoB = 1.14;

  const loBoWoffset = 0.027;
  const loWoBoffset = 0.027;

  const loClip = 0.1;
  const deltaYmin = 0.0005;

  // Calculate contrast
  let SAPC = 0;
  let outputContrast = 0;

  // Check for adequate difference
  if (Math.abs(Ybg - Ytxt) < deltaYmin) {
    return 0;
  }

  // Calculate polarity-dependent contrast
  if (Ybg > Ytxt) {
    // Dark text on light background
    SAPC = (Math.pow(Ybg, normBG) - Math.pow(Ytxt, normTXT)) * scaleBoW;
    outputContrast = SAPC < loClip ? 0 : SAPC - loBoWoffset;
  } else {
    // Light text on dark background
    SAPC = (Math.pow(Ybg, revBG) - Math.pow(Ytxt, revTXT)) * scaleWoB;
    outputContrast = SAPC > -loClip ? 0 : SAPC + loWoBoffset;
  }

  // Return as Lc value (multiply by 100)
  return Math.round(outputContrast * 100);
}

// ============================================================================
// File Parsers
// ============================================================================

/**
 * Parse Tailwind config file to extract colors
 */
async function parseTailwindConfig(filePath: string): Promise<Color[]> {
  const content = await readFile(filePath, 'utf-8');
  const colors: Color[] = [];

  // Extract the colors object using regex (handles both JS and TS)
  // This is a simplified parser - a real implementation might use esbuild/swc
  const colorsMatch = content.match(
    /colors\s*:\s*\{([\s\S]*?)\n\s*\}/
  );

  if (!colorsMatch) {
    // Try theme.extend.colors pattern
    const extendMatch = content.match(
      /extend\s*:\s*\{[\s\S]*?colors\s*:\s*\{([\s\S]*?)\n\s*\}\s*\}/
    );
    if (extendMatch) {
      parseColorObject(extendMatch[1], '', colors);
    }
    return colors;
  }

  parseColorObject(colorsMatch[1], '', colors);
  return colors;
}

/**
 * Recursively parse a color object string
 */
function parseColorObject(
  content: string,
  prefix: string,
  colors: Color[]
): void {
  // Match simple color definitions: name: '#hex' or 'name': '#hex'
  const simplePattern = /['"]?(\w+)['"]?\s*:\s*['"]?(#[A-Fa-f0-9]{3,6})['"]?/g;
  let match;

  while ((match = simplePattern.exec(content)) !== null) {
    const name = prefix ? `${prefix}-${match[1]}` : match[1];
    const hex = normalizeHex(match[2]);
    const rgb = hexToRgb(hex);
    if (rgb) {
      colors.push({ name, hex, rgb });
    }
  }

  // Match nested objects: name: { ... }
  const nestedPattern = /['"]?(\w+)['"]?\s*:\s*\{([^{}]+)\}/g;
  while ((match = nestedPattern.exec(content)) !== null) {
    const nestedPrefix = prefix ? `${prefix}-${match[1]}` : match[1];
    parseColorObject(match[2], nestedPrefix, colors);
  }
}

/**
 * Parse CSS file to extract color variables
 */
async function parseCssFile(filePath: string): Promise<Color[]> {
  const content = await readFile(filePath, 'utf-8');
  const colors: Color[] = [];

  // Match CSS custom properties with color values
  // --color-name: #hex;
  const pattern = /--([\w-]+)\s*:\s*(#[A-Fa-f0-9]{3,6})\s*;/g;
  let match;

  while ((match = pattern.exec(content)) !== null) {
    const name = match[1];
    const hex = normalizeHex(match[2]);
    const rgb = hexToRgb(hex);
    if (rgb) {
      colors.push({ name, hex, rgb });
    }
  }

  return colors;
}

/**
 * Parse JSON palette file to extract colors
 */
async function parseJsonFile(filePath: string): Promise<Color[]> {
  const content = await readFile(filePath, 'utf-8');
  const data = JSON.parse(content);
  const colors: Color[] = [];

  // Look for colors in common structures
  const colorObjects = data.colors || data.palette || data.theme?.colors || data;

  function extractColors(obj: Record<string, unknown>, prefix = ''): void {
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string' && isValidHexColor(value)) {
        const name = prefix ? `${prefix}-${key}` : key;
        const hex = normalizeHex(value);
        const rgb = hexToRgb(hex);
        if (rgb) {
          colors.push({ name, hex, rgb });
        }
      } else if (typeof value === 'object' && value !== null) {
        extractColors(value as Record<string, unknown>, prefix ? `${prefix}-${key}` : key);
      }
    }
  }

  if (typeof colorObjects === 'object' && colorObjects !== null) {
    extractColors(colorObjects as Record<string, unknown>);
  }

  return colors;
}

/**
 * Detect file type and parse colors accordingly
 */
async function parseColorFile(filePath: string): Promise<Color[]> {
  const ext = extname(filePath).toLowerCase();

  if (filePath.includes('tailwind.config')) {
    return parseTailwindConfig(filePath);
  }

  switch (ext) {
    case '.css':
      return parseCssFile(filePath);
    case '.json':
      return parseJsonFile(filePath);
    case '.js':
    case '.ts':
    case '.mjs':
    case '.cjs':
      return parseTailwindConfig(filePath);
    default:
      throw new Error(
        `Unsupported file type: ${ext}. Supported: .css, .json, .js, .ts`
      );
  }
}

// ============================================================================
// Contrast Analysis
// ============================================================================

/**
 * Test all foreground/background combinations
 */
function analyzeContrastPairs(
  colors: Color[],
  level: WcagLevel,
  largeText: boolean
): PaletteAuditResult {
  const results: ContrastResult[] = [];
  const failing: ContrastResult[] = [];
  const passing: ContrastResult[] = [];

  // Thresholds based on WCAG level and text size
  const aaThreshold = largeText ? 3.0 : 4.5;
  const aaaThreshold = largeText ? 4.5 : 7.0;
  const requiredThreshold = level === 'aaa' ? aaaThreshold : aaThreshold;

  // Test all pairs (excluding same color)
  for (const bg of colors) {
    for (const fg of colors) {
      if (bg.hex === fg.hex) continue;

      const wcagRatio = wcagContrastRatio(fg.rgb, bg.rgb);
      const apcaLc = calcAPCA(fg.rgb, bg.rgb);
      const wcagAA = wcagRatio >= aaThreshold;
      const wcagAAA = wcagRatio >= aaaThreshold;

      const result: ContrastResult = {
        background: bg,
        foreground: fg,
        wcagRatio: Math.round(wcagRatio * 10) / 10,
        wcagAA,
        wcagAAA,
        apcaLc,
      };

      results.push(result);

      const passesLevel = level === 'aaa' ? wcagAAA : wcagAA;
      if (passesLevel) {
        passing.push(result);
      } else {
        failing.push(result);
      }
    }
  }

  // Generate fix suggestions for failing pairs
  const suggestions = generateSuggestions(failing, colors, requiredThreshold);

  return {
    totalColors: colors.length,
    totalCombinations: results.length,
    wcagAAPassing: results.filter((r) => r.wcagAA).length,
    wcagAAAPassing: results.filter((r) => r.wcagAAA).length,
    failing,
    passing,
    suggestions,
  };
}

/**
 * Generate fix suggestions by finding nearest passing color
 */
function generateSuggestions(
  failing: ContrastResult[],
  allColors: Color[],
  threshold: number
): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const processed = new Set<string>();

  for (const fail of failing.slice(0, 10)) {
    // Limit suggestions
    const key = `${fail.background.name}+${fail.foreground.name}`;
    if (processed.has(key)) continue;
    processed.add(key);

    // Find alternative foreground colors that pass
    let bestAlternative: { color: Color; ratio: number } | null = null;

    for (const candidate of allColors) {
      if (candidate.hex === fail.foreground.hex) continue;
      if (candidate.hex === fail.background.hex) continue;

      const ratio = wcagContrastRatio(candidate.rgb, fail.background.rgb);
      if (ratio >= threshold) {
        // Prefer colors with similar lightness to original
        if (
          !bestAlternative ||
          Math.abs(
            relativeLuminance(
              candidate.rgb.r,
              candidate.rgb.g,
              candidate.rgb.b
            ) -
              relativeLuminance(
                fail.foreground.rgb.r,
                fail.foreground.rgb.g,
                fail.foreground.rgb.b
              )
          ) <
            Math.abs(
              relativeLuminance(
                bestAlternative.color.rgb.r,
                bestAlternative.color.rgb.g,
                bestAlternative.color.rgb.b
              ) -
                relativeLuminance(
                  fail.foreground.rgb.r,
                  fail.foreground.rgb.g,
                  fail.foreground.rgb.b
                )
            )
        ) {
          bestAlternative = { color: candidate, ratio };
        }
      }
    }

    if (bestAlternative) {
      suggestions.push({
        background: fail.background.name,
        foreground: fail.foreground.name,
        suggestedForeground: bestAlternative.color.name,
        originalRatio: fail.wcagRatio,
        newRatio: Math.round(bestAlternative.ratio * 10) / 10,
      });
    }
  }

  return suggestions;
}

// ============================================================================
// Output Formatting
// ============================================================================

/**
 * Format results as default terminal output
 */
function formatDefaultOutput(
  result: PaletteAuditResult,
  showApca: boolean,
  level: WcagLevel
): void {
  // Summary box
  const aaPercent = Math.round(
    (result.wcagAAPassing / result.totalCombinations) * 100
  );
  const aaaPercent = Math.round(
    (result.wcagAAAPassing / result.totalCombinations) * 100
  );

  const summaryContent = `
${chalk.bold('  Palette Audit Results')}

  Combinations tested: ${result.totalCombinations}
  WCAG AA passing: ${result.wcagAAPassing} (${aaPercent}%)
  WCAG AAA passing: ${result.wcagAAAPassing} (${aaaPercent}%)
`;

  const borderColor = aaPercent >= 80 ? 'green' : aaPercent >= 50 ? 'yellow' : 'red';

  console.log(
    boxen(summaryContent.trim(), {
      padding: 1,
      borderStyle: 'round',
      borderColor,
    })
  );

  // Failing combinations table
  if (result.failing.length > 0) {
    console.log();
    console.log(
      chalk.bold(
        `Failing Combinations (WCAG ${level.toUpperCase()}):`
      )
    );
    console.log();

    // Table header
    const bgCol = 'Background'.padEnd(14);
    const fgCol = 'Foreground'.padEnd(14);
    const ratioCol = 'Ratio'.padEnd(7);
    const wcagCol = 'WCAG'.padEnd(8);
    const apcaCol = showApca ? 'APCA Lc'.padEnd(11) : '';

    console.log(
      chalk.dim(
        `+${'-'.repeat(14)}+${'-'.repeat(14)}+${'-'.repeat(7)}+${'-'.repeat(8)}+${showApca ? '-'.repeat(11) + '+' : ''}`
      )
    );
    console.log(
      chalk.dim('|') +
        chalk.bold(bgCol) +
        chalk.dim('|') +
        chalk.bold(fgCol) +
        chalk.dim('|') +
        chalk.bold(ratioCol) +
        chalk.dim('|') +
        chalk.bold(wcagCol) +
        chalk.dim('|') +
        (showApca ? chalk.bold(apcaCol) + chalk.dim('|') : '')
    );
    console.log(
      chalk.dim(
        `+${'-'.repeat(14)}+${'-'.repeat(14)}+${'-'.repeat(7)}+${'-'.repeat(8)}+${showApca ? '-'.repeat(11) + '+' : ''}`
      )
    );

    // Show up to 15 failing pairs
    for (const fail of result.failing.slice(0, 15)) {
      const bg = fail.background.name.substring(0, 12).padEnd(14);
      const fg = fail.foreground.name.substring(0, 12).padEnd(14);
      const ratio = `${fail.wcagRatio}:1`.padEnd(7);
      const wcag = chalk.red('Fail').padEnd(8 + 10); // Account for ANSI codes
      const apca = showApca ? `Lc ${fail.apcaLc}`.padEnd(11) : '';

      console.log(
        chalk.dim('|') +
          bg +
          chalk.dim('|') +
          fg +
          chalk.dim('|') +
          ratio +
          chalk.dim('|') +
          wcag +
          chalk.dim('|') +
          (showApca ? apca + chalk.dim('|') : '')
      );
    }

    console.log(
      chalk.dim(
        `+${'-'.repeat(14)}+${'-'.repeat(14)}+${'-'.repeat(7)}+${'-'.repeat(8)}+${showApca ? '-'.repeat(11) + '+' : ''}`
      )
    );

    if (result.failing.length > 15) {
      console.log(
        chalk.dim(`  ... and ${result.failing.length - 15} more failing pairs`)
      );
    }
  }

  // Suggestions
  if (result.suggestions.length > 0) {
    console.log();
    console.log(chalk.bold('Suggested Fixes:'));
    for (const sug of result.suggestions) {
      console.log(
        chalk.yellow('*') +
          ` ${sug.background} + ${sug.foreground}: Use ${chalk.green(sug.suggestedForeground)} instead (${sug.newRatio}:1)`
      );
    }
  }

  // Safe pairs for text
  const safePairs = result.passing
    .filter((p) => p.wcagAAA)
    .sort((a, b) => b.wcagRatio - a.wcagRatio)
    .slice(0, 5);

  if (safePairs.length > 0) {
    console.log();
    console.log(chalk.bold('Safe Pairs for Text:'));
    for (const pair of safePairs) {
      const label = pair.wcagAAA ? chalk.green('AAA') : chalk.yellow('AA');
      const apca = showApca ? chalk.dim(` (Lc ${pair.apcaLc})`) : '';
      console.log(
        chalk.green('*') +
          ` ${pair.background.name} + ${pair.foreground.name}: ${pair.wcagRatio}:1 ${label}${apca}`
      );
    }
  }
}

/**
 * Format results as JSON
 */
function formatJsonOutput(result: PaletteAuditResult): void {
  const output = {
    summary: {
      totalColors: result.totalColors,
      totalCombinations: result.totalCombinations,
      wcagAAPassing: result.wcagAAPassing,
      wcagAAAPassing: result.wcagAAAPassing,
      wcagAAPercent: Math.round(
        (result.wcagAAPassing / result.totalCombinations) * 100
      ),
      wcagAAAPercent: Math.round(
        (result.wcagAAAPassing / result.totalCombinations) * 100
      ),
    },
    failing: result.failing.map((f) => ({
      background: { name: f.background.name, hex: f.background.hex },
      foreground: { name: f.foreground.name, hex: f.foreground.hex },
      wcagRatio: f.wcagRatio,
      wcagAA: f.wcagAA,
      wcagAAA: f.wcagAAA,
      apcaLc: f.apcaLc,
    })),
    passing: result.passing.map((p) => ({
      background: { name: p.background.name, hex: p.background.hex },
      foreground: { name: p.foreground.name, hex: p.foreground.hex },
      wcagRatio: p.wcagRatio,
      wcagAA: p.wcagAA,
      wcagAAA: p.wcagAAA,
      apcaLc: p.apcaLc,
    })),
    suggestions: result.suggestions,
  };

  console.log(JSON.stringify(output, null, 2));
}

/**
 * Format results as CSV
 */
function formatCsvOutput(result: PaletteAuditResult): void {
  const headers = [
    'background_name',
    'background_hex',
    'foreground_name',
    'foreground_hex',
    'wcag_ratio',
    'wcag_aa',
    'wcag_aaa',
    'apca_lc',
  ];

  console.log(headers.join(','));

  const allResults = [...result.failing, ...result.passing];
  for (const r of allResults) {
    const row = [
      r.background.name,
      r.background.hex,
      r.foreground.name,
      r.foreground.hex,
      r.wcagRatio,
      r.wcagAA,
      r.wcagAAA,
      r.apcaLc,
    ];
    console.log(row.join(','));
  }
}

// ============================================================================
// Main Command
// ============================================================================

export async function auditPaletteCommand(
  filePath: string,
  options: AuditPaletteOptions = {}
): Promise<void> {
  const {
    format = 'default',
    level = 'aa',
    largeText = false,
    apca = false,
  } = options;

  // Only print banner for default format
  if (format === 'default') {
    printBanner();
  }

  const absolutePath = resolve(filePath);

  // Check file exists
  if (!existsSync(absolutePath)) {
    printError(`File not found: ${filePath}`);
    process.exit(1);
  }

  // Parse colors
  let spinner: ReturnType<typeof createSpinner> | null = null;
  if (format === 'default') {
    spinner = createSpinner('Analyzing color palette...');
    spinner.start();
  }

  let colors: Color[];
  try {
    colors = await parseColorFile(absolutePath);
  } catch (error) {
    if (spinner) spinner.fail('Failed to parse color file');
    printError(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  if (colors.length === 0) {
    if (spinner) spinner.fail('No colors found in file');
    printWarning('The file does not contain any recognizable color definitions.');
    printInfo('Supported formats:');
    printInfo('  - Tailwind: colors: { primary: "#hex" }');
    printInfo('  - CSS: --color-name: #hex;');
    printInfo('  - JSON: { "colors": { "name": "#hex" } }');
    process.exit(1);
  }

  if (format === 'default' && spinner) {
    spinner.text = `Found ${colors.length} colors. Testing ${colors.length * (colors.length - 1)} combinations...`;
  }

  // Analyze contrast
  const result = analyzeContrastPairs(colors, level, largeText);

  if (spinner) {
    spinner.succeed(`Found ${colors.length} colors in palette`);
    console.log();
  }

  // Output results
  switch (format) {
    case 'json':
      formatJsonOutput(result);
      break;
    case 'csv':
      formatCsvOutput(result);
      break;
    default:
      formatDefaultOutput(result, apca, level);
      break;
  }

  // Exit with error if there are failing combinations
  if (result.failing.length > 0 && format === 'default') {
    console.log();
    printWarning(
      `${result.failing.length} color combinations fail WCAG ${level.toUpperCase()}`
    );
  }
}

export default auditPaletteCommand;
