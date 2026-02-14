/**
 * Enhanced Error Messages System
 * 
 * Provides actionable, helpful error messages with:
 * - Clear explanations of what went wrong
 * - Step-by-step remediation guidance
 * - Code examples
 * - Links to documentation
 * - Context-specific suggestions
 */

export interface EnhancedError {
  title: string;
  message: string;
  remediation: string[];
  example?: string;
  docs?: string;
  tip?: string;
}

/**
 * Error messages for common issues
 */
export const ERROR_MESSAGES: Record<string, EnhancedError> = {
  // Installation & Setup Errors
  NO_FILES_FOUND: {
    title: 'No HTML files found',
    message: 'ally couldn\'t find any HTML files to scan in the specified directory.',
    remediation: [
      '1. Check that the path is correct: `ally scan ./src`',
      '2. Verify HTML files exist in the directory: `ls ./src/**/*.html`',
      '3. For React/Vue/Svelte apps, scan build output: `ally scan ./dist`',
      '4. Or scan your dev server: `ally scan --url http://localhost:3000`',
    ],
    example: '# For Next.js apps\nnpm run build\nally scan .next/\n\n# Or scan live dev server\nally scan --url http://localhost:3000',
    docs: 'https://github.com/forbiddenlink/ally#scanning-frameworks',
    tip: 'Most modern frameworks generate HTML at build time or runtime - scan the output, not source!',
  },

  BROWSER_LAUNCH_FAILED: {
    title: 'Browser failed to launch',
    message: 'Puppeteer couldn\'t start the browser for scanning.',
    remediation: [
      '1. Install Chromium: `npx puppeteer browsers install chrome`',
      '2. Check system dependencies (Linux): `apt-get install -y libnss3 libatk1.0-0`',
      '3. Try a different browser: `ally scan --browser firefox`',
      '4. For Docker/CI: Add `--no-sandbox` flag (not recommended for local)',
    ],
    example: '# Install browser\nnpx puppeteer browsers install chrome\n\n# Scan with specific browser\nally scan --browser firefox',
    docs: 'https://pptr.dev/troubleshooting',
    tip: 'Running in CI? Make sure browser dependencies are installed in your Docker image.',
  },

  PAGE_LOAD_TIMEOUT: {
    title: 'Page load timeout',
    message: 'The page took too long to load and the scan timed out.',
    remediation: [
      '1. Increase timeout: `ally scan --timeout 60000` (60 seconds)',
      '2. Check the URL is accessible: `curl -I https://example.com`',
      '3. Verify network connectivity and firewall rules',
      '4. For local dev servers, ensure they\'re running before scanning',
    ],
    example: '# Increase timeout for slow pages\nally scan --url https://example.com --timeout 60000\n\n# Start dev server first\nnpm run dev &\nsleep 5\nally scan --url http://localhost:3000',
    docs: 'https://github.com/forbiddenlink/ally#troubleshooting',
    tip: 'Large pages or slow connections? Try scanning individual routes instead of the homepage.',
  },

  INVALID_URL: {
    title: 'Invalid URL',
    message: 'The URL format is invalid or not supported.',
    remediation: [
      '1. URLs must start with http:// or https://',
      '2. Check for typos: `https://` not `http:/`',
      '3. For local files, use file paths: `ally scan ./dist/index.html`',
      '4. For localhost, include port: `http://localhost:3000`',
    ],
    example: '# Valid URLs\nally scan --url https://example.com\nally scan --url http://localhost:3000\n\n# Invalid - missing protocol\nally scan --url example.com  ✗',
    tip: 'Scanning a local file? Drop the --url flag: `ally scan ./index.html`',
  },

  // Configuration Errors
  INVALID_CONFIG: {
    title: 'Invalid configuration',
    message: 'The .allyrc.json file contains invalid configuration.',
    remediation: [
      '1. Validate JSON syntax: `cat .allyrc.json | jq`',
      '2. Check for typos in property names',
      '3. See valid options: `ally init --help`',
      '4. Delete config to reset: `rm .allyrc.json && ally init`',
    ],
    example: '// Valid .allyrc.json\n{\n  "scan": {\n    "standard": "wcag22aa",\n    "threshold": 5\n  },\n  "fix": {\n    "autoApprove": ["image-alt"]\n  }\n}',
    docs: 'https://github.com/forbiddenlink/ally#configuration',
    tip: 'Use `ally init` to create a valid config file with sensible defaults.',
  },

  MISSING_COPILOT_CLI: {
    title: 'GitHub Copilot CLI not found',
    message: 'The `copilot` command is not available. Some features require GitHub Copilot CLI.',
    remediation: [
      '1. Install Copilot CLI: `npm install -g @github/copilot-cli`',
      '2. Login: `copilot auth login`',
      '3. Verify: `copilot --version`',
      '4. Or use ally without Copilot: `ally scan` works without it!',
    ],
    example: '# Install and setup\nnpm install -g @github/copilot-cli\ncopilot auth login\n\n# Now use AI features\nally explain\nally fix',
    docs: 'https://githubnext.com/projects/copilot-cli',
    tip: 'Basic scanning works without Copilot CLI - only `explain` and `fix` need it for AI features.',
  },

  // Runtime Errors
  PERMISSION_DENIED: {
    title: 'Permission denied',
    message: 'ally doesn\'t have permission to access the file or directory.',
    remediation: [
      '1. Check file permissions: `ls -la /path/to/file`',
      '2. Run with correct user: `sudo ally scan`',
      '3. Fix permissions: `chmod -R 755 ./src`',
      '4. Verify you own the directory: `chown -R $USER ./src`',
    ],
    example: '# Fix permissions\nchmod -R 755 ./src\nally scan ./src\n\n# Or run as correct user\nsudo ally scan ./protected',
    tip: 'Never run ally as root unless absolutely necessary - fix permissions instead!',
  },

  OUT_OF_MEMORY: {
    title: 'Out of memory',
    message: 'ally ran out of memory while processing files.',
    remediation: [
      '1. Scan fewer files: `ally scan ./src/components` instead of `./src`',
      '2. Increase Node memory: `NODE_OPTIONS="--max-old-space-size=4096" ally scan`',
      '3. Use ignore patterns: Add large dirs to .allyignore',
      '4. Scan in batches: `ally scan ./src/a* && ally scan ./src/b*`',
    ],
    example: '# Increase Node memory limit\nNODE_OPTIONS="--max-old-space-size=4096" ally scan ./src\n\n# Create .allyignore\necho "node_modules/" > .allyignore\necho "dist/" >> .allyignore\necho "coverage/" >> .allyignore',
    docs: 'https://github.com/forbiddenlink/ally#ignore-patterns',
    tip: 'Scanning node_modules? Add it to .allyignore to skip dependency files!',
  },

  // Git/CI Errors
  NOT_A_GIT_REPO: {
    title: 'Not a git repository',
    message: 'Some features require a git repository but none was found.',
    remediation: [
      '1. Initialize git: `git init`',
      '2. Or skip git features: `ally scan` works without git',
      '3. In CI: Clone full repo, not shallow: `git clone --depth 1` causes issues',
    ],
    example: '# Initialize git\ngit init\ngit add .\ngit commit -m "Initial commit"\n\n# Now git features work\nally pr-check',
    tip: 'History tracking works better with git - it shows branch and commit for each scan.',
  },

  PR_NOT_FOUND: {
    title: 'Pull request not found',
    message: 'ally couldn\'t detect or access the pull request.',
    remediation: [
      '1. In GitHub Actions: Ensure `gh` CLI is authenticated',
      '2. Set GITHUB_TOKEN: `GITHUB_TOKEN=${{ secrets.GITHUB_TOKEN }}`',
      '3. Specify PR manually: `ally pr-check --pr 123`',
      '4. Verify repo access: `gh pr list`',
    ],
    example: '# GitHub Actions workflow\n- name: Check PR\n  env:\n    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}\n  run: ally pr-check',
    docs: 'https://github.com/forbiddenlink/ally#github-actions',
    tip: 'Local testing? Use `ally pr-check --pr 123` to specify the PR number.',
  },

  // Fix Errors
  FIX_FAILED: {
    title: 'Fix failed',
    message: 'ally couldn\'t apply the fix to the file.',
    remediation: [
      '1. Check file is writable: `ls -la /path/to/file`',
      '2. Verify file wasn\'t deleted: `test -f /path/to/file`',
      '3. Try dry-run first: `ally fix --dry-run`',
      '4. Apply fixes manually using the diff shown',
    ],
    example: '# Dry-run to preview changes\nally fix --dry-run\n\n# Fix permissions if needed\nchmod 644 ./src/Button.tsx\nally fix',
    tip: 'Files under version control? Check `git status` to see what changed.',
  },

  LOW_CONFIDENCE_FIX: {
    title: 'Low confidence fix',
    message: 'The fix has low confidence and needs manual review.',
    remediation: [
      '1. Review the suggested fix carefully',
      '2. Apply manually if it looks correct',
      '3. Use `--auto` to auto-apply high-confidence fixes only: `ally fix --auto`',
      '4. Or skip low confidence: Press "skip" when prompted',
    ],
    example: '# Auto-apply only high-confidence fixes\nally fix --auto\n\n# Or approve each fix interactively\nally fix  # Press y/n/skip for each',
    tip: 'watch --fix-on-save only applies fixes ≥90% confidence - safe by default!',
  },
};

/**
 * Get enhanced error message
 */
export function getEnhancedError(errorCode: string): EnhancedError | null {
  return ERROR_MESSAGES[errorCode] || null;
}

/**
 * Format enhanced error for console output
 */
export function formatEnhancedError(error: EnhancedError): string {
  let output = '';

  // Title with emoji
  output += `\n❌ ${error.title}\n\n`;

  // Message
  output += `${error.message}\n\n`;

  // Remediation steps
  output += `🔧 How to fix:\n`;
  for (const step of error.remediation) {
    output += `   ${step}\n`;
  }

  // Example
  if (error.example) {
    output += `\n💡 Example:\n`;
    const lines = error.example.split('\n');
    for (const line of lines) {
      output += `   ${line}\n`;
    }
  }

  // Tip
  if (error.tip) {
    output += `\n💭 Tip: ${error.tip}\n`;
  }

  // Docs
  if (error.docs) {
    output += `\n📖 Documentation: ${error.docs}\n`;
  }

  return output;
}

/**
 * Common error patterns and their codes
 */
export function detectErrorCode(error: Error): string | null {
  const message = error.message.toLowerCase();

  // Installation & Setup
  if (message.includes('no html files') || message.includes('no files found')) {
    return 'NO_FILES_FOUND';
  }
  
  if (message.includes('browser') && message.includes('launch')) {
    return 'BROWSER_LAUNCH_FAILED';
  }
  
  if (message.includes('timeout') || message.includes('timed out')) {
    return 'PAGE_LOAD_TIMEOUT';
  }
  
  if (message.includes('invalid url') || message.includes('malformed url')) {
    return 'INVALID_URL';
  }

  // Configuration
  if (message.includes('invalid config') || message.includes('allyrc')) {
    return 'INVALID_CONFIG';
  }
  
  if (message.includes('copilot') && message.includes('not found')) {
    return 'MISSING_COPILOT_CLI';
  }

  // Runtime
  if (message.includes('permission denied') || message.includes('eacces')) {
    return 'PERMISSION_DENIED';
  }
  
  if (message.includes('out of memory') || message.includes('enomem')) {
    return 'OUT_OF_MEMORY';
  }

  // Git/CI
  if (message.includes('not a git repository')) {
    return 'NOT_A_GIT_REPO';
  }
  
  if (message.includes('pull request') && message.includes('not found')) {
    return 'PR_NOT_FOUND';
  }

  // Fix
  if (message.includes('fix failed') || message.includes('failed to apply')) {
    return 'FIX_FAILED';
  }
  
  if (message.includes('low confidence')) {
    return 'LOW_CONFIDENCE_FIX';
  }

  return null;
}

/**
 * Show enhanced error and exit
 */
export function showEnhancedErrorAndExit(errorCode: string, exitCode: number = 1): never {
  const enhanced = getEnhancedError(errorCode);
  
  if (enhanced) {
    const formatted = formatEnhancedError(enhanced);
    console.error(formatted);
  } else {
    console.error(`\n❌ Error code: ${errorCode}\n`);
  }
  
  process.exit(exitCode);
}

/**
 * Throw enhanced error (for backwards compatibility)
 */
export function throwEnhancedError(errorCode: string, originalError?: Error): never {
  showEnhancedErrorAndExit(errorCode, 1);
}

/**
 * Handle error with enhanced message
 */
export function handleErrorWithEnhancement(error: Error): void {
  const errorCode = detectErrorCode(error);
  
  if (errorCode) {
    const enhanced = getEnhancedError(errorCode);
    if (enhanced) {
      console.error(formatEnhancedError(enhanced));
      return;
    }
  }

  // Fallback to original error
  console.error(`\n❌ Error: ${error.message}\n`);
  
  if (error.stack) {
    console.error(`\n📋 Stack trace:\n${error.stack}\n`);
  }
  
  console.error(`\n💭 Tip: Run with --verbose for more details\n`);
}
