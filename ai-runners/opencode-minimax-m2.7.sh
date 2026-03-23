#!/usr/bin/env bash
# Benchmark: OpenCode + MiniMax M2.7
# Orchestrated by Hermes → invokes `opencode` CLI with MiniMax M2.7

set -euo pipefail
source "$(dirname "$0")/_common.sh"

TARGET="${1:?Usage: $0 <target-name>}"
RUNNER_ID="opencode-ai-minimax-m2.7"
HARNESS="opencode"
MODEL="minimax/minimax-m2.7"
HARNESS_CMD="OpenCode (opencode --model minimax/minimax-m2.7)"

run_benchmark "$TARGET" "$RUNNER_ID" "$HARNESS" "$MODEL" "$HARNESS_CMD"
