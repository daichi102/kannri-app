"use client";

import { useEffect, useMemo, useState } from "react";
import { ApiError, apiRequest, getSession } from "../lib/api";

function workerName(worker) {
  return worker?.company_name || worker?.id || "未割当";
}

function jobState(job) {
  if (job.work_completed_at || job.status === "completed") return "完了";
  if (job.work_started_at) return "作業中";
  if (job.customer_contacted_at) return "連絡済み";
  return "予定";
}

export default function WorkManagementClient() {
  const [jobs, setJobs] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const visibleJobs = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    if (!query) return jobs;
    return jobs.filter((job) => [job.work_order_number, job.customer_name, job.customer_address, job.product_summary]
      .some((value) => String(value || "").toLowerCase().includes(query)));
  }, [jobs, keyword]);

  useEffect(() => {
    async function bootstrap() {
      try {
        const session = await getSession();
        if (session.user?.role !== "admin") {
          window.location.replace(session.user?.role === "worker" ? "/worker" : "/");
          return;
        }
        const [jobResult, userResult] = await Promise.all([
          apiRequest("/api/logistics/jobs"),
          apiRequest("/api/users")
        ]);
        setJobs(jobResult.jobs || []);
        setWorkers((userResult.users || []).filter((user) => user.role === "worker"));
      } catch (exception) {
        if (exception instanceof ApiError && exception.status === 401) window.location.replace("/");
        else setError(exception.message || "案件を読み込めませんでした。");
      } finally {
        setLoading(false);
      }
    }
    bootstrap();
  }, []);

  function editJob(id, name, value) {
    setJobs((current) => current.map((job) => job.id === id ? { ...job, [name]: value } : job));
  }

  async function saveAssignment(job) {
    setSavingId(job.id);
    setNotice("");
    setError("");
    try {
      const result = await apiRequest("/api/logistics/jobs", {
        method: "POST",
        body: JSON.stringify({
          id: job.id,
          work_order_number: job.work_order_number,
          assigned_worker_id: job.assigned_worker_id || "",
          scheduled_date: job.scheduled_date || ""
        })
      });
      setJobs((current) => current.map((item) => item.id === job.id ? result.job : item));
      setNotice(`作業番号 ${job.work_order_number} の担当を保存しました。`);
    } catch (exception) {
      setError(exception.message || "担当を保存できませんでした。");
    } finally {
      setSavingId("");
    }
  }

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">S</div><div><p className="eyebrow">SPEED ETC</p><h1>配送管理</h1></div></div>
      <section className="sidebar-panel"><nav className="sidebar-nav" aria-label="メインメニュー">
        <a className="sidebar-nav-link" href="/">ダッシュボード</a>
        <a className="sidebar-nav-link" href="/mail">メール取込み</a>
        <a className="sidebar-nav-link active" href="/work">案件・作業員</a>
        <a className="sidebar-nav-link" href="/inventory">在庫管理</a>
        <a className="sidebar-nav-link" href="/settings">設定</a>
        <a className="sidebar-nav-link worker-system-link" href="/worker">作業員システム</a>
      </nav></section>
    </aside>
    <section className="content work-admin-content">
      <header className="page-header"><div><p className="eyebrow">WORK ASSIGNMENT</p><h1>案件・作業員</h1><p className="muted">取込み済みの案件を作業員へ割り当てます。</p></div><span className="pill">{jobs.length}件</span></header>
      {notice ? <p className="worker-notice" role="status">{notice}</p> : null}
      {error ? <p className="worker-error" role="alert">{error}</p> : null}
      <label className="work-admin-search">案件を検索<input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="作業番号・お客様名・住所・商品" /></label>
      <section className="work-admin-list">
        {visibleJobs.map((job) => {
          const assigned = workers.find((worker) => worker.id === job.assigned_worker_id);
          return <article className="work-admin-card" key={job.id}>
            <div className="work-admin-main"><div className="work-order-line"><span>{jobState(job)}</span><strong>{job.work_order_number || "作業番号未設定"}</strong></div><h2>{job.customer_name || "お客様名未設定"}</h2><p>{job.customer_address || job.area || "住所未設定"}</p><small>{job.product_summary || job.work_summary || "作業内容未設定"}</small></div>
            <div className="work-admin-assignment"><label>作業日<input type="date" value={job.scheduled_date || ""} onChange={(event) => editJob(job.id, "scheduled_date", event.target.value)} /></label><label>担当作業員<select value={job.assigned_worker_id || ""} onChange={(event) => editJob(job.id, "assigned_worker_id", event.target.value)}><option value="">未割当</option>{workers.map((worker) => <option key={worker.id} value={worker.id}>{workerName(worker)}</option>)}</select></label><button onClick={() => saveAssignment(job)} disabled={savingId === job.id}>{savingId === job.id ? "保存中…" : "担当を保存"}</button>{assigned ? <small>現在の担当：{workerName(assigned)}</small> : null}</div>
          </article>;
        })}
        {!loading && !visibleJobs.length ? <p className="worker-empty">条件に合う案件はありません。</p> : null}
        {loading ? <p className="worker-empty">案件を読み込んでいます…</p> : null}
      </section>
    </section>
  </main>;
}
