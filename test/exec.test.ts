import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { runCommandSync, splitCommand } from '../src/utils/exec.js'

describe('splitCommand', () => {
  it('splits a binary from a subcommand without using a shell', () => {
    assert.deepEqual(splitCommand('gh copilot'), { file: 'gh', args: ['copilot'] })
    assert.deepEqual(splitCommand('copilot'), { file: 'copilot', args: [] })
  })

  it('rejects an empty command', () => {
    assert.throws(() => splitCommand('   '), /Empty command/)
  })
})

describe('runCommandSync', () => {
  it('passes metacharacters as a single argv entry instead of executing them', () => {
    const payload = 'hello; echo pwned'
    const result = runCommandSync(process.execPath, [
      '--eval',
      'process.stdout.write(process.argv[process.argv.length - 1])',
      payload,
    ])
    assert.equal(result.status, 0)
    assert.equal(result.stdout, payload)
    assert.equal(result.stderr, '')
  })
})
