#!/usr/bin/env bash
# Benchmark: OpenCode + Xiaomi MiMo v2 Pro
# Orchestrated by Hermes → invokes `opencode` CLI with MiMo v2 Pro

set -euo pipefail
source "$(dirname "$0")/_common.sh"

TARGET="${1:?Usage: $0 <target-name>}"
RUNNER_ID="opencode-ai-mimo-v2-pro"
HARNESS="opencode"
MODEL="xiaomi/mimo-v2-pro"
HARNESS_CMD="OpenCode (opencode --model xiaomi/mimo-v2-pro)"

run_benchmark "$TARGET" "$RUNNER_ID" "$HARNESS" "$MODEL" "$HARNESS_CMD"
