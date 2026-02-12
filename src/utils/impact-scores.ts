/**
 * Impact Scoring System
 * 
 * Scores accessibility violations by real-world user impact and business cost.
 * Research shows developers are overwhelmed by violations - impact scoring
 * helps prioritize what actually matters.
 */

import type { Violation } from '../types/index.js';

export interface ImpactScore {
  score: number;              // 0-100 (100 = highest user impact)
  reasoning: string;          // Why this matters
  affectedUsers: string[];    // User groups affected
  businessImpact: 'critical' | 'high' | 'medium' | 'low';
  estimatedUsers: string;     // % of users affected
  wcagLevel: 'A' | 'AA' | 'AAA';
}

export interface PageContext {
  pageType?: 'landing' | 'checkout' | 'form' | 'content' | 'navigation' | 'dashboard';
  hasForm?: boolean;
  hasCheckout?: boolean;
  isNavigation?: boolean;
}

/**
 * Base impact scores for violation types (0-100)
 * Based on real-world user impact data
 */
const BASE_IMPACT_SCORES: Record<string, number> = {
  // CRITICAL - Blocks core functionality (95-100)
  'button-name': 98,          // Can't use buttons at all
  'label': 97,                // Can't complete forms
  'link-name': 96,            // Can't navigate
  'aria-required-parent': 95, // Breaks component completely
  'aria-required-children': 95,
  'keyboard-trap': 100,       // Completely stuck
  
  // HIGH - Severely impacts usability (75-94)
  'html-has-lang': 89,        // Screen reader uses wrong language
  'frame-title': 88,          // Can't understand iframe content
  'form-field-multiple-labels': 87,
  'duplicate-id-active': 86,  // Focus management broken
  'aria-hidden-focus': 85,    // Can focus hidden elements
  'select-name': 84,
  'bypass': 83,               // Must tab through entire nav
  
  // MEDIUM - Reduces accessibility (40-74)
  'image-alt': 72,            // Can't understand images
  'color-contrast': 70,       // Hard to read text
  'heading-order': 65,        // Confusing structure
  'landmark-one-main': 63,    // Can't find main content
  'meta-viewport': 62,        // Can't zoom
  'document-title': 60,       // Don't know what page
  'list': 58,
  'listitem': 58,
  'definition-list': 55,
  'dlitem': 55,
  
  // LOW - Best practice violations (0-39)
  'region': 35,               // Missing landmarks
  'aria-allowed-attr': 32,    // Invalid ARIA (still works)
  'aria-valid-attr-value': 30,
  'meta-refresh': 28,         // Annoying but not blocking
  'tabindex': 25,             // Non-standard tab order
  'accesskeys': 20,           // Rarely used feature
  'empty-heading': 18,        // Confusing but not blocking
  'p-as-heading': 15,         // Semantic issue
};

/**
 * Context multipliers adjust score based on page type
 */
const CONTEXT_MULTIPLIERS: Record<string, Record<string, number>> = {
  'button-name': {
    checkout: 1.5,     // Critical in checkout flow
    form: 1.3,
    navigation: 1.2,
    default: 1.0,
  },
  'label': {
    checkout: 1.5,     // Can't complete purchase
    form: 1.4,
    default: 1.0,
  },
  'link-name': {
    navigation: 1.3,   // Critical for navigation
    landing: 1.2,
    default: 1.0,
  },
  'color-contrast': {
    checkout: 1.3,     // Must read CTA buttons
    form: 1.2,
    default: 1.0,
  },
};

/**
 * User impact data - who is affected by each violation
 */
const AFFECTED_USERS: Record<string, string[]> = {
  'button-name': ['Screen reader users', 'Voice control users'],
  'label': ['Screen reader users', 'Voice control users', 'Cognitive disabilities'],
  'link-name': ['Screen reader users', 'Voice control users'],
  'image-alt': ['Screen reader users', 'Users on slow connections'],
  'color-contrast': ['Low vision users', 'Color blind users', 'Users in bright sunlight'],
  'html-has-lang': ['Screen reader users', 'Translation tool users'],
  'keyboard-trap': ['Keyboard-only users', 'Motor disabilities', 'Power users'],
  'bypass': ['Keyboard-only users', 'Screen reader users'],
  'heading-order': ['Screen reader users', 'Cognitive disabilities'],
  'frame-title': ['Screen reader users'],
  'meta-viewport': ['Mobile users', 'Low vision users'],
  'document-title': ['Screen reader users', 'Multiple tab users'],
  'region': ['Screen reader users'],
  'landmark-one-main': ['Screen reader users'],
  'aria-hidden-focus': ['Keyboard-only users', 'Screen reader users'],
  'select-name': ['Screen reader users', 'Voice control users'],
  'aria-required-parent': ['Screen reader users'],
  'aria-required-children': ['Screen reader users'],
  'duplicate-id-active': ['Screen reader users', 'Keyboard-only users'],
  'form-field-multiple-labels': ['Screen reader users', 'Voice control users'],
  'list': ['Screen reader users'],
  'listitem': ['Screen reader users'],
  'definition-list': ['Screen reader users'],
  'dlitem': ['Screen reader users'],
  'tabindex': ['Keyboard-only users'],
  'meta-refresh': ['Screen reader users', 'Cognitive disabilities'],
  'p-as-heading': ['Screen reader users'],
  'empty-heading': ['Screen reader users'],
  'accesskeys': ['Keyboard-only users'],
  'aria-allowed-attr': ['Screen reader users'],
  'aria-valid-attr-value': ['Screen reader users'],
};

/**
 * Business impact reasoning templates
 */
const BUSINESS_REASONING: Record<string, string> = {
  'button-name': 'Users cannot activate buttons, blocking core actions like "Submit", "Buy Now", or "Sign Up"',
  'label': 'Users cannot complete forms, preventing account creation, checkout, or data submission',
  'link-name': 'Users cannot navigate your site, unable to determine link destinations or purposes',
  'image-alt': 'Users miss critical visual information, including product images, diagrams, or icons',
  'color-contrast': 'Text is illegible for users with low vision or in bright environments',
  'html-has-lang': 'Screen readers pronounce content incorrectly, making text unintelligible',
  'keyboard-trap': 'Users become stuck in UI elements and cannot escape to continue browsing',
  'bypass': 'Users must tab through dozens of navigation links before reaching main content',
  'heading-order': 'Page structure is confusing, making content difficult to navigate and understand',
  'frame-title': 'Users cannot understand iframe content purpose without entering the iframe',
  'meta-viewport': 'Users cannot zoom text to readable size on mobile devices',
  'document-title': 'Users cannot identify page in browser tabs or history',
  'region': 'Users cannot quickly navigate to different page sections',
  'landmark-one-main': 'Users cannot quickly jump to main content area',
  'aria-hidden-focus': 'Hidden elements receive focus, confusing keyboard navigation',
  'select-name': 'Users cannot identify dropdown purpose or make selections confidently',
};

/**
 * Estimated percentage of users affected
 */
const ESTIMATED_USER_IMPACT: Record<string, string> = {
  'button-name': '15-20% of users',
  'label': '15-20% of users',
  'link-name': '15-20% of users',
  'image-alt': '10-15% of users',
  'color-contrast': '20-30% of users',
  'html-has-lang': '10-15% of users',
  'keyboard-trap': '8-12% of users',
  'bypass': '8-12% of users',
  'heading-order': '10-15% of users',
  'frame-title': '5-10% of users',
  'meta-viewport': '15-25% of users',
  'document-title': '10-15% of users',
  'default': '5-15% of users',
};

/**
 * Calculate WCAG level for violation
 */
function getWCAGLevel(violation: Violation): 'A' | 'AA' | 'AAA' {
  const tags = violation.tags || [];
  
  if (tags.includes('wcag2aaa') || tags.includes('wcag21aaa') || tags.includes('wcag22aaa')) {
    return 'AAA';
  }
  if (tags.includes('wcag2aa') || tags.includes('wcag21aa') || tags.includes('wcag22aa')) {
    return 'AA';
  }
  return 'A';
}

/**
 * Detect page context from HTML content
 */
export function detectPageContext(html: string): PageContext {
  const hasCheckoutKeywords = /checkout|cart|payment|order|purchase/i.test(html);
  const hasFormKeywords = /<form|<input|<select|<textarea/i.test(html);
  const hasNavKeywords = /<nav|navigation|menu/i.test(html);
  
  let pageType: PageContext['pageType'] = 'content';
  
  if (hasCheckoutKeywords) {
    pageType = 'checkout';
  } else if (hasFormKeywords) {
    pageType = 'form';
  } else if (hasNavKeywords) {
    pageType = 'navigation';
  }
  
  return {
    pageType,
    hasForm: hasFormKeywords,
    hasCheckout: hasCheckoutKeywords,
    isNavigation: hasNavKeywords,
  };
}

/**
 * Calculate impact score for a violation
 */
export function calculateImpactScore(
  violation: Violation,
  context: PageContext = {}
): ImpactScore {
  const violationId = violation.id;
  
  // Get base score (default to 50 for unknown violations)
  const baseScore = BASE_IMPACT_SCORES[violationId] || 50;
  
  // Get context multiplier
  const pageType = context.pageType || 'default';
  const multipliers = CONTEXT_MULTIPLIERS[violationId] || {};
  const multiplier = multipliers[pageType] || multipliers.default || 1.0;
  
  // Calculate final score (capped at 100)
  const score = Math.min(100, Math.round(baseScore * multiplier));
  
  // Determine business impact category
  let businessImpact: ImpactScore['businessImpact'];
  if (score >= 95) {
    businessImpact = 'critical';
  } else if (score >= 75) {
    businessImpact = 'high';
  } else if (score >= 40) {
    businessImpact = 'medium';
  } else {
    businessImpact = 'low';
  }
  
  // Get affected user groups
  const affectedUsers = AFFECTED_USERS[violationId] || ['Assistive technology users'];
  
  // Get or generate reasoning
  const reasoning = BUSINESS_REASONING[violationId] || 
    `${violation.help}. This affects user experience for people using assistive technologies.`;
  
  // Get estimated user impact
  const estimatedUsers = ESTIMATED_USER_IMPACT[violationId] || ESTIMATED_USER_IMPACT.default;
  
  // Get WCAG level
  const wcagLevel = getWCAGLevel(violation);
  
  return {
    score,
    reasoning,
    affectedUsers,
    businessImpact,
    estimatedUsers,
    wcagLevel,
  };
}

/**
 * Sort violations by impact score (highest first)
 */
export function sortByImpact(
  violations: Violation[],
  context: PageContext = {}
): Array<{ violation: Violation; impact: ImpactScore }> {
  const scored = violations.map((violation) => ({
    violation,
    impact: calculateImpactScore(violation, context),
  }));
  
  return scored.sort((a, b) => b.impact.score - a.impact.score);
}

/**
 * Group violations by impact category
 */
export function groupByImpact(
  violations: Violation[],
  context: PageContext = {}
): Record<string, Array<{ violation: Violation; impact: ImpactScore }>> {
  const sorted = sortByImpact(violations, context);
  
  const groups: Record<string, Array<{ violation: Violation; impact: ImpactScore }>> = {
    critical: [],
    high: [],
    medium: [],
    low: [],
  };
  
  for (const item of sorted) {
    groups[item.impact.businessImpact].push(item);
  }
  
  return groups;
}
