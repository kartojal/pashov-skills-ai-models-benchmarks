#!/usr/bin/env python3
"""
Run a Solidity security audit via OpenRouter API using Python urllib.
Based on Pashov Audit Group skills methodology.
Outputs structured JSON report compatible with the benchmark schema.
"""

import json
import os
import sys
import time
from datetime import datetime, timezone
from urllib import request, error

# ── Config ──────────────────────────────────────────────────────────────
MODEL = "qwen/qwen3.5-9b"
TARGET_DIR = "/home/vscode/projects/security-audit-skills-benchmark/targets/notional-finance/repo"
OUTPUT_PATH = "/home/vscode/projects/security-audit-skills-benchmark/reports/notional-finance/opencode-ai-qwen3.5-9b.json"
API_URL = "https://openrouter.ai/api/v1/chat/completions"

# ── Read source files ──────────────────────────────────────────────────
def collect_sol_files(base_dir):
    """Collect .sol files from src/, excluding tests, interfaces, lib, mocks."""
    src_dir = os.path.join(base_dir, "src")
    files = []
    for root, dirs, filenames in os.walk(src_dir):
        # Skip excluded directories
        rel = os.path.relpath(root, base_dir)
        if any(excl in rel for excl in ["test", "interface", "lib", "mock"]):
            continue
        if any(excl in root for excl in ["test", "interface", "lib", "mock"]):
            continue
        for f in sorted(filenames):
            if f.endswith(".sol"):
                full = os.path.join(root, f)
                rel_path = os.path.relpath(full, base_dir)
                try:
                    with open(full, "r") as fh:
                        content = fh.read()
                    files.append({"path": rel_path, "content": content})
                except Exception as e:
                    print(f"Warning: Could not read {full}: {e}", file=sys.stderr)
    return files

# ── Build prompt ───────────────────────────────────────────────────────
AUDIT_SYSTEM_PROMPT = """You are an expert Solidity smart contract security auditor following the methodology of Pashov Audit Group. You perform thorough, systematic security reviews of DeFi protocols.

Your task: Perform a comprehensive security audit of the provided Solidity smart contracts. Focus on:

1. **Reentrancy vulnerabilities** - external calls before state updates
2. **Access control issues** - missing/incorrect modifiers, privilege escalation
3. **Integer overflow/underflow** - unchecked arithmetic (especially pre-0.8.0)
4. **Front-running / MEV** - sandwich attacks, transaction ordering dependence
5. **Oracle manipulation** - price oracle dependencies, flash loan attacks
6. **Flash loan attacks** - governance manipulation, liquidity draining
7. **Upgradability risks** - storage collisions, initializer bugs
8. **Denial of service** - gas griefing, block gas limit, unbounded loops
9. **Logic errors** - incorrect business logic, edge cases
10. **Centralization risks** - admin key management, single points of failure
11. **Token handling** - fee-on-transfer, rebasing tokens, ERC777 hooks
12. **External call safety** - return value handling, gas forwarding
13. **Timestamp dependence** - block.timestamp manipulation
14. **Unchecked return values** - low-level call failures
15. **ERC4626-specific** - inflation attacks, share price manipulation

For each finding, classify:
- **severity**: critical (direct fund loss), high (significant risk), medium (moderate risk), low (minor), informational (best practice)
- **confidence**: high, medium, low

OUTPUT FORMAT: Respond with a JSON object ONLY. No markdown fences, no explanation outside the JSON.

{
  "findings": [
    {
      "title": "<short title>",
      "severity": "<critical|high|medium|low|informational>",
      "confidence": "<high|medium|low>",
      "category": "<vulnerability category>",
      "description": "<detailed technical description of the vulnerability>",
      "file": "<relative file path>",
      "lines": "<line range, e.g. 45-67>",
      "recommendation": "<specific fix recommendation>"
    }
  ]
}

Be thorough but precise. Only report real vulnerabilities, not false positives. If you find no issues in a category, omit it. Every finding must reference specific file and line numbers."""

def build_user_prompt(sol_files):
    parts = ["Please audit the following Solidity smart contracts from the Notional Finance protocol:\n"]
    for f in sol_files:
        parts.append(f"\n{'='*60}")
        parts.append(f"FILE: {f['path']}")
        parts.append(f"{'='*60}")
        parts.append(f["content"])
    parts.append("\n\nProvide your complete audit findings as JSON.")
    return "\n".join(parts)

# ── API call ────────────────────────────────────────────────────────────
def call_openrouter(system_prompt, user_prompt, model):
    api_key = os.environ.get("OPENROUTER_API_KEY", "")
    if not api_key:
        print("ERROR: OPENROUTER_API_KEY not set", file=sys.stderr)
        sys.exit(1)

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.1,
        "max_tokens": 16384,
    }

    data = json.dumps(payload).encode("utf-8")
    req = request.Request(
        API_URL,
        data=data,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/security-audit-skills-benchmark",
        },
        method="POST",
    )

    print(f"Sending audit request to OpenRouter (model={model})...")
    print(f"Payload size: {len(data)} bytes")

    try:
        with request.urlopen(req, timeout=600) as resp:
            result = json.loads(resp.read().decode("utf-8"))
    except error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"HTTP Error {e.code}: {body}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Request failed: {e}", file=sys.stderr)
        sys.exit(1)

    content = result["choices"][0]["message"]["content"]
    usage = result.get("usage", {})
    print(f"Response received. Tokens: prompt={usage.get('prompt_tokens', '?')}, completion={usage.get('completion_tokens', '?')}")
    return content, usage

# ── Parse response ─────────────────────────────────────────────────────
def extract_json(text):
    """Try to extract JSON from the model response, handling markdown fences."""
    # Strip markdown fences if present
    cleaned = text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        # Remove first and last fence lines
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        cleaned = "\n".join(lines)

    # Try direct parse
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Try finding JSON object in text
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(cleaned[start:end+1])
        except json.JSONDecodeError:
            pass

    return None

# ── Main ───────────────────────────────────────────────────────────────
def main():
    start_time = time.time()
    timestamp = datetime.now(timezone.utc).isoformat()

    print(f"=== Security Audit Benchmark ===")
    print(f"Model: {MODEL}")
    print(f"Target: notional-finance")
    print(f"Timestamp: {timestamp}")

    # Collect source files
    sol_files = collect_sol_files(TARGET_DIR)
    print(f"Found {len(sol_files)} .sol files to audit")
    total_chars = sum(len(f["content"]) for f in sol_files)
    print(f"Total source size: {total_chars} chars")

    if not sol_files:
        print("ERROR: No .sol files found!", file=sys.stderr)
        sys.exit(1)

    # Build prompts
    system_prompt = AUDIT_SYSTEM_PROMPT
    user_prompt = build_user_prompt(sol_files)

    # Call API
    raw_response, usage = call_openrouter(system_prompt, user_prompt, MODEL)

    elapsed = round(time.time() - start_time, 2)
    print(f"Audit completed in {elapsed}s")

    # Parse findings
    parsed = extract_json(raw_response)
    findings_raw = []
    if parsed and "findings" in parsed:
        findings_raw = parsed["findings"]
    else:
        print("WARNING: Could not parse structured JSON from response. Using raw output only.", file=sys.stderr)

    # Build structured findings
    findings = []
    severity_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0, "informational": 0}

    for i, f in enumerate(findings_raw):
        sev = f.get("severity", "informational").lower()
        if sev not in severity_counts:
            sev = "informational"
        severity_counts[sev] += 1

        findings.append({
            "id": f"F-{i+1:03d}",
            "title": f.get("title", f"Finding {i+1}"),
            "severity": sev,
            "confidence": f.get("confidence", "medium").lower(),
            "category": f.get("category", "Unknown"),
            "description": f.get("description", ""),
            "location": {
                "file": f.get("file", ""),
                "lines": f.get("lines", "")
            },
            "recommendation": f.get("recommendation", ""),
            "agents_reporting": ["opencode-qwen3.5-9b"]
        })

    total = len(findings)

    # Build report
    report = {
        "metadata": {
            "model": MODEL,
            "harness": "opencode",
            "target": "notional-finance",
            "timestamp": timestamp,
            "duration_seconds": elapsed,
            "skill_version": "v2"
        },
        "summary": {
            "total_findings": total,
            "critical": severity_counts["critical"],
            "high": severity_counts["high"],
            "medium": severity_counts["medium"],
            "low": severity_counts["low"],
            "informational": severity_counts["informational"]
        },
        "findings": findings,
        "raw_output": raw_response
    }

    # Write report
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    print(f"\nReport saved to: {OUTPUT_PATH}")
    print(f"Total findings: {total}")
    print(f"  Critical: {severity_counts['critical']}")
    print(f"  High: {severity_counts['high']}")
    print(f"  Medium: {severity_counts['medium']}")
    print(f"  Low: {severity_counts['low']}")
    print(f"  Informational: {severity_counts['informational']}")
    print(f"Duration: {elapsed}s")

if __name__ == "__main__":
    main()
