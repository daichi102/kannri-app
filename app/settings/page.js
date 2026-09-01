"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "../../lib/api";

const initialSettings = {
  host: "mail.hosting.ricoh.co.jp",
  port: 993,
  username: "info_order@ithe.co.jp",
  password: "",
  inbox: "INBOX",
  use_ssl: true
};

export default function SettingsPage() {
  const [settings, setSettings] = useState(initialSettings);
  const [configured, setConfigured] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    apiRequest("/api/mail/settings")
      .then((result) => {
        const imap = result.imap || {};
        setConfigured(Boolean(imap.configured));
        setSettings((current) => ({
          ...current,
          host: imap.host || current.host,
          port: imap.port || current.port,
          username: imap.user || current.username,
          inbox: imap.inbox || current.inbox,
          use_ssl: imap.ssl !== false
        }));
      })
      .catch((exception) => setError(exception.message))
      .finally(() => setLoading(false));
  }, []);

  function change(name, value) {
    setSettings((current) => ({ ...current, [name]: value }));
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const result = await apiRequest("/api/mail/settings", {
        method: "POST",
        body: JSON.stringify(settings)
      });
      if (!result.imap?.configured) throw new Error("入力内容を確認してください。");
      await apiRequest("/api/mail/import?check=1");
      setConfigured(true);
      setSettings((current) => ({ ...current, password: "" }));
      setNotice("メール設定を保存し、受信サーバーへの接続を確認しました。");
    } catch (exception) {
      setError(exception.message || "メール設定を保存できませんでした。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">S</div>
          <div><p className="eyebrow">SPEED ETC</p><h1>配送管理</h1></div>
        </div>
        <section className="sidebar-panel">
          <nav className="sidebar-nav" aria-label="メインメニュー">
            <a className="sidebar-nav-link" href="/">ダッシュボード</a>
            <a className="sidebar-nav-link" href="/mail">メール取込み</a>
            <a className="sidebar-nav-link" href="/inventory">在庫管理</a>
            <a className="sidebar-nav-link active" href="/settings">設定</a>
          </nav>
        </section>
      </aside>

      <section className="content settings-content">
        <header className="page-header settings-header">
          <div><p className="eyebrow">CONNECTION SETTINGS</p><h1>設定</h1></div>
          <span className={`settings-status ${configured ? "connected" : ""}`}>
            <span aria-hidden="true" />{configured ? "メール接続済み" : "メール未設定"}
          </span>
        </header>

        <form className="settings-card" onSubmit={save}>
          <div className="settings-card-intro">
            <div className="settings-card-icon" aria-hidden="true">@</div>
            <div>
              <p className="eyebrow">INCOMING MAIL</p>
              <h2>受信メール設定</h2>
              <p>取込みに使用するメールアカウントを設定します。</p>
            </div>
          </div>

          <div className="settings-fields">
            <label className="settings-field settings-field-wide">
              <span>メールアドレス</span>
              <input type="email" value={settings.username} onChange={(event) => change("username", event.target.value)} required />
            </label>
            <label className="settings-field">
              <span>IMAPホスト</span>
              <input value={settings.host} onChange={(event) => change("host", event.target.value)} required />
            </label>
            <label className="settings-field settings-port-field">
              <span>ポート</span>
              <input type="number" min="1" max="65535" value={settings.port} onChange={(event) => change("port", Number(event.target.value))} required />
            </label>
            <label className="settings-field">
              <span>受信フォルダー</span>
              <input value={settings.inbox} onChange={(event) => change("inbox", event.target.value)} required />
            </label>
          </div>

          <div className="password-card">
            <div className="password-card-copy">
              <span className="password-key" aria-hidden="true">●</span>
              <div><strong>メールパスワード</strong><small>{configured ? "変更するときだけ入力してください" : "メール取込みを有効にするため入力してください"}</small></div>
            </div>
            <div className="password-input-wrap">
              <input
                type={showPassword ? "text" : "password"}
                value={settings.password}
                onChange={(event) => change("password", event.target.value)}
                placeholder={configured ? "現在の設定を変更しない" : "パスワードを入力"}
                required={!configured}
                autoComplete="current-password"
              />
              <button type="button" className="password-toggle" onClick={() => setShowPassword((current) => !current)}>
                {showPassword ? "隠す" : "表示"}
              </button>
            </div>
          </div>

          {loading ? <p className="settings-message">設定を確認しています…</p> : null}
          {notice ? <p className="settings-message success" role="status">{notice}</p> : null}
          {error ? <p className="settings-message error" role="alert">{error}</p> : null}

          <div className="settings-actions">
            <a href="/mail">メール取込みへ戻る</a>
            <button type="submit" disabled={saving || loading}>{saving ? "接続確認中…" : "保存して接続を確認"}</button>
          </div>
        </form>
      </section>
    </main>
  );
}


