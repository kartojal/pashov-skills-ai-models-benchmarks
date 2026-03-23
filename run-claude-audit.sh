#!/bin/bash
set -e

TARGET_DIR="/home/vscode/projects/security-audit-skills-benchmark/targets/notional-finance/repo"
OUTPUT_FILE="/tmp/claude-audit-raw-output.txt"
START_TIME=$(date +%s)

echo "START_TIME=${START_TIME}" > /tmp/audit-timing.env
echo "Starting solidity-auditor audit at $(date -u +%Y-%m-%dT%H:%M:%SZ)"

cd "$TARGET_DIR"

claude --model claude-opus-4-6 \
  -p \
  --dangerously-skip-permissions \
  --permission-mode bypassPermissions \
  --output-format json \
  "/solidity-auditor Perform a comprehensive security audit of the Solidity smart contracts in this repository. Focus on the src/ directory and exclude test files, interfaces, lib, and mocks. Analyze all .sol files in src/ and its subdirectories (oracles, proxy, rewards, routers, single-sided-lp, staking, utils, withdraws). Look for all vulnerability categories: reentrancy, access control, integer overflow/underflow, front-running, oracle manipulation, flash loan attacks, upgradeability issues, governance attacks, economic exploits, logic errors, unchecked returns, delegatecall risks, and any other security concerns. For each finding, provide: title, severity (critical/high/medium/low/informational), confidence (high/medium/low), category, detailed description, file path and line numbers, and a specific recommendation for fixing it." \
  2>&1 | tee "$OUTPUT_FILE"

END_TIME=$(date +%s)
echo "END_TIME=${END_TIME}" >> /tmp/audit-timing.env
echo "Audit completed at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Duration: $((END_TIME - START_TIME)) seconds"
