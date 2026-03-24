#!/usr/bin/env bash
# Benchmark: OpenCode + Xiaomi MiMo v2 Pro
# Invokes `opencode` CLI directly

set -euo pipefail
source "$(dirname "$0")/_common.sh"

TARGET="${1:?Usage: $0 <target-name>}"
RUN_ID="${2:-}"
RUNNER_ID="opencode-ai-mimo-v2-pro"
HARNESS="opencode"
MODEL="xiaomi/mimo-v2-pro"
MODEL_ID="xiaomi/mimo-v2-pro"

run_benchmark "$TARGET" "$RUNNER_ID" "$HARNESS" "$MODEL" "$MODEL_ID" "$RUN_ID"
