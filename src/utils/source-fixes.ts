/**
 * Apply high-confidence fix patterns directly to source (HTML or JSX-like).
 * Used by watch --fix-on-save for component files that axe cannot load as pages.
 */

import { FIX_PATTERNS, getFixConfidence } from './fix-patterns.js'

const SOURCE_TAG_TARGETS: Array<{ id: string; pattern: RegExp }> = [
  { id: 'image-alt', pattern: /<img\b[^>]*\/?>/gi },
  { id: 'html-has-lang', pattern: /<html\b[^>]*>/gi },
  { id: 'input-button-name', pattern: /<input\b[^>]*>/gi },
  { id: 'meta-viewport', pattern: /<meta\b[^>]*name=["']viewport["'][^>]*>/gi },
  { id: 'tabindex', pattern: /<[^>]+\btabindex=["'][1-9]\d*["'][^>]*>/gi },
]

export interface SourceFixResult {
  content: string
  applied: string[]
}

/**
 * Walk the file once and apply patterns with confidence ≥ 0.9.
 */
export function applyHighConfidenceSourceFixes(content: string): SourceFixResult {
  let next = content
  const applied: string[] = []

  for (const target of SOURCE_TAG_TARGETS) {
    const confidence = getFixConfidence(target.id)
    if (confidence === null || confidence < 0.9) continue

    const fixer = FIX_PATTERNS[target.id]
    if (!fixer) continue

    next = next.replace(target.pattern, (tag) => {
      const dummyViolation = { id: target.id } as Parameters<typeof fixer>[1]
      const fixed = fixer(tag, dummyViolation)
      if (fixed && fixed !== tag) {
        applied.push(target.id)
        return fixed
      }
      return tag
    })
  }

  return { content: next, applied }
}
