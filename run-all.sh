#!/usr/bin/env bash
# Master orchestrator — runs all AI security audit benchmarks against a target
#
# Usage:
#   ./run-all.sh <target-name>                  # Run all sequentially
#   ./run-all.sh <target-name> --parallel        # Run all in parallel
#   ./run-all.sh <target-name> --only claude-code-opus-4.6  # Run specific runner

set -euo pipefail

BENCHMARK_ROOT="$(cd "$(dirname "$0")" && pwd)"
RUNNERS_DIR="${BENCHMARK_ROOT}/ai-runners"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

TARGET="${1:?Usage: $0 <target-name> [--parallel] [--only <runner>]}"
shift

PARALLEL=false
ONLY=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --parallel) PARALLEL=true; shift ;;
    --only)     ONLY="$2"; shift 2 ;;
    *)          echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# All runner scripts (excluding _common.sh)
RUNNERS=(
  "claude-code-opus-4.6"
  "claude-code-sonnet-4.6"
  "opencode-gemini-3.1-pro"
  "codex-gpt-5.4"
  "opencode-mimo-v2-pro"
  "opencode-minimax-m2.7"
  "opencode-qwen3.5-9b"
  "opencode-grok-4.20-beta"
)

# Filter to single runner if --only specified
if [[ -n "$ONLY" ]]; then
  RUNNERS=("$ONLY")
fi

echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║       Security Audit Skills Benchmark                       ║${NC}"
echo -e "${BOLD}║       Pashov Skills × AI Models Comparison                  ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Target:${NC}   ${TARGET}"
echo -e "${CYAN}Runners:${NC}  ${#RUNNERS[@]}"
echo -e "${CYAN}Mode:${NC}     $(if $PARALLEL; then echo "parallel"; else echo "sequential"; fi)"
echo ""

# Verify target exists
if [[ ! -d "${BENCHMARK_ROOT}/targets/${TARGET}/repo" ]]; then
  echo -e "${RED}[ERROR]${NC} Target not found: targets/${TARGET}/repo" >&2
  exit 1
fi

# Check hermes is installed
if ! command -v hermes &>/dev/null; then
  echo -e "${RED}[ERROR]${NC} Hermes is not installed." >&2
  echo "  Install: curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash" >&2
  exit 1
fi

TOTAL=${#RUNNERS[@]}
PASSED=0
FAILED=0
PIDS=()
RUNNER_NAMES=()

start_time=$(date +%s)

run_single() {
  local runner="$1"
  local idx="$2"
  local script="${RUNNERS_DIR}/${runner}.sh"

  if [[ ! -x "$script" ]]; then
    echo -e "${RED}[${idx}/${TOTAL}] Runner not found: ${runner}${NC}" >&2
    return 1
  fi

  echo -e "${CYAN}[${idx}/${TOTAL}]${NC} Starting: ${BOLD}${runner}${NC}"
  if "$script" "$TARGET"; then
    echo -e "${GREEN}[${idx}/${TOTAL}] PASS:${NC} ${runner}"
    return 0
  else
    echo -e "${RED}[${idx}/${TOTAL}] FAIL:${NC} ${runner}"
    return 1
  fi
}

if $PARALLEL; then
  echo -e "${YELLOW}Launching all runners in parallel...${NC}"
  echo ""

  for i in "${!RUNNERS[@]}"; do
    runner="${RUNNERS[$i]}"
    idx=$((i + 1))
    script="${RUNNERS_DIR}/${runner}.sh"

    if [[ ! -x "$script" ]]; then
      echo -e "${RED}[${idx}/${TOTAL}] Runner not found: ${runner}${NC}" >&2
      FAILED=$((FAILED + 1))
      continue
    fi

    log_file="${BENCHMARK_ROOT}/reports/${TARGET}/${runner}.log"
    "$script" "$TARGET" > "$log_file" 2>&1 &
    PIDS+=($!)
    RUNNER_NAMES+=("$runner")
    echo -e "${CYAN}[${idx}/${TOTAL}]${NC} Launched: ${runner} (PID $!)"
  done

  echo ""
  echo -e "${YELLOW}Waiting for all runners to finish...${NC}"

  for i in "${!PIDS[@]}"; do
    pid="${PIDS[$i]}"
    runner="${RUNNER_NAMES[$i]}"
    if wait "$pid"; then
      echo -e "${GREEN}  PASS:${NC} ${runner}"
      PASSED=$((PASSED + 1))
    else
      echo -e "${RED}  FAIL:${NC} ${runner}"
      FAILED=$((FAILED + 1))
    fi
  done
else
  echo -e "${YELLOW}Running benchmarks sequentially...${NC}"
  echo ""

  for i in "${!RUNNERS[@]}"; do
    runner="${RUNNERS[$i]}"
    idx=$((i + 1))
    if run_single "$runner" "$idx"; then
      PASSED=$((PASSED + 1))
    else
      FAILED=$((FAILED + 1))
    fi
    echo ""
  done
fi

end_time=$(date +%s)
total_duration=$((end_time - start_time))

echo ""
echo -e "${BOLD}════════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Results${NC}"
echo -e "${BOLD}════════════════════════════════════════════════════════════════${NC}"
echo -e "  Total:    ${TOTAL}"
echo -e "  ${GREEN}Passed:${NC}   ${PASSED}"
echo -e "  ${RED}Failed:${NC}   ${FAILED}"
echo -e "  Duration: ${total_duration}s"
echo ""
echo -e "  Reports: ${BENCHMARK_ROOT}/reports/${TARGET}/"
echo ""
echo -e "  View dashboard: ${CYAN}cd dashboard && bun run dev${NC}"
echo ""

if [[ $FAILED -gt 0 ]]; then
  exit 1
fi
