import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isComponentFile, isHtmlFile, isWatchableFile } from '../src/utils/watch-files.js'

describe('watchable files', () => {
  it('treats HTML and component source as watchable', () => {
    for (const file of ['index.html', 'Page.htm', 'Button.tsx', 'Icon.jsx', 'Card.vue', 'Widget.svelte']) {
      assert.equal(isWatchableFile(file), true, file)
    }
  })

  it('ignores unrelated extensions', () => {
    for (const file of ['styles.css', 'app.ts', 'readme.md', 'image.svg']) {
      assert.equal(isWatchableFile(file), false, file)
    }
  })

  it('distinguishes HTML pages from component files', () => {
    assert.equal(isHtmlFile('index.html'), true)
    assert.equal(isHtmlFile('Button.tsx'), false)
    assert.equal(isComponentFile('Button.tsx'), true)
    assert.equal(isComponentFile('index.html'), false)
  })
})
