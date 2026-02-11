/**
 * Tests for configuration loading
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { writeFile, unlink, mkdir, rmdir } from 'fs/promises';
import { join } from 'path';
import { loadIgnorePatterns } from '../dist/utils/config.js';

describe('loadIgnorePatterns', () => {
  const testDir = join(process.cwd(), 'test-ignore-temp');
  const ignoreFile = join(testDir, '.allyignore');

  before(async () => {
    await mkdir(testDir, { recursive: true });
  });

  after(async () => {
    try {
      await unlink(ignoreFile);
    } catch {
      // File may not exist
    }
    try {
      await rmdir(testDir);
    } catch {
      // Dir may not exist
    }
  });

  it('should return empty patterns when no ignore file exists', async () => {
    const result = await loadIgnorePatterns('/nonexistent/path');
    assert.deepStrictEqual(result.patterns, []);
    assert.strictEqual(result.ignorePath, null);
  });

  it('should load patterns from .allyignore file', async () => {
    const content = `
# Comment line
vendor/
*.test.html
dist/output.html
`;
    await writeFile(ignoreFile, content);

    const result = await loadIgnorePatterns(testDir);

    assert.ok(result.ignorePath?.endsWith('.allyignore'));
    assert.ok(result.patterns.length > 0);
    // vendor/ should become **/vendor/**
    assert.ok(result.patterns.some(p => p.includes('vendor')));
  });

  it('should ignore comment lines', async () => {
    const content = `# This is a comment
*.html
# Another comment
`;
    await writeFile(ignoreFile, content);

    const result = await loadIgnorePatterns(testDir);

    // Should only have one pattern (*.html becomes **/*.html)
    assert.strictEqual(result.patterns.length, 1);
    assert.ok(!result.patterns.some(p => p.includes('#')));
  });

  it('should ignore blank lines', async () => {
    const content = `
file1.html

file2.html

`;
    await writeFile(ignoreFile, content);

    const result = await loadIgnorePatterns(testDir);

    assert.strictEqual(result.patterns.length, 2);
  });
});
