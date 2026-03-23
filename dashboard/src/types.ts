export interface Finding {
  id: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low" | "informational";
  confidence: "high" | "medium" | "low";
  category: string;
  description: string;
  location?: {
    file: string;
    lines: string;
  };
  recommendation?: string;
  agents_reporting?: string[];
}

export interface ReportSummary {
  total_findings: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  informational: number;
}

export interface ReportMetadata {
  model: string;
  harness: string;
  target: string;
  timestamp: string;
  duration_seconds: number;
  skill_version: string;
}

export interface Report {
  metadata: ReportMetadata;
  summary: ReportSummary;
  findings: Finding[];
  raw_output?: string;
}

export type ReportsMap = Record<string, Report[]>;
