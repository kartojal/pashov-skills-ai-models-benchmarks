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
import { NEON_SEVERITY_COLORS, NEON, durationBarColor } from "./neonTheme";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

// Cache for preloaded logo images
const logoImageCache: Record<string, HTMLImageElement | null> = {};

function getOrLoadImage(src: string): HTMLImageElement | null {
  if (src in logoImageCache) return logoImageCache[src];
  logoImageCache[src] = null; // mark as loading
  const img = new Image();
  img.src = src;
  img.onload = () => {
    logoImageCache[src] = img;
  };
  return null;
}

/**
 * Chart.js plugin that draws model logos inside each bar.
 * Pass `models` array matching the bar indices.
 * For stacked charts, set `stacked: true` to draw once per bar column.
 */
function makeBarLogosPlugin(models: string[], stacked = false) {
  return {
    id: "barLogos",
    afterDatasetsDraw(chart: any) {
      const ctx = chart.ctx;
      const datasets = chart.data.datasets;
      if (!datasets || datasets.length === 0) return;

      // For stacked charts, we combine all dataset bars per index.
      // For non-stacked, just use dataset 0.
      const datasetIndex = stacked ? 0 : 0;
      const meta = chart.getDatasetMeta(datasetIndex);
      if (!meta?.data) return;

      const logoSize = 18;

      meta.data.forEach((bar: any, i: number) => {
        const model = models[i];
        if (!model) return;
        const logoUrl = getModelLogo(model);
        if (!logoUrl) return;

        const img = getOrLoadImage(logoUrl);
        if (!img) {
          // Image still loading – trigger a re-render once loaded
          const pending = new Image();
          pending.src = logoUrl;
          pending.onload = () => {
            logoImageCache[logoUrl] = pending;
            chart.draw();
          };
          return;
        }

        // Calculate bar bounds
        let barTop: number;
        let barBottom: number;
        const barX = bar.x;

        if (stacked) {
          // For stacked, find the top of the topmost dataset and bottom of the lowest
          barBottom = bar.y; // dataset 0 top
          barTop = bar.y;
          for (let d = 0; d < datasets.length; d++) {
            const dMeta = chart.getDatasetMeta(d);
            if (dMeta?.data?.[i]) {
              const el = dMeta.data[i];
              barTop = Math.min(barTop, el.y);
            }
          }
          barBottom = bar.base ?? chart.scales.y.getPixelForValue(0);
        } else {
          barTop = bar.y;
          barBottom = bar.base ?? chart.scales.y.getPixelForValue(0);
        }

        const barHeight = barBottom - barTop;
        if (barHeight < logoSize + 4) return; // bar too small

        // Draw logo centered horizontally, near top of bar
        const drawX = barX - logoSize / 2;
        const drawY = barTop + 10;

        ctx.save();
        // Draw circular white background
        ctx.beginPath();
        ctx.arc(barX, drawY + logoSize / 2, logoSize / 2 + 2, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.fill();
        // Draw the image clipped to circle
        ctx.beginPath();
        ctx.arc(barX, drawY + logoSize / 2, logoSize / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, drawX, drawY, logoSize, logoSize);
        ctx.restore();
      });
    },
  };
}

const SEVERITY_COLORS = NEON_SEVERITY_COLORS;

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
          (_, i) => durationBarColor(i)
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
        labels: { color: NEON.legendText, font: { size: isMobile ? 9 : 11 } },
      },
    },
    scales: {
      x: {
        ticks: {
          color: NEON.tickX,
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
        grid: { color: NEON.gridLine },
      },
      y: {
        ticks: { color: NEON.tickY, stepSize: 1 },
        grid: { color: NEON.gridLine },
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
        ctx.fillStyle = NEON.tickX;
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
          s === bestFidelity ? NEON.fidelityBest : NEON.fidelityOther
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
          s === bestHighFidelity ? NEON.highFidelityBest : NEON.highFidelityOther
        ),
        borderRadius: 6,
      },
    ],
  };

  // Logo plugins for each chart
  const severityLogosPlugin = makeBarLogosPlugin(aiReports.map((r) => r.metadata.model), true);
  const fidelityLogosPlugin = makeBarLogosPlugin(fidelityScores.map((s) => s.report.metadata.model));
  const highFidelityLogosPlugin = makeBarLogosPlugin(highFidelityScores.map((s) => s.report.metadata.model));
  const durationLogosPlugin = makeBarLogosPlugin(aiReports.map((r) => r.metadata.model));

  return (
    <div>
      {/* Score cards */}
      <div className="score-cards-grid">
        {[
          {
            label: "Total Findings",
            value: `${totalFindings} unique`,
            sub: `${aggregatedCoverage}% aggregated AI vs human coverage`,
            color: NEON_SEVERITY_COLORS.high,
          },
          {
            label: "Best Fidelity vs Human",
            value: bestFidelity ? shortLabel(bestFidelity.report) : "-",
            sub: bestFidelity ? `${bestFidelity.matches}/${humanFindings.length} matched` : "",
            color: NEON.accentLight,
            smallValue: true,
            logo: bestFidelity ? getModelLogo(bestFidelity.report.metadata.model) : null,
          },
        ].map((card, i) => (
          <div
            key={i}
            className="score-card"
            style={{
              background: NEON.surface,
              border: `1px solid ${NEON.border}`,
              borderRadius: 12,
              padding: "20px 24px",
              boxShadow: `0 0 20px ${NEON.accent}10`,
            }}
          >
            <div style={{ fontSize: 12, color: NEON.textMuted, marginBottom: 8 }}>
              {card.label}
            </div>
            <div
              className="card-value"
              style={{
                fontSize: card.smallValue ? 14 : 24,
                fontWeight: 700,
                color: card.color,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {card.logo && (
                <img
                  src={card.logo}
                  alt=""
                  style={{ width: 20, height: 20, flexShrink: 0, background: "white", borderRadius: "50%", padding: 2 }}
                />
              )}
              {card.value}
            </div>
            {card.sub && (
              <div style={{ fontSize: 11, color: NEON.textMuted, marginTop: 4 }}>
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
          <h3 style={{ fontSize: 14, fontWeight: 600, color: NEON.accentLight, marginBottom: 12, textShadow: `0 0 10px ${NEON.accent}60` }}>
            Findings by Severity
          </h3>
          <div className="bar-chart-container" style={{ height: 420, position: "relative", width: "100%", overflow: "hidden" }}>
            <Bar data={severityData} options={stackedOptions as any} plugins={[staggerLabelsPlugin, severityLogosPlugin]} />
          </div>
        </div>

        {/* Fidelity vs Human */}
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: NEON.accentLight, marginBottom: 12, textShadow: `0 0 10px ${NEON.accent}60` }}>
            Fidelity vs Human Audit ({humanFindings.length} findings)
          </h3>
          <div className="bar-chart-container" style={{ height: 420, position: "relative", width: "100%", overflow: "hidden" }}>
            <Bar data={fidelityData} options={chartOptions as any} plugins={[staggerLabelsPlugin, fidelityLogosPlugin]} />
          </div>
        </div>

        {/* Fidelity vs Human Highs */}
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: NEON.highFidelityBest, marginBottom: 12, textShadow: `0 0 10px ${NEON.highFidelityBest}60` }}>
            Fidelity vs Human Highs ({humanHighFindings.length} high findings)
          </h3>
          <div className="bar-chart-container" style={{ height: 420, position: "relative", width: "100%", overflow: "hidden" }}>
            <Bar data={highFidelityData} options={chartOptions as any} plugins={[staggerLabelsPlugin, highFidelityLogosPlugin]} />
          </div>
        </div>

        {/* Duration */}
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: NEON.accentLight, marginBottom: 12, textShadow: `0 0 10px ${NEON.accent}60` }}>
            Audit Duration (seconds)
          </h3>
          <div className="bar-chart-container" style={{ height: 420, position: "relative", width: "100%", overflow: "hidden" }}>
            <Bar data={durationData} options={chartOptions as any} plugins={[staggerLabelsPlugin, durationLogosPlugin]} />
          </div>
        </div>
      </div>

      {/* Leaderboard Table */}
      <div
        className="leaderboard-wrapper"
        style={{
          marginTop: 24,
          background: NEON.surface,
          border: `1px solid ${NEON.border}`,
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: `0 0 30px ${NEON.accent}08`,
        }}
      >
        <div
          style={{
            padding: "16px 24px",
            borderBottom: `1px solid ${NEON.border}`,
            fontWeight: 600,
            fontSize: 15,
            color: NEON.textPrimary,
            textShadow: `0 0 10px ${NEON.accent}40`,
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
                borderBottom: `1px solid ${NEON.border}`,
                color: NEON.textMuted,
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
                    borderBottom: `1px solid ${NEON.gridLine}`,
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
                          ? NEON.gold
                          : i === 1
                            ? NEON.silver
                            : i === 2
                              ? NEON.bronze
                              : NEON.textMuted,
                      textShadow: i < 3 ? `0 0 8px ${i === 0 ? NEON.gold : i === 1 ? NEON.silver : NEON.bronze}60` : "none",
                    }}
                  >
                    {i + 1}
                  </td>
                  <td
                    style={{
                      padding: "12px 16px",
                      fontWeight: 600,
                      color: NEON.textPrimary,
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
                  <td style={{ padding: "12px 16px", color: NEON.textSecondary }}>
                    {r.metadata.harness}
                  </td>
                  <td
                    style={{
                      padding: "12px 16px",
                      textAlign: "center",
                      fontWeight: 700,
                      color: NEON.accentLight,
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
                      color: NEON.textSecondary,
                    }}
                  >
                    {r.metadata.duration_seconds}s
                  </td>
                  <td
                    style={{
                      padding: "12px 16px",
                      textAlign: "center",
                      color: NEON.accentLight,
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
                      color: NEON.highFidelityBest,
                      fontWeight: 600,
                      fontSize: 12,
                    }}
                  >
                    {highDiffLabel}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <span
                      style={{
                        color: NEON.accent,
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

