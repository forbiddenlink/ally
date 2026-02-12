#!/usr/bin/env node

/**
 * Ally MCP Server
 *
 * Exposes project-specific accessibility patterns to GitHub Copilot CLI.
 * This enables Copilot to generate fixes that are consistent with your codebase.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFile, readdir, stat } from "fs/promises";
import { join, extname } from "path";
import { existsSync } from "fs";
import { APCAcontrast, sRGBtoY } from "apca-w3";

// Create server instance
const server = new McpServer({
  name: "ally-patterns",
  version: "1.0.0",
});

// Telemetry to track tool usage
const telemetry = {
  calls: new Map<string, number>(),
  lastCalled: new Map<string, Date>(),
  log(toolName: string) {
    const count = this.calls.get(toolName) || 0;
    this.calls.set(toolName, count + 1);
    this.lastCalled.set(toolName, new Date());
    console.error(`[MCP Telemetry] ${new Date().toISOString()} | ${toolName} called (${count + 1}x total)`);
  }
};

// Cache for analyzed patterns
const patternCache: Map<string, ComponentPattern[]> = new Map();
const tokenCache: Map<string, DesignTokens> = new Map();

interface ComponentPattern {
  component: string;
  file: string;
  patterns: {
    hasAriaLabel: boolean;
    hasAriaDescribedBy: boolean;
    hasRole: boolean;
    hasFocusManagement: boolean;
    hasKeyboardHandlers: boolean;
  };
  examples: string[];
}

interface DesignTokens {
  colors: ColorToken[];
  spacing: string[];
  typography: string[];
}

interface ColorToken {
  name: string;
  value: string;
  contrastRatio?: number;
  wcagAACompliant?: boolean;
  wcagAAACompliant?: boolean;
}

// Tool: Get component ARIA patterns from codebase
server.tool(
  "get_component_patterns",
  "Analyze existing ARIA patterns in React/Vue components to ensure consistent accessibility fixes",
  {
    directory: z.string().optional().describe("Directory to analyze (defaults to current directory)"),
    component: z.string().optional().describe("Specific component name to analyze"),
  },
  async ({ directory, component }) => {
    telemetry.log('get_component_patterns');
    const targetDir = directory || process.cwd();

    try {
      const patterns = await analyzeComponentPatterns(targetDir, component);

      if (patterns.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No component patterns found. This might be a new project or use a different framework.",
            },
          ],
        };
      }

      const summary = patterns.map((p) => {
        const features = [];
        if (p.patterns.hasAriaLabel) features.push("aria-label");
        if (p.patterns.hasAriaDescribedBy) features.push("aria-describedby");
        if (p.patterns.hasRole) features.push("role attributes");
        if (p.patterns.hasFocusManagement) features.push("focus management");
        if (p.patterns.hasKeyboardHandlers) features.push("keyboard handlers");

        return `## ${p.component} (${p.file})
ARIA Features: ${features.length > 0 ? features.join(", ") : "none found"}
${p.examples.length > 0 ? `\nExamples:\n${p.examples.slice(0, 2).join("\n")}` : ""}`;
      });

      return {
        content: [
          {
            type: "text" as const,
            text: `# Component ARIA Patterns\n\n${summary.join("\n\n")}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error analyzing patterns: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool: Get design tokens for contrast-safe color suggestions
server.tool(
  "get_design_tokens",
  "Extract design tokens (colors, spacing) from CSS/SCSS/Tailwind config for WCAG-compliant fixes",
  {
    directory: z.string().optional().describe("Directory to search for design tokens"),
  },
  async ({ directory }) => {
    telemetry.log('get_design_tokens');
    const targetDir = directory || process.cwd();

    try {
      const tokens = await extractDesignTokens(targetDir);

      if (!tokens.colors.length && !tokens.spacing.length) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No design tokens found. Consider using a CSS variables file or Tailwind config.",
            },
          ],
        };
      }

      const wcagCompliantColors = tokens.colors.filter((c) => c.wcagAACompliant);

      let response = "# Design Tokens\n\n";

      if (wcagCompliantColors.length > 0) {
        response += "## WCAG AA Compliant Colors\n";
        response += wcagCompliantColors
          .map((c) => `- ${c.name}: ${c.value} (contrast: ${c.contrastRatio?.toFixed(1) || "unknown"})`)
          .join("\n");
        response += "\n\n";
      }

      if (tokens.colors.length > 0) {
        response += "## All Colors\n";
        response += tokens.colors.map((c) => `- ${c.name}: ${c.value}`).join("\n");
        response += "\n\n";
      }

      if (tokens.spacing.length > 0) {
        response += "## Spacing\n";
        response += tokens.spacing.map((s) => `- ${s}`).join("\n");
      }

      return {
        content: [
          {
            type: "text" as const,
            text: response,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error extracting tokens: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool: Get previous fix history for consistency
server.tool(
  "get_fix_history",
  "Retrieve previously applied accessibility fixes to maintain consistency",
  {
    issueType: z.string().optional().describe("Filter by issue type (e.g., 'image-alt', 'button-name')"),
  },
  async ({ issueType }) => {
    telemetry.log('get_fix_history');
    try {
      const historyPath = join(process.cwd(), ".ally", "fix-history.json");

      if (!existsSync(historyPath)) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No fix history found. Run 'ally fix' to start building a history of applied fixes.",
            },
          ],
        };
      }

      const historyContent = await readFile(historyPath, "utf-8");
      const history = JSON.parse(historyContent) as FixHistoryEntry[];

      let filtered = history;
      if (issueType) {
        filtered = history.filter((h) => h.issueType === issueType);
      }

      if (filtered.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: issueType
                ? `No fixes found for issue type: ${issueType}`
                : "No fixes in history yet.",
            },
          ],
        };
      }

      const summary = filtered.slice(-10).map((h) => {
        return `- **${h.issueType}** in ${h.file}
  Before: \`${h.before.slice(0, 60)}...\`
  After: \`${h.after.slice(0, 60)}...\``;
      });

      return {
        content: [
          {
            type: "text" as const,
            text: `# Recent Fixes\n\n${summary.join("\n\n")}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error reading fix history: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool: Get scan results summary
server.tool(
  "get_scan_summary",
  "Get a summary of current accessibility issues from the latest scan",
  {},
  async () => {
    telemetry.log('get_scan_summary');
    try {
      const scanPath = join(process.cwd(), ".ally", "scan.json");

      if (!existsSync(scanPath)) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No scan results found. Run 'ally scan' first.",
            },
          ],
        };
      }

      const scanContent = await readFile(scanPath, "utf-8");
      const scan = JSON.parse(scanContent);

      const summary = `# Accessibility Scan Summary

**Score:** ${scan.summary.score}/100
**Total Issues:** ${scan.summary.totalViolations}

## By Severity
- Critical: ${scan.summary.bySeverity.critical || 0}
- Serious: ${scan.summary.bySeverity.serious || 0}
- Moderate: ${scan.summary.bySeverity.moderate || 0}
- Minor: ${scan.summary.bySeverity.minor || 0}

## Top Issues
${scan.summary.topIssues.map((i: { description: string; count: number }) => `- ${i.description} (${i.count} occurrences)`).join("\n")}`;

      return {
        content: [
          {
            type: "text" as const,
            text: summary,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error reading scan results: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

interface FixHistoryEntry {
  issueType: string;
  file: string;
  before: string;
  after: string;
  timestamp: string;
}

// WCAG Success Criteria Database
interface WcagCriterion {
  id: string;
  title: string;
  level: "A" | "AA" | "AAA";
  description: string;
  techniques: string[];
  failures: string[];
  relatedViolations: string[];
}

const wcagCriteria: Record<string, WcagCriterion> = {
  "1.1.1": {
    id: "1.1.1",
    title: "Non-text Content",
    level: "A",
    description: "All non-text content that is presented to the user has a text alternative that serves the equivalent purpose, except for controls, input, time-based media, tests, sensory experiences, CAPTCHA, and decoration.",
    techniques: [
      "G94: Providing short text alternative for non-text content",
      "G95: Providing short text alternatives that identify non-text content",
      "H37: Using alt attributes on img elements",
      "H67: Using null alt text and no title attribute for images decoration",
      "ARIA6: Using aria-label to provide labels for objects",
      "ARIA10: Using aria-labelledby to provide a text alternative for non-text content"
    ],
    failures: [
      "F3: Using CSS to include images that convey important information",
      "F20: Not updating text alternatives when non-text content changes",
      "F30: Using text alternatives that are not alternatives",
      "F38: Not marking up decorative images to be ignored by assistive technology",
      "F39: Providing a text alternative that is not null for images that should be ignored",
      "F65: Omitting the alt attribute or text alternative on img elements"
    ],
    relatedViolations: ["image-alt", "input-image-alt", "area-alt", "object-alt", "svg-img-alt"]
  },
  "1.3.1": {
    id: "1.3.1",
    title: "Info and Relationships",
    level: "A",
    description: "Information, structure, and relationships conveyed through presentation can be programmatically determined or are available in text.",
    techniques: [
      "G115: Using semantic elements to mark up structure",
      "G140: Separating information and structure from presentation",
      "H42: Using h1-h6 to identify headings",
      "H44: Using label elements to associate text labels with form controls",
      "H48: Using ol, ul and dl for lists",
      "H51: Using table markup for tabular information",
      "ARIA11: Using ARIA landmarks to identify regions of a page",
      "ARIA12: Using role=heading to identify headings"
    ],
    failures: [
      "F2: Using changes in text presentation to convey information without semantic markup",
      "F33: Using white space characters to create visual lists",
      "F34: Using white space characters to format tables",
      "F43: Failing to identify content using ARIA semantic roles",
      "F46: Failing to identify content using proper heading markup"
    ],
    relatedViolations: ["heading-order", "list", "listitem", "table-fake-caption", "td-headers-attr", "th-has-data-cells"]
  },
  "1.3.5": {
    id: "1.3.5",
    title: "Identify Input Purpose",
    level: "AA",
    description: "The purpose of each input field collecting information about the user can be programmatically determined when the input field serves a purpose identified in the Input Purposes for User Interface Components section.",
    techniques: [
      "H98: Using HTML5.2 autocomplete attributes",
      "Identify the purpose of contact information fields using autocomplete"
    ],
    failures: [
      "Failure to use autocomplete attribute when collecting user information"
    ],
    relatedViolations: ["autocomplete-valid"]
  },
  "1.4.1": {
    id: "1.4.1",
    title: "Use of Color",
    level: "A",
    description: "Color is not used as the only visual means of conveying information, indicating an action, prompting a response, or distinguishing a visual element.",
    techniques: [
      "G14: Using a non-text contrast ratio of at least 3:1",
      "G182: Ensuring that additional visual cues are available when text color differences are used",
      "G183: Using a contrast ratio of 3:1 with surrounding text and providing additional visual cues on focus for links or controls"
    ],
    failures: [
      "F13: Failure due to having a text alternative that does not include information conveyed by color differences",
      "F73: Failure due to creating links that are not visually evident without color vision",
      "F81: Failure due to identifying required or error fields using color differences only"
    ],
    relatedViolations: ["link-in-text-block"]
  },
  "1.4.3": {
    id: "1.4.3",
    title: "Contrast (Minimum)",
    level: "AA",
    description: "The visual presentation of text and images of text has a contrast ratio of at least 4.5:1, except for large text (3:1), incidental text, and logotypes.",
    techniques: [
      "G18: Ensuring a contrast ratio of at least 4.5:1 between text and background",
      "G145: Ensuring a contrast ratio of at least 3:1 for large text",
      "G174: Providing a control with sufficient contrast ratio to toggle high contrast",
      "G148: Not specifying background color and not specifying text color"
    ],
    failures: [
      "F24: Failure due to specifying foreground without specifying background colors",
      "F83: Failure due to using background images that do not provide sufficient contrast"
    ],
    relatedViolations: ["color-contrast", "color-contrast-enhanced"]
  },
  "1.4.11": {
    id: "1.4.11",
    title: "Non-text Contrast",
    level: "AA",
    description: "The visual presentation of user interface components and graphical objects have a contrast ratio of at least 3:1 against adjacent colors.",
    techniques: [
      "G195: Using an author-supplied, visible focus indicator",
      "G207: Ensuring that a contrast ratio of 3:1 is provided for icons",
      "G209: Providing sufficient contrast at the boundaries between adjoining colors"
    ],
    failures: [
      "F78: Failure due to using purely decorative elements with insufficient contrast"
    ],
    relatedViolations: ["focus-visible", "link-in-text-block"]
  },
  "2.1.1": {
    id: "2.1.1",
    title: "Keyboard",
    level: "A",
    description: "All functionality of the content is operable through a keyboard interface without requiring specific timings for individual keystrokes.",
    techniques: [
      "G202: Ensuring keyboard control for all functionality",
      "H91: Using HTML form controls and links",
      "SCR2: Using redundant keyboard and mouse event handlers",
      "SCR20: Using both keyboard and other device-specific functions"
    ],
    failures: [
      "F42: Failure due to using scripting events to emulate links without proper keyboard access",
      "F54: Failure due to using only pointing-device-specific event handlers",
      "F55: Failure due to using script to remove focus when focus is received"
    ],
    relatedViolations: ["accesskeys", "focus-order-semantics", "scrollable-region-focusable"]
  },
  "2.1.2": {
    id: "2.1.2",
    title: "No Keyboard Trap",
    level: "A",
    description: "If keyboard focus can be moved to a component using a keyboard interface, then focus can be moved away from that component using only a keyboard interface.",
    techniques: [
      "G21: Ensuring users are not trapped in content",
      "FLASH17: Providing keyboard access to a Flash object and avoiding a keyboard trap"
    ],
    failures: [
      "F10: Failure due to combining multiple content formats in a way that traps users inside one format type"
    ],
    relatedViolations: ["focus-trap"]
  },
  "2.4.1": {
    id: "2.4.1",
    title: "Bypass Blocks",
    level: "A",
    description: "A mechanism is available to bypass blocks of content that are repeated on multiple Web pages.",
    techniques: [
      "G1: Adding a skip link at the top of each page",
      "G123: Adding a link at the beginning of a block of repeated content",
      "G124: Adding links at the top of the page to each area of the content",
      "ARIA11: Using ARIA landmarks to identify regions of a page",
      "H69: Providing heading elements at the beginning of each section of content"
    ],
    failures: [
      "No specific failures defined"
    ],
    relatedViolations: ["bypass", "region", "landmark-one-main"]
  },
  "2.4.2": {
    id: "2.4.2",
    title: "Page Titled",
    level: "A",
    description: "Web pages have titles that describe topic or purpose.",
    techniques: [
      "G88: Providing descriptive titles for Web pages",
      "H25: Providing a title using the title element"
    ],
    failures: [
      "F25: Failure due to the title of a Web page not identifying the contents"
    ],
    relatedViolations: ["document-title", "page-has-heading-one"]
  },
  "2.4.3": {
    id: "2.4.3",
    title: "Focus Order",
    level: "A",
    description: "If a Web page can be navigated sequentially and the navigation sequences affect meaning or operation, focusable components receive focus in an order that preserves meaning and operability.",
    techniques: [
      "G59: Placing the interactive elements in an order that follows sequences and relationships within the content",
      "H4: Creating a logical tab order through links, form controls, and objects",
      "C27: Making the DOM order match the visual order"
    ],
    failures: [
      "F44: Failure due to using tabindex to create a tab order that does not preserve meaning and operability",
      "F85: Failure due to using dialogs or menus that are not adjacent to their trigger control in the sequence"
    ],
    relatedViolations: ["tabindex", "focus-order-semantics"]
  },
  "2.4.4": {
    id: "2.4.4",
    title: "Link Purpose (In Context)",
    level: "A",
    description: "The purpose of each link can be determined from the link text alone or from the link text together with its programmatically determined link context.",
    techniques: [
      "G91: Providing link text that describes the purpose of a link",
      "H30: Providing link text that describes the purpose of a link for anchor elements",
      "H77: Identifying the purpose of a link using link text combined with its enclosing list item",
      "ARIA7: Using aria-labelledby for link purpose",
      "ARIA8: Using aria-label for link purpose"
    ],
    failures: [
      "F63: Failure due to providing link context only in content that is not related to the link",
      "F89: Failure due to not providing an accessible name for an image which is the only content in a link"
    ],
    relatedViolations: ["link-name", "empty-links"]
  },
  "2.4.6": {
    id: "2.4.6",
    title: "Headings and Labels",
    level: "AA",
    description: "Headings and labels describe topic or purpose.",
    techniques: [
      "G130: Providing descriptive headings",
      "G131: Providing descriptive labels"
    ],
    failures: [
      "No specific failures defined"
    ],
    relatedViolations: ["empty-heading", "heading-order", "label"]
  },
  "2.4.7": {
    id: "2.4.7",
    title: "Focus Visible",
    level: "AA",
    description: "Any keyboard operable user interface has a mode of operation where the keyboard focus indicator is visible.",
    techniques: [
      "G149: Using user interface components that are highlighted by the user agent when they receive focus",
      "G165: Using the default focus indicator for the platform",
      "G195: Using an author-supplied, visible focus indicator",
      "C15: Using CSS to change the presentation of a user interface component when it receives focus"
    ],
    failures: [
      "F55: Failure due to using script to remove focus when focus is received",
      "F78: Failure due to styling element outlines and borders in a way that removes or renders non-visible the visible focus indicator"
    ],
    relatedViolations: ["focus-visible"]
  },
  "3.1.1": {
    id: "3.1.1",
    title: "Language of Page",
    level: "A",
    description: "The default human language of each Web page can be programmatically determined.",
    techniques: [
      "H57: Using the language attribute on the HTML element"
    ],
    failures: [
      "No specific failures defined"
    ],
    relatedViolations: ["html-has-lang", "html-lang-valid", "html-xml-lang-mismatch"]
  },
  "3.1.2": {
    id: "3.1.2",
    title: "Language of Parts",
    level: "AA",
    description: "The human language of each passage or phrase in the content can be programmatically determined except for proper names, technical terms, words of indeterminate language, and words or phrases that have become part of the vernacular.",
    techniques: [
      "H58: Using language attributes to identify changes in the human language"
    ],
    failures: [
      "No specific failures defined"
    ],
    relatedViolations: ["valid-lang"]
  },
  "3.3.1": {
    id: "3.3.1",
    title: "Error Identification",
    level: "A",
    description: "If an input error is automatically detected, the item that is in error is identified and the error is described to the user in text.",
    techniques: [
      "G83: Providing text descriptions to identify required fields that were not completed",
      "G84: Providing a text description when the user provides information that is not in the list of allowed values",
      "G85: Providing a text description when user input falls outside the required format or values",
      "ARIA21: Using aria-invalid to indicate an error field"
    ],
    failures: [
      "No specific failures defined"
    ],
    relatedViolations: ["aria-valid-attr-value", "aria-input-field-name"]
  },
  "3.3.2": {
    id: "3.3.2",
    title: "Labels or Instructions",
    level: "A",
    description: "Labels or instructions are provided when content requires user input.",
    techniques: [
      "G131: Providing descriptive labels",
      "H44: Using label elements to associate text labels with form controls",
      "H71: Providing a description for groups of form controls using fieldset and legend elements",
      "ARIA1: Using the aria-describedby property to provide a descriptive label for user interface controls",
      "ARIA9: Using aria-labelledby to concatenate a label from several text nodes"
    ],
    failures: [
      "F82: Failure due to visually formatting a set of phone number fields but not including a text label"
    ],
    relatedViolations: ["label", "form-field-multiple-labels", "select-name"]
  },
  "4.1.1": {
    id: "4.1.1",
    title: "Parsing",
    level: "A",
    description: "In content implemented using markup languages, elements have complete start and end tags, elements are nested according to their specifications, elements do not contain duplicate attributes, and any IDs are unique.",
    techniques: [
      "G134: Validating Web pages",
      "G192: Fully conforming to specifications",
      "H74: Ensuring that opening and closing tags are used according to specification",
      "H93: Ensuring that id attributes are unique on a Web page",
      "H94: Ensuring that elements do not contain duplicate attributes"
    ],
    failures: [
      "F70: Failure due to incorrect use of start and end tags or attribute markup",
      "F77: Failure due to duplicate values of type ID"
    ],
    relatedViolations: ["duplicate-id", "duplicate-id-active", "duplicate-id-aria"]
  },
  "4.1.2": {
    id: "4.1.2",
    title: "Name, Role, Value",
    level: "A",
    description: "For all user interface components, the name and role can be programmatically determined; states, properties, and values that can be set by the user can be programmatically set; and notification of changes to these items is available to user agents, including assistive technologies.",
    techniques: [
      "G108: Using markup features to expose the name and role",
      "H64: Using the title attribute of the iframe element",
      "H91: Using HTML form controls and links",
      "ARIA4: Using a WAI-ARIA role to expose the role of a user interface component",
      "ARIA5: Using WAI-ARIA state and property attributes to expose the state of a user interface component",
      "ARIA14: Using aria-label to provide an accessible name",
      "ARIA16: Using aria-labelledby to provide a name for user interface controls"
    ],
    failures: [
      "F15: Failure due to implementing custom controls that do not use an accessibility API",
      "F20: Failure due to not updating text alternatives when changes occur",
      "F59: Failure due to using script to make div or span a user interface control without first adding the role",
      "F68: Failure due to the association of label and user interface controls not being programmatically determined",
      "F79: Failure due to focus not being set when the state of a radio button, checkbox or select list is changed"
    ],
    relatedViolations: ["aria-allowed-attr", "aria-allowed-role", "aria-required-attr", "aria-required-children", "aria-required-parent", "aria-roles", "button-name", "input-button-name", "role-img-alt"]
  }
};

// Mapping from violation IDs to WCAG criteria
const violationToWcag: Record<string, string> = {
  "image-alt": "1.1.1",
  "input-image-alt": "1.1.1",
  "area-alt": "1.1.1",
  "object-alt": "1.1.1",
  "svg-img-alt": "1.1.1",
  "heading-order": "1.3.1",
  "list": "1.3.1",
  "listitem": "1.3.1",
  "table-fake-caption": "1.3.1",
  "td-headers-attr": "1.3.1",
  "th-has-data-cells": "1.3.1",
  "autocomplete-valid": "1.3.5",
  "link-in-text-block": "1.4.1",
  "color-contrast": "1.4.3",
  "color-contrast-enhanced": "1.4.3",
  "focus-visible": "1.4.11",
  "accesskeys": "2.1.1",
  "focus-order-semantics": "2.1.1",
  "scrollable-region-focusable": "2.1.1",
  "focus-trap": "2.1.2",
  "bypass": "2.4.1",
  "region": "2.4.1",
  "landmark-one-main": "2.4.1",
  "document-title": "2.4.2",
  "page-has-heading-one": "2.4.2",
  "tabindex": "2.4.3",
  "link-name": "2.4.4",
  "empty-links": "2.4.4",
  "empty-heading": "2.4.6",
  "label": "2.4.6",
  "duplicate-id": "4.1.1",
  "duplicate-id-active": "4.1.1",
  "duplicate-id-aria": "4.1.1",
  "aria-allowed-attr": "4.1.2",
  "aria-allowed-role": "4.1.2",
  "aria-required-attr": "4.1.2",
  "aria-required-children": "4.1.2",
  "aria-required-parent": "4.1.2",
  "aria-roles": "4.1.2",
  "button-name": "4.1.2",
  "input-button-name": "4.1.2",
  "role-img-alt": "4.1.2",
  "html-has-lang": "3.1.1",
  "html-lang-valid": "3.1.1",
  "html-xml-lang-mismatch": "3.1.1",
  "valid-lang": "3.1.2",
  "aria-valid-attr-value": "3.3.1",
  "aria-input-field-name": "3.3.1",
  "form-field-multiple-labels": "3.3.2",
  "select-name": "3.3.2"
};

// ARIA Patterns Database
interface AriaPattern {
  name: string;
  description: string;
  roles: string[];
  states: string[];
  properties: string[];
  keyboardInteractions: { key: string; action: string }[];
  codeExample: string;
}

const ariaPatterns: Record<string, AriaPattern> = {
  "modal": {
    name: "Modal Dialog",
    description: "A dialog is a window overlaid on the primary window. Focus is trapped within the dialog until it is dismissed.",
    roles: ["dialog", "alertdialog"],
    states: ["aria-modal='true'"],
    properties: ["aria-labelledby", "aria-describedby"],
    keyboardInteractions: [
      { key: "Tab", action: "Move focus to next focusable element inside dialog (wraps to first when at end)" },
      { key: "Shift+Tab", action: "Move focus to previous focusable element inside dialog (wraps to last when at start)" },
      { key: "Escape", action: "Close the dialog" }
    ],
    codeExample: `<div
  role="dialog"
  aria-modal="true"
  aria-labelledby="dialog-title"
  aria-describedby="dialog-description"
>
  <h2 id="dialog-title">Dialog Title</h2>
  <p id="dialog-description">Dialog description text.</p>
  <button>Action</button>
  <button>Cancel</button>
</div>

// Focus management
const dialog = document.querySelector('[role="dialog"]');
const firstFocusable = dialog.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
firstFocusable.focus();

// Trap focus within dialog
dialog.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    const focusable = dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
  if (e.key === 'Escape') closeDialog();
});`
  },
  "dialog": {
    name: "Modal Dialog",
    description: "A dialog is a window overlaid on the primary window. Focus is trapped within the dialog until it is dismissed.",
    roles: ["dialog", "alertdialog"],
    states: ["aria-modal='true'"],
    properties: ["aria-labelledby", "aria-describedby"],
    keyboardInteractions: [
      { key: "Tab", action: "Move focus to next focusable element inside dialog (wraps to first when at end)" },
      { key: "Shift+Tab", action: "Move focus to previous focusable element inside dialog (wraps to last when at start)" },
      { key: "Escape", action: "Close the dialog" }
    ],
    codeExample: `<div
  role="dialog"
  aria-modal="true"
  aria-labelledby="dialog-title"
  aria-describedby="dialog-description"
>
  <h2 id="dialog-title">Dialog Title</h2>
  <p id="dialog-description">Dialog description text.</p>
  <button>Action</button>
  <button>Cancel</button>
</div>`
  },
  "tabs": {
    name: "Tabs",
    description: "A set of layered sections of content, where one panel is displayed at a time.",
    roles: ["tablist", "tab", "tabpanel"],
    states: ["aria-selected='true|false'"],
    properties: ["aria-controls", "aria-labelledby"],
    keyboardInteractions: [
      { key: "Tab", action: "Move focus into the tab list, then to the active tabpanel" },
      { key: "ArrowLeft/ArrowRight", action: "Move focus between tabs (horizontal tablist)" },
      { key: "ArrowUp/ArrowDown", action: "Move focus between tabs (vertical tablist)" },
      { key: "Home", action: "Move focus to first tab" },
      { key: "End", action: "Move focus to last tab" },
      { key: "Space/Enter", action: "Activate the focused tab (if activation is manual)" }
    ],
    codeExample: `<div role="tablist" aria-label="Entertainment options">
  <button
    role="tab"
    aria-selected="true"
    aria-controls="panel-1"
    id="tab-1"
    tabindex="0"
  >
    Tab 1
  </button>
  <button
    role="tab"
    aria-selected="false"
    aria-controls="panel-2"
    id="tab-2"
    tabindex="-1"
  >
    Tab 2
  </button>
</div>

<div
  role="tabpanel"
  id="panel-1"
  aria-labelledby="tab-1"
  tabindex="0"
>
  Panel 1 content
</div>

<div
  role="tabpanel"
  id="panel-2"
  aria-labelledby="tab-2"
  tabindex="0"
  hidden
>
  Panel 2 content
</div>

// Keyboard navigation
tablist.addEventListener('keydown', (e) => {
  const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
  const currentIndex = tabs.indexOf(document.activeElement);

  if (e.key === 'ArrowRight') {
    const nextIndex = (currentIndex + 1) % tabs.length;
    tabs[nextIndex].focus();
  } else if (e.key === 'ArrowLeft') {
    const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    tabs[prevIndex].focus();
  }
});`
  },
  "tabpanel": {
    name: "Tabs",
    description: "A set of layered sections of content, where one panel is displayed at a time.",
    roles: ["tablist", "tab", "tabpanel"],
    states: ["aria-selected='true|false'"],
    properties: ["aria-controls", "aria-labelledby"],
    keyboardInteractions: [
      { key: "Tab", action: "Move focus into the tab list, then to the active tabpanel" },
      { key: "ArrowLeft/ArrowRight", action: "Move focus between tabs (horizontal tablist)" },
      { key: "Home", action: "Move focus to first tab" },
      { key: "End", action: "Move focus to last tab" }
    ],
    codeExample: `See 'tabs' pattern for full implementation.`
  },
  "menu": {
    name: "Menu",
    description: "A menu offers a list of choices to the user, such as actions or functions.",
    roles: ["menu", "menuitem", "menuitemcheckbox", "menuitemradio"],
    states: ["aria-expanded='true|false'", "aria-checked='true|false' (for menuitemcheckbox/radio)"],
    properties: ["aria-haspopup='menu'", "aria-labelledby"],
    keyboardInteractions: [
      { key: "Enter/Space", action: "Activate menu item and close menu" },
      { key: "ArrowDown", action: "Move focus to next menu item" },
      { key: "ArrowUp", action: "Move focus to previous menu item" },
      { key: "ArrowRight", action: "Open submenu (if available) and move focus to first item" },
      { key: "ArrowLeft", action: "Close submenu and return focus to parent menu item" },
      { key: "Escape", action: "Close the menu" },
      { key: "Home", action: "Move focus to first menu item" },
      { key: "End", action: "Move focus to last menu item" }
    ],
    codeExample: `<button
  aria-haspopup="menu"
  aria-expanded="false"
  aria-controls="menu-1"
>
  Menu
</button>

<ul role="menu" id="menu-1" aria-labelledby="menu-button">
  <li role="menuitem" tabindex="-1">Action 1</li>
  <li role="menuitem" tabindex="-1">Action 2</li>
  <li role="menuitem" tabindex="-1">Action 3</li>
</ul>

// Open menu and manage focus
button.addEventListener('click', () => {
  const expanded = button.getAttribute('aria-expanded') === 'true';
  button.setAttribute('aria-expanded', !expanded);
  if (!expanded) {
    menu.querySelector('[role="menuitem"]').focus();
  }
});

menu.addEventListener('keydown', (e) => {
  const items = Array.from(menu.querySelectorAll('[role="menuitem"]'));
  const currentIndex = items.indexOf(document.activeElement);

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      items[(currentIndex + 1) % items.length].focus();
      break;
    case 'ArrowUp':
      e.preventDefault();
      items[(currentIndex - 1 + items.length) % items.length].focus();
      break;
    case 'Escape':
      button.setAttribute('aria-expanded', 'false');
      button.focus();
      break;
  }
});`
  },
  "menubar": {
    name: "Menubar",
    description: "A horizontal menu typically used as a main navigation element.",
    roles: ["menubar", "menuitem", "menu"],
    states: ["aria-expanded='true|false'"],
    properties: ["aria-haspopup='menu'", "aria-labelledby"],
    keyboardInteractions: [
      { key: "ArrowLeft/ArrowRight", action: "Move focus between menubar items" },
      { key: "ArrowDown", action: "Open submenu and move focus to first item" },
      { key: "ArrowUp", action: "Open submenu and move focus to last item" },
      { key: "Enter/Space", action: "Open submenu or activate item" },
      { key: "Escape", action: "Close submenu" }
    ],
    codeExample: `<nav aria-label="Main">
  <ul role="menubar">
    <li role="none">
      <button
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded="false"
      >
        File
      </button>
      <ul role="menu">
        <li role="menuitem" tabindex="-1">New</li>
        <li role="menuitem" tabindex="-1">Open</li>
        <li role="menuitem" tabindex="-1">Save</li>
      </ul>
    </li>
    <li role="none">
      <button role="menuitem">Edit</button>
    </li>
  </ul>
</nav>`
  },
  "accordion": {
    name: "Accordion",
    description: "Vertically stacked headings that reveal or hide associated content.",
    roles: ["button (for headers)", "region (optional for panels)"],
    states: ["aria-expanded='true|false'"],
    properties: ["aria-controls", "aria-labelledby"],
    keyboardInteractions: [
      { key: "Enter/Space", action: "Toggle the accordion panel" },
      { key: "ArrowDown", action: "Move focus to next accordion header" },
      { key: "ArrowUp", action: "Move focus to previous accordion header" },
      { key: "Home", action: "Move focus to first accordion header" },
      { key: "End", action: "Move focus to last accordion header" }
    ],
    codeExample: `<div class="accordion">
  <h3>
    <button
      aria-expanded="true"
      aria-controls="panel-1"
      id="header-1"
    >
      Section 1
    </button>
  </h3>
  <div
    id="panel-1"
    role="region"
    aria-labelledby="header-1"
  >
    <p>Content for section 1</p>
  </div>

  <h3>
    <button
      aria-expanded="false"
      aria-controls="panel-2"
      id="header-2"
    >
      Section 2
    </button>
  </h3>
  <div
    id="panel-2"
    role="region"
    aria-labelledby="header-2"
    hidden
  >
    <p>Content for section 2</p>
  </div>
</div>

// Toggle accordion
button.addEventListener('click', () => {
  const expanded = button.getAttribute('aria-expanded') === 'true';
  button.setAttribute('aria-expanded', !expanded);
  panel.hidden = expanded;
});`
  },
  "combobox": {
    name: "Combobox / Autocomplete",
    description: "A composite widget with a text input and a popup listbox for selecting a value.",
    roles: ["combobox", "listbox", "option"],
    states: ["aria-expanded='true|false'", "aria-selected='true|false'", "aria-activedescendant"],
    properties: ["aria-controls", "aria-autocomplete='list|both|inline'", "aria-haspopup='listbox'"],
    keyboardInteractions: [
      { key: "ArrowDown", action: "Open listbox (if closed) or move focus to next option" },
      { key: "ArrowUp", action: "Move focus to previous option" },
      { key: "Enter", action: "Select the focused option and close listbox" },
      { key: "Escape", action: "Close the listbox without selecting" },
      { key: "Home", action: "Move focus to first option" },
      { key: "End", action: "Move focus to last option" },
      { key: "Type characters", action: "Filter options or jump to matching option" }
    ],
    codeExample: `<div class="combobox-wrapper">
  <label id="label" for="combobox">Choose a fruit:</label>
  <input
    type="text"
    id="combobox"
    role="combobox"
    aria-controls="listbox"
    aria-expanded="false"
    aria-haspopup="listbox"
    aria-autocomplete="list"
    aria-activedescendant=""
  />
  <ul
    role="listbox"
    id="listbox"
    aria-labelledby="label"
    hidden
  >
    <li role="option" id="opt-1">Apple</li>
    <li role="option" id="opt-2">Banana</li>
    <li role="option" id="opt-3">Cherry</li>
  </ul>
</div>

// Manage active descendant
input.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    listbox.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    // Update aria-activedescendant to next option
    const currentId = input.getAttribute('aria-activedescendant');
    const options = Array.from(listbox.querySelectorAll('[role="option"]'));
    const currentIndex = options.findIndex(o => o.id === currentId);
    const nextOption = options[(currentIndex + 1) % options.length];
    input.setAttribute('aria-activedescendant', nextOption.id);
  }
  if (e.key === 'Enter') {
    const activeId = input.getAttribute('aria-activedescendant');
    const activeOption = document.getElementById(activeId);
    input.value = activeOption.textContent;
    listbox.hidden = true;
    input.setAttribute('aria-expanded', 'false');
  }
  if (e.key === 'Escape') {
    listbox.hidden = true;
    input.setAttribute('aria-expanded', 'false');
  }
});`
  },
  "autocomplete": {
    name: "Combobox / Autocomplete",
    description: "A composite widget with a text input and a popup listbox for selecting a value.",
    roles: ["combobox", "listbox", "option"],
    states: ["aria-expanded='true|false'", "aria-selected='true|false'", "aria-activedescendant"],
    properties: ["aria-controls", "aria-autocomplete='list|both|inline'", "aria-haspopup='listbox'"],
    keyboardInteractions: [
      { key: "ArrowDown", action: "Open listbox or move focus to next option" },
      { key: "ArrowUp", action: "Move focus to previous option" },
      { key: "Enter", action: "Select the focused option" },
      { key: "Escape", action: "Close the listbox" }
    ],
    codeExample: `See 'combobox' pattern for full implementation.`
  },
  "tooltip": {
    name: "Tooltip",
    description: "A popup displaying a description for an element when the element receives keyboard focus or hover.",
    roles: ["tooltip"],
    states: [],
    properties: ["aria-describedby"],
    keyboardInteractions: [
      { key: "Escape", action: "Dismiss the tooltip" },
      { key: "Focus/Blur", action: "Show/hide tooltip on keyboard focus" }
    ],
    codeExample: `<button aria-describedby="tooltip-1">
  Save
</button>
<div role="tooltip" id="tooltip-1" hidden>
  Save your changes (Ctrl+S)
</div>

// Show tooltip on focus/hover
button.addEventListener('focus', () => {
  tooltip.hidden = false;
});
button.addEventListener('blur', () => {
  tooltip.hidden = true;
});
button.addEventListener('mouseenter', () => {
  tooltip.hidden = false;
});
button.addEventListener('mouseleave', () => {
  tooltip.hidden = true;
});

// Hide on Escape
button.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    tooltip.hidden = true;
  }
});

/* CSS for positioning */
[role="tooltip"] {
  position: absolute;
  background: #333;
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 14px;
}`
  },
  "alert": {
    name: "Alert",
    description: "A live region containing important, time-sensitive information. Alerts are assertive and announced immediately.",
    roles: ["alert", "alertdialog", "status"],
    states: [],
    properties: ["aria-live='assertive'", "aria-atomic='true'"],
    keyboardInteractions: [
      { key: "None required", action: "Alerts do not require keyboard interaction - they are announced automatically" }
    ],
    codeExample: `<!-- Simple alert (auto-announced) -->
<div role="alert">
  Your session will expire in 5 minutes.
</div>

<!-- Alert with live region (for dynamic content) -->
<div
  role="alert"
  aria-live="assertive"
  aria-atomic="true"
>
  Error: Please enter a valid email address.
</div>

<!-- Status message (polite, less urgent) -->
<div role="status" aria-live="polite">
  File uploaded successfully.
</div>

// Dynamically add alert
function showAlert(message) {
  const alert = document.createElement('div');
  alert.setAttribute('role', 'alert');
  alert.textContent = message;
  document.body.appendChild(alert);

  // Remove after announcement
  setTimeout(() => alert.remove(), 5000);
}`
  },
  "tree": {
    name: "Tree View",
    description: "A hierarchical list that allows users to expand and collapse nested groups of items.",
    roles: ["tree", "treeitem", "group"],
    states: ["aria-expanded='true|false'", "aria-selected='true|false'"],
    properties: ["aria-level", "aria-setsize", "aria-posinset", "aria-owns"],
    keyboardInteractions: [
      { key: "ArrowDown", action: "Move focus to next visible treeitem" },
      { key: "ArrowUp", action: "Move focus to previous visible treeitem" },
      { key: "ArrowRight", action: "Expand node (if collapsed) or move to first child" },
      { key: "ArrowLeft", action: "Collapse node (if expanded) or move to parent" },
      { key: "Enter", action: "Activate the focused treeitem" },
      { key: "Home", action: "Move focus to first treeitem" },
      { key: "End", action: "Move focus to last visible treeitem" },
      { key: "* (asterisk)", action: "Expand all siblings at the current level" }
    ],
    codeExample: `<ul role="tree" aria-label="File browser">
  <li
    role="treeitem"
    aria-expanded="true"
    aria-level="1"
    aria-setsize="2"
    aria-posinset="1"
    tabindex="0"
  >
    Documents
    <ul role="group">
      <li
        role="treeitem"
        aria-level="2"
        aria-setsize="2"
        aria-posinset="1"
        tabindex="-1"
      >
        report.pdf
      </li>
      <li
        role="treeitem"
        aria-level="2"
        aria-setsize="2"
        aria-posinset="2"
        tabindex="-1"
      >
        notes.txt
      </li>
    </ul>
  </li>
  <li
    role="treeitem"
    aria-expanded="false"
    aria-level="1"
    aria-setsize="2"
    aria-posinset="2"
    tabindex="-1"
  >
    Images
    <ul role="group" hidden>
      <li role="treeitem" aria-level="2" tabindex="-1">photo.jpg</li>
    </ul>
  </li>
</ul>

// Keyboard navigation
tree.addEventListener('keydown', (e) => {
  const current = document.activeElement;
  const items = Array.from(tree.querySelectorAll('[role="treeitem"]:not([hidden])'));
  const index = items.indexOf(current);

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      if (index < items.length - 1) items[index + 1].focus();
      break;
    case 'ArrowUp':
      e.preventDefault();
      if (index > 0) items[index - 1].focus();
      break;
    case 'ArrowRight':
      if (current.getAttribute('aria-expanded') === 'false') {
        current.setAttribute('aria-expanded', 'true');
        current.querySelector('[role="group"]').hidden = false;
      }
      break;
    case 'ArrowLeft':
      if (current.getAttribute('aria-expanded') === 'true') {
        current.setAttribute('aria-expanded', 'false');
        current.querySelector('[role="group"]').hidden = true;
      }
      break;
  }
});`
  },
  "treeitem": {
    name: "Tree View",
    description: "A hierarchical list that allows users to expand and collapse nested groups of items.",
    roles: ["tree", "treeitem", "group"],
    states: ["aria-expanded='true|false'", "aria-selected='true|false'"],
    properties: ["aria-level", "aria-setsize", "aria-posinset"],
    keyboardInteractions: [
      { key: "ArrowDown", action: "Move focus to next visible treeitem" },
      { key: "ArrowUp", action: "Move focus to previous visible treeitem" },
      { key: "ArrowRight", action: "Expand node or move to first child" },
      { key: "ArrowLeft", action: "Collapse node or move to parent" }
    ],
    codeExample: `See 'tree' pattern for full implementation.`
  }
};

// Tool: Get WCAG success criterion details
server.tool(
  "get_wcag_guideline",
  "Get full WCAG success criterion details for a violation",
  {
    criterionId: z.string().describe("WCAG criterion like '1.1.1' or violation id like 'image-alt'"),
  },
  async ({ criterionId }) => {
    telemetry.log('get_wcag_guideline');
    try {
      // Check if it's a violation ID first
      let wcagId = criterionId;
      if (violationToWcag[criterionId]) {
        wcagId = violationToWcag[criterionId];
      }

      // Look up the criterion
      const criterion = wcagCriteria[wcagId];
      if (!criterion) {
        // Try to find partial matches
        const matches = Object.keys(wcagCriteria).filter((k) => k.includes(criterionId));
        if (matches.length > 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No exact match for "${criterionId}". Did you mean one of these?\n${matches.map((m) => `- ${m}: ${wcagCriteria[m].title}`).join("\n")}`,
              },
            ],
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: `WCAG criterion "${criterionId}" not found. Try a criterion ID like "1.1.1" or a violation ID like "image-alt".`,
            },
          ],
        };
      }

      const response = `# WCAG ${criterion.id}: ${criterion.title}

**Level:** ${criterion.level}

## Description
${criterion.description}

## Techniques
${criterion.techniques.map((t) => `- ${t}`).join("\n")}

## Common Failures
${criterion.failures.map((f) => `- ${f}`).join("\n")}

## Related Violations
${criterion.relatedViolations.map((v) => `- ${v}`).join("\n")}`;

      return {
        content: [
          {
            type: "text" as const,
            text: response,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error looking up WCAG criterion: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool: Suggest ARIA pattern for a component type
server.tool(
  "suggest_aria_pattern",
  "Suggest ARIA pattern for a component type",
  {
    componentType: z.string().describe("e.g., 'modal', 'tabs', 'menu', 'accordion'"),
  },
  async ({ componentType }) => {
    telemetry.log('suggest_aria_pattern');
    try {
      // Normalize the component type
      const normalizedType = componentType.toLowerCase().trim();

      // Look up the pattern
      const pattern = ariaPatterns[normalizedType];
      if (!pattern) {
        // Try to find partial matches
        const matches = Object.keys(ariaPatterns).filter(
          (k) => k.includes(normalizedType) || normalizedType.includes(k)
        );
        if (matches.length > 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No exact match for "${componentType}". Did you mean one of these?\n${matches.map((m) => `- ${m}: ${ariaPatterns[m].name}`).join("\n")}\n\nAvailable patterns: ${Object.keys(ariaPatterns).join(", ")}`,
              },
            ],
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: `ARIA pattern for "${componentType}" not found.\n\nAvailable patterns: ${Object.keys(ariaPatterns).join(", ")}`,
            },
          ],
        };
      }

      const response = `# ${pattern.name}

## Description
${pattern.description}

## ARIA Roles
${pattern.roles.map((r) => `- \`${r}\``).join("\n")}

## States
${pattern.states.length > 0 ? pattern.states.map((s) => `- \`${s}\``).join("\n") : "- None required"}

## Properties
${pattern.properties.length > 0 ? pattern.properties.map((p) => `- \`${p}\``).join("\n") : "- None required"}

## Keyboard Interactions
| Key | Action |
|-----|--------|
${pattern.keyboardInteractions.map((k) => `| ${k.key} | ${k.action} |`).join("\n")}

## Code Example
\`\`\`html
${pattern.codeExample}
\`\`\``;

      return {
        content: [
          {
            type: "text" as const,
            text: response,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error looking up ARIA pattern: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool: Check color contrast
server.tool(
  "check_color_contrast",
  "Calculate WCAG contrast ratio and APCA Lc value between two colors and check compliance",
  {
    foreground: z.string().describe("Foreground color (hex, rgb, or named)"),
    background: z.string().describe("Background color (hex, rgb, or named)"),
    fontSize: z.number().optional().describe("Font size in pixels (optional, for AA/AAA thresholds)"),
    isBold: z.boolean().optional().describe("Whether text is bold (optional)"),
  },
  async ({ foreground, background, fontSize, isBold }) => {
    telemetry.log('check_color_contrast');
    try {
      // Parse colors
      const fgColor = parseColor(foreground);
      const bgColor = parseColor(background);

      if (!fgColor) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Unable to parse foreground color: "${foreground}". Supported formats: hex (#RGB, #RRGGBB), rgb(r, g, b), or named colors (e.g., "red", "blue").`,
            },
          ],
          isError: true,
        };
      }

      if (!bgColor) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Unable to parse background color: "${background}". Supported formats: hex (#RGB, #RRGGBB), rgb(r, g, b), or named colors (e.g., "red", "blue").`,
            },
          ],
          isError: true,
        };
      }

      // Calculate WCAG 2.x contrast ratio
      const contrastRatio = calculateContrastRatio(fgColor, bgColor);
      const roundedRatio = Math.round(contrastRatio * 100) / 100;

      // Calculate APCA Lc value (Advanced Perceptual Contrast Algorithm)
      const fgArray: [number, number, number] = [fgColor.r, fgColor.g, fgColor.b];
      const bgArray: [number, number, number] = [bgColor.r, bgColor.g, bgColor.b];
      const apcaLc = APCAcontrast(sRGBtoY(fgArray), sRGBtoY(bgArray)) as number;
      const roundedLc = Math.round(apcaLc * 10) / 10;
      const absLc = Math.abs(roundedLc);

      // APCA thresholds (based on WCAG 3.0 draft guidelines)
      // Lc 90+ : Preferred for body text
      // Lc 75+ : Minimum for body text
      // Lc 60+ : Large text and headlines
      // Lc 45+ : Non-text elements, graphics
      const apcaCompliance = {
        bodyTextPreferred: absLc >= 90,
        bodyTextMinimum: absLc >= 75,
        largeText: absLc >= 60,
        nonText: absLc >= 45,
      };

      // Determine if text is large
      const largeText = isLargeText(fontSize, isBold);

      // WCAG 2.x thresholds
      // AA: 4.5:1 for normal text, 3:1 for large text
      // AAA: 7:1 for normal text, 4.5:1 for large text
      const wcagAA = {
        normalText: contrastRatio >= 4.5,
        largeText: contrastRatio >= 3,
      };

      const wcagAAA = {
        normalText: contrastRatio >= 7,
        largeText: contrastRatio >= 4.5,
      };

      // Generate recommendation
      let recommendation = "";
      const passesAA = largeText ? wcagAA.largeText : wcagAA.normalText;
      const passesAAA = largeText ? wcagAAA.largeText : wcagAAA.normalText;

      if (passesAAA) {
        recommendation = "Excellent! This color combination meets WCAG AAA standards for all text sizes.";
      } else if (passesAA) {
        recommendation = "Good. This color combination meets WCAG AA standards.";
        if (!wcagAAA.largeText) {
          recommendation += " To achieve AAA compliance, increase contrast to at least 7:1.";
        }
      } else if (wcagAA.largeText) {
        recommendation = `This combination only passes for large text (18pt+ or 14pt+ bold). For normal text, increase contrast to at least 4.5:1. Current ratio: ${roundedRatio}:1.`;
      } else {
        const requiredRatio = largeText ? 3 : 4.5;
        recommendation = `Insufficient contrast (${roundedRatio}:1). Minimum required: ${requiredRatio}:1 for ${largeText ? "large" : "normal"} text. Consider:\n`;
        recommendation += "- Darkening the foreground color\n";
        recommendation += "- Lightening the background color\n";
        recommendation += "- Choosing colors with greater luminance difference";
      }

      // Build result object
      const result = {
        contrastRatio: roundedRatio,
        apcaLc: roundedLc,
        wcagAA,
        wcagAAA,
        apcaCompliance,
        recommendation,
      };

      // Format response
      const passStatus = passesAA
        ? passesAAA
          ? "PASS (AAA)"
          : "PASS (AA)"
        : wcagAA.largeText
        ? "PARTIAL (large text only)"
        : "FAIL";

      // APCA status string
      let apcaStatus = "";
      if (apcaCompliance.bodyTextPreferred) {
        apcaStatus = "Preferred for body text";
      } else if (apcaCompliance.bodyTextMinimum) {
        apcaStatus = "Minimum for body text";
      } else if (apcaCompliance.largeText) {
        apcaStatus = "Large text/headlines only";
      } else if (apcaCompliance.nonText) {
        apcaStatus = "Non-text elements only";
      } else {
        apcaStatus = "Insufficient";
      }

      const response = `# Color Contrast Check

**Foreground:** ${foreground} → rgb(${fgColor.r}, ${fgColor.g}, ${fgColor.b})
**Background:** ${background} → rgb(${bgColor.r}, ${bgColor.g}, ${bgColor.b})
${fontSize ? `**Text size:** ${fontSize}px${isBold ? " (bold)" : ""}` : ""}

## Result: ${passStatus}

**WCAG 2.x Contrast Ratio:** ${roundedRatio}:1
**APCA Lc Value:** ${roundedLc} (${apcaStatus})

### WCAG 2.x Compliance
| Level | Normal Text (< 18pt) | Large Text (≥ 18pt) |
|-------|---------------------|---------------------|
| AA    | ${wcagAA.normalText ? "✓ Pass (≥ 4.5:1)" : "✗ Fail (< 4.5:1)"} | ${wcagAA.largeText ? "✓ Pass (≥ 3:1)" : "✗ Fail (< 3:1)"} |
| AAA   | ${wcagAAA.normalText ? "✓ Pass (≥ 7:1)" : "✗ Fail (< 7:1)"} | ${wcagAAA.largeText ? "✓ Pass (≥ 4.5:1)" : "✗ Fail (< 4.5:1)"} |

### APCA Compliance (Experimental - WCAG 3.0 Draft)
| Use Case | Threshold | Status |
|----------|-----------|--------|
| Body text (preferred) | Lc ≥ 90 | ${apcaCompliance.bodyTextPreferred ? "✓ Pass" : "✗ Fail"} |
| Body text (minimum) | Lc ≥ 75 | ${apcaCompliance.bodyTextMinimum ? "✓ Pass" : "✗ Fail"} |
| Large text/headlines | Lc ≥ 60 | ${apcaCompliance.largeText ? "✓ Pass" : "✗ Fail"} |
| Non-text elements | Lc ≥ 45 | ${apcaCompliance.nonText ? "✓ Pass" : "✗ Fail"} |

*Note: APCA uses signed values. Negative Lc indicates light text on dark background.*

## Recommendation
${recommendation}

---
*Data (JSON):*
\`\`\`json
${JSON.stringify(result, null, 2)}
\`\`\``;

      return {
        content: [
          {
            type: "text" as const,
            text: response,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error checking color contrast: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Helper: Analyze component patterns
async function analyzeComponentPatterns(
  directory: string,
  componentFilter?: string
): Promise<ComponentPattern[]> {
  const patterns: ComponentPattern[] = [];
  const extensions = [".jsx", ".tsx", ".vue", ".svelte"];

  async function scanDir(dir: string): Promise<void> {
    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
          if (!entry.name.startsWith(".") && entry.name !== "node_modules" && entry.name !== "dist") {
            await scanDir(fullPath);
          }
        } else if (extensions.includes(extname(entry.name))) {
          if (componentFilter && !entry.name.toLowerCase().includes(componentFilter.toLowerCase())) {
            continue;
          }

          try {
            const content = await readFile(fullPath, "utf-8");
            const pattern = analyzeComponent(entry.name, fullPath, content);
            if (pattern) {
              patterns.push(pattern);
            }
          } catch {
            // Skip files that can't be read
          }
        }
      }
    } catch {
      // Skip directories that can't be read
    }
  }

  await scanDir(directory);
  return patterns;
}

function analyzeComponent(name: string, file: string, content: string): ComponentPattern | null {
  const hasAriaLabel = /aria-label/i.test(content);
  const hasAriaDescribedBy = /aria-describedby/i.test(content);
  const hasRole = /role=["']/i.test(content);
  const hasFocusManagement = /focus\(\)|useRef|tabIndex|onFocus|onBlur/i.test(content);
  const hasKeyboardHandlers = /onKeyDown|onKeyUp|onKeyPress|@keydown|@keyup/i.test(content);

  // Extract examples of ARIA usage
  const examples: string[] = [];
  const ariaLabelMatches = content.match(/aria-label=["'][^"']+["']/gi);
  if (ariaLabelMatches) {
    examples.push(...ariaLabelMatches.slice(0, 3));
  }

  const roleMatches = content.match(/role=["'][^"']+["']/gi);
  if (roleMatches) {
    examples.push(...roleMatches.slice(0, 3));
  }

  return {
    component: name.replace(/\.(jsx|tsx|vue|svelte)$/, ""),
    file,
    patterns: {
      hasAriaLabel,
      hasAriaDescribedBy,
      hasRole,
      hasFocusManagement,
      hasKeyboardHandlers,
    },
    examples,
  };
}

// Helper: Extract design tokens
async function extractDesignTokens(directory: string): Promise<DesignTokens> {
  const tokens: DesignTokens = {
    colors: [],
    spacing: [],
    typography: [],
  };

  // Look for common token files
  const tokenFiles = [
    "tailwind.config.js",
    "tailwind.config.ts",
    "theme.js",
    "theme.ts",
    "tokens.js",
    "tokens.ts",
    "variables.css",
    "tokens.css",
    "_variables.scss",
    "design-tokens.json",
  ];

  for (const filename of tokenFiles) {
    const filePath = join(directory, filename);
    if (existsSync(filePath)) {
      try {
        const content = await readFile(filePath, "utf-8");
        extractTokensFromContent(content, filename, tokens);
      } catch {
        // Skip files that can't be read
      }
    }
  }

  // Also check src directory
  const srcPath = join(directory, "src");
  if (existsSync(srcPath)) {
    for (const filename of tokenFiles) {
      const filePath = join(srcPath, filename);
      if (existsSync(filePath)) {
        try {
          const content = await readFile(filePath, "utf-8");
          extractTokensFromContent(content, filename, tokens);
        } catch {
          // Skip files that can't be read
        }
      }
    }
  }

  return tokens;
}

function extractTokensFromContent(content: string, filename: string, tokens: DesignTokens): void {
  // Extract CSS custom properties
  const cssVarMatches = content.matchAll(/--([a-zA-Z0-9-]+):\s*([^;]+);/g);
  for (const match of cssVarMatches) {
    const name = match[1];
    const value = match[2].trim();

    if (name.includes("color") || value.startsWith("#") || value.startsWith("rgb") || value.startsWith("hsl")) {
      tokens.colors.push({ name: `--${name}`, value });
    } else if (name.includes("space") || name.includes("gap") || name.includes("margin") || name.includes("padding")) {
      tokens.spacing.push(`--${name}: ${value}`);
    }
  }

  // Extract Tailwind colors
  const tailwindColorMatches = content.matchAll(/'([a-zA-Z]+)':\s*['"]?(#[a-fA-F0-9]{3,8})['"]?/g);
  for (const match of tailwindColorMatches) {
    tokens.colors.push({ name: match[1], value: match[2] });
  }

  // Calculate contrast ratios (simplified - assuming white background)
  tokens.colors = tokens.colors.map((color) => {
    const ratio = estimateContrastRatio(color.value);
    return {
      ...color,
      contrastRatio: ratio,
      wcagAACompliant: ratio >= 4.5,
      wcagAAACompliant: ratio >= 7,
    };
  });
}

/**
 * Named CSS colors to hex mapping
 */
const namedColors: Record<string, string> = {
  black: "#000000",
  white: "#ffffff",
  red: "#ff0000",
  green: "#008000",
  blue: "#0000ff",
  yellow: "#ffff00",
  cyan: "#00ffff",
  magenta: "#ff00ff",
  gray: "#808080",
  grey: "#808080",
  silver: "#c0c0c0",
  maroon: "#800000",
  olive: "#808000",
  lime: "#00ff00",
  aqua: "#00ffff",
  teal: "#008080",
  navy: "#000080",
  fuchsia: "#ff00ff",
  purple: "#800080",
  orange: "#ffa500",
  pink: "#ffc0cb",
  brown: "#a52a2a",
  coral: "#ff7f50",
  crimson: "#dc143c",
  darkblue: "#00008b",
  darkgray: "#a9a9a9",
  darkgreen: "#006400",
  darkred: "#8b0000",
  gold: "#ffd700",
  indigo: "#4b0082",
  ivory: "#fffff0",
  khaki: "#f0e68c",
  lavender: "#e6e6fa",
  lightblue: "#add8e6",
  lightgray: "#d3d3d3",
  lightgreen: "#90ee90",
  lightyellow: "#ffffe0",
  midnightblue: "#191970",
  mintcream: "#f5fffa",
  mistyrose: "#ffe4e1",
  moccasin: "#ffe4b5",
  navajowhite: "#ffdead",
  oldlace: "#fdf5e6",
  olivedrab: "#6b8e23",
  orangered: "#ff4500",
  orchid: "#da70d6",
  palegoldenrod: "#eee8aa",
  palegreen: "#98fb98",
  paleturquoise: "#afeeee",
  palevioletred: "#db7093",
  papayawhip: "#ffefd5",
  peachpuff: "#ffdab9",
  peru: "#cd853f",
  plum: "#dda0dd",
  powderblue: "#b0e0e6",
  rosybrown: "#bc8f8f",
  royalblue: "#4169e1",
  saddlebrown: "#8b4513",
  salmon: "#fa8072",
  sandybrown: "#f4a460",
  seagreen: "#2e8b57",
  seashell: "#fff5ee",
  sienna: "#a0522d",
  skyblue: "#87ceeb",
  slateblue: "#6a5acd",
  slategray: "#708090",
  snow: "#fffafa",
  springgreen: "#00ff7f",
  steelblue: "#4682b4",
  tan: "#d2b48c",
  thistle: "#d8bfd8",
  tomato: "#ff6347",
  turquoise: "#40e0d0",
  violet: "#ee82ee",
  wheat: "#f5deb3",
  whitesmoke: "#f5f5f5",
  yellowgreen: "#9acd32",
  rebeccapurple: "#663399",
  transparent: "#00000000",
};

/**
 * Parse a color string (hex, rgb, or named) to RGB values
 */
function parseColor(color: string): { r: number; g: number; b: number } | null {
  const trimmed = color.trim().toLowerCase();

  // Check named colors
  if (namedColors[trimmed]) {
    return parseColor(namedColors[trimmed]);
  }

  // Hex format: #RGB, #RGBA, #RRGGBB, #RRGGBBAA
  if (trimmed.startsWith("#")) {
    const hex = trimmed.slice(1);
    if (hex.length === 3) {
      // #RGB -> #RRGGBB
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
      };
    } else if (hex.length === 4) {
      // #RGBA -> #RRGGBBAA (ignore alpha)
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
      };
    } else if (hex.length >= 6) {
      // #RRGGBB or #RRGGBBAA
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
      };
    }
  }

  // RGB format: rgb(r, g, b) or rgba(r, g, b, a)
  const rgbMatch = trimmed.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1], 10),
      g: parseInt(rgbMatch[2], 10),
      b: parseInt(rgbMatch[3], 10),
    };
  }

  // RGB percentage format: rgb(r%, g%, b%)
  const rgbPercentMatch = trimmed.match(/rgba?\s*\(\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%/);
  if (rgbPercentMatch) {
    return {
      r: Math.round((parseFloat(rgbPercentMatch[1]) / 100) * 255),
      g: Math.round((parseFloat(rgbPercentMatch[2]) / 100) * 255),
      b: Math.round((parseFloat(rgbPercentMatch[3]) / 100) * 255),
    };
  }

  return null;
}

/**
 * Calculate relative luminance per WCAG 2.1 specification
 * https://www.w3.org/WAI/GL/wiki/Relative_luminance
 */
function getLuminance(r: number, g: number, b: number): number {
  // Convert 8-bit RGB to sRGB
  const rSrgb = r / 255;
  const gSrgb = g / 255;
  const bSrgb = b / 255;

  // Apply gamma correction
  const gammaCorrect = (c: number): number => {
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };

  const rLin = gammaCorrect(rSrgb);
  const gLin = gammaCorrect(gSrgb);
  const bLin = gammaCorrect(bSrgb);

  // Calculate relative luminance
  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

/**
 * Calculate contrast ratio between two colors per WCAG 2.1
 * https://www.w3.org/WAI/GL/wiki/Contrast_ratio
 */
function calculateContrastRatio(fg: { r: number; g: number; b: number }, bg: { r: number; g: number; b: number }): number {
  const fgLum = getLuminance(fg.r, fg.g, fg.b);
  const bgLum = getLuminance(bg.r, bg.g, bg.b);

  const lighter = Math.max(fgLum, bgLum);
  const darker = Math.min(fgLum, bgLum);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Determine if text is "large" per WCAG definition
 * Large text: 18pt (24px) or 14pt (18.67px) bold
 */
function isLargeText(fontSize?: number, isBold?: boolean): boolean {
  if (!fontSize) return false;

  // 18pt = 24px
  if (fontSize >= 24) return true;

  // 14pt bold = 18.67px bold
  if (fontSize >= 18.67 && isBold) return true;

  return false;
}

/**
 * Calculate contrast ratio using WCAG 2.1 formula with proper sRGB gamma correction
 * (Legacy function for backward compatibility with design token analysis)
 */
function estimateContrastRatio(color: string): number {
  if (!color.startsWith("#")) return 0;

  const hex = color.replace("#", "");
  if (hex.length < 6) return 0;

  // Parse RGB values
  const rRaw = parseInt(hex.slice(0, 2), 16) / 255;
  const gRaw = parseInt(hex.slice(2, 4), 16) / 255;
  const bRaw = parseInt(hex.slice(4, 6), 16) / 255;

  // Apply sRGB gamma correction (WCAG 2.1 specification)
  const gammaCorrect = (c: number): number => {
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };

  const r = gammaCorrect(rRaw);
  const g = gammaCorrect(gRaw);
  const b = gammaCorrect(bRaw);

  // Calculate relative luminance
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

  // Contrast ratio against white background (luminance = 1)
  const ratio = (1 + 0.05) / (luminance + 0.05);

  return Math.round(ratio * 10) / 10;
}

// Run the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Ally MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
