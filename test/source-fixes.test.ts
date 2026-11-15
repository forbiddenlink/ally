import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { applyHighConfidenceSourceFixes } from '../src/utils/source-fixes.js'
import { generateSuggestedFix, getFixConfidence } from '../src/utils/fix-patterns.js'

describe('applyHighConfidenceSourceFixes', () => {
  it('does not auto-apply filename-derived or placeholder image descriptions', () => {
    for (const source of ['<img src="a8f23c.webp" />', '<img src="hero-banner.jpg" />', '<img />']) {
      assert.deepEqual(applyHighConfidenceSourceFixes(source), { content: source, applied: [] })
    }
  })

  it('does not guess English for a page with no declared language', () => {
    const source = '<html><body>Bienvenidos a nuestra tienda</body></html>'
    assert.deepEqual(applyHighConfidenceSourceFixes(source), { content: source, applied: [] })
  })

  it('preserves author-provided descriptions, decorative alternatives and language', () => {
    for (const source of ['<img src="logo.png" alt="Company logo" />', '<img src="decoration.png" alt="" />', '<html lang="es"><body>Hola</body></html>']) {
      assert.deepEqual(applyHighConfidenceSourceFixes(source), { content: source, applied: [] })
    }
  })

  it('keeps semantic guesses below the shared automatic-application threshold', () => {
    for (const id of ['image-alt', 'html-has-lang']) {
      const confidence = getFixConfidence(id)
      assert.ok(confidence !== null && confidence < 0.9)
    }
  })

  it('retains semantic suggestions for explicit review instead of counting them as applied', () => {
    const violation = { id: 'image-alt' } as Parameters<typeof generateSuggestedFix>[0]
    assert.ok(generateSuggestedFix(violation, '<img src="hero-banner.jpg" />'))
    assert.deepEqual(applyHighConfidenceSourceFixes('<img src="hero-banner.jpg" />').applied, [])
  })

  it('continues applying unrelated high-confidence mechanical fixes', () => {
    const result = applyHighConfidenceSourceFixes('<button tabindex="2">Go</button>')
    assert.match(result.content, /tabindex="0"/)
    assert.deepEqual(result.applied, ['tabindex'])
  })
})
