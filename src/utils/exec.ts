/**
 * Spawn helpers that never invoke a shell.
 * Pass user-controlled strings as argv entries, not as interpolated command text.
 */

import { spawn, spawnSync, type SpawnSyncOptions } from 'node:child_process'

export interface CommandResult {
  stdout: string
  stderr: string
  status: number | null
}

/**
 * Split a binary + optional subcommand ("gh copilot") into file + prefix args.
 * Does not parse quoted shell syntax — callers must not pass user input here.
 */
export function splitCommand(command: string): { file: string; args: string[] } {
  const parts = command.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) {
    throw new Error('Empty command')
  }
  return { file: parts[0], args: parts.slice(1) }
}

export function runCommandSync(
  file: string,
  args: readonly string[],
  options: SpawnSyncOptions = {}
): CommandResult {
  const result = spawnSync(file, [...args], {
    encoding: 'utf-8',
    ...options,
    shell: false,
  })

  if (result.error) {
    throw result.error
  }

  return {
    stdout: result.stdout?.toString() ?? '',
    stderr: result.stderr?.toString() ?? '',
    status: result.status,
  }
}

export function runCommand(
  file: string,
  args: readonly string[],
  options: { cwd?: string; timeout?: number } = {}
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, [...args], {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    const timer =
      options.timeout !== undefined
        ? setTimeout(() => {
            child.kill('SIGTERM')
            if (!settled) {
              settled = true
              reject(new Error(`Command timed out after ${options.timeout}ms: ${file}`))
            }
          }, options.timeout)
        : null

    child.stdout?.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString()
    })
    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString()
    })

    child.on('error', (error) => {
      if (timer) clearTimeout(timer)
      if (!settled) {
        settled = true
        reject(error)
      }
    })

    child.on('close', (status) => {
      if (timer) clearTimeout(timer)
      if (!settled) {
        settled = true
        resolve({ stdout, stderr, status })
      }
    })
  })
}
