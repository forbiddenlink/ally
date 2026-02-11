/**
 * ally doctor command - Diagnoses installation and configuration issues
 */

import { existsSync, readFileSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import chalk from 'chalk';
import { printBanner } from '../utils/ui.js';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface CheckResult {
  status: 'pass' | 'warn' | 'fail' | 'info';
  message: string;
}

/**
 * Get the installed Node.js version
 */
function getNodeVersion(): string {
  return process.version.replace('v', '');
}

/**
 * Parse a semver string and return major version number
 */
function parseMajorVersion(version: string): number {
  const match = version.match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Check if a command exists
 */
function commandExists(command: string): boolean {
  try {
    execSync(`which ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get ally version from package.json
 */
function getAllyVersion(): string {
  try {
    // Use createRequire to read package.json (same approach as cli.ts)
    const require = createRequire(import.meta.url);
    const { version } = require('../../package.json');
    return version || 'unknown';
  } catch {
    // Fallback: try to get from local package.json
    try {
      const localPkgPath = resolve(process.cwd(), 'package.json');
      if (existsSync(localPkgPath)) {
        const pkg = JSON.parse(readFileSync(localPkgPath, 'utf-8'));
        if (pkg.name === 'ally-a11y') {
          return pkg.version || 'unknown';
        }
      }
    } catch {
      // ignore
    }
  }
  return 'unknown';
}

/**
 * Check if Puppeteer browser is installed
 */
async function checkPuppeteerBrowser(): Promise<CheckResult> {
  try {
    // Try to import puppeteer and check for browser
    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    await browser.close();
    return { status: 'pass', message: 'Puppeteer browser installed' };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes('Could not find Chrome') || errorMsg.includes('Could not find Chromium')) {
      return { status: 'fail', message: 'Puppeteer browser not installed. Run: npx puppeteer browsers install chrome' };
    }
    return { status: 'fail', message: `Puppeteer browser check failed: ${errorMsg}` };
  }
}

/**
 * Check if MCP server is configured
 */
function checkMcpServer(): CheckResult {
  const cwd = process.cwd();

  // Check for mcp-server in node_modules (installed package)
  const nodeModulesPath = join(cwd, 'node_modules', 'ally-a11y', 'mcp-server', 'dist', 'index.js');
  if (existsSync(nodeModulesPath)) {
    return { status: 'pass', message: 'MCP server configured (via node_modules)' };
  }

  // Check for local mcp-server (development)
  const localPath = join(cwd, 'mcp-server', 'dist', 'index.js');
  if (existsSync(localPath)) {
    return { status: 'pass', message: 'MCP server configured (local development)' };
  }

  // Check if .copilot/mcp-config.json exists
  const mcpConfigPath = join(cwd, '.copilot', 'mcp-config.json');
  if (existsSync(mcpConfigPath)) {
    try {
      const config = JSON.parse(readFileSync(mcpConfigPath, 'utf-8'));
      if (config.mcpServers && config.mcpServers['ally-patterns']) {
        return { status: 'warn', message: 'MCP config exists but server files not found. Run: npm run build:all' };
      }
    } catch {
      return { status: 'warn', message: 'MCP config file invalid' };
    }
  }

  return { status: 'info', message: 'MCP server not configured. Run: ally init' };
}

/**
 * Check if .allyrc.json exists and is valid
 */
function checkAllyConfig(): CheckResult {
  const cwd = process.cwd();
  const configPath = join(cwd, '.allyrc.json');

  if (!existsSync(configPath)) {
    return { status: 'info', message: '.allyrc.json not found (using defaults)' };
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    JSON.parse(content);
    return { status: 'pass', message: '.allyrc.json valid' };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return { status: 'fail', message: `.allyrc.json invalid JSON: ${errorMsg}` };
  }
}

/**
 * Check if .allyignore exists
 */
function checkAllyIgnore(): CheckResult {
  const cwd = process.cwd();
  const ignorePath = join(cwd, '.allyignore');

  if (existsSync(ignorePath)) {
    return { status: 'pass', message: '.allyignore found' };
  }

  return { status: 'info', message: '.allyignore not found (optional)' };
}

/**
 * Print a check result with appropriate styling
 */
function printCheck(result: CheckResult): void {
  const icons: Record<CheckResult['status'], string> = {
    pass: chalk.green('  '),
    warn: chalk.yellow('  '),
    fail: chalk.red('  '),
    info: chalk.blue('  '),
  };

  const colors: Record<CheckResult['status'], (text: string) => string> = {
    pass: chalk.green,
    warn: chalk.yellow,
    fail: chalk.red,
    info: chalk.blue,
  };

  console.log(`${icons[result.status]} ${colors[result.status](result.message)}`);
}

export async function doctorCommand(): Promise<void> {
  printBanner();

  console.log(chalk.bold.cyan('Checking ally installation...\n'));

  const results: CheckResult[] = [];
  let hasFailures = false;

  // 1. Check Node.js version
  const nodeVersion = getNodeVersion();
  const nodeMajor = parseMajorVersion(nodeVersion);
  if (nodeMajor >= 18) {
    results.push({ status: 'pass', message: `Node.js ${nodeVersion} (>=18 required)` });
  } else {
    results.push({ status: 'fail', message: `Node.js ${nodeVersion} (>=18 required)` });
    hasFailures = true;
  }

  // 2. Check ally version
  const allyVersion = getAllyVersion();
  if (allyVersion !== 'unknown') {
    results.push({ status: 'pass', message: `ally v${allyVersion} installed` });
  } else {
    results.push({ status: 'warn', message: 'ally version unknown' });
  }

  // 3. Check Puppeteer browser
  const puppeteerResult = await checkPuppeteerBrowser();
  results.push(puppeteerResult);
  if (puppeteerResult.status === 'fail') {
    hasFailures = true;
  }

  // 4. Check GitHub Copilot CLI
  if (commandExists('copilot')) {
    results.push({ status: 'pass', message: 'GitHub Copilot CLI available' });
  } else if (commandExists('gh') && commandExists('gh-copilot')) {
    results.push({ status: 'pass', message: 'GitHub Copilot CLI available (gh extension)' });
  } else {
    results.push({ status: 'warn', message: 'GitHub Copilot CLI not found (optional)' });
  }

  // 5. Check MCP server
  const mcpResult = checkMcpServer();
  results.push(mcpResult);
  if (mcpResult.status === 'fail') {
    hasFailures = true;
  }

  // 6. Check .allyrc.json
  const configResult = checkAllyConfig();
  results.push(configResult);
  if (configResult.status === 'fail') {
    hasFailures = true;
  }

  // 7. Check .allyignore
  const ignoreResult = checkAllyIgnore();
  results.push(ignoreResult);

  // Print all results
  for (const result of results) {
    printCheck(result);
  }

  // Print summary
  console.log();
  if (hasFailures) {
    console.log(chalk.red.bold('Some checks failed. Please fix the issues above.'));
  } else {
    console.log(chalk.green.bold('All checks passed! ally is ready to use.'));
  }
}

export default doctorCommand;
