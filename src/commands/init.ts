/**
 * ally init command - Sets up ally configuration in a project
 */

import { mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, join } from 'path';
import chalk from 'chalk';
import {
  printBanner,
  createSpinner,
  printSuccess,
  printInfo,
  printWarning,
} from '../utils/ui.js';

interface InitOptions {
  force?: boolean;
  hooks?: boolean;
}

/**
 * Set up pre-commit hooks for accessibility checks
 */
async function setupPreCommitHooks(cwd: string, force: boolean, createdFiles: string[]): Promise<void> {
  const gitDir = join(cwd, '.git');
  const huskyDir = join(cwd, '.husky');

  // Pre-commit hook script content
  const preCommitScript = `#!/bin/sh
# Accessibility check - block commits with a11y errors
npx ally-a11y scan src/ --ci --fail-on error
`;

  // Pre-commit config YAML content
  const preCommitConfigYaml = `repos:
  - repo: local
    hooks:
      - id: ally-scan
        name: Accessibility Check
        entry: npx ally-a11y scan src/ --ci --fail-on error
        language: system
        types: [html]
        pass_filenames: false
`;

  // Check if husky is installed (look for .husky directory or package.json reference)
  const hasHusky = existsSync(huskyDir);
  const hasGit = existsSync(gitDir);

  if (hasHusky) {
    // Use husky-style hook
    const huskyPreCommit = join(huskyDir, 'pre-commit');
    if (!existsSync(huskyPreCommit) || force) {
      await writeFile(huskyPreCommit, preCommitScript, { mode: 0o755 });
      printSuccess('Created .husky/pre-commit');
      createdFiles.push('.husky/pre-commit');
    } else {
      printWarning('.husky/pre-commit already exists (use --force to overwrite)');
    }
  } else if (hasGit) {
    // Use git hooks directly
    const hooksDir = join(gitDir, 'hooks');
    if (!existsSync(hooksDir)) {
      await mkdir(hooksDir, { recursive: true });
    }
    const gitPreCommit = join(hooksDir, 'pre-commit');
    if (!existsSync(gitPreCommit) || force) {
      await writeFile(gitPreCommit, preCommitScript, { mode: 0o755 });
      printSuccess('Created .git/hooks/pre-commit');
      createdFiles.push('.git/hooks/pre-commit');
    } else {
      printWarning('.git/hooks/pre-commit already exists (use --force to overwrite)');
    }
  } else {
    printWarning('No .git directory found - skipping git hook setup');
  }

  // Always create .pre-commit-config.yaml for the pre-commit framework
  const preCommitConfigPath = join(cwd, '.pre-commit-config.yaml');
  if (!existsSync(preCommitConfigPath) || force) {
    await writeFile(preCommitConfigPath, preCommitConfigYaml);
    printSuccess('Created .pre-commit-config.yaml');
    createdFiles.push('.pre-commit-config.yaml');
  } else {
    printWarning('.pre-commit-config.yaml already exists (use --force to overwrite)');
  }
}

export async function initCommand(options: InitOptions = {}): Promise<void> {
  printBanner();

  const cwd = process.cwd();
  const { force = false, hooks = false } = options;
  const createdFiles: string[] = [];

  console.log(chalk.bold.cyan('Setting up ally in your project...\n'));

  // Create .ally directory
  const allyDir = join(cwd, '.ally');
  if (!existsSync(allyDir)) {
    await mkdir(allyDir, { recursive: true });
    printSuccess('Created .ally/ directory');
  } else {
    printInfo('.ally/ directory already exists');
  }

  // Create .copilot directory and MCP config
  const copilotDir = join(cwd, '.copilot');
  const mcpConfigPath = join(copilotDir, 'mcp-config.json');

  if (!existsSync(copilotDir)) {
    await mkdir(copilotDir, { recursive: true });
  }

  if (!existsSync(mcpConfigPath) || force) {
    const mcpConfig = {
      mcpServers: {
        'ally-patterns': {
          type: 'local',
          command: 'node',
          tools: ['*'],
          args: ['./node_modules/ally-a11y/mcp-server/dist/index.js'],
          env: {},
        },
      },
    };

    await writeFile(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
    printSuccess('Created .copilot/mcp-config.json');
  } else {
    printWarning('.copilot/mcp-config.json already exists (use --force to overwrite)');
  }

  // Set up pre-commit hooks if requested
  if (hooks) {
    await setupPreCommitHooks(cwd, force, createdFiles);
  }

  // Add to .gitignore if it exists
  const gitignorePath = join(cwd, '.gitignore');
  if (existsSync(gitignorePath)) {
    const { readFile } = await import('fs/promises');
    const gitignore = await readFile(gitignorePath, 'utf-8');

    const toAdd: string[] = [];
    if (!gitignore.includes('.ally/')) {
      toAdd.push('.ally/');
    }

    if (toAdd.length > 0) {
      const appendContent = '\n# Ally accessibility scanner\n' + toAdd.join('\n') + '\n';
      const { appendFile } = await import('fs/promises');
      await appendFile(gitignorePath, appendContent);
      printSuccess('Updated .gitignore');
    }
  }

  // Summary
  console.log();
  console.log(chalk.bold('Setup complete! Next steps:'));
  console.log();
  console.log(chalk.cyan('  1. Scan your project:'));
  console.log(chalk.dim('     ally scan ./src'));
  console.log();
  console.log(chalk.cyan('  2. Understand issues:'));
  console.log(chalk.dim('     ally explain'));
  console.log();
  console.log(chalk.cyan('  3. Fix with AI assistance:'));
  console.log(chalk.dim('     ally fix'));
  console.log();
  console.log(chalk.cyan('  4. Generate report:'));
  console.log(chalk.dim('     ally report'));
  console.log();

  // Show hook-specific info if hooks were created
  if (createdFiles.length > 0) {
    console.log(chalk.bold('Pre-commit hooks configured:'));
    for (const file of createdFiles) {
      console.log(chalk.dim(`     ${file}`));
    }
    console.log();
    printInfo('Commits will now be checked for accessibility violations');
  }

  printInfo('For AI-powered fixes, install GitHub Copilot CLI:');
  console.log(chalk.dim('  npm install -g @github/copilot-cli'));
  console.log(chalk.dim('  copilot auth login'));
}

export default initCommand;
