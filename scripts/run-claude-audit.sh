#!/bin/bash
set -e

TARGET_DIR="/home/vscode/projects/security-audit-skills-benchmark/targets/notional-finance/repo"
OUTPUT_FILE="/home/vscode/projects/security-audit-skills-benchmark/reports/notional-finance/claude-code-raw-output.md"

echo "=== Claude Code Solidity Audit ==="
echo "Target: $TARGET_DIR"
echo "Start: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
START_EPOCH=$(date +%s)
echo "StartEpoch: $START_EPOCH"

# Run Claude Code with the solidity-auditor skill
cd "$TARGET_DIR"

claude --print \
  --model claude-opus-4-6 \
  --allowedTools "Bash,Read,Glob,Grep,Write,Agent" \
  "/solidity-auditor" 2>&1 | tee "$OUTPUT_FILE"

EXIT_CODE=${PIPESTATUS[0]}
END_EPOCH=$(date +%s)
DURATION=$((END_EPOCH - START_EPOCH))

echo ""
echo "=== Audit Complete ==="
echo "End: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Duration: ${DURATION}s"
echo "ExitCode: $EXIT_CODE"
echo "OutputFile: $OUTPUT_FILE"

# Save duration for later use
echo "$DURATION" > /tmp/audit-duration.txt
