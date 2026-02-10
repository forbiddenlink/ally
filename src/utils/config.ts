/**
 * Configuration file support for Ally A11y CLI
 *
 * Supports loading config from:
 * - .allyrc.json
 * - .allyrc (JSON format)
 * - ally.config.js (CommonJS module)
 *
 * Searches current directory and parent directories (like eslint)
 */

import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { resolve, dirname, join } from 'path';
import type { Severity } from '../types/index.js';
import type { WcagStandard } from './scanner.js';

/**
 * Configuration options for the scan command
 */
export interface ScanConfig {
  /** Paths to scan (relative to config file or cwd) */
  paths?: string[];
  /** Glob patterns to ignore */
  ignore?: string[];
  /** Violation threshold for CI (exit with error if exceeded) */
  threshold?: number;
  /** WCAG standard to test against */
  standard?: WcagStandard;
  /** Only fail on these severity levels */
  failOn?: Severity[];
}

/**
 * Configuration options for report generation
 */
export interface ReportConfig {
  /** Output format: json, sarif, markdown, html */
  format?: string;
  /** Output directory or file path */
  output?: string;
}

/**
 * Configuration options for the fix command
 */
export interface FixConfig {
  /** Show what would be fixed without making changes */
  dryRun?: boolean;
  /** Auto-approve fixes for these violation types */
  autoApprove?: string[];
}

/**
 * Complete Ally configuration
 */
export interface AllyConfig {
  scan?: ScanConfig;
  report?: ReportConfig;
  fix?: FixConfig;
}

/** Config file names to search for (in order of priority) */
const CONFIG_FILES = [
  '.allyrc.json',
  '.allyrc',
  'ally.config.js',
  'ally.config.cjs',
];

/** Result from loading config */
export interface ConfigResult {
  config: AllyConfig;
  configPath: string | null;
}

/**
 * Search for config file starting from directory and moving up to root
 */
async function findConfigFile(startDir: string): Promise<string | null> {
  let currentDir = resolve(startDir);
  const root = dirname(currentDir);

  // Keep searching until we hit the root
  while (currentDir !== root) {
    for (const configFile of CONFIG_FILES) {
      const configPath = join(currentDir, configFile);
      if (existsSync(configPath)) {
        return configPath;
      }
    }
    currentDir = dirname(currentDir);
  }

  // Check root as well
  for (const configFile of CONFIG_FILES) {
    const configPath = join(currentDir, configFile);
    if (existsSync(configPath)) {
      return configPath;
    }
  }

  return null;
}

/**
 * Load and parse a config file
 */
async function parseConfigFile(configPath: string): Promise<AllyConfig> {
  const ext = configPath.split('.').pop();

  if (ext === 'js' || ext === 'cjs') {
    // Load JavaScript config (CommonJS)
    try {
      const configModule = await import(configPath);
      return configModule.default || configModule;
    } catch (error) {
      throw new Error(
        `Failed to load config from ${configPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Load JSON config
  try {
    const content = await readFile(configPath, 'utf-8');
    return JSON.parse(content) as AllyConfig;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in config file ${configPath}: ${error.message}`);
    }
    throw new Error(
      `Failed to read config file ${configPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Validate config structure and values
 */
function validateConfig(config: AllyConfig, configPath: string): void {
  const validStandards = [
    'wcag2a', 'wcag2aa', 'wcag2aaa',
    'wcag21a', 'wcag21aa', 'wcag21aaa',
    'wcag22aa', 'section508', 'best-practice'
  ];

  const validSeverities: Severity[] = ['critical', 'serious', 'moderate', 'minor'];

  if (config.scan?.standard && !validStandards.includes(config.scan.standard)) {
    throw new Error(
      `Invalid standard "${config.scan.standard}" in ${configPath}. ` +
      `Valid options: ${validStandards.join(', ')}`
    );
  }

  if (config.scan?.failOn) {
    for (const severity of config.scan.failOn) {
      if (!validSeverities.includes(severity)) {
        throw new Error(
          `Invalid severity "${severity}" in failOn in ${configPath}. ` +
          `Valid options: ${validSeverities.join(', ')}`
        );
      }
    }
  }

  if (config.scan?.threshold !== undefined) {
    if (typeof config.scan.threshold !== 'number' || config.scan.threshold < 0) {
      throw new Error(
        `Invalid threshold "${config.scan.threshold}" in ${configPath}. ` +
        `Must be a non-negative number.`
      );
    }
  }

  const validFormats = ['json', 'sarif', 'markdown', 'html'];
  if (config.report?.format && !validFormats.includes(config.report.format)) {
    throw new Error(
      `Invalid report format "${config.report.format}" in ${configPath}. ` +
      `Valid options: ${validFormats.join(', ')}`
    );
  }
}

/**
 * Load configuration from .allyrc.json or similar config files
 *
 * Searches current directory and parent directories for config files.
 * Returns an empty config if no file is found.
 *
 * @param startDir - Directory to start searching from (defaults to cwd)
 * @returns Loaded configuration and path to config file (if found)
 */
export async function loadConfig(startDir: string = process.cwd()): Promise<ConfigResult> {
  try {
    const configPath = await findConfigFile(startDir);

    if (!configPath) {
      return { config: {}, configPath: null };
    }

    const config = await parseConfigFile(configPath);
    validateConfig(config, configPath);

    return { config, configPath };
  } catch (error) {
    // Re-throw validation/parsing errors
    if (error instanceof Error && error.message.includes('config')) {
      throw error;
    }
    // Wrap other errors
    throw new Error(
      `Failed to load config: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Get the path to the config file that would be used
 *
 * Useful for debugging to see which config file is being loaded.
 *
 * @param startDir - Directory to start searching from (defaults to cwd)
 * @returns Path to config file or null if none found
 */
export async function getConfigPath(startDir: string = process.cwd()): Promise<string | null> {
  return findConfigFile(startDir);
}

/**
 * Merge CLI options with config file options
 *
 * CLI options take precedence over config file options.
 *
 * @param cliOptions - Options from command line
 * @param config - Options from config file
 * @returns Merged options
 */
export function mergeOptions<T extends Record<string, unknown>>(
  cliOptions: T,
  configOptions: Partial<T>
): T {
  const merged = { ...configOptions } as T;

  // CLI options override config options (only if explicitly set)
  for (const [key, value] of Object.entries(cliOptions)) {
    if (value !== undefined) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }

  return merged;
}
