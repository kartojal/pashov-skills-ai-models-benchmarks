#!/usr/bin/env bash
# Shared utilities for AI runner scripts
# Invokes AI coding harnesses (claude-code, opencode, codex) directly — no orchestrator needed.

set -euo pipefail

BENCHMARK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# Resolve target directory
resolve_target() {
  local target_name="$1"
  local target_dir="${BENCHMARK_ROOT}/targets/${target_name}/repo"
  if [[ ! -d "$target_dir" ]]; then
    log_error "Target not found: ${target_dir}"
    exit 1
  fi
  echo "$target_dir"
}

# Resolve report output path (supports run numbering)
resolve_report_path() {
  local target_name="$1"
  local runner_id="$2"
  local run_id="${3:-}"

  local report_dir="${BENCHMARK_ROOT}/reports/${target_name}"
  if [[ -n "$run_id" ]]; then
    report_dir="${report_dir}/${run_id}"
  fi
  mkdir -p "$report_dir"
  echo "${report_dir}/${runner_id}.json"
}

# Check that a harness CLI is available
require_harness() {
  local harness="$1"
  local cmd=""
  case "$harness" in
    claude-code) cmd="claude" ;;
    opencode)    cmd="opencode" ;;
    codex)       cmd="codex" ;;
    *)
      log_error "Unknown harness: ${harness}"
      exit 1
      ;;
  esac

  if ! command -v "$cmd" &>/dev/null; then
    log_error "${harness} (${cmd}) is not installed."
    exit 1
  fi
}

# Build the full audit prompt from the target's AUDIT_PROMPT.md
build_audit_prompt() {
  local target_name="$1"
  local target_dir="$2"
  local report_path="$3"
  local harness="$4"
  local model="$5"

  local prompt_file="${BENCHMARK_ROOT}/targets/${target_name}/AUDIT_PROMPT.md"
  local integrations_file="${BENCHMARK_ROOT}/targets/${target_name}/integrations-context/INTEGRATIONS_CONTEXT.md"

  # Read the audit prompt
  local audit_scope=""
  if [[ -f "$prompt_file" ]]; then
    audit_scope="$(cat "$prompt_file")"
  else
    log_warn "No AUDIT_PROMPT.md found for ${target_name}, using generic scope"
    audit_scope="Audit all .sol files under src/ (exclude tests/, interfaces/, lib/, mocks/)."
  fi

  # Determine skill invocation syntax per harness
  local skill_prefix="/"
  case "$harness" in
    codex) skill_prefix="\$" ;;
  esac

  cat <<PROMPT
You are running a security audit benchmark. Follow these steps exactly:

1. Navigate to the target directory: ${target_dir}
2. Read the integrations context file at: ${integrations_file}
3. Run ${skill_prefix}solidity-auditor against the codebase with the scope and focus described below.
4. Collect ALL findings (Critical, High, Medium severity — skip Low/Informational unless they enable a higher-severity exploit chain).
5. Format the results as a JSON object matching the schema below and write it to: ${report_path}

## Audit Scope & Focus

${audit_scope}

## Output JSON Schema

Write a single JSON file to ${report_path} with this exact structure:
{
  "metadata": {
    "model": "${model}",
    "harness": "${harness}",
    "target": "${target_name}",
    "timestamp": "<ISO 8601 timestamp>",
    "duration_seconds": <elapsed seconds>,
    "skill_version": "v2"
  },
  "summary": {
    "total_findings": <count>,
    "critical": <count>,
    "high": <count>,
    "medium": <count>,
    "low": <count>,
    "informational": <count>
  },
  "findings": [
    {
      "id": "F-001",
      "title": "<finding title>",
      "severity": "<critical|high|medium|low|informational>",
      "confidence": "<high|medium|low>",
      "category": "<vulnerability category>",
      "description": "<detailed description with root cause and impact>",
      "location": { "file": "<relative path>", "lines": "<line range>" },
      "recommendation": "<specific fix recommendation>",
      "agents_reporting": ["<agent names that found this>"]
    }
  ],
  "raw_output": "<full markdown output from the audit>"
}

IMPORTANT:
- Record start time before the audit and calculate duration_seconds.
- Each finding must have a unique sequential ID (F-001, F-002, ...).
- Severity: critical = direct fund loss, high = significant exploitable risk, medium = moderate risk under specific conditions.
- Save the JSON file to exactly: ${report_path}
- Do NOT ask for confirmation — run fully autonomously.
PROMPT
}

# ─── Harness-specific invocation ─────────────────────────────────────────────

run_claude_code() {
  local model_id="$1"
  local prompt="$2"
  local log_file="$3"
  local target_dir="$4"

  cd "$target_dir"
  claude \
    --model "$model_id" \
    -p \
    --dangerously-skip-permissions \
    --output-format text \
    "$prompt" \
    2>&1 | tee "$log_file"
}

run_opencode() {
  local model_id="$1"
  local prompt="$2"
  local log_file="$3"
  local target_dir="$4"

  (
    set -euo pipefail

    cd "$target_dir"
    opencode \
      --model "openrouter/$model_id" \
      run "$prompt" \
      2>&1 | tee "$log_file"
  )
}

run_codex() {
  local model_id="$1"
  local prompt="$2"
  local log_file="$3"

  codex exec \
    --model "$model_id" \
    --full-auto \
    "$prompt" \
    2>&1 | tee "$log_file"
}

# ─── Main benchmark runner ───────────────────────────────────────────────────

run_benchmark() {
  local target_name="$1"
  local runner_id="$2"
  local harness="$3"
  local model="$4"
  local model_id="$5"         # CLI-specific model identifier
  local run_id="${6:-}"        # optional run ID (e.g., "run-1")

  require_harness "$harness"

  local target_dir
  target_dir="$(resolve_target "$target_name")"

  local report_path
  report_path="$(resolve_report_path "$target_name" "$runner_id" "$run_id")"

  local audit_prompt
  audit_prompt="$(build_audit_prompt "$target_name" "$target_dir" "$report_path" "$harness" "$model")"

  local log_file="${report_path%.json}.log"

  log_info "Starting benchmark: ${runner_id}"
  log_info "  Target:  ${target_name} (${target_dir})"
  log_info "  Harness: ${harness}"
  log_info "  Model:   ${model}"
  log_info "  Report:  ${report_path}"
  [[ -n "$run_id" ]] && log_info "  Run:     ${run_id}"

  local start_time
  start_time=$(date +%s)

  # Dry-run mode: print the prompt and exit
  if [[ "${DRY_RUN:-false}" == "true" ]]; then
    log_info "DRY RUN — prompt that would be sent to ${harness}:"
    echo ""
    echo "────────────────────────────────────────────────────────────"
    echo "$audit_prompt"
    echo "────────────────────────────────────────────────────────────"
    echo ""
    log_info "Report would be written to: ${report_path}"
    log_info "Log would be written to: ${log_file}"
    return 0
  fi

  # Dispatch to harness
  log_info "Invoking ${harness}..."
  case "$harness" in
    claude-code) run_claude_code "$model_id" "$audit_prompt" "$log_file" "$target_dir" ;;
    opencode)    run_opencode    "$model_id" "$audit_prompt" "$log_file" "$target_dir" ;;
    codex)       run_codex       "$model_id" "$audit_prompt" "$log_file" "$target_dir" ;;
  esac

  local end_time
  end_time=$(date +%s)
  local duration=$(( end_time - start_time ))

  if [[ -f "$report_path" ]]; then
    log_ok "Benchmark complete: ${runner_id} (${duration}s)"
    log_ok "Report saved to: ${report_path}"

    # Patch duration if the AI didn't set it correctly
    if command -v jq &>/dev/null; then
      local tmp
      tmp=$(mktemp)
      jq --argjson dur "$duration" '.metadata.duration_seconds = $dur' "$report_path" > "$tmp" && mv "$tmp" "$report_path"
    fi
  else
    log_error "Benchmark failed: ${runner_id} — no report generated"
    # Create a minimal failure report
    cat > "$report_path" <<EOF
{
  "metadata": {
    "model": "${model}",
    "harness": "${harness}",
    "target": "${target_name}",
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "duration_seconds": ${duration},
    "skill_version": "v2"
  },
  "summary": {
    "total_findings": 0,
    "critical": 0,
    "high": 0,
    "medium": 0,
    "low": 0,
    "informational": 0
  },
  "findings": [],
  "raw_output": "ERROR: Benchmark run failed. Check ${log_file} for details."
}
EOF
    exit 1
  fi
}
