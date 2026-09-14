import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { applyHighConfidenceSourceFixes } from '../src/utils/source-fixes.js'

describe('applyHighConfidenceSourceFixes', () => {
  it('adds alt text to JSX img tags', () => {
    const result = applyHighConfidenceSourceFixes('<img src="logo.png" />')
    assert.match(result.content, /alt=/)
    assert.ok(result.applied.includes('image-alt'))
  })

  it('adds lang to html tags', () => {
    const result = applyHighConfidenceSourceFixes('<html><body></body></html>')
    assert.match(result.content, /<html lang="/)
    assert.ok(result.applied.includes('html-has-lang'))
  })

  it('leaves already-fixed markup alone', () => {
    const source = '<img src="logo.png" alt="Logo" />'
    const result = applyHighConfidenceSourceFixes(source)
    assert.equal(result.content, source)
    assert.equal(result.applied.includes('image-alt'), false)
  })
})
