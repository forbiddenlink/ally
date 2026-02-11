/**
 * Smart project detection for zero-config scanning
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, join } from 'path';
import { glob } from 'glob';

export type ProjectType = 'next' | 'nuxt' | 'react' | 'vue' | 'svelte' | 'angular' | 'html' | 'unknown';

export interface ProjectInfo {
  type: ProjectType;
  srcDir: string;
  publicDir: string;
  patterns: string[];
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/**
 * Detect the project type and return appropriate scan patterns
 */
export async function detectProject(cwd: string): Promise<ProjectInfo> {
  const packageJsonPath = resolve(cwd, 'package.json');

  // Try to detect from package.json first
  if (existsSync(packageJsonPath)) {
    try {
      const content = await readFile(packageJsonPath, 'utf-8');
      const pkg: PackageJson = JSON.parse(content);
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

      // Check for frameworks in priority order
      if ('next' in allDeps) {
        return detectNextProject(cwd);
      }

      if ('nuxt' in allDeps) {
        return detectNuxtProject(cwd);
      }

      if ('@angular/core' in allDeps) {
        return {
          type: 'angular',
          srcDir: 'src',
          publicDir: 'public',
          patterns: ['src/**/*.html', 'src/**/*.component.html'],
        };
      }

      if ('svelte' in allDeps || '@sveltejs/kit' in allDeps) {
        return {
          type: 'svelte',
          srcDir: 'src',
          publicDir: 'static',
          patterns: ['src/**/*.svelte'],
        };
      }

      if ('vue' in allDeps) {
        return {
          type: 'vue',
          srcDir: 'src',
          publicDir: 'public',
          patterns: ['src/**/*.vue'],
        };
      }

      if ('react' in allDeps || 'react-dom' in allDeps) {
        return {
          type: 'react',
          srcDir: 'src',
          publicDir: 'public',
          patterns: ['src/**/*.tsx', 'src/**/*.jsx'],
        };
      }
    } catch {
      // Failed to parse package.json, fall through to directory detection
    }
  }

  // No package.json or no recognized framework - check for common directories
  return await detectStaticSite(cwd);
}

/**
 * Detect Next.js project structure
 */
async function detectNextProject(cwd: string): Promise<ProjectInfo> {
  // Check for app router (Next.js 13+)
  const hasAppDir = existsSync(join(cwd, 'app'));
  const hasSrcAppDir = existsSync(join(cwd, 'src', 'app'));

  // Check for pages router
  const hasPagesDir = existsSync(join(cwd, 'pages'));
  const hasSrcPagesDir = existsSync(join(cwd, 'src', 'pages'));

  const patterns: string[] = [];
  let srcDir = '.';

  if (hasSrcAppDir || hasSrcPagesDir) {
    srcDir = 'src';
  }

  if (hasAppDir || hasSrcAppDir) {
    const appPath = hasSrcAppDir ? 'src/app' : 'app';
    patterns.push(`${appPath}/**/*.tsx`, `${appPath}/**/*.jsx`);
  }

  if (hasPagesDir || hasSrcPagesDir) {
    const pagesPath = hasSrcPagesDir ? 'src/pages' : 'pages';
    patterns.push(`${pagesPath}/**/*.tsx`, `${pagesPath}/**/*.jsx`);
  }

  // Also scan components directory if it exists
  if (existsSync(join(cwd, 'components'))) {
    patterns.push('components/**/*.tsx', 'components/**/*.jsx');
  } else if (existsSync(join(cwd, 'src', 'components'))) {
    patterns.push('src/components/**/*.tsx', 'src/components/**/*.jsx');
  }

  // Include public HTML files
  patterns.push('public/**/*.html');

  return {
    type: 'next',
    srcDir,
    publicDir: 'public',
    patterns: patterns.length > 0 ? patterns : ['**/*.tsx', '**/*.jsx', 'public/**/*.html'],
  };
}

/**
 * Detect Nuxt project structure
 */
async function detectNuxtProject(cwd: string): Promise<ProjectInfo> {
  const patterns: string[] = [];

  // Nuxt 3 uses pages/ and components/
  if (existsSync(join(cwd, 'pages'))) {
    patterns.push('pages/**/*.vue');
  }

  if (existsSync(join(cwd, 'components'))) {
    patterns.push('components/**/*.vue');
  }

  if (existsSync(join(cwd, 'layouts'))) {
    patterns.push('layouts/**/*.vue');
  }

  // App.vue at root
  if (existsSync(join(cwd, 'app.vue'))) {
    patterns.push('app.vue');
  }

  // Public HTML files
  patterns.push('public/**/*.html');

  return {
    type: 'nuxt',
    srcDir: '.',
    publicDir: 'public',
    patterns: patterns.length > 0 ? patterns : ['**/*.vue', 'public/**/*.html'],
  };
}

/**
 * Detect static HTML site
 */
async function detectStaticSite(cwd: string): Promise<ProjectInfo> {
  // Check for common static site directories
  const staticDirs = ['public', 'dist', 'build', 'out', '_site', 'www'];

  for (const dir of staticDirs) {
    const dirPath = join(cwd, dir);
    if (existsSync(dirPath)) {
      const htmlFiles = await glob('**/*.html', { cwd: dirPath, absolute: false });
      if (htmlFiles.length > 0) {
        return {
          type: 'html',
          srcDir: dir,
          publicDir: dir,
          patterns: [`${dir}/**/*.html`, `${dir}/**/*.htm`],
        };
      }
    }
  }

  // Check for HTML files in the root
  const rootHtmlFiles = await glob('*.html', { cwd, absolute: false });
  if (rootHtmlFiles.length > 0) {
    return {
      type: 'html',
      srcDir: '.',
      publicDir: '.',
      patterns: ['**/*.html', '**/*.htm'],
    };
  }

  // Unknown project type - default to scanning for HTML files
  return {
    type: 'unknown',
    srcDir: '.',
    publicDir: '.',
    patterns: ['**/*.html', '**/*.htm'],
  };
}

/**
 * Count files matching the detected patterns
 */
export async function countProjectFiles(cwd: string, patterns: string[]): Promise<number> {
  const files = await glob(patterns, {
    cwd,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**'],
    absolute: false,
  });
  return files.length;
}

/**
 * Get a human-readable description of the project type
 */
export function getProjectDescription(type: ProjectType): string {
  const descriptions: Record<ProjectType, string> = {
    next: 'Next.js project',
    nuxt: 'Nuxt project',
    react: 'React project',
    vue: 'Vue project',
    svelte: 'Svelte project',
    angular: 'Angular project',
    html: 'Static HTML site',
    unknown: 'Unknown project type',
  };
  return descriptions[type];
}
