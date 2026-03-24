#!/usr/bin/env bash
# Benchmark: OpenCode + MiniMax M2.7
# Invokes `opencode` CLI directly

set -euo pipefail
source "$(dirname "$0")/_common.sh"

TARGET="${1:?Usage: $0 <target-name>}"
RUN_ID="${2:-}"
RUNNER_ID="opencode-ai-minimax-m2.7"
HARNESS="opencode"
MODEL="minimax/minimax-m2.7"
MODEL_ID="minimax/minimax-m2.7"

run_benchmark "$TARGET" "$RUNNER_ID" "$HARNESS" "$MODEL" "$MODEL_ID" "$RUN_ID"
