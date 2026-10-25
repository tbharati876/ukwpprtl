
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Wind,
  Zap,
} from "lucide-react";
import "./App.css";

const API_URL = "https://uk-wind-dasboard.onrender.com/api/dashboard";

function formatNumber(value, decimals = 0) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return "—";
  }

  return Number(value).toLocaleString("en-GB", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
}

function formatDateTime(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatDay(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "2-digit",
    month: "short",
  }).format(date);
}

function MetricCard({ title, value, unit, note, icon: Icon }) {
  return (
    <article className="metric-card">
      <div className="metric-heading">
        <span>{title}</span>
        <span className="metric-icon">
          <Icon size={19} />
        </span>
      </div>

      <div className="metric-value">
        {value} <small>{unit}</small>
      </div>

      <p>{note}</p>
    </article>
  );
}

export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const loadData = useCallback(async (refresh = false) => {
    if (refresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      const url = refresh ? `${API_URL}?refresh=true` : API_URL;
      const response = await fetch(url);

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));

        throw new Error(
          result.detail || `Request failed: ${response.status}`
        );
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(
        `${err.message}. Check that your Python backend is running at http://127.0.0.1:8000.`
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchDashboard() {
      setError("");

      try {
        const response = await fetch(API_URL, {
          signal: controller.signal,
        });

        if (!response.ok) {
          const result = await response.json().catch(() => ({}));

          throw new Error(
            result.detail || `Request failed: ${response.status}`
          );
        }

        const result = await response.json();
        setData(result);
      } catch (err) {
        if (err.name !== "AbortError") {
          setError(
            `${err.message}. Check that your Python backend is running at http://127.0.0.1:8000.`
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    fetchDashboard();

    return () => controller.abort();
  }, []);

  const records = useMemo(() => data?.records ?? [], [data]);
  const summary = data?.summary ?? {};

  const chartData = useMemo(() => {
    const daily = new Map();

    records.forEach((record) => {
      const label = formatDay(record.startTime);

      if (!label) return;

      if (!daily.has(label)) {
        daily.set(label, {
          date: label,
          actualSum: 0,
          actualCount: 0,
          forecastSum: 0,
          forecastCount: 0,
        });
      }

      const day = daily.get(label);

      if (record.actualGeneration != null) {
        day.actualSum += Number(record.actualGeneration);
        day.actualCount += 1;
      }

      if (record.forecastGeneration != null) {
        day.forecastSum += Number(record.forecastGeneration);
        day.forecastCount += 1;
      }
    });

    return Array.from(daily.values()).map((day) => ({
      date: day.date,
      actual: day.actualCount
        ? Math.round(day.actualSum / day.actualCount)
        : null,
      forecast: day.forecastCount
        ? Math.round(day.forecastSum / day.forecastCount)
        : null,
    }));
  }, [records]);

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return records;

    return records.filter((record) =>
      [
        formatDateTime(record.startTime),
        record.actualGeneration,
        record.forecastGeneration,
        record.error,
      ].some((value) =>
        String(value ?? "").toLowerCase().includes(query)
      )
    );
  }, [records, search]);

  function exportCsv() {
    const headings = [
      "startTime",
      "actualGeneration_MW",
      "forecastGeneration_MW",
      "error_MW",
      "absoluteError_MW",
      "publishTime",
    ];

    const escapeCsv = (value) =>
      `"${String(value ?? "").replaceAll('"', '""')}"`;

    const rows = filteredRecords.map((record) =>
      [
        record.startTime,
        record.actualGeneration,
        record.forecastGeneration,
        record.error,
        record.absoluteError,
        record.publishTime,
      ]
        .map(escapeCsv)
        .join(",")
    );

    const csv = [headings.join(","), ...rows].join("\r\n");
    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "uk-wind-january-2026.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  }

  return (
    <main className="dashboard">
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon">
            <Wind size={25} />
          </span>

          <div>
            <strong>WINDWISE</strong>
            <small>ENERGY INTELLIGENCE</small>
          </div>
        </div>

        <div className="header-right">
          <span className="connection-status">
            <span className="status-dot" />
            WIND GENERATION ANALYTICS
          </span>
          <span className="country-tag">GB</span>
        </div>
      </header>

      <div className="page-content">
        <section className="page-heading">
          <div>
            <p className="eyebrow">
              NATIONAL RENEWABLES · HISTORICAL ANALYSIS
            </p>

            <h1>
              Wind generation <span>overview</span>
            </h1>

            <p className="subtitle">
              Compare forecast wind generation with actual output and assess
              forecast accuracy.
            </p>
          </div>

          <div className="heading-actions">
            <span className="date-pill">01 — 31 JAN 2026</span>

            <button
              className="primary-button"
              onClick={() => loadData(true)}
              disabled={loading || refreshing}
            >
              <RefreshCw
                size={15}
                className={refreshing ? "spin" : ""}
              />
              {refreshing ? "Refreshing…" : "Refresh data"}
            </button>
          </div>
        </section>

        {error && (
          <section className="error-message" role="alert">
            <AlertTriangle size={21} />

            <div>
              <strong>Unable to load dashboard data</strong>
              <p>{error}</p>
              <button onClick={() => loadData()}>Try again</button>
            </div>
          </section>
        )}

        {loading && !data ? (
          <section className="loading-state">
            <span className="loader" />
            <h2>Loading wind generation data…</h2>
            <p>
              Connecting to the Python API and retrieving Elexon data.
            </p>
          </section>
        ) : (
          <>
            <section className="metric-grid">
              <MetricCard
                title="MEAN ABSOLUTE ERROR"
                value={formatNumber(summary.maeMW)}
                unit="MW"
                note="Average size of forecast error"
                icon={Activity}
              />

              <MetricCard
                title="ROOT MEAN SQUARED ERROR"
                value={formatNumber(summary.rmseMW)}
                unit="MW"
                note="Penalises larger forecast errors"
                icon={Zap}
              />

              <MetricCard
                title="FORECAST BIAS"
                value={formatNumber(summary.biasMW)}
                unit="MW"
                note="Positive means overforecasting"
                icon={Wind}
              />

              <MetricCard
                title="FORECAST COVERAGE"
                value={formatNumber(summary.forecastCoveragePercent, 1)}
                unit="%"
                note={`${formatNumber(summary.periodsWithEligibleForecast)} of ${formatNumber(summary.actualPeriods)} periods matched`}
                icon={CheckCircle2}
              />
            </section>

            <section className="main-grid">
              <article className="panel chart-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">GENERATION PROFILE</p>
                    <h2>Forecast vs actual</h2>
                    <p className="panel-subtitle">
                      Daily average national wind generation · MW
                    </p>
                  </div>

                  <span className="chart-tag">JAN 2026</span>
                </div>

                <div className="chart-legend">
                  <span>
                    <i className="actual-dot" />
                    Actual generation
                  </span>
                  <span>
                    <i className="forecast-dot" />
                    Day-ahead forecast
                  </span>
                </div>

                <div className="chart-container">
                  {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={chartData}
                        margin={{
                          top: 12,
                          right: 10,
                          left: 0,
                          bottom: 0,
                        }}
                      >
                        <defs>
                          <linearGradient
                            id="actualGradient"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor="#23866e"
                              stopOpacity={0.22}
                            />
                            <stop
                              offset="100%"
                              stopColor="#23866e"
                              stopOpacity={0.01}
                            />
                          </linearGradient>

                          <linearGradient
                            id="forecastGradient"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor="#8184dc"
                              stopOpacity={0.2}
                            />
                            <stop
                              offset="100%"
                              stopColor="#8184dc"
                              stopOpacity={0.01}
                            />
                          </linearGradient>
                        </defs>

                        <CartesianGrid
                          stroke="#edf0f4"
                          strokeDasharray="4 4"
                          vertical={false}
                        />

                        <XAxis
                          dataKey="date"
                          tick={{ fill: "#84909d", fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                          interval={4}
                        />

                        <YAxis
                          tick={{ fill: "#84909d", fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                          width={55}
                          tickFormatter={(value) =>
                            `${Math.round(value / 1000)}k`
                          }
                        />

                        <Tooltip
                          contentStyle={{
                            borderRadius: 10,
                            border: "1px solid #e7ebef",
                            fontSize: 12,
                          }}
                          formatter={(value, name) => [
                            value == null
                              ? "No data"
                              : `${formatNumber(value)} MW`,
                            name === "actual" ? "Actual" : "Forecast",
                          ]}
                        />

                        <Legend content={() => null} />

                        <Area
                          type="monotone"
                          dataKey="actual"
                          name="actual"
                          stroke="#23866e"
                          strokeWidth={2.5}
                          fill="url(#actualGradient)"
                          dot={false}
                          connectNulls={false}
                        />

                        <Area
                          type="monotone"
                          dataKey="forecast"
                          name="forecast"
                          stroke="#8184dc"
                          strokeWidth={2.3}
                          fill="url(#forecastGradient)"
                          dot={false}
                          connectNulls={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="empty-state">
                      No chart data is available for this period.
                    </div>
                  )}
                </div>

                <p className="chart-note">
                  Daily averages are calculated from available half-hourly
                  records.
                </p>
              </article>

              <article className="panel insights-panel">
                <p className="eyebrow">HOW TO READ THE RESULTS</p>
                <h2>Forecast insights</h2>

                <div className="insight">
                  <span className="insight-icon green">
                    <Activity size={18} />
                  </span>
                  <div>
                    <strong>Mean absolute error</strong>
                    <p>
                      Average difference between forecast and actual
                      generation. Lower is better.
                    </p>
                  </div>
                </div>

                <div className="insight">
                  <span className="insight-icon purple">
                    <Zap size={18} />
                  </span>
                  <div>
                    <strong>Forecast bias</strong>
                    <p>
                      Positive bias means the forecast was higher than actual
                      output on average.
                    </p>
                  </div>
                </div>

                <div className="insight">
                  <span className="insight-icon amber">
                    <CheckCircle2 size={18} />
                  </span>
                  <div>
                    <strong>Forecast coverage</strong>
                    <p>
                      Shows the share of actual delivery periods with an
                      eligible forecast.
                    </p>
                  </div>
                </div>

                <div className="assumption-box">
                  <strong>Decision-time assumption</strong>
                  <p>
                    {data?.decisionAssumption ||
                      "The latest forecast available by the assumed day-ahead cutoff is selected."}
                  </p>
                  <p>
                    Confirm this cutoff against the client's intended
                    procurement decision time before interpreting the metrics
                    as final.
                  </p>
                </div>
              </article>
            </section>

            <section className="panel data-panel">
              <div className="table-heading">
                <div>
                  <p className="eyebrow">UNDERLYING DATA</p>
                  <h2>Half-hourly observations</h2>
                  <p className="panel-subtitle">
                    Actual generation matched with the eligible forecast.
                  </p>
                </div>

                <button
                  className="secondary-button"
                  onClick={exportCsv}
                  disabled={!filteredRecords.length}
                >
                  Export CSV
                </button>
              </div>

              <div className="table-tools">
                <input
                  type="search"
                  placeholder="Search date or generation…"
                  aria-label="Search observations"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />

                <span>
                  {formatNumber(filteredRecords.length)} observations
                </span>
              </div>

              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>DELIVERY TIME (UK)</th>
                      <th>ACTUAL (MW)</th>
                      <th>FORECAST (MW)</th>
                      <th>ERROR (MW)</th>
                      <th>PUBLICATION TIME</th>
                      <th>STATUS</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredRecords.slice(0, 100).map((record) => (
                      <tr key={record.startTime}>
                        <td>{formatDateTime(record.startTime)}</td>
                        <td>{formatNumber(record.actualGeneration)}</td>
                        <td>{formatNumber(record.forecastGeneration)}</td>
                        <td>{formatNumber(record.error)}</td>
                        <td>{formatDateTime(record.publishTime)}</td>
                        <td>
                          {record.forecastGeneration == null ? (
                            <span className="badge missing">No match</span>
                          ) : (
                            <span className="badge matched">Matched</span>
                          )}
                        </td>
                      </tr>
                    ))}

                    {filteredRecords.length === 0 && (
                      <tr>
                        <td colSpan="6" className="empty-table">
                          No observations match your search.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {filteredRecords.length > 100 && (
                <p className="table-note">
                  Showing the first 100 matching rows. Export CSV to download
                  all matching observations.
                </p>
              )}
            </section>

            <footer className="footer">
              <span>
                Source: Elexon BMRS · FUELHH and WINDFOR datasets
              </span>
              <span>Times: UK local time · Generation units: MW</span>
            </footer>
          </>
        )}
      </div>
    </main>
  );
}
