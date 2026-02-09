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
}

export async function initCommand(options: InitOptions = {}): Promise<void> {
  printBanner();

  const cwd = process.cwd();
  const { force = false } = options;

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

  printInfo('For AI-powered fixes, install GitHub Copilot CLI:');
  console.log(chalk.dim('  npm install -g @github/copilot-cli'));
  console.log(chalk.dim('  copilot auth login'));
}

export default initCommand;
