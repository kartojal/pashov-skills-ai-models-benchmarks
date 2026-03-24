#!/usr/bin/env bash
# Benchmark: OpenCode + Qwen 3.5 27B via OpenRouter
# Orchestrated by Hermes → invokes opencode CLI

set -euo pipefail
source "$(dirname "$0")/_common.sh"

TARGET="${1:?Usage: $0 <target-name>}"
RUNNER_ID="opencode-ai-qwen3.5-27b"
HARNESS="opencode"
MODEL="qwen/qwen3.5-27b"
HARNESS_CMD="OpenCode (opencode --model qwen/qwen3.5-27b)"

run_benchmark "$TARGET" "$RUNNER_ID" "$HARNESS" "$MODEL" "$HARNESS_CMD"
