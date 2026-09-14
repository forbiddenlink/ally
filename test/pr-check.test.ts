import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseGitHubRemote } from '../src/commands/pr-check.js'

describe('parseGitHubRemote', () => {
  it('parses HTTPS and SSH remotes', () => {
    assert.deepEqual(parseGitHubRemote('https://github.com/forbiddenlink/ally.git'), {
      owner: 'forbiddenlink',
      repo: 'ally',
    })
    assert.deepEqual(parseGitHubRemote('git@github.com:forbiddenlink/ally.git'), {
      owner: 'forbiddenlink',
      repo: 'ally',
    })
  })

  it('rejects names that are not safe to pass as CLI args', () => {
    assert.equal(parseGitHubRemote('https://github.com/owner;rm/repo.git'), null)
    assert.equal(parseGitHubRemote('git@github.com:ow ner/repo.git'), null)
  })
})
