#!/usr/bin/env bash
# Benchmark: OpenCode + Claude Opus 4.6 via OpenRouter
# Orchestrated by Hermes → invokes opencode CLI

set -euo pipefail
source "$(dirname "$0")/_common.sh"

TARGET="${1:?Usage: $0 <target-name>}"
RUNNER_ID="opencode-ai-claude-opus-4.6"
HARNESS="opencode"
MODEL="anthropic/claude-opus-4.6"
HARNESS_CMD="OpenCode (opencode --model anthropic/claude-opus-4.6)"

run_benchmark "$TARGET" "$RUNNER_ID" "$HARNESS" "$MODEL" "$HARNESS_CMD"
