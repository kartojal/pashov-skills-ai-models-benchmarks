#!/usr/bin/env bash
# Benchmark: Claude Code + Claude Sonnet 4.6
# Invokes `claude` CLI directly with Sonnet 4.6

set -euo pipefail
source "$(dirname "$0")/_common.sh"

TARGET="${1:?Usage: $0 <target-name>}"
RUN_ID="${2:-}"
RUNNER_ID="claude-code-ai-claude-sonnet-4.6"
HARNESS="claude-code"
MODEL="claude-sonnet-4.6"
MODEL_ID="claude-sonnet-4-6"

run_benchmark "$TARGET" "$RUNNER_ID" "$HARNESS" "$MODEL" "$MODEL_ID" "$RUN_ID"
