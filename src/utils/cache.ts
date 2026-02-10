/**
 * Caching utilities for incremental scans
 *
 * Caches scan results by file hash to avoid re-scanning unchanged files.
 */

import { createHash } from 'crypto';
import { readFile, writeFile, mkdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, dirname, relative, basename } from 'path';
import type { ScanResult } from '../types/index.js';

const CACHE_VERSION = 1;
const CACHE_DIR = '.ally/cache';
const CACHE_INDEX_FILE = '.ally/cache/index.json';

/**
 * Cache index entry for a single file
 */
interface CacheEntry {
  /** File path (relative to project root) */
  path: string;
  /** Content hash */
  hash: string;
  /** Last modified timestamp */
  mtime: number;
  /** Scan result */
  result: ScanResult;
  /** WCAG standard used for the scan */
  standard: string;
  /** Cache creation timestamp */
  cachedAt: number;
}

/**
 * Cache index structure
 */
interface CacheIndex {
  /** Cache format version */
  version: number;
  /** Map of file path to cache entry */
  entries: Record<string, CacheEntry>;
  /** Last updated timestamp */
  updatedAt: number;
}

/**
 * Compute SHA-256 hash of file content
 */
export async function hashFile(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Compute hash of content string
 */
export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Load cache index from disk
 */
export async function loadCacheIndex(): Promise<CacheIndex> {
  const indexPath = resolve(CACHE_INDEX_FILE);

  if (!existsSync(indexPath)) {
    return {
      version: CACHE_VERSION,
      entries: {},
      updatedAt: Date.now(),
    };
  }

  try {
    const content = await readFile(indexPath, 'utf-8');
    const index = JSON.parse(content) as CacheIndex;

    // Check version compatibility
    if (index.version !== CACHE_VERSION) {
      return {
        version: CACHE_VERSION,
        entries: {},
        updatedAt: Date.now(),
      };
    }

    return index;
  } catch {
    return {
      version: CACHE_VERSION,
      entries: {},
      updatedAt: Date.now(),
    };
  }
}

/**
 * Save cache index to disk
 */
export async function saveCacheIndex(index: CacheIndex): Promise<void> {
  const indexPath = resolve(CACHE_INDEX_FILE);
  const cacheDir = dirname(indexPath);

  if (!existsSync(cacheDir)) {
    await mkdir(cacheDir, { recursive: true });
  }

  index.updatedAt = Date.now();
  await writeFile(indexPath, JSON.stringify(index, null, 2));
}

/**
 * Get cached result for a file if valid
 */
export async function getCachedResult(
  filePath: string,
  standard: string
): Promise<ScanResult | null> {
  const index = await loadCacheIndex();
  const relativePath = relative(process.cwd(), filePath);
  const entry = index.entries[relativePath];

  if (!entry) {
    return null;
  }

  // Check if standard matches
  if (entry.standard !== standard) {
    return null;
  }

  try {
    // Check if file has been modified
    const stats = await stat(filePath);
    const mtime = stats.mtimeMs;

    if (mtime !== entry.mtime) {
      // File modified, verify with hash
      const hash = await hashFile(filePath);
      if (hash !== entry.hash) {
        return null;
      }
      // Hash matches, update mtime in cache
      entry.mtime = mtime;
      await saveCacheIndex(index);
    }

    return entry.result;
  } catch {
    return null;
  }
}

/**
 * Cache a scan result for a file
 */
export async function cacheResult(
  filePath: string,
  result: ScanResult,
  standard: string
): Promise<void> {
  const index = await loadCacheIndex();
  const relativePath = relative(process.cwd(), filePath);

  try {
    const stats = await stat(filePath);
    const hash = await hashFile(filePath);

    index.entries[relativePath] = {
      path: relativePath,
      hash,
      mtime: stats.mtimeMs,
      result,
      standard,
      cachedAt: Date.now(),
    };

    await saveCacheIndex(index);
  } catch {
    // Silently fail if caching fails
  }
}

/**
 * Clear all cached results
 */
export async function clearCache(): Promise<void> {
  const index: CacheIndex = {
    version: CACHE_VERSION,
    entries: {},
    updatedAt: Date.now(),
  };
  await saveCacheIndex(index);
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  entries: number;
  size: number;
  oldestEntry: number | null;
  newestEntry: number | null;
}> {
  const index = await loadCacheIndex();
  const entries = Object.values(index.entries);

  if (entries.length === 0) {
    return {
      entries: 0,
      size: 0,
      oldestEntry: null,
      newestEntry: null,
    };
  }

  const timestamps = entries.map((e) => e.cachedAt);

  return {
    entries: entries.length,
    size: JSON.stringify(index).length,
    oldestEntry: Math.min(...timestamps),
    newestEntry: Math.max(...timestamps),
  };
}

/**
 * Remove stale cache entries (files that no longer exist)
 */
export async function pruneCache(): Promise<number> {
  const index = await loadCacheIndex();
  let removed = 0;

  for (const path of Object.keys(index.entries)) {
    const fullPath = resolve(path);
    if (!existsSync(fullPath)) {
      delete index.entries[path];
      removed++;
    }
  }

  if (removed > 0) {
    await saveCacheIndex(index);
  }

  return removed;
}
