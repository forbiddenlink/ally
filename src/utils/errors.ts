/**
 * Error handling utilities with contextual hints for better user experience
 */

import chalk from 'chalk';
import boxen from 'boxen';
import { printError, printInfo, printWarning } from './ui.js';

/**
 * Suggest running 'ally scan' when scan results are missing
 */
export function suggestInit(reportPath?: string): void {
  printError(`No scan results found`);
  printInfo(`Run 'ally scan' first to generate results`);
  if (reportPath) {
    console.log(chalk.dim(`  Expected file: ${reportPath}`));
  }
  console.log();
  console.log(chalk.dim('Quick start:'));
  console.log(chalk.cyan('  ally scan              ') + chalk.dim('# Scan HTML files in current directory'));
  console.log(chalk.cyan('  ally scan --url <url>  ') + chalk.dim('# Scan a running web app'));
}

/**
 * Suggest using --url flag when no HTML files are found
 */
export function suggestUrl(): void {
  printWarning('No HTML files found to scan');
  console.log();
  console.log(chalk.dim('For static HTML projects:'));
  console.log(chalk.cyan('  ally scan ./public     ') + chalk.dim('# Scan a specific directory'));
  console.log();
  console.log(chalk.dim('For React, Vue, Next.js, or other SPA projects:'));
  console.log(chalk.cyan('  ally scan --url http://localhost:3000'));
  console.log();
  printInfo('Start your dev server first, then scan the running app');
}

/**
 * Common Puppeteer error patterns and their solutions
 */
interface PuppeteerDiagnostic {
  pattern: RegExp;
  message: string;
  suggestion: string;
}

const PUPPETEER_DIAGNOSTICS: PuppeteerDiagnostic[] = [
  {
    pattern: /Could not find (Chrome|Chromium|browser)/i,
    message: 'Chrome browser not found',
    suggestion: "Run 'npx puppeteer browsers install chrome' to download Chrome",
  },
  {
    pattern: /No usable sandbox/i,
    message: 'Chrome sandbox error (common on Linux/CI)',
    suggestion: "Try running with '--no-sandbox' flag or configure user namespaces",
  },
  {
    pattern: /ECONNREFUSED|ERR_CONNECTION_REFUSED/i,
    message: 'Could not connect to the URL',
    suggestion: 'Check that the server is running and the URL is correct',
  },
  {
    pattern: /Navigation timeout|TimeoutError|Timeout exceeded/i,
    message: 'Page took too long to load',
    suggestion: 'Check the URL is accessible, or try scanning a simpler page first',
  },
  {
    pattern: /net::ERR_NAME_NOT_RESOLVED/i,
    message: 'Could not resolve hostname',
    suggestion: 'Check the URL is spelled correctly and the domain exists',
  },
  {
    pattern: /net::ERR_CERT/i,
    message: 'SSL certificate error',
    suggestion: 'The site has an invalid SSL certificate. Try using http:// instead of https://',
  },
  {
    pattern: /Protocol error|Target closed/i,
    message: 'Browser crashed or was closed unexpectedly',
    suggestion: 'Try running the scan again. If the issue persists, check system memory',
  },
  {
    pattern: /EPERM|EACCES|Permission denied/i,
    message: 'Permission denied',
    suggestion: 'Check file permissions or try running with elevated privileges',
  },
];

/**
 * Diagnose Puppeteer errors and return a helpful message
 */
export function diagnosePuppeteer(error: Error): string {
  const errorMessage = error.message || String(error);

  for (const diagnostic of PUPPETEER_DIAGNOSTICS) {
    if (diagnostic.pattern.test(errorMessage)) {
      return `${diagnostic.message}\n\nSuggestion: ${diagnostic.suggestion}`;
    }
  }

  // Generic fallback for unknown Puppeteer errors
  return `Browser error: ${errorMessage}\n\nIf this persists, try:\n  - Updating Puppeteer: npm update puppeteer\n  - Reinstalling Chrome: npx puppeteer browsers install chrome`;
}

/**
 * Check if an error is a Puppeteer-related error
 */
export function isPuppeteerError(error: Error): boolean {
  const errorMessage = error.message || String(error);
  return PUPPETEER_DIAGNOSTICS.some((d) => d.pattern.test(errorMessage));
}

/**
 * Format an error with context and suggestions in a nice box
 */
export function formatError(error: Error, context?: string): void {
  const errorMessage = error.message || String(error);

  // Check for Puppeteer errors first
  if (isPuppeteerError(error)) {
    const diagnosis = diagnosePuppeteer(error);
    console.log(
      boxen(diagnosis, {
        padding: 1,
        margin: { top: 1, bottom: 1, left: 0, right: 0 },
        borderStyle: 'round',
        borderColor: 'red',
        title: 'Browser Error',
        titleAlignment: 'left',
      })
    );
    return;
  }

  // Build error display
  let content = chalk.red(errorMessage);

  if (context) {
    content = `${chalk.dim(context)}\n\n${content}`;
  }

  console.log(
    boxen(content, {
      padding: 1,
      margin: { top: 1, bottom: 1, left: 0, right: 0 },
      borderStyle: 'round',
      borderColor: 'red',
      title: 'Error',
      titleAlignment: 'left',
    })
  );
}

/**
 * Format a scan failure with helpful context
 */
export function formatScanError(error: Error, target: string): void {
  if (isPuppeteerError(error)) {
    formatError(error, `Failed to scan: ${target}`);
  } else {
    printError(`Failed to scan ${target}`);
    console.log(chalk.dim(`  ${error.message}`));
  }
}

/**
 * Provide helpful message when scan results file is corrupted
 */
export function suggestRescan(reportPath: string): void {
  printError('Scan results file appears to be corrupted');
  printInfo(`Delete ${reportPath} and run 'ally scan' again`);
  console.log();
  console.log(chalk.cyan(`  rm ${reportPath} && ally scan`));
}
