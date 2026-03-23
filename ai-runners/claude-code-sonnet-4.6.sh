#!/usr/bin/env bash
# Benchmark: Claude Code + Claude Sonnet 4.6
# Orchestrated by Hermes → invokes `claude` CLI with Sonnet 4.6

set -euo pipefail
source "$(dirname "$0")/_common.sh"

TARGET="${1:?Usage: $0 <target-name>}"
RUNNER_ID="claude-code-ai-claude-sonnet-4.6"
HARNESS="claude-code"
MODEL="claude-sonnet-4.6"
HARNESS_CMD="Claude Code (claude --model claude-sonnet-4-6)"

run_benchmark "$TARGET" "$RUNNER_ID" "$HARNESS" "$MODEL" "$HARNESS_CMD"
