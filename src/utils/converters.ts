/**
 * Format converters for accessibility reports
 * Converts AllyReport to various output formats (SARIF, JUnit, CSV)
 */

import { relative } from 'path';
import type { AllyReport, Violation, Severity } from '../types/index.js';

// SARIF 2.1.0 types
export interface SarifReport {
  $schema: string;
  version: string;
  runs: SarifRun[];
}

interface SarifRun {
  tool: {
    driver: {
      name: string;
      version: string;
      informationUri: string;
      rules: SarifRule[];
    };
  };
  results: SarifResult[];
}

interface SarifRule {
  id: string;
  name: string;
  shortDescription: { text: string };
  fullDescription: { text: string };
  helpUri: string;
  defaultConfiguration: {
    level: 'error' | 'warning' | 'note';
  };
  properties?: {
    tags?: string[];
  };
}

interface SarifResult {
  ruleId: string;
  ruleIndex: number;
  level: 'error' | 'warning' | 'note';
  message: { text: string };
  locations: SarifLocation[];
}

interface SarifLocation {
  physicalLocation: {
    artifactLocation: {
      uri: string;
      uriBaseId?: string;
    };
    region?: {
      startLine?: number;
      startColumn?: number;
      snippet?: { text: string };
    };
  };
}

/**
 * Map axe-core severity to SARIF level
 */
function severityToSarifLevel(severity: Severity): 'error' | 'warning' | 'note' {
  switch (severity) {
    case 'critical':
    case 'serious':
      return 'error';
    case 'moderate':
      return 'warning';
    case 'minor':
    default:
      return 'note';
  }
}

/**
 * Convert AllyReport to SARIF 2.1.0 format for GitHub Code Scanning integration
 */
export function convertToSarif(report: AllyReport): SarifReport {
  // Collect unique rules from all violations
  const ruleMap = new Map<string, { violation: Violation; severity: Severity }>();

  for (const result of report.results) {
    for (const violation of result.violations) {
      if (!ruleMap.has(violation.id)) {
        ruleMap.set(violation.id, { violation, severity: violation.impact });
      }
    }
  }

  // Build rules array
  const rules: SarifRule[] = [];
  const ruleIndexMap = new Map<string, number>();

  Array.from(ruleMap.entries()).forEach(([ruleId, { violation, severity }]) => {
    ruleIndexMap.set(ruleId, rules.length);
    rules.push({
      id: ruleId,
      name: ruleId,
      shortDescription: { text: violation.help },
      fullDescription: { text: violation.description },
      helpUri: violation.helpUrl,
      defaultConfiguration: {
        level: severityToSarifLevel(severity),
      },
      properties: {
        tags: violation.tags,
      },
    });
  });

  // Build results array
  const results: SarifResult[] = [];

  for (const scanResult of report.results) {
    const fileUri = scanResult.file
      ? relative(process.cwd(), scanResult.file)
      : scanResult.url;

    for (const violation of scanResult.violations) {
      const ruleIndex = ruleIndexMap.get(violation.id) ?? 0;

      // Create a result for each affected node
      for (const node of violation.nodes) {
        const locations: SarifLocation[] = [
          {
            physicalLocation: {
              artifactLocation: {
                uri: fileUri,
                uriBaseId: '%SRCROOT%',
              },
              region: {
                startLine: 1, // Line info not available from axe-core
                snippet: { text: node.html },
              },
            },
          },
        ];

        results.push({
          ruleId: violation.id,
          ruleIndex,
          level: severityToSarifLevel(violation.impact),
          message: {
            text: `${violation.help}. ${node.failureSummary}`,
          },
          locations,
        });
      }
    }
  }

  return {
    $schema:
      'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'ally',
            version: '1.0.0',
            informationUri: 'https://github.com/forbiddenlink/ally',
            rules,
          },
        },
        results,
      },
    ],
  };
}

/**
 * Escape XML special characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Convert AllyReport to JUnit XML format for CI/CD tools (Jenkins, GitLab, etc.)
 * Each violation is represented as a test failure
 */
export function convertToJunit(report: AllyReport): string {
  // Count total tests (violations) and failures
  let totalTests = 0;
  let totalFailures = 0;

  // Collect all violations with their file context
  const testcases: string[] = [];

  for (const result of report.results) {
    const fileUri = result.file
      ? relative(process.cwd(), result.file)
      : result.url || 'unknown';

    for (const violation of result.violations) {
      for (const node of violation.nodes) {
        totalTests++;
        totalFailures++;

        const wcagTags = violation.tags.filter(t => t.startsWith('wcag')).join(', ');
        const failureMessage = escapeXml(`${violation.help}. ${node.failureSummary || ''}`);
        const failureDetails = escapeXml(
          `File: ${fileUri}\n` +
          `Selector: ${node.target.join(' > ')}\n` +
          `HTML: ${node.html}\n` +
          `WCAG: ${wcagTags}\n` +
          `Help: ${violation.helpUrl}`
        );

        testcases.push(
          `    <testcase name="${escapeXml(violation.id)}" classname="${escapeXml(violation.impact)}" time="0">\n` +
          `      <failure message="${failureMessage}" type="${escapeXml(violation.impact)}">\n` +
          `${failureDetails}\n` +
          `      </failure>\n` +
          `    </testcase>`
        );
      }
    }
  }

  // Build the JUnit XML
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites name="ally-a11y" tests="${totalTests}" failures="${totalFailures}" errors="0" time="0">`,
    `  <testsuite name="accessibility" tests="${totalTests}" failures="${totalFailures}" errors="0" skipped="0" time="0">`,
    ...testcases,
    '  </testsuite>',
    '</testsuites>',
  ].join('\n');

  return xml;
}

/**
 * Escape a value for CSV output
 */
function escapeCsv(value: string): string {
  // If value contains comma, quote, or newline, wrap in quotes and escape internal quotes
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

/**
 * Convert AllyReport to CSV format
 * Headers: file,violation_id,impact,description,selector,wcag,help_url
 */
export function convertToCsv(report: AllyReport): string {
  const headers = ['file', 'violation_id', 'impact', 'description', 'selector', 'wcag', 'help_url'];
  const rows: string[] = [headers.join(',')];

  for (const result of report.results) {
    const fileUri = result.file
      ? relative(process.cwd(), result.file)
      : result.url || 'unknown';

    for (const violation of result.violations) {
      const wcagTags = violation.tags.filter(t => t.startsWith('wcag')).join('; ');

      for (const node of violation.nodes) {
        const row = [
          escapeCsv(fileUri),
          escapeCsv(violation.id),
          escapeCsv(violation.impact),
          escapeCsv(violation.help),
          escapeCsv(node.target.join(' > ')),
          escapeCsv(wcagTags),
          escapeCsv(violation.helpUrl),
        ];
        rows.push(row.join(','));
      }
    }
  }

  return rows.join('\n');
}
