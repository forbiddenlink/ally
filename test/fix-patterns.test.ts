/**
 * Tests for auto-fix patterns
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  getAttr,
  hasAttr,
  addAttr,
  getTagName,
  inferDescription,
  FIX_PATTERNS,
  generateSuggestedFix,
} from '../dist/utils/fix-patterns.js';
import type { Violation } from '../dist/types/index.js';

// Mock violation for testing
const mockViolation = (id: string): Violation => ({
  id,
  impact: 'serious',
  description: 'Test violation',
  help: 'Fix this issue',
  helpUrl: 'https://example.com',
  nodes: [],
});

describe('Helper Functions', () => {
  describe('getAttr', () => {
    it('should extract attribute with double quotes', () => {
      assert.strictEqual(getAttr('<img src="test.jpg">', 'src'), 'test.jpg');
    });

    it('should extract attribute with single quotes', () => {
      assert.strictEqual(getAttr("<img src='test.jpg'>", 'src'), 'test.jpg');
    });

    it('should return null for missing attribute', () => {
      assert.strictEqual(getAttr('<img>', 'src'), null);
    });

    it('should be case insensitive', () => {
      assert.strictEqual(getAttr('<img SRC="test.jpg">', 'src'), 'test.jpg');
    });
  });

  describe('hasAttr', () => {
    it('should detect attribute with value', () => {
      assert.strictEqual(hasAttr('<input type="text">', 'type'), true);
    });

    it('should detect attribute without value', () => {
      assert.strictEqual(hasAttr('<input disabled>', 'disabled'), true);
    });

    it('should detect attribute in self-closing tag', () => {
      assert.strictEqual(hasAttr('<input disabled/>', 'disabled'), true);
    });

    it('should return false for missing attribute', () => {
      assert.strictEqual(hasAttr('<input>', 'disabled'), false);
    });
  });

  describe('addAttr', () => {
    it('should add attribute to tag', () => {
      const result = addAttr('<img src="x.jpg">', 'img', 'alt', 'description');
      assert.ok(result.includes('alt="description"'));
    });

    it('should work with tags that have attributes', () => {
      const result = addAttr('<img src="x.jpg"/>', 'img', 'alt', 'test');
      assert.ok(result.includes('alt="test"'));
    });
  });

  describe('getTagName', () => {
    it('should extract tag name', () => {
      assert.strictEqual(getTagName('<button>Click</button>'), 'button');
    });

    it('should handle self-closing tags', () => {
      assert.strictEqual(getTagName('<input type="text"/>'), 'input');
    });

    it('should handle custom elements', () => {
      assert.strictEqual(getTagName('<my-component>'), 'my-component');
    });

    it('should return null for invalid HTML', () => {
      assert.strictEqual(getTagName('not html'), null);
    });
  });

  describe('inferDescription', () => {
    it('should use title attribute', () => {
      assert.strictEqual(inferDescription('<a title="Home">Link</a>', 'fallback'), 'Home');
    });

    it('should use name attribute', () => {
      assert.strictEqual(inferDescription('<input name="user_name">', 'fallback'), 'user name');
    });

    it('should use text content', () => {
      assert.strictEqual(inferDescription('<button>Submit Form</button>', 'fallback'), 'Submit Form');
    });

    it('should return fallback when nothing found', () => {
      assert.strictEqual(inferDescription('<div></div>', 'fallback'), 'fallback');
    });
  });
});

describe('Fix Patterns', () => {
  describe('image-alt', () => {
    it('should add alt from filename', () => {
      const result = FIX_PATTERNS['image-alt']('<img src="/images/hero-banner.jpg">', mockViolation('image-alt'));
      assert.ok(result?.includes('alt="hero banner"'));
    });

    it('should return null if alt exists', () => {
      const result = FIX_PATTERNS['image-alt']('<img src="x.jpg" alt="existing">', mockViolation('image-alt'));
      assert.strictEqual(result, null);
    });

    it('should use fallback for data URLs', () => {
      const result = FIX_PATTERNS['image-alt']('<img src="data:image/png;base64,...">', mockViolation('image-alt'));
      assert.ok(result?.includes('alt='));
    });
  });

  describe('image-redundant-alt', () => {
    it('should remove "image of" prefix', () => {
      const result = FIX_PATTERNS['image-redundant-alt']('<img alt="image of a cat">', mockViolation('image-redundant-alt'));
      assert.ok(result?.includes('alt="a cat"'));
    });

    it('should remove "picture of" prefix', () => {
      const result = FIX_PATTERNS['image-redundant-alt']('<img alt="Picture of sunset">', mockViolation('image-redundant-alt'));
      assert.ok(result?.includes('alt="sunset"'));
    });

    it('should return null for clean alt text', () => {
      const result = FIX_PATTERNS['image-redundant-alt']('<img alt="A cat sleeping">', mockViolation('image-redundant-alt'));
      assert.strictEqual(result, null);
    });
  });

  describe('button-name', () => {
    it('should add aria-label from content', () => {
      const result = FIX_PATTERNS['button-name']('<button>Submit</button>', mockViolation('button-name'));
      assert.ok(result?.includes('aria-label="Submit"'));
    });

    it('should return null if aria-label exists', () => {
      const result = FIX_PATTERNS['button-name']('<button aria-label="Send">X</button>', mockViolation('button-name'));
      assert.strictEqual(result, null);
    });
  });

  describe('link-name', () => {
    it('should add aria-label from href', () => {
      const result = FIX_PATTERNS['link-name']('<a href="/about-us"></a>', mockViolation('link-name'));
      assert.ok(result?.includes('aria-label'));
    });

    it('should return null if aria-labelledby exists', () => {
      const result = FIX_PATTERNS['link-name']('<a href="#" aria-labelledby="label1"></a>', mockViolation('link-name'));
      assert.strictEqual(result, null);
    });
  });

  describe('html-has-lang', () => {
    it('should add lang="en"', () => {
      const result = FIX_PATTERNS['html-has-lang']('<html>', mockViolation('html-has-lang'));
      assert.ok(result?.includes('lang="en"'));
    });

    it('should return null if lang exists', () => {
      const result = FIX_PATTERNS['html-has-lang']('<html lang="fr">', mockViolation('html-has-lang'));
      assert.strictEqual(result, null);
    });
  });

  describe('document-title', () => {
    it('should add title element', () => {
      const result = FIX_PATTERNS['document-title']('<head></head>', mockViolation('document-title'));
      assert.ok(result?.includes('<title>'));
    });

    it('should return null if title exists', () => {
      const result = FIX_PATTERNS['document-title']('<head><title>Page</title></head>', mockViolation('document-title'));
      assert.strictEqual(result, null);
    });
  });

  describe('meta-viewport', () => {
    it('should remove user-scalable=no', () => {
      const result = FIX_PATTERNS['meta-viewport']('<meta name="viewport" content="width=device-width, user-scalable=no">', mockViolation('meta-viewport'));
      assert.ok(!result?.includes('user-scalable=no'));
    });

    it('should remove maximum-scale=1', () => {
      const result = FIX_PATTERNS['meta-viewport']('<meta content="maximum-scale=1">', mockViolation('meta-viewport'));
      assert.ok(!result?.includes('maximum-scale=1'));
    });

    it('should return null for valid viewport', () => {
      const result = FIX_PATTERNS['meta-viewport']('<meta name="viewport" content="width=device-width">', mockViolation('meta-viewport'));
      assert.strictEqual(result, null);
    });
  });

  describe('label', () => {
    it('should add aria-label from name', () => {
      const result = FIX_PATTERNS['label']('<input type="text" name="email_address">', mockViolation('label'));
      assert.ok(result?.includes('aria-label="email address"'));
    });

    it('should return null if id exists (can have associated label)', () => {
      const result = FIX_PATTERNS['label']('<input type="text" id="email">', mockViolation('label'));
      assert.strictEqual(result, null);
    });
  });

  describe('autocomplete-valid', () => {
    it('should add autocomplete="email" for email input', () => {
      const result = FIX_PATTERNS['autocomplete-valid']('<input type="email">', mockViolation('autocomplete-valid'));
      assert.ok(result?.includes('autocomplete="email"'));
    });

    it('should add autocomplete="tel" for phone input', () => {
      const result = FIX_PATTERNS['autocomplete-valid']('<input name="phone">', mockViolation('autocomplete-valid'));
      assert.ok(result?.includes('autocomplete="tel"'));
    });

    it('should return null if autocomplete exists', () => {
      const result = FIX_PATTERNS['autocomplete-valid']('<input autocomplete="off">', mockViolation('autocomplete-valid'));
      assert.strictEqual(result, null);
    });
  });

  describe('heading-order', () => {
    it('should suggest lower heading level', () => {
      const result = FIX_PATTERNS['heading-order']('<h4>Title</h4>', mockViolation('heading-order'));
      assert.ok(result?.includes('<h3>'));
    });
  });

  describe('empty-heading', () => {
    it('should add placeholder text', () => {
      const result = FIX_PATTERNS['empty-heading']('<h2></h2>', mockViolation('empty-heading'));
      assert.ok(result?.includes('[Heading text]'));
    });

    it('should return null for non-empty heading', () => {
      const result = FIX_PATTERNS['empty-heading']('<h2>Title</h2>', mockViolation('empty-heading'));
      assert.strictEqual(result, null);
    });
  });

  describe('tabindex', () => {
    it('should fix positive tabindex', () => {
      const result = FIX_PATTERNS['tabindex']('<div tabindex="5">', mockViolation('tabindex'));
      assert.ok(result?.includes('tabindex="0"'));
    });

    it('should return null for tabindex="0"', () => {
      const result = FIX_PATTERNS['tabindex']('<div tabindex="0">', mockViolation('tabindex'));
      assert.strictEqual(result, null);
    });

    it('should return null for tabindex="-1"', () => {
      const result = FIX_PATTERNS['tabindex']('<div tabindex="-1">', mockViolation('tabindex'));
      assert.strictEqual(result, null);
    });
  });

  describe('frame-title', () => {
    it('should add title from src', () => {
      const result = FIX_PATTERNS['frame-title']('<iframe src="/embed/video-player.html">', mockViolation('frame-title'));
      assert.ok(result?.includes('title="video player"'));
    });

    it('should return null if title exists', () => {
      const result = FIX_PATTERNS['frame-title']('<iframe title="Video" src="/x">', mockViolation('frame-title'));
      assert.strictEqual(result, null);
    });
  });

  describe('aria-hidden-focus', () => {
    it('should add tabindex="-1" to aria-hidden element', () => {
      const result = FIX_PATTERNS['aria-hidden-focus']('<button aria-hidden="true">', mockViolation('aria-hidden-focus'));
      assert.ok(result?.includes('tabindex="-1"'));
    });

    it('should fix existing tabindex on aria-hidden element', () => {
      const result = FIX_PATTERNS['aria-hidden-focus']('<button aria-hidden="true" tabindex="0">', mockViolation('aria-hidden-focus'));
      assert.ok(result?.includes('tabindex="-1"'));
    });
  });

  describe('svg-img-alt', () => {
    it('should add role and aria-label', () => {
      const result = FIX_PATTERNS['svg-img-alt']('<svg viewBox="0 0 100 100">', mockViolation('svg-img-alt'));
      assert.ok(result?.includes('role="img"'));
      assert.ok(result?.includes('aria-label'));
    });

    it('should return null if aria-label exists', () => {
      const result = FIX_PATTERNS['svg-img-alt']('<svg aria-label="Icon">', mockViolation('svg-img-alt'));
      assert.strictEqual(result, null);
    });
  });

  describe('video-caption', () => {
    it('should add captions track', () => {
      const result = FIX_PATTERNS['video-caption']('<video src="movie.mp4"></video>', mockViolation('video-caption'));
      assert.ok(result?.includes('<track kind="captions"'));
    });

    it('should return null if track exists', () => {
      const result = FIX_PATTERNS['video-caption']('<video><track kind="captions"></video>', mockViolation('video-caption'));
      assert.strictEqual(result, null);
    });
  });

  describe('link-in-text-block', () => {
    it('should add underline style', () => {
      const result = FIX_PATTERNS['link-in-text-block']('<a href="#">Link</a>', mockViolation('link-in-text-block'));
      assert.ok(result?.includes('text-decoration: underline'));
    });

    it('should append to existing style', () => {
      const result = FIX_PATTERNS['link-in-text-block']('<a href="#" style="color: blue;">Link</a>', mockViolation('link-in-text-block'));
      assert.ok(result?.includes('text-decoration: underline'));
      assert.ok(result?.includes('color: blue'));
    });
  });
});

describe('generateSuggestedFix', () => {
  it('should return fix for known violation', () => {
    const violation = mockViolation('image-alt');
    const result = generateSuggestedFix(violation, '<img src="test.jpg">');
    assert.ok(result !== null);
    assert.ok(result?.includes('alt='));
  });

  it('should return null for unknown violation', () => {
    const violation = mockViolation('unknown-rule');
    const result = generateSuggestedFix(violation, '<div>content</div>');
    assert.strictEqual(result, null);
  });

  it('should handle errors gracefully', () => {
    const violation = mockViolation('image-alt');
    // Pass malformed input - should not throw
    const result = generateSuggestedFix(violation, '');
    // May return result or null, but should not throw
    assert.ok(result === null || typeof result === 'string');
  });
});
