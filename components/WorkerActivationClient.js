"use client";
import { useState } from "react";
import { apiRequest } from "../lib/api";

export default function WorkerActivationClient() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");
  async function activate(event) {
    event.preventDefault(); setError("");
    if (password !== confirmation) return setError("確認用パスワードが一致しません。");
    const token = new URLSearchParams(window.location.search).get("token") || "";
    if (!token) return setError("招待リンクが正しくありません。");
    setLoading(true);
    try { await apiRequest("/api/worker/activate", { method: "POST", body: JSON.stringify({ token, password }) }); setComplete(true); }
    catch (exception) { setError(exception.message || "アカウントを作成できませんでした。"); }
    finally { setLoading(false); }
  }
  return <main className="worker-login"><section className="worker-login-card"><div className="worker-logo">S</div><p>ACCOUNT ACTIVATION</p><h1>作業員アカウント作成</h1>{complete ? <><div className="worker-notice">パスワードを設定しました。アカウントを利用できます。</div><a className="activation-login-link" href="/worker">作業員ログインへ</a></> : <form className="activation-form" onSubmit={activate}><label>パスワード（8文字以上）<input type="password" minLength="8" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="new-password" /></label><label>パスワード確認<input type="password" minLength="8" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required autoComplete="new-password" /></label>{error ? <p className="worker-error">{error}</p> : null}<button disabled={loading}>{loading ? "作成中…" : "アカウントを作成"}</button></form>}</section></main>;
}
