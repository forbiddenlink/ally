/**
 * Browser abstraction layer for cross-browser accessibility testing
 *
 * Supports Puppeteer (default, always available) and Playwright (optional, for Firefox/WebKit)
 */

import type { Browser as PuppeteerBrowser, Page as PuppeteerPage } from 'puppeteer';

export type BrowserType = 'chromium' | 'firefox' | 'webkit';

/**
 * Abstract page interface for browser-agnostic operations
 */
export interface PageAdapter {
  goto(url: string, options?: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle'; timeout?: number }): Promise<void>;
  setContent(html: string, options?: { waitUntil?: 'load' | 'domcontentloaded' }): Promise<void>;
  content(): Promise<string>;
  waitForSelector(selector: string, options?: { timeout?: number }): Promise<void>;
  evaluate<T>(fn: () => T): Promise<T>;
  addStyleTag(options: { content: string }): Promise<void>;
  setViewport(viewport: { width: number; height: number }): Promise<void>;
  screenshot(options: { path: string; fullPage?: boolean }): Promise<void>;
  close(): Promise<void>;

  /**
   * Get the underlying page object for axe-core integration
   * Returns the Puppeteer Page or Playwright Page instance
   */
  getUnderlyingPage(): unknown;

  /**
   * Get the adapter type for conditional axe-core setup
   */
  getAdapterType(): 'puppeteer' | 'playwright';
}

/**
 * Abstract browser interface
 */
export interface BrowserAdapter {
  launch(): Promise<void>;
  newPage(): Promise<PageAdapter>;
  close(): Promise<void>;
  getBrowserType(): BrowserType;
}

/**
 * Dynamic import helper that works with optional dependencies
 * Uses eval to avoid TypeScript module resolution errors
 */
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const dynamicImport = new Function('modulePath', 'return import(modulePath)') as (modulePath: string) => Promise<unknown>;

/**
 * Check if Playwright is installed
 */
export async function isPlaywrightInstalled(): Promise<boolean> {
  try {
    await dynamicImport('playwright');
    return true;
  } catch {
    return false;
  }
}

/**
 * Error thrown when Playwright is requested but not installed
 */
export class PlaywrightNotInstalledError extends Error {
  constructor(browser: BrowserType) {
    super(
      `Playwright is required for ${browser} browser but is not installed.\n\n` +
        `To install Playwright, run:\n` +
        `  npm install playwright\n\n` +
        `Then install browser binaries:\n` +
        `  npx playwright install ${browser}\n\n` +
        `Or use the default Chromium browser (no additional installation required):\n` +
        `  ally scan --browser chromium`
    );
    this.name = 'PlaywrightNotInstalledError';
  }
}

/**
 * Puppeteer adapter - wraps Puppeteer for chromium support
 */
class PuppeteerPageAdapter implements PageAdapter {
  private page: PuppeteerPage;

  constructor(page: PuppeteerPage) {
    this.page = page;
  }

  async goto(url: string, options?: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle'; timeout?: number }): Promise<void> {
    // Map our waitUntil to Puppeteer's options
    const waitUntil = options?.waitUntil === 'networkidle' ? 'networkidle2' : options?.waitUntil || 'load';
    await this.page.goto(url, { waitUntil, timeout: options?.timeout });
  }

  async setContent(html: string, options?: { waitUntil?: 'load' | 'domcontentloaded' }): Promise<void> {
    await this.page.setContent(html, { waitUntil: options?.waitUntil || 'domcontentloaded' });
  }

  async content(): Promise<string> {
    return this.page.content();
  }

  async waitForSelector(selector: string, options?: { timeout?: number }): Promise<void> {
    await this.page.waitForSelector(selector, options);
  }

  async evaluate<T>(fn: () => T): Promise<T> {
    return this.page.evaluate(fn);
  }

  async addStyleTag(options: { content: string }): Promise<void> {
    await this.page.addStyleTag(options);
  }

  async setViewport(viewport: { width: number; height: number }): Promise<void> {
    await this.page.setViewport(viewport);
  }

  async screenshot(options: { path: string; fullPage?: boolean }): Promise<void> {
    await this.page.screenshot(options);
  }

  async close(): Promise<void> {
    await this.page.close();
  }

  getUnderlyingPage(): PuppeteerPage {
    return this.page;
  }

  getAdapterType(): 'puppeteer' | 'playwright' {
    return 'puppeteer';
  }
}

class PuppeteerBrowserAdapter implements BrowserAdapter {
  private browser: PuppeteerBrowser | null = null;

  async launch(): Promise<void> {
    // Dynamic import to avoid loading at startup
    const puppeteer = await import('puppeteer');
    this.browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }

  async newPage(): Promise<PageAdapter> {
    if (!this.browser) {
      throw new Error('Browser not launched. Call launch() first.');
    }
    const page = await this.browser.newPage();
    return new PuppeteerPageAdapter(page);
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  getBrowserType(): BrowserType {
    return 'chromium';
  }
}

/**
 * Playwright types - defined here to avoid requiring @types/playwright
 * These are minimal interfaces for the parts we use
 */
interface PlaywrightPage {
  goto(url: string, options?: { waitUntil?: string; timeout?: number }): Promise<unknown>;
  setContent(html: string, options?: { waitUntil?: string }): Promise<void>;
  content(): Promise<string>;
  waitForSelector(selector: string, options?: { timeout?: number }): Promise<unknown>;
  evaluate<T>(fn: () => T): Promise<T>;
  addStyleTag(options: { content: string }): Promise<unknown>;
  setViewportSize(viewport: { width: number; height: number }): Promise<void>;
  screenshot(options: { path: string; fullPage?: boolean }): Promise<Buffer>;
  close(): Promise<void>;
}

interface PlaywrightBrowser {
  newPage(): Promise<PlaywrightPage>;
  close(): Promise<void>;
}

interface PlaywrightBrowserType {
  launch(options?: { headless?: boolean }): Promise<PlaywrightBrowser>;
}

interface PlaywrightModule {
  chromium: PlaywrightBrowserType;
  firefox: PlaywrightBrowserType;
  webkit: PlaywrightBrowserType;
}

/**
 * Playwright adapter - supports chromium, firefox, and webkit
 */
class PlaywrightPageAdapter implements PageAdapter {
  private page: PlaywrightPage;

  constructor(page: PlaywrightPage) {
    this.page = page;
  }

  async goto(url: string, options?: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle'; timeout?: number }): Promise<void> {
    // Playwright uses 'networkidle' directly
    await this.page.goto(url, {
      waitUntil: options?.waitUntil,
      timeout: options?.timeout,
    });
  }

  async setContent(html: string, options?: { waitUntil?: 'load' | 'domcontentloaded' }): Promise<void> {
    await this.page.setContent(html, { waitUntil: options?.waitUntil || 'domcontentloaded' });
  }

  async content(): Promise<string> {
    return this.page.content();
  }

  async waitForSelector(selector: string, options?: { timeout?: number }): Promise<void> {
    await this.page.waitForSelector(selector, options ? { timeout: options.timeout } : undefined);
  }

  async evaluate<T>(fn: () => T): Promise<T> {
    return this.page.evaluate(fn);
  }

  async addStyleTag(options: { content: string }): Promise<void> {
    await this.page.addStyleTag(options);
  }

  async setViewport(viewport: { width: number; height: number }): Promise<void> {
    await this.page.setViewportSize(viewport);
  }

  async screenshot(options: { path: string; fullPage?: boolean }): Promise<void> {
    await this.page.screenshot(options);
  }

  async close(): Promise<void> {
    await this.page.close();
  }

  getUnderlyingPage(): PlaywrightPage {
    return this.page;
  }

  getAdapterType(): 'puppeteer' | 'playwright' {
    return 'playwright';
  }
}

class PlaywrightBrowserAdapter implements BrowserAdapter {
  private browser: PlaywrightBrowser | null = null;
  private browserType: BrowserType;

  constructor(browserType: BrowserType) {
    this.browserType = browserType;
  }

  async launch(): Promise<void> {
    // Dynamic import to avoid loading at startup
    let playwright: PlaywrightModule;
    try {
      playwright = await dynamicImport('playwright') as PlaywrightModule;
    } catch {
      throw new PlaywrightNotInstalledError(this.browserType);
    }

    // Select the appropriate browser engine
    const browserLauncher = playwright[this.browserType];
    if (!browserLauncher) {
      throw new Error(`Unknown browser type: ${this.browserType}`);
    }

    try {
      this.browser = await browserLauncher.launch({
        headless: true,
      });
    } catch (error) {
      // Check if the error is about missing browser binaries
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('Executable doesn\'t exist') || errorMessage.includes('browserType.launch')) {
        throw new Error(
          `${this.browserType} browser binaries are not installed.\n\n` +
            `To install them, run:\n` +
            `  npx playwright install ${this.browserType}\n\n` +
            `Or install all browsers:\n` +
            `  npx playwright install`
        );
      }
      throw error;
    }
  }

  async newPage(): Promise<PageAdapter> {
    if (!this.browser) {
      throw new Error('Browser not launched. Call launch() first.');
    }
    const page = await this.browser.newPage();
    return new PlaywrightPageAdapter(page);
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  getBrowserType(): BrowserType {
    return this.browserType;
  }
}

/**
 * Create a browser adapter for the specified browser type
 *
 * @param type Browser type: 'chromium', 'firefox', or 'webkit'
 * @returns BrowserAdapter instance
 *
 * Note: chromium uses Puppeteer by default (always available).
 * Firefox and WebKit require Playwright to be installed.
 * Use --browser chromium-playwright to force Playwright for Chromium.
 */
export function createBrowser(type: BrowserType | 'chromium-playwright' = 'chromium'): BrowserAdapter {
  // For chromium, use Puppeteer by default (lighter weight, always available)
  if (type === 'chromium') {
    return new PuppeteerBrowserAdapter();
  }

  // For chromium-playwright, firefox, or webkit, use Playwright
  const playwrightType = type === 'chromium-playwright' ? 'chromium' : type;
  return new PlaywrightBrowserAdapter(playwrightType);
}

/**
 * Validate browser type option
 */
export function validateBrowserType(value: string): BrowserType {
  const valid: BrowserType[] = ['chromium', 'firefox', 'webkit'];
  if (!valid.includes(value as BrowserType)) {
    throw new Error(`Invalid browser: ${value}. Valid options: ${valid.join(', ')}`);
  }
  return value as BrowserType;
}
