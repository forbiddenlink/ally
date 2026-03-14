/**
 * VPAT 2.4 INT Edition HTML template generator
 * Generates accessibility conformance reports in the official VPAT format
 */

import type { ConformanceResult, ConformanceStatus } from './vpat-mappings.js';

export interface VpatMetadata {
  productName: string;
  productVersion: string;
  vendor: string;
  contact?: string;
  evaluationDate: string;
  evaluationMethods: string[];
  notes?: string;
}

interface VpatData {
  metadata: VpatMetadata;
  conformanceResults: ConformanceResult[];
  summary: {
    supports: number;
    partiallySupports: number;
    doesNotSupport: number;
    notApplicable: number;
    notEvaluated: number;
  };
}

function getStatusClass(status: ConformanceStatus): string {
  switch (status) {
    case 'Supports': return 'supports';
    case 'Partially Supports': return 'partial';
    case 'Does Not Support': return 'fails';
    case 'Not Applicable': return 'na';
    case 'Not Evaluated': return 'not-evaluated';
  }
}

function getStatusIcon(status: ConformanceStatus): string {
  switch (status) {
    case 'Supports': return '&#10004;';
    case 'Partially Supports': return '&#9679;';
    case 'Does Not Support': return '&#10008;';
    case 'Not Applicable': return '&mdash;';
    case 'Not Evaluated': return '?';
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function generateWcagTable(results: ConformanceResult[], level: 'A' | 'AA'): string {
  const filtered = results.filter(r => r.criterion.level === level);

  return filtered.map(r => `
    <tr class="${getStatusClass(r.status)}">
      <td><strong>${r.criterion.id}</strong> ${escapeHtml(r.criterion.name)}</td>
      <td class="status">${getStatusIcon(r.status)} ${r.status}</td>
      <td>${escapeHtml(r.remarks)}</td>
    </tr>
  `).join('\n');
}

export function generateVpatHtml(data: VpatData): string {
  const { metadata, conformanceResults, summary } = data;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VPAT 2.4 - ${escapeHtml(metadata.productName)}</title>
  <style>
    :root {
      --supports: #0a7b0a;
      --partial: #b86e00;
      --fails: #c41e3a;
      --na: #666;
      --not-evaluated: #666;
    }

    * { box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem;
      color: #333;
    }

    h1 { color: #1a1a1a; border-bottom: 3px solid #0066cc; padding-bottom: 0.5rem; }
    h2 { color: #333; margin-top: 2rem; border-bottom: 1px solid #ddd; padding-bottom: 0.25rem; }
    h3 { color: #444; margin-top: 1.5rem; }

    .header-info {
      background: #f8f9fa;
      border: 1px solid #dee2e6;
      border-radius: 8px;
      padding: 1.5rem;
      margin: 1rem 0 2rem;
    }

    .header-info table {
      width: 100%;
      border-collapse: collapse;
    }

    .header-info td {
      padding: 0.5rem 1rem;
      border: none;
    }

    .header-info td:first-child {
      font-weight: 600;
      width: 200px;
      color: #555;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 1rem;
      margin: 1.5rem 0;
    }

    .summary-card {
      background: #fff;
      border: 1px solid #dee2e6;
      border-radius: 8px;
      padding: 1rem;
      text-align: center;
    }

    .summary-card.supports { border-left: 4px solid var(--supports); }
    .summary-card.partial { border-left: 4px solid var(--partial); }
    .summary-card.fails { border-left: 4px solid var(--fails); }
    .summary-card.na { border-left: 4px solid var(--na); }
    .summary-card.not-evaluated { border-left: 4px solid var(--not-evaluated); }

    .summary-card .count {
      font-size: 2rem;
      font-weight: 700;
    }

    .summary-card.supports .count { color: var(--supports); }
    .summary-card.partial .count { color: var(--partial); }
    .summary-card.fails .count { color: var(--fails); }

    .summary-card .label {
      font-size: 0.875rem;
      color: #666;
    }

    table.conformance {
      width: 100%;
      border-collapse: collapse;
      margin: 1rem 0;
    }

    table.conformance th,
    table.conformance td {
      border: 1px solid #dee2e6;
      padding: 0.75rem;
      text-align: left;
      vertical-align: top;
    }

    table.conformance th {
      background: #f8f9fa;
      font-weight: 600;
    }

    table.conformance th:nth-child(1) { width: 35%; }
    table.conformance th:nth-child(2) { width: 15%; }
    table.conformance th:nth-child(3) { width: 50%; }

    table.conformance tr.supports td.status { color: var(--supports); font-weight: 600; }
    table.conformance tr.partial td.status { color: var(--partial); font-weight: 600; }
    table.conformance tr.fails td.status { color: var(--fails); font-weight: 600; }
    table.conformance tr.na td.status { color: var(--na); }
    table.conformance tr.not-evaluated td.status { color: var(--not-evaluated); font-style: italic; }

    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 1.5rem;
      margin: 1rem 0;
      padding: 1rem;
      background: #f8f9fa;
      border-radius: 8px;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.9rem;
    }

    .legend-item .icon {
      width: 1.5rem;
      text-align: center;
      font-weight: bold;
    }

    .legend-item .icon.supports { color: var(--supports); }
    .legend-item .icon.partial { color: var(--partial); }
    .legend-item .icon.fails { color: var(--fails); }

    .note {
      background: #fff3cd;
      border: 1px solid #ffc107;
      border-radius: 8px;
      padding: 1rem;
      margin: 1rem 0;
    }

    .section-508, .en-301-549 {
      background: #e7f3ff;
      border: 1px solid #0066cc;
      border-radius: 8px;
      padding: 1rem;
      margin: 1rem 0;
    }

    footer {
      margin-top: 3rem;
      padding-top: 1rem;
      border-top: 1px solid #dee2e6;
      color: #666;
      font-size: 0.875rem;
    }

    @media print {
      body { padding: 0; }
      .summary-card { break-inside: avoid; }
      table.conformance { font-size: 0.9rem; }
    }
  </style>
</head>
<body>
  <h1>Voluntary Product Accessibility Template (VPAT&reg;)</h1>
  <p><strong>Version 2.4 INT</strong> &mdash; WCAG 2.2, Revised Section 508, EN 301 549</p>

  <div class="header-info">
    <table>
      <tr>
        <td>Product Name</td>
        <td>${escapeHtml(metadata.productName)}</td>
      </tr>
      <tr>
        <td>Product Version</td>
        <td>${escapeHtml(metadata.productVersion)}</td>
      </tr>
      <tr>
        <td>Vendor</td>
        <td>${escapeHtml(metadata.vendor)}</td>
      </tr>
      ${metadata.contact ? `<tr>
        <td>Contact</td>
        <td>${escapeHtml(metadata.contact)}</td>
      </tr>` : ''}
      <tr>
        <td>Evaluation Date</td>
        <td>${escapeHtml(metadata.evaluationDate)}</td>
      </tr>
      <tr>
        <td>Evaluation Methods</td>
        <td>${metadata.evaluationMethods.map(escapeHtml).join(', ')}</td>
      </tr>
    </table>
  </div>

  ${metadata.notes ? `<div class="note"><strong>Notes:</strong> ${escapeHtml(metadata.notes)}</div>` : ''}

  <h2>Conformance Summary</h2>

  <div class="summary-grid">
    <div class="summary-card supports">
      <div class="count">${summary.supports}</div>
      <div class="label">Supports</div>
    </div>
    <div class="summary-card partial">
      <div class="count">${summary.partiallySupports}</div>
      <div class="label">Partially Supports</div>
    </div>
    <div class="summary-card fails">
      <div class="count">${summary.doesNotSupport}</div>
      <div class="label">Does Not Support</div>
    </div>
    <div class="summary-card na">
      <div class="count">${summary.notApplicable}</div>
      <div class="label">Not Applicable</div>
    </div>
    <div class="summary-card not-evaluated">
      <div class="count">${summary.notEvaluated}</div>
      <div class="label">Not Evaluated</div>
    </div>
  </div>

  <div class="legend">
    <div class="legend-item"><span class="icon supports">&#10004;</span> Supports: Fully meets the criterion</div>
    <div class="legend-item"><span class="icon partial">&#9679;</span> Partially Supports: Some aspects meet the criterion</div>
    <div class="legend-item"><span class="icon fails">&#10008;</span> Does Not Support: Does not meet the criterion</div>
    <div class="legend-item"><span class="icon">&mdash;</span> Not Applicable: Criterion not relevant</div>
    <div class="legend-item"><span class="icon">?</span> Not Evaluated: Requires manual testing</div>
  </div>

  <h2>Table 1: WCAG 2.2 Level A</h2>
  <table class="conformance">
    <thead>
      <tr>
        <th>Criteria</th>
        <th>Conformance Level</th>
        <th>Remarks and Explanations</th>
      </tr>
    </thead>
    <tbody>
      ${generateWcagTable(conformanceResults, 'A')}
    </tbody>
  </table>

  <h2>Table 2: WCAG 2.2 Level AA</h2>
  <table class="conformance">
    <thead>
      <tr>
        <th>Criteria</th>
        <th>Conformance Level</th>
        <th>Remarks and Explanations</th>
      </tr>
    </thead>
    <tbody>
      ${generateWcagTable(conformanceResults, 'AA')}
    </tbody>
  </table>

  <h2>Revised Section 508 Report</h2>
  <div class="section-508">
    <h3>Chapter 3: Functional Performance Criteria</h3>
    <p>See WCAG 2.2 Level A and AA sections above. Section 508 functional performance criteria are addressed through WCAG conformance.</p>

    <h3>Chapter 4: Hardware</h3>
    <p>Not applicable. This product is web-based software.</p>

    <h3>Chapter 5: Software</h3>
    <p>See WCAG 2.2 Level A and AA sections above. Software accessibility requirements are addressed through WCAG conformance.</p>

    <h3>Chapter 6: Support Documentation and Services</h3>
    <p>Documentation is provided in accessible formats. Support services are available via multiple channels.</p>
  </div>

  <h2>EN 301 549 Report</h2>
  <div class="en-301-549">
    <h3>Chapter 4: Functional Performance Statements</h3>
    <p>See WCAG 2.2 Level A and AA sections above. EN 301 549 functional performance statements are addressed through WCAG conformance.</p>

    <h3>Chapters 5-13: Specific Requirements</h3>
    <p>This product is web-based software. Relevant requirements from Chapters 9 (Web), 10 (Non-web documents), and 11 (Software) are addressed through WCAG 2.2 conformance detailed above.</p>

    <p>Additional EN 301 549 specific requirements:</p>
    <ul>
      <li><strong>9.2 Web content requirements:</strong> See WCAG tables above</li>
      <li><strong>11.8 Authoring tools:</strong> Not applicable unless product creates web content</li>
      <li><strong>12.1 Product documentation:</strong> Documentation available in accessible formats</li>
      <li><strong>12.2 Support services:</strong> Support available via accessible channels</li>
    </ul>
  </div>

  <footer>
    <p>
      <strong>Report generated by ally</strong> &mdash;
      <a href="https://github.com/elizabethsiegle/ally">github.com/elizabethsiegle/ally</a>
    </p>
    <p>
      This VPAT follows the ITI VPAT&reg; 2.4 INT format. VPAT is a registered trademark of the
      Information Technology Industry Council (ITI).
    </p>
    <p>
      <strong>Disclaimer:</strong> This report is based on automated testing and may not represent
      complete conformance status. Manual review is recommended for criteria marked "Not Evaluated"
      or "Partially Supports".
    </p>
  </footer>
</body>
</html>`;
}

/**
 * Calculate summary statistics from conformance results
 */
export function calculateSummary(results: ConformanceResult[]): VpatData['summary'] {
  return {
    supports: results.filter(r => r.status === 'Supports').length,
    partiallySupports: results.filter(r => r.status === 'Partially Supports').length,
    doesNotSupport: results.filter(r => r.status === 'Does Not Support').length,
    notApplicable: results.filter(r => r.status === 'Not Applicable').length,
    notEvaluated: results.filter(r => r.status === 'Not Evaluated').length,
  };
}
