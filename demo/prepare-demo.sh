#!/bin/bash
# Demo Recording Preparation Script
# Run this before recording to ensure a clean state

set -e

cd "$(dirname "$0")/.."

echo "=== Ally Demo Preparation ==="
echo ""

# 1. Build the project
echo "1. Building project..."
npm run build:all
echo "   ✓ Build complete"
echo ""

# 2. Clear history for fresh stats
echo "2. Clearing scan history..."
rm -rf .ally/history.json .ally/fix-history.json 2>/dev/null || true
mkdir -p .ally
echo "   ✓ History cleared"
echo ""

# 3. Test that scan works
echo "3. Testing scan command..."
node dist/cli.js scan ./demo --json > /dev/null 2>&1 && echo "   ✓ Scan works" || echo "   ✗ Scan failed"
echo ""

# 4. Show file status
echo "4. Demo files ready:"
ls -la demo/*.html
echo ""

# 5. Print recording checklist
echo "=== Recording Checklist ==="
echo ""
echo "[ ] Terminal font size: 18-20pt"
echo "[ ] Terminal width: ~100 columns"
echo "[ ] Dark theme enabled"
echo "[ ] Screen recording software ready"
echo "[ ] Audio recording ready (separate track recommended)"
echo "[ ] Timer visible for pacing"
echo "[ ] Practice run completed"
echo ""
echo "Ready to record! Start with:"
echo ""
echo "  cd $(pwd)"
echo "  clear"
echo "  ally scan ./demo"
echo ""
