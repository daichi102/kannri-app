"use client";

import { useEffect, useMemo, useState } from "react";
import { ApiError, getDashboard, getSession, login, logout } from "../lib/api";

function yen(value) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function compactDate(value) {
  if (!value) return "未登録";
  return String(value).replaceAll("-", "/");
}

function vehicleLabel(vehicle) {
  return vehicle.display_name || vehicle.name || `車両 ${vehicle.vehicle_number || "-"}`;
}

function vehicleImage(vehicle) {
  return vehicle.photo_url || vehicle.photo || "/static/app-icon-192.png";
}

function statusLabel(status) {
  return status || "未設定";
}

export default function DashboardClient() {
  const [user, setUser] = useState(null);
  const [loginId, setLoginId] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [payload, setPayload] = useState(null);
  const [filters, setFilters] = useState({
    date_from: "",
    date_to: "",
    vehicle: "",
    status: ""
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const records = payload?.records || [];
  const summary = payload?.summary || {};
  const vehicles = payload?.vehicle_summaries || [];
  const statuses = payload?.available_statuses || [];
  const daily = summary.daily || [];

  const selectedVehicle = useMemo(
    () => vehicles.find((vehicle) => vehicle.vehicle_number === filters.vehicle),
    [vehicles, filters.vehicle]
  );

  async function loadDashboard(nextFilters = filters) {
    setLoading(true);
    setError("");
    try {
      const data = await getDashboard(nextFilters);
      setPayload(data);
    } catch (exception) {
      if (exception instanceof ApiError && exception.status === 401) {
        setUser(null);
        setError("");
      } else {
        setError(exception.message || "データの取得に失敗しました");
      }
    } finally {
      setLoading(false);
    }
  }

  async function bootstrap() {
    setLoading(true);
    setError("");
    try {
      const session = await getSession();
      setUser(session.user);
      await loadDashboard(filters);
    } catch (exception) {
      if (exception instanceof ApiError && exception.status === 401) {
        setUser(null);
      } else {
        setError(exception.message || "初期表示に失敗しました");
      }
      setLoading(false);
    }
  }

  useEffect(() => {
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogin(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const session = await login(loginId, loginPassword);
      setUser(session.user);
      setLoginPassword("");
      await loadDashboard(filters);
    } catch (exception) {
      setError(exception.message || "ログインできませんでした");
      setLoading(false);
    }
  }

  async function handleLogout() {
    await logout();
    setUser(null);
    setPayload(null);
  }

  function updateFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value }));
  }

  function selectVehicle(vehicleNumber) {
    const nextFilters = { ...filters, vehicle: vehicleNumber };
    setFilters(nextFilters);
    loadDashboard(nextFilters);
  }

  if (!user) {
    return (
      <main className="login-screen">
        <section className="login-card">
          <div className="brand-mark">S</div>
          <p className="eyebrow">SPEED ETC</p>
          <h1>明細管理</h1>
          <p className="muted">既存Python APIへ接続するNext.js版の入口です。</p>
          <form onSubmit={handleLogin} className="login-form">
            <label>
              ログインID
              <input
                value={loginId}
                onChange={(event) => setLoginId(event.target.value)}
                autoComplete="username"
                required
              />
            </label>
            <label>
              パスワード
              <input
                type="password"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            {error ? <p className="error-message">{error}</p> : null}
            <button disabled={loading}>{loading ? "確認中..." : "ログイン"}</button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">S</div>
          <div>
            <p className="eyebrow">SPEED ETC</p>
            <h1>明細管理</h1>
          </div>
        </div>

        <section className="sidebar-panel">
          <nav className="sidebar-nav" aria-label="メインメニュー">
            <a className="sidebar-nav-link active" href="/">ダッシュボード</a>
            <a className="sidebar-nav-link" href="/mail">メール取込み</a>
            <a className="sidebar-nav-link" href="/inventory">在庫管理</a>
          </nav>
        </section>

        <section className="sidebar-panel">
          <div className="panel-title">
            <span>車両別に表示</span>
            <small>押すと絞り込み</small>
          </div>
          <button
            className={`vehicle-button ${!filters.vehicle ? "active" : ""}`}
            onClick={() => selectVehicle("")}
          >
            <span className="vehicle-placeholder">全</span>
            <span>
              <strong>全車両</strong>
              <small>すべて表示</small>
            </span>
          </button>
          {vehicles.map((vehicle) => (
            <button
              key={vehicle.vehicle_number}
              className={`vehicle-button ${
                filters.vehicle === vehicle.vehicle_number ? "active" : ""
              }`}
              onClick={() => selectVehicle(vehicle.vehicle_number)}
            >
              <img src={vehicleImage(vehicle)} alt="" />
              <span>
                <strong>{vehicleLabel(vehicle)}</strong>
                <small>車両番号 {vehicle.vehicle_number}</small>
                {vehicle.card_number_last6 ? (
                  <small>ETC下6桁 {vehicle.card_number_last6}</small>
                ) : null}
              </span>
            </button>
          ))}
        </section>

        <section className="user-panel">
          <a className="link-button" href="/mail">メール取込</a>
          <small>LOGIN USER</small>
          <strong>{user.id}</strong>
          <button onClick={handleLogout}>ログアウト</button>
        </section>
      </aside>

      <section className="content">
        <header className="page-header">
          <div>
            <p className="eyebrow">ETC USAGE OVERVIEW</p>
            <h2>利用状況</h2>
            <p className="muted">
              {compactDate(summary.date_min)} — {compactDate(summary.date_max)}
            </p>
          </div>
          <button className="ghost-button" onClick={() => loadDashboard(filters)}>
            再読み込み
          </button>
        </header>

        {error ? <div className="alert error-message">{error}</div> : null}

        <section className="summary-grid">
          <article className="summary-card primary">
            <small>通行料金 合計</small>
            <strong>{yen(summary.amount)}</strong>
            <span>選択期間の合計</span>
          </article>
          <article className="summary-card">
            <small>利用件数</small>
            <strong>{summary.count || 0}件</strong>
            <span>選択期間の明細</span>
          </article>
          <article className="summary-card">
            <small>車両数</small>
            <strong>{summary.vehicles || 0}台</strong>
            <span>車両番号で集計</span>
          </article>
          <article className="summary-card">
            <small>1件あたり平均</small>
            <strong>{yen(summary.count ? summary.amount / summary.count : 0)}</strong>
            <span>通行料金の平均</span>
          </article>
        </section>

        <section className="filter-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">FILTER</p>
              <h3>表示条件</h3>
              {selectedVehicle ? (
                <p className="muted">
                  {vehicleLabel(selectedVehicle)} / 車両番号 {selectedVehicle.vehicle_number}
                </p>
              ) : null}
            </div>
            <button
              className="link-button"
              onClick={() => {
                const nextFilters = { date_from: "", date_to: "", vehicle: "", status: "" };
                setFilters(nextFilters);
                loadDashboard(nextFilters);
              }}
            >
              条件をクリア
            </button>
          </div>
          <div className="filters">
            <label>
              利用日（開始）
              <input
                type="date"
                value={filters.date_from}
                onChange={(event) => updateFilter("date_from", event.target.value)}
              />
            </label>
            <label>
              利用日（終了）
              <input
                type="date"
                value={filters.date_to}
                onChange={(event) => updateFilter("date_to", event.target.value)}
              />
            </label>
            <label>
              車両番号
              <select
                value={filters.vehicle}
                onChange={(event) => updateFilter("vehicle", event.target.value)}
              >
                <option value="">すべての車両</option>
                {vehicles.map((vehicle) => (
                  <option key={vehicle.vehicle_number} value={vehicle.vehicle_number}>
                    {vehicleLabel(vehicle)} / {vehicle.vehicle_number}
                  </option>
                ))}
              </select>
            </label>
            <label>
              状態
              <select
                value={filters.status}
                onChange={(event) => updateFilter("status", event.target.value)}
              >
                <option value="">すべての状態</option>
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {statusLabel(status)}
                  </option>
                ))}
              </select>
            </label>
            <button onClick={() => loadDashboard(filters)}>表示する</button>
          </div>
        </section>

        <section className="dashboard-grid">
          <article className="chart-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">DAILY TOTAL</p>
                <h3>日別利用料金</h3>
              </div>
            </div>
            <div className="bar-chart">
              {daily.length ? (
                daily.map((item) => {
                  const max = Math.max(...daily.map((row) => row.amount || 0), 1);
                  const height = Math.max(8, Math.round(((item.amount || 0) / max) * 160));
                  return (
                    <div key={item.date} className="bar-item">
                      <span>{yen(item.amount).replace("￥", "")}</span>
                      <div style={{ height }} />
                      <small>{String(item.date).slice(5).replace("-", "/")}</small>
                    </div>
                  );
                })
              ) : (
                <p className="empty">表示できるデータがありません</p>
              )}
            </div>
          </article>

          <article className="status-card">
            <p className="eyebrow">IMPORT STATUS</p>
            <h3>読み込み状況</h3>
            {(payload?.files || []).slice(0, 6).map((file) => (
              <div className="file-row" key={file.name}>
                <span>{file.name}</span>
                <small>{file.encoding || file.type || ""}</small>
              </div>
            ))}
            {!payload?.files?.length ? <p className="empty">CSVがまだ読み込まれていません</p> : null}
          </article>
        </section>

        <section className="details-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">USAGE DETAILS</p>
              <h3>ETC利用明細</h3>
            </div>
            <span className="pill">{records.length}件</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>利用日時</th>
                  <th>区間</th>
                  <th>車両番号</th>
                  <th>車種</th>
                  <th>通行料金</th>
                  <th>状態</th>
                  <th>取込元</th>
                </tr>
              </thead>
              <tbody>
                {records.slice(0, 50).map((record) => (
                  <tr key={record.id}>
                    <td>
                      {compactDate(record.date_start)} {record.time_start}
                    </td>
                    <td>
                      {record.ic_start || "—"} → {record.ic_end || "—"}
                    </td>
                    <td>{record.vehicle_number || "—"}</td>
                    <td>{record.vehicle_type || "—"}</td>
                    <td>{yen(record.toll_fee)}</td>
                    <td>
                      <span className="status-pill">{statusLabel(record.status)}</span>
                    </td>
                    <td>{record.source_file || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {loading ? <p className="empty">読み込み中...</p> : null}
            {!loading && !records.length ? <p className="empty">表示できる明細がありません</p> : null}
          </div>
        </section>
      </section>
    </main>
  );
}
