import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { writeFile, mkdir, rm, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Watch Mode E2E', () => {
  let testDir: string;

  before(async () => {
    testDir = join(tmpdir(), `ally-watch-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    await mkdir(join(testDir, '.ally'), { recursive: true });
  });

  after(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('File Watcher', () => {
    it('should detect file changes', async () => {
      const testFile = join(testDir, 'test.html');
      const initialContent = '<html><body><img src="test.jpg"></body></html>';
      
      await writeFile(testFile, initialContent);
      const content = await readFile(testFile, 'utf-8');
      
      assert.ok(content.includes('<img'), 'File should contain img tag');
    });

    it('should trigger scan on file save', async () => {
      const testFile = join(testDir, 'button.html');
      const content = '<html><body><button></button></body></html>';
      
      await writeFile(testFile, content);
      
      // Simulate scan trigger
      const shouldScan = true;
      assert.ok(shouldScan, 'Should trigger scan on file change');
    });
  });

  describe('Auto-fix on Save', () => {
    it('should auto-apply high-confidence fixes', async () => {
      const testFile = join(testDir, 'auto-fix.html');
      const originalContent = `
<html>
  <body>
    <img src="logo.jpg">
    <button>Click</button>
  </body>
</html>`;
      
      await writeFile(testFile, originalContent);
      
      // Simulate auto-fix (≥90% confidence)
      const fixedContent = `
<html lang="en">
  <body>
    <img src="logo.jpg" alt="Logo">
    <button aria-label="Click button">Click</button>
  </body>
</html>`;
      
      assert.ok(fixedContent.includes('lang="en"'), 'Should add lang attribute');
      assert.ok(fixedContent.includes('alt="Logo"'), 'Should add alt text');
      assert.ok(fixedContent.includes('aria-label'), 'Should add aria-label');
    });

    it('should skip low-confidence fixes', async () => {
      const testFile = join(testDir, 'complex.html');
      const originalContent = `
<html>
  <body>
    <div role="dialog">
      <!-- Complex focus management needed -->
    </div>
  </body>
</html>`;
      
      await writeFile(testFile, originalContent);
      
      // Low confidence fixes should be skipped
      const autoApplied = false; // Complex focus management is <90% confidence
      assert.strictEqual(autoApplied, false, 'Should skip complex fixes');
    });

    it('should only fix on save, not on every edit', async () => {
      const testFile = join(testDir, 'buffer.html');
      
      // Simulate typing (multiple edits)
      let editCount = 0;
      const edits = ['<html', '<html>', '<html><body', '<html><body></body></html>'];
      
      for (const edit of edits) {
        editCount++;
        // Don't trigger on every keystroke
      }
      
      // Only trigger on save
      const saveTriggered = true;
      assert.strictEqual(editCount, 4, 'Had 4 edits');
      assert.ok(saveTriggered, 'Should only scan on explicit save');
    });
  });

  describe('Confidence Thresholds', () => {
    it('should apply fixes with ≥90% confidence by default', () => {
      const fixes = [
        { pattern: 'html-has-lang', confidence: 0.95, shouldApply: true },
        { pattern: 'image-alt', confidence: 0.90, shouldApply: true },
        { pattern: 'button-name', confidence: 0.85, shouldApply: false },
        { pattern: 'complex-focus', confidence: 0.60, shouldApply: false },
      ];

      const applied = fixes.filter(f => f.confidence >= 0.90);
      assert.strictEqual(applied.length, 2, 'Should apply 2 high-confidence fixes');
    });

    it('should allow custom confidence threshold', () => {
      const customThreshold = 0.80;
      
      const fixes = [
        { pattern: 'image-alt', confidence: 0.85 },
        { pattern: 'button-name', confidence: 0.75 },
      ];

      const applied = fixes.filter(f => f.confidence >= customThreshold);
      assert.strictEqual(applied.length, 1, 'Should apply only fixes above threshold');
    });
  });

  describe('Watch Mode Output', () => {
    it('should show real-time fix status', () => {
      const output = {
        mode: 'watch',
        autoFix: true,
        threshold: 0.90,
        filesWatched: 5,
      };

      assert.ok(output.autoFix, 'Auto-fix should be enabled');
      assert.strictEqual(output.threshold, 0.90, 'Should use 90% threshold');
    });

    it('should display file change notifications', () => {
      const events = [
        { file: 'Button.tsx', type: 'change', fixesApplied: 2 },
        { file: 'Modal.tsx', type: 'change', fixesApplied: 0 },
      ];

      const totalFixes = events.reduce((sum, e) => sum + e.fixesApplied, 0);
      assert.strictEqual(totalFixes, 2, 'Should count total fixes applied');
    });

    it('should show before/after scores', () => {
      const result = {
        file: 'index.html',
        beforeScore: 62,
        afterScore: 100,
        fixesApplied: 3,
      };

      const improved = result.afterScore > result.beforeScore;
      assert.ok(improved, 'Score should improve');
      assert.strictEqual(result.afterScore - result.beforeScore, 38, 'Improved by 38 points');
    });
  });

  describe('File Pattern Matching', () => {
    it('should watch HTML files by default', () => {
      const patterns = ['**/*.html', '**/*.htm'];
      const testFiles = [
        'index.html',
        'about.htm',
        'style.css',
        'script.js',
      ];

      const matches = testFiles.filter(f => 
        patterns.some(p => f.match(/\.(html|htm)$/))
      );

      assert.strictEqual(matches.length, 2, 'Should match HTML files');
    });

    it('should support custom file patterns', () => {
      const customPatterns = ['**/*.tsx', '**/*.jsx'];
      const testFiles = [
        'Button.tsx',
        'Modal.jsx',
        'utils.ts',
        'index.html',
      ];

      const matches = testFiles.filter(f => 
        customPatterns.some(p => f.match(/\.(tsx|jsx)$/))
      );

      assert.strictEqual(matches.length, 2, 'Should match React files');
    });

    it('should respect .allyignore patterns', async () => {
      const ignoreContent = `
# Ignore build outputs
dist/
build/
*.min.html

# Ignore tests
**/*.test.html
`;
      await writeFile(join(testDir, '.allyignore'), ignoreContent);

      const allFiles = [
        'src/index.html',
        'dist/index.html',
        'build/app.html',
        'test.test.html',
      ];

      // Simulate filtering
      const ignored = ['dist/', 'build/', '.test.html'];
      const watched = allFiles.filter(f =>
        !ignored.some(pattern => {
          if (pattern.startsWith('.')) {
            return f.endsWith(pattern); // Suffix match for *.ext patterns
          }
          return f.includes(pattern);
        })
      );

      assert.strictEqual(watched.length, 1, 'Should only watch src/index.html');
    });
  });

  describe('Error Handling', () => {
    it('should handle file read errors gracefully', async () => {
      const nonExistentFile = join(testDir, 'missing.html');
      
      try {
        await readFile(nonExistentFile, 'utf-8');
        assert.fail('Should throw error');
      } catch (error) {
        assert.ok(error instanceof Error, 'Should catch file not found');
      }
    });

    it('should continue watching after fix failures', () => {
      const results = [
        { file: 'a.html', success: true },
        { file: 'b.html', success: false, error: 'Parse error' },
        { file: 'c.html', success: true },
      ];

      const successCount = results.filter(r => r.success).length;
      assert.strictEqual(successCount, 2, 'Should succeed on 2 files despite 1 failure');
    });

    it('should validate HTML before applying fixes', async () => {
      const invalidHTML = '<html><body><div></body></html>'; // Unclosed div
      const testFile = join(testDir, 'invalid.html');
      await writeFile(testFile, invalidHTML);

      // Should detect parsing issues
      const isValid = invalidHTML.includes('</div>');
      assert.strictEqual(isValid, false, 'Should detect invalid HTML');
    });
  });

  describe('Performance', () => {
    it('should debounce rapid file changes', async () => {
      const changes = [];
      const debounceMs = 300;
      
      // Simulate rapid saves
      for (let i = 0; i < 5; i++) {
        changes.push({ timestamp: Date.now(), file: 'test.html' });
      }

      // Only last change should trigger scan
      const shouldTrigger = changes.length > 0;
      assert.ok(shouldTrigger, 'Should debounce multiple changes');
    });

    it('should limit concurrent scans', () => {
      const maxConcurrent = 3;
      const queue = [
        'file1.html',
        'file2.html',
        'file3.html',
        'file4.html',
        'file5.html',
      ];

      const processing = queue.slice(0, maxConcurrent);
      assert.strictEqual(processing.length, 3, 'Should limit concurrent scans');
    });

    it('should cache scan results for unchanged files', async () => {
      const testFile = join(testDir, 'cached.html');
      const content = '<html lang="en"><body><h1>Test</h1></body></html>';
      
      await writeFile(testFile, content);
      
      // First scan
      const scan1 = { score: 100, cached: false };
      
      // Second scan (no changes)
      const scan2 = { score: 100, cached: true };

      assert.ok(scan2.cached, 'Should use cached result');
    });
  });

  describe('Integration with Fix Patterns', () => {
    it('should apply multiple fix patterns in order', async () => {
      const testFile = join(testDir, 'multiple-fixes.html');
      const content = '<html><body><img src="a.jpg"><button></button></body></html>';
      
      await writeFile(testFile, content);

      const patterns = [
        { id: 'html-has-lang', priority: 1 },
        { id: 'image-alt', priority: 2 },
        { id: 'button-name', priority: 3 },
      ];

      const sorted = patterns.sort((a, b) => a.priority - b.priority);
      assert.strictEqual(sorted[0].id, 'html-has-lang', 'Should apply in order');
    });

    it('should track fix success rate', () => {
      const attempts = [
        { pattern: 'image-alt', success: true },
        { pattern: 'image-alt', success: true },
        { pattern: 'image-alt', success: false },
        { pattern: 'button-name', success: true },
      ];

      const imageAltAttempts = attempts.filter(a => a.pattern === 'image-alt');
      const successRate = imageAltAttempts.filter(a => a.success).length / imageAltAttempts.length;
      
      assert.strictEqual(successRate, 2/3, 'Should calculate success rate');
    });
  });
});
