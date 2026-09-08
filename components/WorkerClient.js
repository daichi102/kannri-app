"use client";

import { useEffect, useMemo, useState } from "react";
import { ApiError, apiRequest } from "../lib/api";

function getWorkerSession() {
  return apiRequest("/api/worker/session");
}

function workerLogin(id, password) {
  return apiRequest("/api/worker/login", {
    method: "POST",
    body: JSON.stringify({ user_id: id, password })
  });
}

function workerLogout() {
  return apiRequest("/api/worker/logout", { method: "POST" });
}

const RETURN_LABELS = {
  item_name: "品目",
  sto_slip: "STO伝票（参伝No.）",
  requesting_department: "依頼部署",
  application_category: "申請区分",
  application_detail: "申請内容",
  shipping_origin: "積送元",
  product_model: "品番",
  product_serial: "製造番号",
  approval_date: "承認日",
  customer_address: "お客様住所（県・市）",
  customer_name: "お客様名",
  approval_number: "承認No.",
  work_order_number: "作業指示番号",
  symptom: "症状"
};

const CHECK_ITEMS = [
  ["arrival", "訪問先・作業内容を確認"],
  ["product", "商品・型番・製造番号を確認"],
  ["route", "搬入・搬出経路を確認"],
  ["installation", "設置状態と動作を確認"],
  ["cleanup", "清掃・忘れ物がないことを確認"],
  ["customer", "お客様へ作業内容を説明"]
];

function formatDate(value) {
  if (!value) return "未定";
  return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", weekday: "short" }).format(new Date(`${value}T00:00:00`));
}

export default function WorkerClient() {
  const [user, setUser] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const selected = useMemo(() => jobs.find((job) => job.id === selectedId) || jobs[0] || null, [jobs, selectedId]);
  const visibleJobs = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    if (!query) return jobs;
    return jobs.filter((job) => [job.work_order_number, job.customer_name, job.customer_address, job.product_summary]
      .some((value) => String(value || "").toLowerCase().includes(query)));
  }, [jobs, keyword]);

  async function loadJobs() {
    const result = await apiRequest("/api/worker/jobs");
    setJobs(result.jobs || []);
  }

  async function bootstrap() {
    setLoading(true);
    try {
      const session = await getWorkerSession();
      setUser(session.user);
      await loadJobs();
    } catch (exception) {
      if (!(exception instanceof ApiError && exception.status === 401)) setError(exception.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { bootstrap(); }, []);

  async function handleLogin(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await workerLogin(loginId, password);
      setUser(result.user);
      setPassword("");
      await loadJobs();
    } catch (exception) {
      setError(exception.message || "ログインできませんでした。");
    } finally {
      setLoading(false);
    }
  }

  async function runAction(action, checklist) {
    if (!selected) return;
    setLoading(true);
    setNotice("");
    setError("");
    try {
      const result = await apiRequest("/api/worker/jobs", {
        method: "POST",
        body: JSON.stringify({ job_id: selected.id, action, checklist })
      });
      setJobs((current) => current.map((job) => job.id === result.job.id ? result.job : job));
      setNotice(action === "contact" ? "訪問前連絡を記録しました。" : action === "start" ? "作業を開始しました。" : action === "complete" ? "作業完了を記録しました。" : "チェック内容を保存しました。");
    } catch (exception) {
      setError(exception.message || "更新できませんでした。");
    } finally {
      setLoading(false);
    }
  }

  async function toggleCheck(key) {
    const checklist = { ...(selected?.worker_checklist || {}), [key]: !selected?.worker_checklist?.[key] };
    await runAction("checklist", checklist);
  }

  if (!user) {
    return <main className="worker-login"><form onSubmit={handleLogin} className="worker-login-card">
      <div className="worker-logo">S</div><p>FIELD SERVICE</p><h1>作業員ログイン</h1><a className="worker-admin-back" href="/">管理者画面へ戻る</a>
      <label>ログインID<input value={loginId} onChange={(event) => setLoginId(event.target.value)} required /></label>
      <label>パスワード<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
      {error ? <div className="worker-error">{error}</div> : null}
      <button disabled={loading}>{loading ? "確認中…" : "ログイン"}</button>
    </form></main>;
  }

  const returnData = selected?.raw_payload?.return_shipment_data || {};
  const checked = CHECK_ITEMS.filter(([key]) => selected?.worker_checklist?.[key]).length;

  return <main className="worker-shell">
    <header className="worker-header"><div><small>SPEED ETC</small><strong>作業員画面</strong></div><button onClick={async () => { await workerLogout(); setUser(null); setJobs([]); }}>ログアウト</button></header>
    <section className="worker-content">
      <div className="worker-welcome"><div><p>ログイン中</p><h1>{user.company_name || user.id}</h1></div><span>{jobs.length}件</span></div>
      {notice ? <p className="worker-notice">{notice}</p> : null}{error ? <p className="worker-error">{error}</p> : null}
      <label className="worker-search">作業番号・お客様名で検索<input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="例：01247991" /></label>
      <div className="worker-layout">
        <section className="worker-job-list" aria-label="担当案件">
          {visibleJobs.map((job) => <button className={selected?.id === job.id ? "active" : ""} onClick={() => setSelectedId(job.id)} key={job.id}>
            <time>{formatDate(job.scheduled_date)}</time><strong>{job.customer_name || "お客様名未設定"}</strong><span>作業番号 {job.work_order_number}</span><small>{job.customer_address || job.area || "住所未設定"}</small>
          </button>)}
          {!visibleJobs.length ? <p className="worker-empty">担当案件はありません。</p> : null}
        </section>
        {selected ? <article className="worker-job-detail">
          <div className="worker-detail-heading"><div><p>WORK ORDER</p><h2>{selected.work_order_number}</h2></div><span className={`worker-status ${selected.status}`}>{selected.status === "completed" ? "作業完了" : selected.work_started_at ? "作業中" : "予定"}</span></div>
          <dl className="worker-customer"><div><dt>お客様</dt><dd>{selected.customer_name || "-"}</dd></div><div><dt>住所</dt><dd>{selected.customer_address || "-"}</dd></div><div><dt>電話</dt><dd>{selected.customer_phone ? <a href={`tel:${selected.customer_phone}`}>{selected.customer_phone}</a> : "-"}</dd></div><div><dt>商品・作業</dt><dd>{[selected.product_summary, selected.work_summary].filter(Boolean).join(" / ") || "-"}</dd></div></dl>
          <div className="worker-actions"><button className={selected.customer_contacted_at ? "done" : ""} onClick={() => runAction("contact")} disabled={loading || selected.customer_contacted_at}>① 訪問前連絡</button><button className={selected.work_started_at ? "done" : ""} onClick={() => runAction("start")} disabled={loading || !selected.customer_contacted_at || selected.work_started_at}>② 作業開始</button><button className={selected.work_completed_at ? "done" : ""} onClick={() => runAction("complete")} disabled={loading || !selected.work_started_at || selected.work_completed_at}>③ 作業完了</button></div>
          <section className="worker-checklist"><div><h3>作業チェック</h3><span>{checked}/{CHECK_ITEMS.length}</span></div>{CHECK_ITEMS.map(([key, label]) => <button onClick={() => toggleCheck(key)} className={selected.worker_checklist?.[key] ? "checked" : ""} key={key}><span>✓</span>{label}</button>)}</section>
          <section className="worker-return"><div><p>RETURN SHIPMENT</p><h3>お帰り便データ</h3></div>{Object.keys(returnData).length ? <dl>{Object.entries(RETURN_LABELS).map(([key, label]) => <div className={key === "symptom" ? "wide" : ""} key={key}><dt>{label}</dt><dd>{returnData[key] || "未記載"}</dd></div>)}</dl> : <p className="worker-empty">この作業番号に紐づくお帰り便データはありません。</p>}</section>
        </article> : null}
      </div>
    </section>
  </main>;
}
