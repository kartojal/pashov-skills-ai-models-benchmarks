import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import type { Report, Finding } from "./types";
import { useIsMobile } from "./useIsMobile";
import { getModelLogo } from "./modelLogos";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#3b82f6",
  informational: "#8b5cf6",
};

function shortModel(model: string): string {
  // Strip provider prefix (e.g. "anthropic/claude-opus-4.6" -> "claude-opus-4.6")
  const name = model.includes("/") ? model.split("/").pop()! : model;
  return name;
}

function shortLabel(r: Report): string {
  return `${r.metadata.harness} / ${shortModel(r.metadata.model)}`;
}

/** Multi-line label for chart x-axis: [harness, model] */
function chartLabel(r: Report): string[] {
  return [r.metadata.harness, shortModel(r.metadata.model)];
}

function extractWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

function wordOverlap(a: string, b: string): number {
  const wordsA = extractWords(a);
  const wordsB = extractWords(b);
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let matches = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) matches++;
  }
  const smaller = Math.min(wordsA.size, wordsB.size);
  return matches / smaller;
}

/** Normalize categories like "Oracle Manipulation" and "oracle-manipulation" */
function normalizeCategory(cat: string): string {
  return cat.toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
}

/** Category similarity: exact normalized match = 1, word overlap otherwise */
function categorySimilarity(a: string, b: string): number {
  const na = normalizeCategory(a);
  const nb = normalizeCategory(b);
  if (na === nb) return 1;
  return wordOverlap(na, nb);
}

/** Normalize file path for comparison (strip leading src/ etc.) */
function normalizeFile(f: string): string {
  return f.replace(/^(src\/|contracts\/|\.\/)/i, "").toLowerCase();
}

/** Check if two findings reference the same file */
function sameFile(a: Finding, b: Finding): boolean {
  const fa = a.location?.file;
  const fb = b.location?.file;
  if (!fa || !fb) return false;
  return normalizeFile(fa) === normalizeFile(fb);
}

/** Score how well an AI finding matches a human finding (0-1) */
function matchScore(ai: Finding, human: Finding): number {
  const catSim = categorySimilarity(ai.category, human.category);
  const titleSim = wordOverlap(ai.title, human.title);
  const descSim = wordOverlap(ai.description, human.description);
  const fileMatch = sameFile(ai, human);
  const textSim = titleSim * 0.4 + descSim * 0.6;

  // Same file + strong text evidence = high confidence match
  if (fileMatch && descSim >= 0.4) return 0.55 + textSim * 0.45;
  if (fileMatch && descSim >= 0.3 && titleSim >= 0.2) return 0.45 + textSim * 0.45;

  // Strong title match alone — require 3+ shared words to avoid
  // generic security terms ("reentrancy", "token") creating false matches
  const titleWordsA = extractWords(ai.title);
  const titleWordsB = extractWords(human.title);
  const sharedTitleWords = [...titleWordsA].filter((w) => titleWordsB.has(w)).length;
  if (titleSim >= 0.5 && sharedTitleWords >= 3) return 0.4 + titleSim * 0.6;

  // Strong description + title or category support (no file match)
  if (descSim >= 0.45 && titleSim >= 0.25) {
    return catSim * 0.1 + titleSim * 0.3 + descSim * 0.6;
  }

  // Default: conservative
  return catSim * 0.1 + titleSim * 0.4 + descSim * 0.3;
}

function countMatches(aiFindings: Finding[], humanFindings: Finding[]): number {
  const THRESHOLD = 0.5;
  let matched = 0;
  const used = new Set<number>();

  for (const hf of humanFindings) {
    let bestIdx = -1;
    let bestScore = 0;
    for (let i = 0; i < aiFindings.length; i++) {
      if (used.has(i)) continue;
      const score = matchScore(aiFindings[i]!, hf);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0 && bestScore >= THRESHOLD) {
      matched++;
      used.add(bestIdx);
    }
  }
  return matched;
}

interface Props {
  reports: Report[];
  onSelectModel: (model: string) => void;
}

export function ComparisonView({ reports, onSelectModel }: Props) {
  const isMobile = useIsMobile();

  const humanReport = reports.find((r) => r.metadata.model === "human");
  const humanFindings = humanReport?.findings ?? [];

  // Filter out human report from charts and dashboard data
  const aiReports = reports.filter((r) => r.metadata.model !== "human");
  const labels = aiReports.map(chartLabel);

  // Stacked bar: findings by severity
  const severityData = {
    labels,
    datasets: [
      {
        label: "Critical",
        data: aiReports.map((r) => r.summary.critical),
        backgroundColor: SEVERITY_COLORS.critical,
        borderRadius: 4,
      },
      {
        label: "High",
        data: aiReports.map((r) => r.summary.high),
        backgroundColor: SEVERITY_COLORS.high,
        borderRadius: 4,
      },
      {
        label: "Medium",
        data: aiReports.map((r) => r.summary.medium),
        backgroundColor: SEVERITY_COLORS.medium,
        borderRadius: 4,
      },
      {
        label: "Low",
        data: aiReports.map((r) => r.summary.low),
        backgroundColor: SEVERITY_COLORS.low,
        borderRadius: 4,
      },
      {
        label: "Informational",
        data: aiReports.map((r) => r.summary.informational),
        backgroundColor: SEVERITY_COLORS.informational,
        borderRadius: 4,
      },
    ],
  };

  // Duration comparison
  const durationData = {
    labels,
    datasets: [
      {
        label: "Duration (seconds)",
        data: aiReports.map((r) => r.metadata.duration_seconds),
        backgroundColor: aiReports.map(
          (_, i) =>
            `hsl(${230 + i * 15}, 70%, ${55 + (i % 3) * 5}%)`
        ),
        borderRadius: 6,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { color: "#aaa", font: { size: isMobile ? 9 : 11 } },
      },
    },
    scales: {
      x: {
        ticks: {
          color: "#ccc",
          font: { size: isMobile ? 8 : 11 },
          maxRotation: 0,
          minRotation: 0,
          autoSkip: false,
          padding: 4,
          callback: function (_value: unknown, index: number, _ticks: unknown[]) {
            const labelSet = (this as any).chart.data.labels;
            const label = labelSet?.[index];
            return label;
          },
        },
        afterFit(axis: any) {
          // Add extra height to accommodate staggered labels
          axis.paddingBottom = (axis.paddingBottom || 0) + 14;
        },
        grid: { color: "#1a1a2e" },
      },
      y: {
        ticks: { color: "#888", stepSize: 1 },
        grid: { color: "#1a1a2e" },
      },
    },
    layout: {
      padding: { bottom: 16 },
    },
  };

  // Plugin to stagger even-indexed x-axis tick labels downward
  const staggerLabelsPlugin = {
    id: "staggerLabels",
    afterDraw(chart: any) {
      const xAxis = chart.scales?.x;
      if (!xAxis) return;
      const ticks = xAxis.ticks;
      if (!ticks || ticks.length === 0) return;

      const ctx = chart.ctx;
      ctx.save();

      ticks.forEach((_tick: any, i: number) => {
        if (i % 2 !== 1) return; // only shift odd-indexed (0-based) labels
        const x = xAxis.getPixelForTick(i);
        const label = chart.data.labels?.[i];
        if (!label) return;

        const lines = Array.isArray(label) ? label : [label];
        const fontSize = isMobile ? 8 : 11;
        const lineHeight = fontSize + 3;
        const yBase = xAxis.bottom + 4;

        // Clear original label area for this tick
        const labelWidth = 90;
        ctx.fillStyle = "#0a0a14";
        ctx.fillRect(x - labelWidth / 2, yBase - 2, labelWidth, lineHeight * lines.length + 16);

        // Draw label shifted down
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.font = `${fontSize}px sans-serif`;
        ctx.fillStyle = "#ccc";
        lines.forEach((line: string, li: number) => {
          ctx.fillText(line, x, yBase + 12 + li * lineHeight);
        });
      });

      ctx.restore();
    },
  };

  const stackedOptions = {
    ...chartOptions,
    scales: {
      ...chartOptions.scales,
      x: { ...chartOptions.scales.x, stacked: true },
      y: { ...chartOptions.scales.y, stacked: true },
    },
  };

  // Score card stats (AI reports only)
  const totalFindings = aiReports.reduce(
    (sum, r) => sum + r.summary.total_findings,
    0
  );
  const avgDuration = Math.round(
    aiReports.reduce((sum, r) => sum + r.metadata.duration_seconds, 0) /
      aiReports.length
  );
  // Fidelity: match count against human findings per model
  const fidelityScores = aiReports
    .map((r) => ({
      report: r,
      matches: countMatches(r.findings, humanFindings),
    }))
    .sort((a, b) => b.matches - a.matches);
  const bestFidelity = fidelityScores[0];

  // Fidelity chart data (sorted by matches descending)
  const fidelityData = {
    labels: fidelityScores.map((s) => chartLabel(s.report)),
    datasets: [
      {
        label: "Matched Findings",
        data: fidelityScores.map((s) => s.matches),
        backgroundColor: fidelityScores.map((s) =>
          s === bestFidelity ? "#22c55e" : "#6366f1"
        ),
        borderRadius: 6,
      },
    ],
  };

  return (
    <div>
      {/* Score cards */}
      <div className="score-cards-grid">
        {[
          {
            label: "Models Tested",
            value: aiReports.length,
            color: "#6366f1",
          },
          {
            label: "Total Findings",
            value: totalFindings,
            color: "#f97316",
          },
          {
            label: "Avg Duration",
            value: `${avgDuration}s`,
            color: "#3b82f6",
          },
          {
            label: "Best Fidelity vs Human",
            value: bestFidelity ? shortLabel(bestFidelity.report) : "-",
            sub: bestFidelity ? `${bestFidelity.matches}/${humanFindings.length} matched` : "",
            color: "#22c55e",
            smallValue: true,
          },
        ].map((card, i) => (
          <div
            key={i}
            className="score-card"
            style={{
              background: "#12121f",
              border: "1px solid #2a2a4a",
              borderRadius: 12,
              padding: "20px 24px",
            }}
          >
            <div style={{ fontSize: 12, color: "#666680", marginBottom: 8 }}>
              {card.label}
            </div>
            <div
              className="card-value"
              style={{
                fontSize: card.smallValue ? 14 : 24,
                fontWeight: 700,
                color: card.color,
              }}
            >
              {card.value}
            </div>
            {card.sub && (
              <div style={{ fontSize: 11, color: "#666680", marginTop: 4 }}>
                {card.sub}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Charts Grid */}
      <div className="charts-grid" style={{ width: "98vw", maxWidth: "98vw", marginLeft: "calc(-49vw + 50%)", boxSizing: "border-box", padding: 10 }}>
        {/* Findings by Severity */}
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#a5b4fc", marginBottom: 12 }}>
            Findings by Severity
          </h3>
          <div className="bar-chart-container" style={{ height: 420, position: "relative", width: "100%", overflow: "hidden" }}>
            <Bar data={severityData} options={stackedOptions as any} plugins={[staggerLabelsPlugin]} />
          </div>
        </div>

        {/* Duration */}
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#a5b4fc", marginBottom: 12 }}>
            Audit Duration (seconds)
          </h3>
          <div className="bar-chart-container" style={{ height: 420, position: "relative", width: "100%", overflow: "hidden" }}>
            <Bar data={durationData} options={chartOptions as any} plugins={[staggerLabelsPlugin]} />
          </div>
        </div>

        {/* Fidelity vs Human */}
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#a5b4fc", marginBottom: 12 }}>
            Fidelity vs Human Audit ({humanFindings.length} findings)
          </h3>
          <div className="bar-chart-container" style={{ height: 420, position: "relative", width: "100%", overflow: "hidden" }}>
            <Bar data={fidelityData} options={chartOptions as any} plugins={[staggerLabelsPlugin]} />
          </div>
        </div>
      </div>

      {/* Leaderboard Table */}
      <div
        className="leaderboard-wrapper"
        style={{
          marginTop: 24,
          background: "#12121f",
          border: "1px solid #2a2a4a",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "16px 24px",
            borderBottom: "1px solid #2a2a4a",
            fontWeight: 600,
            fontSize: 15,
          }}
        >
          Leaderboard
        </div>
        <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            minWidth: 900,
            borderCollapse: "collapse",
            fontSize: 13,
          }}
        >
          <thead>
            <tr
              style={{
                borderBottom: "1px solid #2a2a4a",
                color: "#666680",
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              <th style={{ padding: "10px 24px", textAlign: "left" }}>#</th>
              <th style={{ padding: "10px 16px", textAlign: "left" }}>
                Model
              </th>
              <th style={{ padding: "10px 16px", textAlign: "left" }}>
                Harness
              </th>
              <th style={{ padding: "10px 16px", textAlign: "center" }}>
                Total
              </th>
              <th style={{ padding: "10px 16px", textAlign: "center" }}>
                Crit
              </th>
              <th style={{ padding: "10px 16px", textAlign: "center" }}>
                High
              </th>
              <th style={{ padding: "10px 16px", textAlign: "center" }}>
                Med
              </th>
              <th style={{ padding: "10px 16px", textAlign: "center" }}>
                Low
              </th>
              <th style={{ padding: "10px 16px", textAlign: "center" }}>
                Info
              </th>
              <th style={{ padding: "10px 16px", textAlign: "center" }}>
                Duration
              </th>
              <th style={{ padding: "10px 16px", textAlign: "center" }}>
                Diff
              </th>
              <th style={{ padding: "10px 16px" }}></th>
            </tr>
          </thead>
          <tbody>
            {aiReports.map((r, i) => {
              const diffLabel = `${countMatches(r.findings, humanFindings)}/${humanFindings.length}`;
              return (
                <tr
                  key={i}
                  style={{
                    borderBottom: "1px solid #1a1a2e",
                    cursor: "pointer",
                  }}
                  onClick={() => onSelectModel(r.metadata.model)}
                >
                  <td
                    style={{
                      padding: "12px 24px",
                      fontWeight: 700,
                      color:
                        i === 0
                          ? "#fbbf24"
                          : i === 1
                            ? "#94a3b8"
                            : i === 2
                              ? "#d97706"
                              : "#666680",
                    }}
                  >
                    {i + 1}
                  </td>
                  <td
                    style={{
                      padding: "12px 16px",
                      fontWeight: 600,
                      color: "#e0e0e8",
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {getModelLogo(r.metadata.model) && (
                        <img
                          src={getModelLogo(r.metadata.model)!}
                          alt=""
                          style={{ width: 20, height: 20, flexShrink: 0 }}
                        />
                      )}
                      {r.metadata.model}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px", color: "#8888aa" }}>
                    {r.metadata.harness}
                  </td>
                  <td
                    style={{
                      padding: "12px 16px",
                      textAlign: "center",
                      fontWeight: 700,
                      color: "#a5b4fc",
                    }}
                  >
                    {r.summary.total_findings}
                  </td>
                  <td
                    style={{
                      padding: "12px 16px",
                      textAlign: "center",
                      color: SEVERITY_COLORS.critical,
                    }}
                  >
                    {r.summary.critical}
                  </td>
                  <td
                    style={{
                      padding: "12px 16px",
                      textAlign: "center",
                      color: SEVERITY_COLORS.high,
                    }}
                  >
                    {r.summary.high}
                  </td>
                  <td
                    style={{
                      padding: "12px 16px",
                      textAlign: "center",
                      color: SEVERITY_COLORS.medium,
                    }}
                  >
                    {r.summary.medium}
                  </td>
                  <td
                    style={{
                      padding: "12px 16px",
                      textAlign: "center",
                      color: SEVERITY_COLORS.low,
                    }}
                  >
                    {r.summary.low}
                  </td>
                  <td
                    style={{
                      padding: "12px 16px",
                      textAlign: "center",
                      color: SEVERITY_COLORS.informational,
                    }}
                  >
                    {r.summary.informational}
                  </td>
                  <td
                    style={{
                      padding: "12px 16px",
                      textAlign: "center",
                      color: "#8888aa",
                    }}
                  >
                    {r.metadata.duration_seconds}s
                  </td>
                  <td
                    style={{
                      padding: "12px 16px",
                      textAlign: "center",
                      color: "#a5b4fc",
                      fontWeight: 600,
                      fontSize: 12,
                    }}
                  >
                    {diffLabel}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <span
                      style={{
                        color: "#6366f1",
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      View &rarr;
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

