/**
 * ally watch command - Continuous accessibility testing for development
 *
 * Watches HTML and component files. HTML files get a full axe scan.
 * Component files get high-confidence source fixes (axe needs rendered HTML).
 */

import chalk from 'chalk'
import chokidar from 'chokidar'
import { existsSync, statSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import { relative, resolve } from 'path'
import type { ScanResult, Severity, Violation } from '../types/index.js'
import { generateSuggestedFix, getFixConfidence } from '../utils/fix-patterns.js'
import { AccessibilityScanner, calculateScore } from '../utils/scanner.js'
import { applyHighConfidenceSourceFixes } from '../utils/source-fixes.js'
import { printBanner, printError, printInfo } from '../utils/ui.js'
import { isHtmlFile, isWatchableFile } from '../utils/watch-files.js'

interface WatchCommandOptions {
  port?: number
  debounce?: number
  clear?: boolean
  fixOnSave?: boolean
}

interface WatchStats {
  filesScanned: number
  totalViolations: number
  cleanScans: number
  autoFixed: number
}

/**
 * Auto-apply high-confidence fixes to a file from axe violations
 */
async function autoFixFile(filePath: string, violations: Violation[]): Promise<number> {
  let content = await readFile(filePath, 'utf-8')
  let fixesApplied = 0

  const highConfidenceViolations = violations.filter((v) => {
    const confidence = getFixConfidence(v.id)
    return confidence !== null && confidence >= 0.9
  })

  for (const violation of highConfidenceViolations) {
    for (const node of violation.nodes) {
      if (node.html) {
        const fixedHtml = generateSuggestedFix(violation, node.html)
        if (fixedHtml && fixedHtml !== node.html) {
          content = content.replace(node.html, fixedHtml)
          fixesApplied++
        }
      }
    }
  }

  if (fixesApplied > 0) {
    await writeFile(filePath, content, 'utf-8')
  }

  return fixesApplied
}

function formatTime(): string {
  const now = new Date()
  return chalk.dim(
    `[${now.getHours().toString().padStart(2, '0')}:${now
      .getMinutes()
      .toString()
      .padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}]`
  )
}

function debounce(fn: (filePath: string) => Promise<void>, delay: number): (filePath: string) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  return (filePath: string) => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    timeoutId = setTimeout(() => fn(filePath), delay)
  }
}

function printCompactViolation(violation: Violation): void {
  const count = violation.nodes.length
  const countText = count > 1 ? chalk.dim(` (${count} instances)`) : ''
  console.log(`   - ${chalk.cyan(violation.id)}: ${violation.help}${countText}`)
}

function printWatchResult(
  file: string,
  result: ScanResult,
  basePath: string,
  fixesApplied?: number
): void {
  const relPath = relative(basePath, file)
  const score = calculateScore([result])
  const violations = result.violations

  console.log()
  console.log(`${formatTime()} ${chalk.bold(relPath)} changed`)

  if (fixesApplied && fixesApplied > 0) {
    const fixText = fixesApplied === 1 ? 'fix' : 'fixes'
    console.log(chalk.green(`   ✓ Auto-applied ${fixesApplied} ${fixText}`))
  }

  if (violations.length === 0) {
    console.log(chalk.green(`   No issues found (score: ${score})`))
  } else {
    const issueText = violations.length === 1 ? 'issue' : 'issues'
    const scoreColor = score >= 75 ? chalk.green : score >= 50 ? chalk.yellow : chalk.red
    console.log(
      chalk.yellow(`   ${violations.length} ${issueText} found`) +
        ` (score: ${scoreColor(score.toString())})`
    )

    const bySeverity: Partial<Record<Severity, Violation[]>> = {}
    for (const v of violations) {
      if (!bySeverity[v.impact]) {
        bySeverity[v.impact] = []
      }
      bySeverity[v.impact]!.push(v)
    }

    const order: Severity[] = ['critical', 'serious', 'moderate', 'minor']
    for (const severity of order) {
      const sViolations = bySeverity[severity]
      if (sViolations) {
        for (const v of sViolations) {
          printCompactViolation(v)
        }
      }
    }
  }
}

function printWatchSummary(stats: WatchStats, startTime: Date): void {
  const duration = Math.round((Date.now() - startTime.getTime()) / 1000)
  const minutes = Math.floor(duration / 60)
  const seconds = duration % 60
  const durationStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`

  console.log()
  console.log(chalk.bold.cyan('\nWatch Session Summary'))
  console.log(chalk.dim('-'.repeat(40)))
  console.log(`  Duration:        ${durationStr}`)
  console.log(`  Files scanned:   ${stats.filesScanned}`)
  console.log(`  Total violations: ${stats.totalViolations}`)
  console.log(`  Clean scans:     ${stats.cleanScans}`)
  if (stats.autoFixed > 0) {
    console.log(chalk.green(`  Auto-fixed:      ${stats.autoFixed}`))
  }
  console.log()
}

function watchDirectory(dirPath: string, callback: (filename: string) => void): () => void {
  const watcher = chokidar.watch(dirPath, {
    ignored: (watchPath: string) => {
      const normalized = watchPath.replace(/\\/g, '/')
      return /(^|\/)(\.|node_modules|dist|build)(\/|$)/.test(normalized)
    },
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
  })

  const onFile = (filePath: string) => {
    if (isWatchableFile(filePath)) {
      callback(filePath)
    }
  }

  watcher.on('add', onFile)
  watcher.on('change', onFile)

  return () => {
    void watcher.close()
  }
}

export async function watchCommand(
  targetPath: string = '.',
  options: WatchCommandOptions = {}
): Promise<void> {
  const { debounce: debounceMs = 500, clear = false, fixOnSave = false } = options

  const absolutePath = resolve(targetPath)

  if (!existsSync(absolutePath)) {
    printError(`Path does not exist: ${absolutePath}`)
    process.exit(1)
  }

  const pathStat = statSync(absolutePath)
  if (!pathStat.isDirectory()) {
    printError(`Path is not a directory: ${absolutePath}`)
    process.exit(1)
  }

  printBanner()

  console.log(chalk.cyan.bold('Watching for accessibility changes...'))
  console.log(chalk.dim(`   Directory: ${absolutePath}`))
  console.log(chalk.dim('   Files: .html, .htm, .tsx, .jsx, .vue, .svelte'))
  console.log(chalk.dim(`   Debounce: ${debounceMs}ms`))
  if (fixOnSave) {
    console.log(chalk.green('   Auto-fix: ON (confidence ≥ 90%)'))
  }
  console.log(chalk.dim('   Press Ctrl+C to stop\n'))

  const scanner = new AccessibilityScanner()
  await scanner.init()

  const stats: WatchStats = {
    filesScanned: 0,
    totalViolations: 0,
    cleanScans: 0,
    autoFixed: 0,
  }
  const startTime = new Date()

  const scanFile = async (filePath: string): Promise<void> => {
    if (!existsSync(filePath)) return

    try {
      if (clear) {
        console.clear()
        console.log(chalk.cyan.bold('Watching for accessibility changes...'))
        console.log(chalk.dim('   Press Ctrl+C to stop\n'))
      }

      if (!isHtmlFile(filePath)) {
        stats.filesScanned++
        let fixesApplied = 0
        if (fixOnSave) {
          const original = await readFile(filePath, 'utf-8')
          const { content, applied } = applyHighConfidenceSourceFixes(original)
          if (applied.length > 0 && content !== original) {
            await writeFile(filePath, content, 'utf-8')
            fixesApplied = applied.length
            stats.autoFixed += fixesApplied
          }
        }

        const relPath = relative(absolutePath, filePath)
        console.log()
        console.log(`${formatTime()} ${chalk.bold(relPath)} changed`)
        if (fixesApplied > 0) {
          const fixText = fixesApplied === 1 ? 'fix' : 'fixes'
          console.log(chalk.green(`   ✓ Auto-applied ${fixesApplied} source ${fixText}`))
        } else if (fixOnSave) {
          console.log(chalk.dim('   No high-confidence source fixes to apply'))
        }
        console.log(
          chalk.dim('   Component files are not axe-scanned (needs rendered HTML). Use ally scan --url.')
        )
        return
      }

      const result = await scanner.scanHtmlFile(filePath)
      stats.filesScanned++
      stats.totalViolations += result.violations.length
      if (result.violations.length === 0) {
        stats.cleanScans++
      }

      let fixesApplied = 0
      if (fixOnSave && result.violations.length > 0) {
        fixesApplied = await autoFixFile(filePath, result.violations)
        stats.autoFixed += fixesApplied

        if (fixesApplied > 0) {
          const updatedResult = await scanner.scanHtmlFile(filePath)
          printWatchResult(filePath, updatedResult, absolutePath, fixesApplied)
          return
        }
      }

      printWatchResult(filePath, result, absolutePath)
    } catch (error) {
      console.log()
      console.log(
        `${formatTime()} ${chalk.red('Error scanning')} ${relative(absolutePath, filePath)}`
      )
      printError(error instanceof Error ? error.message : String(error))
    }
  }

  const debouncedScan = debounce(scanFile, debounceMs)

  const stopWatching = watchDirectory(absolutePath, (filename) => {
    debouncedScan(filename)
  })

  const cleanup = async (): Promise<void> => {
    stopWatching()
    await scanner.close()
    printWatchSummary(stats, startTime)
    process.exit(0)
  }

  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)

  printInfo('Waiting for file changes...')

  await new Promise(() => {})
}

export default watchCommand
