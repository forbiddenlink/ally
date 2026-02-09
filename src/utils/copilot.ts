/**
 * GitHub Copilot CLI integration utilities
 */

import { spawn, execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';

export interface CopilotConfig {
  available: boolean;
  command: string;
  version?: string;
}

/**
 * Check if GitHub Copilot CLI is installed and available
 */
export function checkCopilotCli(): CopilotConfig {
  const commands = ['copilot', 'gh copilot'];

  for (const cmd of commands) {
    try {
      const result = execSync(`${cmd} --version 2>/dev/null`, {
        encoding: 'utf-8',
        timeout: 5000,
      });
      return {
        available: true,
        command: cmd,
        version: result.trim(),
      };
    } catch {
      // Command not found, try next
    }
  }

  return {
    available: false,
    command: '',
  };
}

/**
 * Generate a Copilot CLI prompt for fixing an accessibility issue
 */
export function generateFixPrompt(
  file: string,
  issue: string,
  html: string,
  suggestedFix?: string
): string {
  let prompt = `Fix this accessibility issue in ${file}:

Issue: ${issue}

Current code:
${html}
`;

  if (suggestedFix) {
    prompt += `
Suggested fix pattern:
${suggestedFix}
`;
  }

  prompt += `
Requirements:
- Make the minimal change needed to fix the accessibility issue
- Preserve existing functionality and styling
- Follow WCAG 2.1 AA guidelines
- Use semantic HTML where possible
`;

  return prompt;
}

/**
 * Invoke Copilot CLI to fix an issue (with approval flow)
 */
export async function invokeCopilotFix(
  file: string,
  prompt: string,
  options: { allowEdits?: boolean } = {}
): Promise<{ success: boolean; output: string }> {
  const config = checkCopilotCli();

  if (!config.available) {
    return {
      success: false,
      output: 'GitHub Copilot CLI is not installed. Install it with: npm install -g @github/copilot-cli',
    };
  }

  return new Promise((resolve) => {
    const args = ['-p', prompt];

    if (options.allowEdits) {
      args.unshift('--allow-edits');
    }

    // Split command if it contains spaces (e.g., "gh copilot")
    const cmdParts = config.command.split(' ');
    const cmd = cmdParts[0];
    const cmdArgs = [...cmdParts.slice(1), ...args];

    const copilot = spawn(cmd, cmdArgs, {
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    copilot.stdout?.on('data', (data) => {
      stdout += data.toString();
      process.stdout.write(data);
    });

    copilot.stderr?.on('data', (data) => {
      stderr += data.toString();
      process.stderr.write(data);
    });

    copilot.on('close', (code) => {
      resolve({
        success: code === 0,
        output: stdout || stderr,
      });
    });

    copilot.on('error', (error) => {
      resolve({
        success: false,
        output: error.message,
      });
    });
  });
}

/**
 * Print Copilot CLI installation instructions
 */
export function printCopilotInstructions(): void {
  console.log();
  console.log(chalk.yellow('GitHub Copilot CLI not detected.'));
  console.log();
  console.log(chalk.bold('To enable AI-powered fixes, install Copilot CLI:'));
  console.log();
  console.log(chalk.cyan('  npm install -g @github/copilot-cli'));
  console.log(chalk.cyan('  copilot auth login'));
  console.log();
  console.log(chalk.dim('Once installed, run `ally fix` again for AI-assisted fixes.'));
  console.log(chalk.dim('For now, showing manual fix suggestions below.'));
  console.log();
}

/**
 * Check if MCP server is configured
 */
export function checkMcpConfig(): { configured: boolean; path: string } {
  const home = homedir();
  const configPaths = [
    '.copilot/mcp-config.json',
    ...(home ? [resolve(home, '.copilot/mcp-config.json')] : []),
  ];

  for (const configPath of configPaths) {
    if (existsSync(configPath)) {
      return { configured: true, path: configPath };
    }
  }

  return { configured: false, path: '' };
}
