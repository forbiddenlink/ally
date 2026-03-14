/**
 * VPAT 2.4 mappings - WCAG Success Criteria to axe-core rules
 * Used for generating VPAT/ACR compliance reports
 */

export type ConformanceLevel = 'A' | 'AA' | 'AAA';
export type ConformanceStatus = 'Supports' | 'Partially Supports' | 'Does Not Support' | 'Not Applicable' | 'Not Evaluated';
export type Testability = 'full' | 'partial' | 'manual';

export interface WcagCriterion {
  id: string;           // e.g., "1.1.1"
  name: string;         // e.g., "Non-text Content"
  level: ConformanceLevel;
  axeRules: string[];   // axe-core rule IDs that test this criterion
  testability: Testability;
  manualNote?: string;  // Guidance for manual review when testability is partial/manual
}

export interface ConformanceResult {
  criterion: WcagCriterion;
  status: ConformanceStatus;
  remarks: string;
  violationCount: number;
}

/**
 * WCAG 2.2 Level A and AA Success Criteria mapped to axe-core rules
 * Based on WCAG_COVERAGE.md analysis
 */
export const WCAG_CRITERIA: WcagCriterion[] = [
  // 1. Perceivable
  {
    id: '1.1.1',
    name: 'Non-text Content',
    level: 'A',
    axeRules: ['image-alt', 'input-image-alt', 'svg-img-alt', 'area-alt', 'object-alt', 'role-img-alt'],
    testability: 'full',
  },
  {
    id: '1.2.1',
    name: 'Audio-only and Video-only (Prerecorded)',
    level: 'A',
    axeRules: ['video-caption'],
    testability: 'partial',
    manualNote: 'Verify audio alternatives and transcripts are provided',
  },
  {
    id: '1.2.2',
    name: 'Captions (Prerecorded)',
    level: 'A',
    axeRules: ['video-caption'],
    testability: 'partial',
    manualNote: 'Verify caption accuracy and synchronization',
  },
  {
    id: '1.2.3',
    name: 'Audio Description or Media Alternative (Prerecorded)',
    level: 'A',
    axeRules: [],
    testability: 'manual',
    manualNote: 'Verify audio description or text alternative is provided for video content',
  },
  {
    id: '1.2.4',
    name: 'Captions (Live)',
    level: 'AA',
    axeRules: [],
    testability: 'manual',
    manualNote: 'Verify live captions are provided for live audio content',
  },
  {
    id: '1.2.5',
    name: 'Audio Description (Prerecorded)',
    level: 'AA',
    axeRules: [],
    testability: 'manual',
    manualNote: 'Verify audio description is provided for video content',
  },
  {
    id: '1.3.1',
    name: 'Info and Relationships',
    level: 'A',
    axeRules: ['label', 'list', 'listitem', 'definition-list', 'dlitem', 'landmark-one-main', 'landmark-no-duplicate-main', 'region', 'th-has-data-cells', 'td-headers-attr', 'table-fake-caption', 'scope-attr-valid'],
    testability: 'full',
  },
  {
    id: '1.3.2',
    name: 'Meaningful Sequence',
    level: 'A',
    axeRules: [],
    testability: 'manual',
    manualNote: 'Verify reading order matches visual presentation',
  },
  {
    id: '1.3.3',
    name: 'Sensory Characteristics',
    level: 'A',
    axeRules: [],
    testability: 'manual',
    manualNote: 'Verify instructions do not rely solely on shape, size, location, or sound',
  },
  {
    id: '1.3.4',
    name: 'Orientation',
    level: 'AA',
    axeRules: ['meta-viewport'],
    testability: 'partial',
    manualNote: 'Verify content is not restricted to a single orientation',
  },
  {
    id: '1.3.5',
    name: 'Identify Input Purpose',
    level: 'AA',
    axeRules: ['autocomplete-valid'],
    testability: 'full',
  },
  {
    id: '1.4.1',
    name: 'Use of Color',
    level: 'A',
    axeRules: ['link-in-text-block'],
    testability: 'partial',
    manualNote: 'Verify color is not the only visual means of conveying information',
  },
  {
    id: '1.4.2',
    name: 'Audio Control',
    level: 'A',
    axeRules: [],
    testability: 'manual',
    manualNote: 'Verify auto-playing audio can be paused or stopped',
  },
  {
    id: '1.4.3',
    name: 'Contrast (Minimum)',
    level: 'AA',
    axeRules: ['color-contrast'],
    testability: 'full',
  },
  {
    id: '1.4.4',
    name: 'Resize Text',
    level: 'AA',
    axeRules: ['meta-viewport'],
    testability: 'partial',
    manualNote: 'Verify text can be resized to 200% without loss of content',
  },
  {
    id: '1.4.5',
    name: 'Images of Text',
    level: 'AA',
    axeRules: [],
    testability: 'manual',
    manualNote: 'Verify text is used instead of images of text where possible',
  },
  {
    id: '1.4.10',
    name: 'Reflow',
    level: 'AA',
    axeRules: [],
    testability: 'manual',
    manualNote: 'Verify content reflows at 320px width without horizontal scrolling',
  },
  {
    id: '1.4.11',
    name: 'Non-text Contrast',
    level: 'AA',
    axeRules: [],
    testability: 'manual',
    manualNote: 'Verify UI components and graphics have 3:1 contrast ratio',
  },
  {
    id: '1.4.12',
    name: 'Text Spacing',
    level: 'AA',
    axeRules: [],
    testability: 'manual',
    manualNote: 'Verify content adapts to increased text spacing without loss',
  },
  {
    id: '1.4.13',
    name: 'Content on Hover or Focus',
    level: 'AA',
    axeRules: [],
    testability: 'manual',
    manualNote: 'Verify hover/focus content is dismissible, hoverable, and persistent',
  },

  // 2. Operable
  {
    id: '2.1.1',
    name: 'Keyboard',
    level: 'A',
    axeRules: ['focusable-content', 'scrollable-region-focusable', 'nested-interactive'],
    testability: 'partial',
    manualNote: 'Verify all functionality is available via keyboard',
  },
  {
    id: '2.1.2',
    name: 'No Keyboard Trap',
    level: 'A',
    axeRules: [],
    testability: 'manual',
    manualNote: 'Verify keyboard focus can be moved away from all components',
  },
  {
    id: '2.1.4',
    name: 'Character Key Shortcuts',
    level: 'A',
    axeRules: [],
    testability: 'manual',
    manualNote: 'Verify character key shortcuts can be turned off or remapped',
  },
  {
    id: '2.2.1',
    name: 'Timing Adjustable',
    level: 'A',
    axeRules: ['meta-refresh'],
    testability: 'partial',
    manualNote: 'Verify time limits can be turned off, adjusted, or extended',
  },
  {
    id: '2.2.2',
    name: 'Pause, Stop, Hide',
    level: 'A',
    axeRules: [],
    testability: 'manual',
    manualNote: 'Verify auto-updating content can be paused, stopped, or hidden',
  },
  {
    id: '2.3.1',
    name: 'Three Flashes or Below Threshold',
    level: 'A',
    axeRules: [],
    testability: 'manual',
    manualNote: 'Verify content does not flash more than 3 times per second',
  },
  {
    id: '2.4.1',
    name: 'Bypass Blocks',
    level: 'A',
    axeRules: ['bypass', 'frame-title', 'frame-title-unique'],
    testability: 'full',
  },
  {
    id: '2.4.2',
    name: 'Page Titled',
    level: 'A',
    axeRules: ['document-title'],
    testability: 'full',
  },
  {
    id: '2.4.3',
    name: 'Focus Order',
    level: 'A',
    axeRules: ['focus-order-semantics', 'tabindex'],
    testability: 'partial',
    manualNote: 'Verify focus order preserves meaning and operability',
  },
  {
    id: '2.4.4',
    name: 'Link Purpose (In Context)',
    level: 'A',
    axeRules: ['link-name'],
    testability: 'full',
  },
  {
    id: '2.4.5',
    name: 'Multiple Ways',
    level: 'AA',
    axeRules: [],
    testability: 'manual',
    manualNote: 'Verify multiple ways to locate pages are available',
  },
  {
    id: '2.4.6',
    name: 'Headings and Labels',
    level: 'AA',
    axeRules: ['heading-order', 'empty-heading', 'empty-table-header', 'label'],
    testability: 'partial',
    manualNote: 'Verify headings and labels are descriptive',
  },
  {
    id: '2.4.7',
    name: 'Focus Visible',
    level: 'AA',
    axeRules: [],
    testability: 'manual',
    manualNote: 'Verify keyboard focus indicator is visible',
  },
  {
    id: '2.4.11',
    name: 'Focus Not Obscured (Minimum)',
    level: 'AA',
    axeRules: [],
    testability: 'manual',
    manualNote: 'Verify focused element is not entirely hidden by other content',
  },
  {
    id: '2.5.1',
    name: 'Pointer Gestures',
    level: 'A',
    axeRules: [],
    testability: 'manual',
    manualNote: 'Verify multipoint/path-based gestures have single-pointer alternatives',
  },
  {
    id: '2.5.2',
    name: 'Pointer Cancellation',
    level: 'A',
    axeRules: [],
    testability: 'manual',
    manualNote: 'Verify down-event is not used to execute functions',
  },
  {
    id: '2.5.3',
    name: 'Label in Name',
    level: 'A',
    axeRules: ['label-title-only'],
    testability: 'partial',
    manualNote: 'Verify accessible name contains visible label text',
  },
  {
    id: '2.5.4',
    name: 'Motion Actuation',
    level: 'A',
    axeRules: [],
    testability: 'manual',
    manualNote: 'Verify motion-triggered functions have UI alternatives',
  },
  {
    id: '2.5.7',
    name: 'Dragging Movements',
    level: 'AA',
    axeRules: [],
    testability: 'manual',
    manualNote: 'Verify dragging operations have single-pointer alternatives',
  },
  {
    id: '2.5.8',
    name: 'Target Size (Minimum)',
    level: 'AA',
    axeRules: ['target-size'],
    testability: 'partial',
    manualNote: 'Verify targets are at least 24x24 CSS pixels',
  },

  // 3. Understandable
  {
    id: '3.1.1',
    name: 'Language of Page',
    level: 'A',
    axeRules: ['html-has-lang', 'html-lang-valid'],
    testability: 'full',
  },
  {
    id: '3.1.2',
    name: 'Language of Parts',
    level: 'AA',
    axeRules: ['valid-lang'],
    testability: 'full',
  },
  {
    id: '3.2.1',
    name: 'On Focus',
    level: 'A',
    axeRules: [],
    testability: 'manual',
    manualNote: 'Verify focus does not cause unexpected context changes',
  },
  {
    id: '3.2.2',
    name: 'On Input',
    level: 'A',
    axeRules: [],
    testability: 'manual',
    manualNote: 'Verify input does not cause unexpected context changes',
  },
  {
    id: '3.2.3',
    name: 'Consistent Navigation',
    level: 'AA',
    axeRules: [],
    testability: 'manual',
    manualNote: 'Verify navigation is consistent across pages',
  },
  {
    id: '3.2.4',
    name: 'Consistent Identification',
    level: 'AA',
    axeRules: [],
    testability: 'manual',
    manualNote: 'Verify components with same function are identified consistently',
  },
  {
    id: '3.2.6',
    name: 'Consistent Help',
    level: 'A',
    axeRules: [],
    testability: 'manual',
    manualNote: 'Verify help mechanisms appear in consistent locations',
  },
  {
    id: '3.3.1',
    name: 'Error Identification',
    level: 'A',
    axeRules: [],
    testability: 'manual',
    manualNote: 'Verify input errors are identified and described in text',
  },
  {
    id: '3.3.2',
    name: 'Labels or Instructions',
    level: 'A',
    axeRules: ['label', 'select-name', 'input-button-name'],
    testability: 'full',
  },
  {
    id: '3.3.3',
    name: 'Error Suggestion',
    level: 'AA',
    axeRules: [],
    testability: 'manual',
    manualNote: 'Verify error corrections are suggested when known',
  },
  {
    id: '3.3.4',
    name: 'Error Prevention (Legal, Financial, Data)',
    level: 'AA',
    axeRules: [],
    testability: 'manual',
    manualNote: 'Verify submissions are reversible, checked, or confirmed',
  },
  {
    id: '3.3.7',
    name: 'Redundant Entry',
    level: 'A',
    axeRules: [],
    testability: 'manual',
    manualNote: 'Verify previously entered information is auto-populated or available',
  },
  {
    id: '3.3.8',
    name: 'Accessible Authentication (Minimum)',
    level: 'AA',
    axeRules: [],
    testability: 'manual',
    manualNote: 'Verify authentication does not require cognitive function tests',
  },

  // 4. Robust
  {
    id: '4.1.2',
    name: 'Name, Role, Value',
    level: 'A',
    axeRules: ['button-name', 'aria-allowed-attr', 'aria-hidden-body', 'aria-hidden-focus', 'aria-required-attr', 'aria-required-children', 'aria-required-parent', 'aria-roles', 'aria-valid-attr', 'aria-valid-attr-value'],
    testability: 'full',
  },
  {
    id: '4.1.3',
    name: 'Status Messages',
    level: 'AA',
    axeRules: ['aria-live-region-has-description'],
    testability: 'partial',
    manualNote: 'Verify status messages are announced by screen readers',
  },
];

/**
 * Get criteria filtered by conformance level
 */
export function getCriteriaByLevel(maxLevel: ConformanceLevel): WcagCriterion[] {
  const levels: ConformanceLevel[] = maxLevel === 'AAA' ? ['A', 'AA', 'AAA'] : maxLevel === 'AA' ? ['A', 'AA'] : ['A'];
  return WCAG_CRITERIA.filter(c => levels.includes(c.level));
}

/**
 * Determine conformance status for a criterion based on scan results
 */
export function getConformanceStatus(
  criterion: WcagCriterion,
  violationIds: Set<string>,
): ConformanceResult {
  // Check if any axe rules for this criterion have violations
  const hasViolations = criterion.axeRules.some(rule => violationIds.has(rule));
  const violationCount = criterion.axeRules.filter(rule => violationIds.has(rule)).length;

  if (criterion.testability === 'manual') {
    return {
      criterion,
      status: 'Not Evaluated',
      remarks: criterion.manualNote || 'Requires manual testing',
      violationCount: 0,
    };
  }

  if (criterion.testability === 'partial') {
    if (hasViolations) {
      return {
        criterion,
        status: 'Does Not Support',
        remarks: `Automated testing found violations. ${criterion.manualNote || 'Additional manual review recommended.'}`,
        violationCount,
      };
    }
    return {
      criterion,
      status: 'Partially Supports',
      remarks: `No automated violations found. ${criterion.manualNote || 'Manual verification required for full conformance.'}`,
      violationCount: 0,
    };
  }

  // Full testability
  if (hasViolations) {
    return {
      criterion,
      status: 'Does Not Support',
      remarks: 'Automated testing detected accessibility violations',
      violationCount,
    };
  }

  return {
    criterion,
    status: 'Supports',
    remarks: 'No issues detected by automated testing',
    violationCount: 0,
  };
}

/**
 * Generate full conformance report from scan violations
 */
export function generateConformanceReport(
  violationIds: string[],
  level: ConformanceLevel = 'AA',
): ConformanceResult[] {
  const violationSet = new Set(violationIds);
  const criteria = getCriteriaByLevel(level);
  return criteria.map(criterion => getConformanceStatus(criterion, violationSet));
}
