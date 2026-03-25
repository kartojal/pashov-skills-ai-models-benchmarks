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
import type { Report } from "./types";
import { useIsMobile } from "./useIsMobile";
import { getModelLogo } from "./modelLogos";
import { matchScore, countMatches, countUniqueFindings } from "./findingMatcher";

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
          padding: isMobile ? -1 : 4,
          callback: function (_value: unknown, index: number, _ticks: unknown[]) {
            if (isMobile && index % 2 === 1) return ""; // hide odd labels; drawn by plugin
            const labelSet = (this as any).chart.data.labels;
            const label = labelSet?.[index];
            return label;
          },
        },
        afterFit(axis: any) {
          // Add extra height to accommodate staggered labels
          axis.paddingBottom = (axis.paddingBottom || 0) + (isMobile ? 34 : 14);
        },
        grid: { color: "#1a1a2e" },
      },
      y: {
        ticks: { color: "#888", stepSize: 1 },
        grid: { color: "#1a1a2e" },
      },
    },
    layout: {
      padding: { bottom: isMobile ? 34 : 16 },
    },
  };

  // Plugin to draw odd-indexed x-axis labels staggered below even ones (mobile only)
  const staggerLabelsPlugin = {
    id: "staggerLabels",
    afterDraw(chart: any) {
      if (!isMobile) return;
      const xAxis = chart.scales?.x;
      if (!xAxis) return;
      const ticks = xAxis.ticks;
      if (!ticks || ticks.length === 0) return;

      const ctx = chart.ctx;
      ctx.save();

      const fontSize = 8;
      const lineHeight = fontSize + 3;

      ticks.forEach((_tick: any, i: number) => {
        if (i % 2 !== 1) return;
        const x = xAxis.getPixelForTick(i);
        const label = chart.data.labels?.[i];
        if (!label) return;

        const lines = Array.isArray(label) ? label : [label];
        // Position below the even-indexed labels
        const yBase = xAxis.bottom + lineHeight + 1;

        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.font = `${fontSize}px sans-serif`;
        ctx.fillStyle = "#ccc";
        lines.forEach((line: string, li: number) => {
          ctx.fillText(line, x, yBase + li * lineHeight);
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
  const allAiFindings = aiReports.flatMap((r) => r.findings);
  const totalFindings = countUniqueFindings(allAiFindings);

  // Aggregated AI coverage: how many unique human findings are matched by ANY AI report
  const aggregatedMatches = countMatches(allAiFindings, humanFindings);
  const aggregatedCoverage = humanFindings.length > 0
    ? Math.round((aggregatedMatches / humanFindings.length) * 100)
    : 0;

  // Fidelity: match count against human findings per model
  const fidelityScores = aiReports
    .map((r) => ({
      report: r,
      matches: countMatches(r.findings, humanFindings),
    }))
    .sort((a, b) => b.matches - a.matches);
  const bestFidelity = fidelityScores[0];

  // High-severity fidelity: match count against only human HIGH findings
  const humanHighFindings = humanFindings.filter((f) => f.severity === "high");
  const highFidelityScores = aiReports
    .map((r) => ({
      report: r,
      matches: countMatches(r.findings, humanHighFindings),
    }))
    .sort((a, b) => b.matches - a.matches);
  const bestHighFidelity = highFidelityScores[0];

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

  // High fidelity chart data (sorted by matches descending)
  const highFidelityData = {
    labels: highFidelityScores.map((s) => chartLabel(s.report)),
    datasets: [
      {
        label: "Matched High Findings",
        data: highFidelityScores.map((s) => s.matches),
        backgroundColor: highFidelityScores.map((s) =>
          s === bestHighFidelity ? "#f97316" : "#f9731680"
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
            label: "Total Findings",
            value: `${totalFindings} unique`,
            sub: `${aggregatedCoverage}% aggregated AI vs human coverage`,
            color: "#f97316",
          },
          {
            label: "Best Fidelity vs Human",
            value: bestFidelity ? shortLabel(bestFidelity.report) : "-",
            sub: bestFidelity ? `${bestFidelity.matches}/${humanFindings.length} matched` : "",
            color: "#ffffff",
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

        {/* Fidelity vs Human */}
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#a5b4fc", marginBottom: 12 }}>
            Fidelity vs Human Audit ({humanFindings.length} findings)
          </h3>
          <div className="bar-chart-container" style={{ height: 420, position: "relative", width: "100%", overflow: "hidden" }}>
            <Bar data={fidelityData} options={chartOptions as any} plugins={[staggerLabelsPlugin]} />
          </div>
        </div>

        {/* Fidelity vs Human Highs */}
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#f97316", marginBottom: 12 }}>
            Fidelity vs Human Highs ({humanHighFindings.length} high findings)
          </h3>
          <div className="bar-chart-container" style={{ height: 420, position: "relative", width: "100%", overflow: "hidden" }}>
            <Bar data={highFidelityData} options={chartOptions as any} plugins={[staggerLabelsPlugin]} />
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
              <th style={{ padding: "10px 16px", textAlign: "center" }}>
                High Diff
              </th>
              <th style={{ padding: "10px 16px" }}></th>
            </tr>
          </thead>
          <tbody>
            {[...aiReports]
              .sort((a, b) => countMatches(b.findings, humanFindings) - countMatches(a.findings, humanFindings))
              .map((r, i) => {
              const diffLabel = `${countMatches(r.findings, humanFindings)}/${humanFindings.length}`;
              const highDiffLabel = `${countMatches(r.findings, humanHighFindings)}/${humanHighFindings.length}`;
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
                          style={{ width: 20, height: 20, flexShrink: 0, background: "white", borderRadius: "50%", padding: 2 }}
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
                  <td
                    style={{
                      padding: "12px 16px",
                      textAlign: "center",
                      color: "#f97316",
                      fontWeight: 600,
                      fontSize: 12,
                    }}
                  >
                    {highDiffLabel}
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

