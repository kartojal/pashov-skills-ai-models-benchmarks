import type React from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
} from "chart.js";
import { Bar, Radar } from "react-chartjs-2";
import type { Report } from "./types";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler
);

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#3b82f6",
  informational: "#8b5cf6",
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "#22c55e",
  medium: "#eab308",
  low: "#ef4444",
};

function shortLabel(r: Report) {
  return `${r.metadata.harness} / ${r.metadata.model}`;
}

interface Props {
  reports: Report[];
  onSelectModel: (model: string) => void;
}

export function ComparisonView({ reports, onSelectModel }: Props) {
  const labels = reports.map(shortLabel);

  // Stacked bar: findings by severity
  const severityData = {
    labels,
    datasets: [
      {
        label: "Critical",
        data: reports.map((r) => r.summary.critical),
        backgroundColor: SEVERITY_COLORS.critical,
        borderRadius: 4,
      },
      {
        label: "High",
        data: reports.map((r) => r.summary.high),
        backgroundColor: SEVERITY_COLORS.high,
        borderRadius: 4,
      },
      {
        label: "Medium",
        data: reports.map((r) => r.summary.medium),
        backgroundColor: SEVERITY_COLORS.medium,
        borderRadius: 4,
      },
      {
        label: "Low",
        data: reports.map((r) => r.summary.low),
        backgroundColor: SEVERITY_COLORS.low,
        borderRadius: 4,
      },
      {
        label: "Informational",
        data: reports.map((r) => r.summary.informational),
        backgroundColor: SEVERITY_COLORS.informational,
        borderRadius: 4,
      },
    ],
  };

  // Confidence distribution bar chart
  const confidenceCounts = reports.map((r) => {
    const counts = { high: 0, medium: 0, low: 0 };
    r.findings.forEach((f) => {
      if (f.confidence in counts) counts[f.confidence]++;
    });
    return counts;
  });

  const confidenceData = {
    labels,
    datasets: [
      {
        label: "High Confidence",
        data: confidenceCounts.map((c) => c.high),
        backgroundColor: CONFIDENCE_COLORS.high,
        borderRadius: 4,
      },
      {
        label: "Medium Confidence",
        data: confidenceCounts.map((c) => c.medium),
        backgroundColor: CONFIDENCE_COLORS.medium,
        borderRadius: 4,
      },
      {
        label: "Low Confidence",
        data: confidenceCounts.map((c) => c.low),
        backgroundColor: CONFIDENCE_COLORS.low,
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
        data: reports.map((r) => r.metadata.duration_seconds),
        backgroundColor: reports.map(
          (_, i) =>
            `hsl(${230 + i * 15}, 70%, ${55 + (i % 3) * 5}%)`
        ),
        borderRadius: 6,
      },
    ],
  };

  // Radar chart: category coverage
  const allCategories = [
    ...new Set(reports.flatMap((r) => r.findings.map((f) => f.category))),
  ].sort();

  const radarData = {
    labels: allCategories.map((c) =>
      c.length > 16 ? c.slice(0, 14) + "..." : c
    ),
    datasets: reports.map((r, i) => ({
      label: shortLabel(r),
      data: allCategories.map(
        (cat) => r.findings.filter((f) => f.category === cat).length
      ),
      borderColor: `hsl(${(i * 45) % 360}, 70%, 60%)`,
      backgroundColor: `hsla(${(i * 45) % 360}, 70%, 60%, 0.1)`,
      borderWidth: 2,
      pointRadius: 3,
    })),
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { color: "#aaa", font: { size: 11 } },
      },
    },
    scales: {
      x: {
        ticks: { color: "#888", font: { size: 9 }, maxRotation: 45, minRotation: 45 },
        grid: { color: "#1a1a2e" },
      },
      y: {
        ticks: { color: "#888", stepSize: 1 },
        grid: { color: "#1a1a2e" },
      },
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

  const radarOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom" as const,
        labels: { color: "#aaa", font: { size: 10 }, padding: 12 },
      },
    },
    scales: {
      r: {
        ticks: { color: "#888", backdropColor: "transparent", stepSize: 1 },
        grid: { color: "#2a2a4a" },
        pointLabels: { color: "#aaa", font: { size: 9 } },
      },
    },
  };

  // Score card stats
  const totalFindings = reports.reduce(
    (sum, r) => sum + r.summary.total_findings,
    0
  );
  const avgDuration = Math.round(
    reports.reduce((sum, r) => sum + r.metadata.duration_seconds, 0) /
      reports.length
  );
  const maxFindings = Math.max(...reports.map((r) => r.summary.total_findings));
  const bestModel = reports.find(
    (r) => r.summary.total_findings === maxFindings
  );

  return (
    <div>
      {/* Score cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
          marginBottom: 24,
        }}
      >
        {[
          {
            label: "Models Tested",
            value: reports.length,
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
            label: "Most Findings",
            value: bestModel ? shortLabel(bestModel) : "-",
            sub: bestModel ? `${maxFindings} findings` : "",
            color: "#22c55e",
          },
        ].map((card, i) => (
          <div
            key={i}
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
              style={{
                fontSize: 24,
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
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 20,
        }}
      >
        {/* Findings by Severity */}
        <ChartCard title="Findings by Severity">
          <div style={{ height: 320 }}>
            <Bar data={severityData} options={stackedOptions as any} />
          </div>
        </ChartCard>

        {/* Confidence Distribution */}
        <ChartCard title="Confidence Distribution">
          <div style={{ height: 320 }}>
            <Bar data={confidenceData} options={stackedOptions as any} />
          </div>
        </ChartCard>

        {/* Duration */}
        <ChartCard title="Audit Duration (seconds)">
          <div style={{ height: 320 }}>
            <Bar data={durationData} options={chartOptions as any} />
          </div>
        </ChartCard>

        {/* Radar: Category Coverage */}
        <ChartCard title="Vulnerability Category Coverage">
          <div style={{ height: 320 }}>
            <Radar data={radarData} options={radarOptions} />
          </div>
        </ChartCard>
      </div>

      {/* Leaderboard Table */}
      <div
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
        <table
          style={{
            width: "100%",
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
                High Conf %
              </th>
              <th style={{ padding: "10px 16px" }}></th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r, i) => {
              const highConf = r.findings.filter(
                (f) => f.confidence === "high"
              ).length;
              const confPct =
                r.findings.length > 0
                  ? Math.round((highConf / r.findings.length) * 100)
                  : 0;
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
                    {r.metadata.model}
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
                    }}
                  >
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 10,
                        fontSize: 11,
                        fontWeight: 600,
                        background:
                          confPct >= 70
                            ? "#22c55e20"
                            : confPct >= 40
                              ? "#eab30820"
                              : "#ef444420",
                        color:
                          confPct >= 70
                            ? "#22c55e"
                            : confPct >= 40
                              ? "#eab308"
                              : "#ef4444",
                      }}
                    >
                      {confPct}%
                    </span>
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
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "#12121f",
        border: "1px solid #2a2a4a",
        borderRadius: 12,
        padding: 20,
      }}
    >
      <h3
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "#a5b4fc",
          marginBottom: 16,
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}
