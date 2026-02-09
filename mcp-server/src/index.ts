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

// Create server instance
const server = new McpServer({
  name: "ally-patterns",
  version: "1.0.0",
});

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
 * Calculate contrast ratio using WCAG 2.1 formula with proper sRGB gamma correction
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
