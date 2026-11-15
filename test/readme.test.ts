import assert from 'node:assert'
import { describe, it } from 'node:test'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { dirname, resolve } from 'path'

const root = resolve(import.meta.dirname, '..')
const readme = readFileSync(resolve(root, 'README.md'), 'utf8')

/** Relative markdown link targets (no scheme, no pure anchors), anchors stripped. */
function relativeLinks(markdown: string): string[] {
  const withoutFences = markdown.replace(/```[\s\S]*?```/g, '')
  const targets: string[] = []
  for (const match of withoutFences.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = match[1]
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) continue
    targets.push(target.split('#')[0])
  }
  return targets
}

describe('README front page', () => {
  it('stays a short front page', () => {
    const lines = readme.split('\n').length
    assert.ok(lines <= 150, `README.md is ${lines} lines, expected 150 or fewer`)
  })

  it('has no dead relative links', () => {
    for (const target of relativeLinks(readme)) {
      assert.ok(existsSync(resolve(root, target)), `README.md links to missing ${target}`)
    }
  })

  it('links every guide under docs/', () => {
    for (const file of readdirSync(resolve(root, 'docs')).filter((f) => f.endsWith('.md'))) {
      assert.ok(readme.includes(`docs/${file}`), `README.md does not link docs/${file}`)
    }
  })

  it('has no dead relative links inside docs/', () => {
    const docsDir = resolve(root, 'docs')
    for (const file of readdirSync(docsDir).filter((f) => f.endsWith('.md'))) {
      const body = readFileSync(resolve(docsDir, file), 'utf8')
      for (const target of relativeLinks(body)) {
        assert.ok(
          existsSync(resolve(dirname(resolve(docsDir, file)), target)),
          `docs/${file} links to missing ${target}`
        )
      }
    }
  })

  it('documents every registered CLI command in docs/COMMANDS.md', () => {
    const cli = readFileSync(resolve(root, 'src/cli.ts'), 'utf8')
    const commands = [...cli.matchAll(/\.command\('([a-z][a-z-]*)/g)].map((m) => m[1])
    assert.ok(commands.length > 10, 'expected to find the registered commands')
    const doc = readFileSync(resolve(root, 'docs/COMMANDS.md'), 'utf8')
    for (const name of commands) {
      assert.ok(doc.includes(`ally ${name}`), `docs/COMMANDS.md does not mention "ally ${name}"`)
    }
  })
})
