#!/usr/bin/env python3
"""Run a Solidity security audit via OpenRouter API and produce structured JSON report."""

import json
import os
import sys
import time
import subprocess
import re
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.error import HTTPError

TARGET_DIR = "/home/vscode/projects/security-audit-skills-benchmark/targets/notional-finance/repo"
REPORT_PATH = "/home/vscode/projects/security-audit-skills-benchmark/reports/notional-finance/opencode-ai-qwen3.5-9b.json"
MODEL = "qwen/qwen3.5-9b"
HARNESS = "opencode"
TARGET_NAME = "notional-finance"
SKILL_VERSION = "v2"

def collect_sol_files(target_dir):
    result = subprocess.run(
        ["find", "src", "-name", "*.sol",
         "!", "-path", "*/tests/*",
         "!", "-path", "*/interfaces/*",
         "!", "-path", "*/lib/*",
         "!", "-path", "*/mocks/*"],
        capture_output=True, text=True, cwd=target_dir
    )
    files = sorted(result.stdout.strip().split("\n"))
    return [f for f in files if f]

def read_files(target_dir, file_list):
    contents = {}
    for fp in file_list:
        full_path = os.path.join(target_dir, fp)
        try:
            with open(full_path, "r") as f:
                contents[fp] = f.read()
        except Exception as e:
            print(f"Warning: Could not read {fp}: {e}")
    return contents

AUDIT_PROMPT = """You are a senior smart contract security auditor following the Pashov Audit Group methodology. Perform a comprehensive security audit of the following Solidity smart contracts.

Analyze ALL of the following source files for security vulnerabilities. For each finding, provide:
- A clear title
- Severity: critical (direct fund loss), high (significant exploitable risk), medium (moderate risk under specific conditions), low (minor issues), informational (best practices)
- Confidence: high, medium, or low
- Category (e.g., reentrancy, access-control, arithmetic, centralization, oracle-manipulation, flash-loan, logic-error, etc.)
- Detailed description of the vulnerability
- File path and line numbers
- Specific recommendation to fix
- Which agent/perspective found it

After analyzing, output your findings in the following EXACT JSON format (and nothing else - no markdown fences, no extra text):

{
  "findings": [
    {
      "title": "<finding title>",
      "severity": "<critical|high|medium|low|informational>",
      "confidence": "<high|medium|low>",
      "category": "<vulnerability category>",
      "description": "<detailed description>",
      "location": { "file": "<relative path from src/>", "lines": "<line range>" },
      "recommendation": "<fix recommendation>",
      "agents_reporting": ["qwen3.5-9b"]
    }
  ]
}

Here are the smart contracts to audit:

"""

def build_prompt(file_contents):
    prompt = AUDIT_PROMPT
    for path, content in sorted(file_contents.items()):
        prompt += f"\n--- FILE: {path} ---\n"
        prompt += content
        prompt += f"\n--- END FILE: {path} ---\n"
    return prompt

def call_openrouter(model, prompt):
    api_key = os.environ.get("OPENROUTER_API_KEY", "")
    if not api_key:
        print("ERROR: OPENROUTER_API_KEY not set", file=sys.stderr)
        sys.exit(1)

    payload = json.dumps({
        "model": model,
        "messages": [
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.1,
        "max_tokens": 32000
    }).encode("utf-8")

    req = Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/pashov/skills"
        },
        method="POST"
    )

    print(f"Calling OpenRouter API with model {model}...")
    try:
        with urlopen(req, timeout=600) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            return result
    except HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"HTTP Error {e.code}: {body}", file=sys.stderr)
        sys.exit(1)

def extract_json_from_response(content):
    try:
        parsed = json.loads(content)
        return parsed
    except json.JSONDecodeError:
        pass

    fence_match = re.search(r'```(?:json)?\s*\n?(.*?)\n?\s*```', content, re.DOTALL)
    if fence_match:
        try:
            parsed = json.loads(fence_match.group(1))
            return parsed
        except json.JSONDecodeError:
            pass

    json_match = re.search(r'\{[\s\S]*\}', content)
    if json_match:
        try:
            parsed = json.loads(json_match.group(0))
            return parsed
        except json.JSONDecodeError:
            pass

    return None

def build_report(findings_parsed, raw_output, duration):
    summary = {
        "total_findings": 0,
        "critical": 0,
        "high": 0,
        "medium": 0,
        "low": 0,
        "informational": 0
    }

    findings = []
    raw_findings = []
    if findings_parsed and "findings" in findings_parsed:
        raw_findings = findings_parsed["findings"]

    for i, f in enumerate(raw_findings):
        severity = f.get("severity", "informational").lower()
        if severity not in summary:
            severity = "informational"

        finding = {
            "id": f"F-{i+1:03d}",
            "title": f.get("title", "Unknown"),
            "severity": severity,
            "confidence": f.get("confidence", "medium"),
            "category": f.get("category", "unknown"),
            "description": f.get("description", ""),
            "location": f.get("location", {"file": "unknown", "lines": "unknown"}),
            "recommendation": f.get("recommendation", ""),
            "agents_reporting": f.get("agents_reporting", ["qwen3.5-9b"])
        }
        findings.append(finding)
        summary[severity] += 1
        summary["total_findings"] += 1

    report = {
        "metadata": {
            "model": MODEL,
            "harness": HARNESS,
            "target": TARGET_NAME,
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "duration_seconds": duration,
            "skill_version": SKILL_VERSION
        },
        "summary": summary,
        "findings": findings,
        "raw_output": raw_output
    }
    return report

def main():
    print(f"Audit target: {TARGET_NAME}")
    print(f"Target dir: {TARGET_DIR}")
    print(f"Model: {MODEL}")
    print(f"Report: {REPORT_PATH}")

    files = collect_sol_files(TARGET_DIR)
    print(f"Found {len(files)} Solidity files to audit")
    for f in files:
        print(f"  - {f}")

    file_contents = read_files(TARGET_DIR, files)
    total_lines = sum(c.count("\n") + 1 for c in file_contents.values())
    print(f"Total lines: {total_lines}")

    prompt = build_prompt(file_contents)
    print(f"Prompt size: {len(prompt)} characters")

    start_time = time.time()

    response = call_openrouter(MODEL, prompt)

    duration = int(time.time() - start_time)
    print(f"Audit completed in {duration} seconds")

    raw_output = ""
    if "choices" in response and len(response["choices"]) > 0:
        raw_output = response["choices"][0].get("message", {}).get("content", "")

    if not raw_output:
        print("ERROR: Empty response from model", file=sys.stderr)
        raw_output = "ERROR: No response from model"
        findings_parsed = None
    else:
        print(f"Response length: {len(raw_output)} characters")
        findings_parsed = extract_json_from_response(raw_output)

    if findings_parsed:
        n = len(findings_parsed.get("findings", []))
        print(f"Parsed {n} findings from response")
    else:
        print("WARNING: Could not parse structured JSON from response, saving raw output only")
        findings_parsed = {"findings": []}

    report = build_report(findings_parsed, raw_output, duration)

    os.makedirs(os.path.dirname(REPORT_PATH), exist_ok=True)

    with open(REPORT_PATH, "w") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    print(f"\nReport saved to: {REPORT_PATH}")
    print(f"Total findings: {report['summary']['total_findings']}")
    print(f"  Critical: {report['summary']['critical']}")
    print(f"  High: {report['summary']['high']}")
    print(f"  Medium: {report['summary']['medium']}")
    print(f"  Low: {report['summary']['low']}")
    print(f"  Informational: {report['summary']['informational']}")

if __name__ == "__main__":
    main()
