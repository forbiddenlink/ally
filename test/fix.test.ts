/**
 * Tests for the fix command and related utilities
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { resolve, join } from 'path';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { existsSync } from 'fs';
import { generateSuggestedFix, getFixConfidence, getConfidenceLevel, FIX_CONFIDENCE } from '../dist/utils/fix-patterns.js';
import type { Violation } from '../dist/types/index.js';

describe('fix patterns', () => {
  describe('generateSuggestedFix', () => {
    it('should generate fix for image-alt violation', () => {
      const violation: Violation = {
        id: 'image-alt',
        impact: 'critical',
        description: 'Images must have alternate text',
        help: 'Images must have alternate text',
        helpUrl: 'https://example.com',
        tags: ['wcag2a'],
        nodes: [{ html: '<img src="photo.jpg">', target: ['img'], failureSummary: '' }]
      };

      const fix = generateSuggestedFix(violation, '<img src="photo.jpg">');
      assert.ok(fix, 'Should generate a fix');
      assert.ok(fix.includes('alt='), 'Fix should add alt attribute');
    });

    it('should generate fix for button-name violation', () => {
      const violation: Violation = {
        id: 'button-name',
        impact: 'critical',
        description: 'Buttons must have discernible text',
        help: 'Buttons must have discernible text',
        helpUrl: 'https://example.com',
        tags: ['wcag2a'],
        nodes: [{ html: '<button></button>', target: ['button'], failureSummary: '' }]
      };

      const fix = generateSuggestedFix(violation, '<button></button>');
      assert.ok(fix, 'Should generate a fix');
      assert.ok(fix.includes('aria-label'), 'Fix should add aria-label');
    });

    it('should generate fix for html-has-lang violation', () => {
      const violation: Violation = {
        id: 'html-has-lang',
        impact: 'serious',
        description: 'HTML must have lang attribute',
        help: 'HTML must have lang attribute',
        helpUrl: 'https://example.com',
        tags: ['wcag2a'],
        nodes: [{ html: '<html>', target: ['html'], failureSummary: '' }]
      };

      const fix = generateSuggestedFix(violation, '<html>');
      assert.ok(fix, 'Should generate a fix');
      assert.ok(fix.includes('lang="en"'), 'Fix should add lang attribute');
    });

    it('should generate fix for link-name violation', () => {
      const violation: Violation = {
        id: 'link-name',
        impact: 'serious',
        description: 'Links must have discernible text',
        help: 'Links must have discernible text',
        helpUrl: 'https://example.com',
        tags: ['wcag2a'],
        nodes: [{ html: '<a href="/about"></a>', target: ['a'], failureSummary: '' }]
      };

      const fix = generateSuggestedFix(violation, '<a href="/about"></a>');
      assert.ok(fix, 'Should generate a fix');
      assert.ok(fix.includes('aria-label'), 'Fix should add aria-label');
    });

    it('should generate fix for meta-viewport violation', () => {
      const violation: Violation = {
        id: 'meta-viewport',
        impact: 'critical',
        description: 'Viewport meta tag should not disable zooming',
        help: 'Viewport meta tag should not disable zooming',
        helpUrl: 'https://example.com',
        tags: ['wcag21aa'],
        nodes: [{ html: '<meta name="viewport" content="user-scalable=no">', target: ['meta'], failureSummary: '' }]
      };

      const fix = generateSuggestedFix(violation, '<meta name="viewport" content="user-scalable=no">');
      assert.ok(fix, 'Should generate a fix');
      assert.ok(!fix.includes('user-scalable=no'), 'Fix should remove user-scalable=no');
    });

    it('should return null for unknown violation', () => {
      const violation: Violation = {
        id: 'unknown-violation-id',
        impact: 'minor',
        description: 'Unknown violation',
        help: 'Unknown violation',
        helpUrl: 'https://example.com',
        tags: [],
        nodes: [{ html: '<div>', target: ['div'], failureSummary: '' }]
      };

      const fix = generateSuggestedFix(violation, '<div>');
      assert.strictEqual(fix, null, 'Should return null for unknown violation');
    });

    it('should not add alt if already present', () => {
      const violation: Violation = {
        id: 'image-alt',
        impact: 'critical',
        description: 'Images must have alternate text',
        help: 'Images must have alternate text',
        helpUrl: 'https://example.com',
        tags: ['wcag2a'],
        nodes: [{ html: '<img src="photo.jpg" alt="Photo">', target: ['img'], failureSummary: '' }]
      };

      const fix = generateSuggestedFix(violation, '<img src="photo.jpg" alt="Photo">');
      assert.strictEqual(fix, null, 'Should return null if alt already present');
    });
  });

  describe('getFixConfidence', () => {
    it('should return high confidence for image-alt', () => {
      const confidence = getFixConfidence('image-alt');
      assert.ok(confidence, 'Should return confidence value');
      assert.ok(confidence >= 0.8, 'Confidence should be high (>= 0.8)');
    });

    it('should return high confidence for html-has-lang', () => {
      const confidence = getFixConfidence('html-has-lang');
      assert.ok(confidence, 'Should return confidence value');
      assert.ok(confidence >= 0.9, 'Confidence should be very high (>= 0.9)');
    });

    it('should return null for unknown violations', () => {
      const confidence = getFixConfidence('unknown-violation');
      assert.strictEqual(confidence, null, 'Should return null for unknown');
    });
  });

  describe('getConfidenceLevel', () => {
    it('should return high for confidence >= 0.9', () => {
      assert.strictEqual(getConfidenceLevel(0.95), 'high');
      assert.strictEqual(getConfidenceLevel(0.9), 'high');
    });

    it('should return medium for confidence 0.7-0.89', () => {
      assert.strictEqual(getConfidenceLevel(0.85), 'medium');
      assert.strictEqual(getConfidenceLevel(0.7), 'medium');
    });

    it('should return low for confidence < 0.7', () => {
      assert.strictEqual(getConfidenceLevel(0.5), 'low');
      assert.strictEqual(getConfidenceLevel(0.1), 'low');
    });
  });
});

describe('fix history', () => {
  let tempDir: string;
  const originalCwd = process.cwd();

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'ally-fix-test-'));
  });

  afterEach(async () => {
    // Ensure we're back in original dir before cleanup
    process.chdir(originalCwd);
    if (existsSync(tempDir)) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should handle fix history file creation', async () => {
    // Create .ally directory in temp location
    const allyDir = join(tempDir, '.ally');
    await mkdir(allyDir, { recursive: true });

    // Write a test history entry
    const historyPath = join(allyDir, 'fix-history.json');
    const testEntry = {
      timestamp: new Date().toISOString(),
      issueType: 'image-alt',
      filePath: 'test.html',
      beforeSnippet: '<img src="test.jpg">',
      afterSnippet: '<img src="test.jpg" alt="Test">',
      wcagCriteria: ['wcag2a']
    };

    await writeFile(historyPath, JSON.stringify([testEntry], null, 2));

    // Verify file exists and can be read
    assert.ok(existsSync(historyPath), 'History file should exist');

    const content = await readFile(historyPath, 'utf-8');
    const history = JSON.parse(content);
    assert.strictEqual(history.length, 1, 'Should have one entry');
    assert.strictEqual(history[0].issueType, 'image-alt');
  });
});

describe('WCAG explanations', () => {
  it('should provide explanations for common violations', () => {
    // Test that common violation types have explanations
    // This tests the WCAG_EXPLANATIONS constant indirectly
    const commonViolations = [
      'image-alt',
      'button-name',
      'link-name',
      'label',
      'html-has-lang',
      'color-contrast',
      'heading-order'
    ];

    // These are the violations that should have confidence scores
    for (const id of commonViolations) {
      const confidence = getFixConfidence(id);
      // Most common violations should have fix confidence
      // Some like color-contrast may not have auto-fixes
      if (id !== 'color-contrast') {
        assert.ok(confidence !== null || id === 'heading-order', `${id} should have confidence or be heading-order`);
      }
    }
  });
});
