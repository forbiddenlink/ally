/**
 * Tests for VPAT mappings and template generation
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  WCAG_CRITERIA,
  getCriteriaByLevel,
  getConformanceStatus,
  generateConformanceReport,
} from '../dist/utils/vpat-mappings.js';
import { generateVpatHtml, calculateSummary } from '../dist/utils/vpat-template.js';

describe('VPAT mappings', () => {
  describe('WCAG_CRITERIA', () => {
    it('should include all Level A criteria', () => {
      const levelA = WCAG_CRITERIA.filter(c => c.level === 'A');
      assert.ok(levelA.length > 0, 'Should have Level A criteria');

      // Check some key Level A criteria exist
      const ids = levelA.map(c => c.id);
      assert.ok(ids.includes('1.1.1'), 'Should include 1.1.1 Non-text Content');
      assert.ok(ids.includes('2.1.1'), 'Should include 2.1.1 Keyboard');
      assert.ok(ids.includes('3.1.1'), 'Should include 3.1.1 Language of Page');
      assert.ok(ids.includes('4.1.2'), 'Should include 4.1.2 Name, Role, Value');
    });

    it('should include all Level AA criteria', () => {
      const levelAA = WCAG_CRITERIA.filter(c => c.level === 'AA');
      assert.ok(levelAA.length > 0, 'Should have Level AA criteria');

      // Check some key Level AA criteria exist
      const ids = levelAA.map(c => c.id);
      assert.ok(ids.includes('1.4.3'), 'Should include 1.4.3 Contrast');
      assert.ok(ids.includes('2.4.6'), 'Should include 2.4.6 Headings and Labels');
      assert.ok(ids.includes('3.1.2'), 'Should include 3.1.2 Language of Parts');
    });

    it('should have axe rules for testable criteria', () => {
      const testable = WCAG_CRITERIA.filter(c => c.testability === 'full');

      for (const criterion of testable) {
        assert.ok(
          criterion.axeRules.length > 0,
          `Criterion ${criterion.id} should have axe rules`
        );
      }
    });

    it('should have manual notes for non-automatable criteria', () => {
      const manual = WCAG_CRITERIA.filter(c => c.testability === 'manual');

      for (const criterion of manual) {
        assert.ok(
          criterion.manualNote,
          `Criterion ${criterion.id} should have manual note`
        );
      }
    });
  });

  describe('getCriteriaByLevel', () => {
    it('should return only Level A for A', () => {
      const criteria = getCriteriaByLevel('A');
      assert.ok(criteria.every(c => c.level === 'A'), 'All should be Level A');
    });

    it('should return Level A and AA for AA', () => {
      const criteria = getCriteriaByLevel('AA');
      const levels = new Set(criteria.map(c => c.level));

      assert.ok(levels.has('A'), 'Should include Level A');
      assert.ok(levels.has('AA'), 'Should include Level AA');
      assert.ok(!levels.has('AAA'), 'Should not include Level AAA');
    });

    it('should return all levels for AAA', () => {
      const criteria = getCriteriaByLevel('AAA');
      const levels = new Set(criteria.map(c => c.level));

      assert.ok(levels.has('A'), 'Should include Level A');
      assert.ok(levels.has('AA'), 'Should include Level AA');
      // AAA criteria would be included if we had any
    });
  });

  describe('getConformanceStatus', () => {
    it('should return Supports when no violations for full testability', () => {
      const criterion = WCAG_CRITERIA.find(c => c.id === '1.1.1')!;
      const result = getConformanceStatus(criterion, new Set());

      assert.strictEqual(result.status, 'Supports');
      assert.ok(result.remarks.includes('No issues detected'));
    });

    it('should return Does Not Support when violations found', () => {
      const criterion = WCAG_CRITERIA.find(c => c.id === '1.1.1')!;
      const result = getConformanceStatus(criterion, new Set(['image-alt']));

      assert.strictEqual(result.status, 'Does Not Support');
      assert.ok(result.violationCount > 0);
    });

    it('should return Not Evaluated for manual criteria', () => {
      const criterion = WCAG_CRITERIA.find(c => c.testability === 'manual')!;
      const result = getConformanceStatus(criterion, new Set());

      assert.strictEqual(result.status, 'Not Evaluated');
      assert.ok(result.remarks.length > 0, 'Should have remarks for manual criteria');
    });

    it('should return Partially Supports for partial testability without violations', () => {
      const criterion = WCAG_CRITERIA.find(c => c.testability === 'partial')!;
      const result = getConformanceStatus(criterion, new Set());

      assert.strictEqual(result.status, 'Partially Supports');
    });
  });

  describe('generateConformanceReport', () => {
    it('should generate report for all AA criteria', () => {
      const results = generateConformanceReport([], 'AA');

      assert.ok(results.length > 0, 'Should have results');

      // Check we have results for different levels
      const levels = new Set(results.map(r => r.criterion.level));
      assert.ok(levels.has('A'), 'Should include Level A');
      assert.ok(levels.has('AA'), 'Should include Level AA');
    });

    it('should mark criteria with violations as failing', () => {
      const results = generateConformanceReport(['image-alt', 'color-contrast'], 'AA');

      const imageAltResult = results.find(r => r.criterion.id === '1.1.1');
      const contrastResult = results.find(r => r.criterion.id === '1.4.3');

      assert.strictEqual(imageAltResult?.status, 'Does Not Support');
      assert.strictEqual(contrastResult?.status, 'Does Not Support');
    });

    it('should mark criteria without violations as supporting', () => {
      const results = generateConformanceReport([], 'AA');

      const langResult = results.find(r => r.criterion.id === '3.1.1');
      assert.strictEqual(langResult?.status, 'Supports');
    });
  });
});

describe('VPAT template', () => {
  describe('calculateSummary', () => {
    it('should count statuses correctly', () => {
      const results = generateConformanceReport(['image-alt'], 'AA');
      const summary = calculateSummary(results);

      assert.ok(summary.supports >= 0);
      assert.ok(summary.partiallySupports >= 0);
      assert.ok(summary.doesNotSupport >= 1); // At least image-alt
      assert.ok(summary.notApplicable >= 0);
      assert.ok(summary.notEvaluated >= 0);

      // Total should match results length
      const total = summary.supports + summary.partiallySupports +
        summary.doesNotSupport + summary.notApplicable + summary.notEvaluated;
      assert.strictEqual(total, results.length);
    });
  });

  describe('generateVpatHtml', () => {
    it('should generate valid HTML', () => {
      const results = generateConformanceReport([], 'AA');
      const summary = calculateSummary(results);

      const html = generateVpatHtml({
        metadata: {
          productName: 'Test Product',
          productVersion: '1.0.0',
          vendor: 'Test Vendor',
          evaluationDate: '2024-01-15',
          evaluationMethods: ['Automated testing'],
        },
        conformanceResults: results,
        summary,
      });

      assert.ok(html.includes('<!DOCTYPE html>'), 'Should have doctype');
      assert.ok(html.includes('<html lang="en">'), 'Should have html element with lang');
      assert.ok(html.includes('</html>'), 'Should close html element');
    });

    it('should include product metadata', () => {
      const results = generateConformanceReport([], 'AA');
      const summary = calculateSummary(results);

      const html = generateVpatHtml({
        metadata: {
          productName: 'My Cool App',
          productVersion: '2.5.1',
          vendor: 'Cool Company Inc.',
          contact: 'a11y@cool.com',
          evaluationDate: '2024-03-15',
          evaluationMethods: ['Automated testing', 'Manual review'],
        },
        conformanceResults: results,
        summary,
      });

      assert.ok(html.includes('My Cool App'), 'Should include product name');
      assert.ok(html.includes('2.5.1'), 'Should include version');
      assert.ok(html.includes('Cool Company Inc.'), 'Should include vendor');
      assert.ok(html.includes('a11y@cool.com'), 'Should include contact');
    });

    it('should include WCAG tables', () => {
      const results = generateConformanceReport(['image-alt'], 'AA');
      const summary = calculateSummary(results);

      const html = generateVpatHtml({
        metadata: {
          productName: 'Test',
          productVersion: '1.0',
          vendor: 'Test',
          evaluationDate: '2024-01-01',
          evaluationMethods: ['Automated'],
        },
        conformanceResults: results,
        summary,
      });

      assert.ok(html.includes('WCAG 2.2 Level A'), 'Should have Level A table');
      assert.ok(html.includes('WCAG 2.2 Level AA'), 'Should have Level AA table');
      assert.ok(html.includes('Non-text Content'), 'Should include criterion names');
    });

    it('should include Section 508 and EN 301 549 sections', () => {
      const results = generateConformanceReport([], 'AA');
      const summary = calculateSummary(results);

      const html = generateVpatHtml({
        metadata: {
          productName: 'Test',
          productVersion: '1.0',
          vendor: 'Test',
          evaluationDate: '2024-01-01',
          evaluationMethods: ['Automated'],
        },
        conformanceResults: results,
        summary,
      });

      assert.ok(html.includes('Section 508'), 'Should have Section 508 section');
      assert.ok(html.includes('EN 301 549'), 'Should have EN 301 549 section');
    });

    it('should escape HTML in user input', () => {
      const results = generateConformanceReport([], 'AA');
      const summary = calculateSummary(results);

      const html = generateVpatHtml({
        metadata: {
          productName: '<script>alert("xss")</script>',
          productVersion: '1.0',
          vendor: 'Test & Company',
          evaluationDate: '2024-01-01',
          evaluationMethods: ['Automated'],
        },
        conformanceResults: results,
        summary,
      });

      assert.ok(!html.includes('<script>'), 'Should escape script tags');
      assert.ok(html.includes('&lt;script&gt;'), 'Should have escaped script');
      assert.ok(html.includes('Test &amp; Company'), 'Should escape ampersands');
    });
  });
});

describe('createReport', () => {
  it('should create valid report structure', () => {
    const results = generateConformanceReport([], 'AA');
    assert.ok(Array.isArray(results), 'Should return array');
    assert.ok(results.length > 0, 'Should have results');
    assert.ok(results[0].criterion, 'Each result should have criterion');
    assert.ok(results[0].status, 'Each result should have status');
    assert.ok(results[0].remarks !== undefined, 'Each result should have remarks');
  });
});
