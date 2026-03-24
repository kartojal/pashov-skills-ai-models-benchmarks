#!/usr/bin/env bash
# Benchmark: OpenCode + Qwen 3.5 9B
# Invokes `opencode` CLI directly

set -euo pipefail
source "$(dirname "$0")/_common.sh"

TARGET="${1:?Usage: $0 <target-name>}"
RUN_ID="${2:-}"
RUNNER_ID="opencode-ai-qwen-3.5-plus-02-15"
HARNESS="opencode"
MODEL="qwen/qwen3.5-plus-02-15"
MODEL_ID="qwen/qwen3.5-plus-02-15"

run_benchmark "$TARGET" "$RUNNER_ID" "$HARNESS" "$MODEL" "$MODEL_ID" "$RUN_ID"
