"use client";

import { useEffect, useState } from "react";
import { apiRequest as request } from "../../lib/api";

const localMode = process.env.NEXT_PUBLIC_AUTH_MODE === "local";
const MAIL_PAGE_SIZE = 20;

function formatMailDate(value) {
  if (!value) return "日時不明";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "日時不明";
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatFileSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const AIZA_SUMMARY_SECTIONS = [
  {
    title: "対応業者",
    sourceAddress: "B9",
    fallbackSourceLabel: "ご依頼様",
    fields: [
      { labelAddress: "C9", valueAddress: "I9", fallbackLabel: "発注元名" },
      { labelAddress: "C10", valueAddress: "I10", fallbackLabel: "電話番号", phoneLink: true },
      { labelAddress: "C11", valueAddress: "I11", fallbackLabel: "住所" }
    ]
  },
  {
    title: "設置先",
    sourceAddress: "B14",
    fallbackSourceLabel: "設置先",
    fields: [
      { labelAddress: "C14", valueAddress: "I14", fallbackLabel: "お客様カナ名" },
      { labelAddress: "C15", valueAddress: "I15", fallbackLabel: "名前" },
      { labelAddress: "C16", valueAddress: "I16", fallbackLabel: "住所", mapLink: true },
      { labelAddress: "C17", valueAddress: "I17", fallbackLabel: "電話番号", phoneLink: true }
    ]
  },
  {
    title: "設置商品",
    sourceAddress: "B19",
    fallbackSourceLabel: "設置商品",
    fields: [
      { labelAddress: "C19", valueAddress: "C20", fallbackLabel: "品名" },
      { labelAddress: "I19", valueAddress: "I20", fallbackLabel: "品番" },
      { labelAddress: "S19", valueAddress: "S20", fallbackLabel: "色" },
      { labelAddress: "V19", valueAddress: "V20", fallbackLabel: "数量" },
      { labelAddress: "Y19", valueAddress: "Y20", fallbackLabel: "備考" }
    ]
  },
  {
    title: "依頼情報",
    sourceAddress: "",
    fallbackSourceLabel: "依頼情報",
    fields: [
      { labelAddress: "B26", valueAddress: "J26", fallbackLabel: "弊社問合番号" },
      { labelAddress: "B27", valueAddress: "J27", fallbackLabel: "設置訪問日" },
      { labelAddress: "B28", valueAddresses: ["J28", "T28"], fallbackLabel: "商品所在" },
      { labelAddress: "B29", valueAddress: "J29", fallbackLabel: "立会の有無" },
      { labelAddress: "B30", valueAddress: "J30", fallbackLabel: "設置階" },
      { labelAddress: "B31", valueAddress: "J31", fallbackLabel: "既設品搬出" },
      { labelAddress: "B32", valueAddress: "J32", fallbackLabel: "駐車場" },
      { labelAddress: "B33", valueAddress: "J33", fallbackLabel: "保証書" },
      { labelAddress: "B34", valueAddress: "J34", fallbackLabel: "訪問時間連絡" },
      { labelAddress: "B35", valueAddress: "J35", fallbackLabel: "特記事項" },
      { labelAddress: "B38", valueAddress: "J38", fallbackLabel: "担当者" },
      { labelAddress: "B39", valueAddress: "B40", fallbackLabel: "注意事項" }
    ]
  }
];

function aizaCellValue(sheet, address) {
  for (const row of sheet.rows || []) {
    const cell = (row.cells || []).find((item) => item.address === address);
    if (cell) return cell.value;
  }
  return "";
}

function normalizeAizaLabel(value, fallbackLabel) {
  return String(value || fallbackLabel)
    .replace(/^[・\s]+/, "")
    .replace(/[：:]\s*$/, "")
    .trim();
}

function phoneNumberForLink(value) {
  const match = String(value || "").match(/\+?\d[\d\s().‐‑‒–—―ー−-]{7,}\d/);
  if (!match) return "";
  const normalized = match[0].replace(/[^\d+]/g, "");
  return /^\+?\d{9,15}$/.test(normalized) ? normalized : "";
}

function aizaSummarySections(sheet) {
  return AIZA_SUMMARY_SECTIONS.map((section) => ({
    title: section.title,
    sourceLabel: aizaCellValue(sheet, section.sourceAddress) || section.fallbackSourceLabel,
    fields: section.fields.map((field) => {
      const value = (field.valueAddresses || [field.valueAddress])
        .map((address) => aizaCellValue(sheet, address))
        .filter(Boolean)
        .join(" ") || "未記載";
      return {
        key: field.labelAddress,
        label: normalizeAizaLabel(aizaCellValue(sheet, field.labelAddress), field.fallbackLabel),
        value,
        mapLink: Boolean(field.mapLink),
        phoneNumber: field.phoneLink ? phoneNumberForLink(value) : ""
      };
    })
  }));
}

function googleMapsSearchUrl(address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function visiblePageNumbers(currentPage, totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const pages = new Set([1, totalPages]);
  for (let page = currentPage - 2; page <= currentPage + 2; page += 1) {
    if (page > 1 && page < totalPages) pages.add(page);
  }
  return [...pages].sort((left, right) => left - right);
}

function normalizedSagyouStatus(status) {
  if (status === "synced") return "synced";
  if (status === "error") return "error";
  return "unlinked";
}

function sagyouStatusLabel(status) {
  return {
    synced: "連携済み",
    error: "エラー",
    unlinked: "未連携"
  }[normalizedSagyouStatus(status)];
}

function mailIntegrationStatus(importEntry) {
  const jobs = importEntry?.jobs || [];
  if (!jobs.length) return "received";
  const statuses = jobs.map((job) => normalizedSagyouStatus(job.sagyou_sync_status));
  if (statuses.includes("error")) return "error";
  if (statuses.every((status) => status === "synced")) return "synced";
  return "unlinked";
}

function mailIntegrationStatusLabel(status) {
  return {
    received: "メール受信済み",
    unlinked: "未連携",
    synced: "連携済み",
    error: "エラー"
  }[status] || "メール受信済み";
}

function findImportForMail(imports, mail) {
  return imports.find((item) => (
    (item.message_id && String(item.message_id) === String(mail.id))
    || (item.uid && String(item.uid) === String(mail.uid))
  ));
}

function mailRowsForDisplay(messages, imports, page) {
  const importsByMessageId = new Map();
  const importsByUid = new Map();
  for (const item of imports) {
    if (item.message_id) importsByMessageId.set(String(item.message_id), item);
    if (item.uid) importsByUid.set(String(item.uid), item);
  }

  const usedImportIds = new Set();
  const inboxRows = messages.map((mail) => {
    const importEntry = importsByMessageId.get(String(mail.id)) || importsByUid.get(String(mail.uid));
    if (importEntry?.id) usedImportIds.add(importEntry.id);
    return {
      ...mail,
      row_key: `inbox-${mail.uid}`,
      import_entry: importEntry || null,
      integration_status: mailIntegrationStatus(importEntry)
    };
  });

  if (page !== 1) return inboxRows;
  const importedRows = imports
    .filter((item) => item.jobs?.length && !usedImportIds.has(item.id))
    .slice(0, MAIL_PAGE_SIZE)
    .map((item) => ({
      id: item.message_id || item.id,
      uid: String(item.uid || `import-${item.id}`),
      row_key: `import-${item.id}`,
      subject: item.subject || "（件名なし）",
      sender_name: "",
      sender_address: item.sender || "メールアドレス不明",
      received_at: item.received_at || item.created_at || "",
      preview: "取込済みメール",
      is_unread: false,
      is_import_record: true,
      import_entry: item,
      integration_status: mailIntegrationStatus(item)
    }));

  return [...inboxRows, ...importedRows].sort((left, right) => (
    new Date(right.received_at || 0).valueOf() - new Date(left.received_at || 0).valueOf()
  ));
}

export default function MailImportPage() {
  const [messages, setMessages] = useState([]);
  const [mailboxPage, setMailboxPage] = useState(1);
  const [mailboxMeta, setMailboxMeta] = useState({
    total_count: 0,
    total_pages: 1,
    unread_count: 0
  });
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState("success");
  const [loading, setLoading] = useState(false);
  const [importingUid, setImportingUid] = useState("");
  const [openedMessageUid, setOpenedMessageUid] = useState("");
  const [messageDetails, setMessageDetails] = useState({});
  const [detailLoadingUid, setDetailLoadingUid] = useState("");
  const [detailErrors, setDetailErrors] = useState({});
  const [readStateUpdatingUid, setReadStateUpdatingUid] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [mailConfigured, setMailConfigured] = useState(false);
  const [mailSettings, setMailSettings] = useState({
    host: "mail.hosting.ricoh.co.jp",
    port: 993,
    username: "info_order@ithe.co.jp",
    password: "",
    inbox: "INBOX",
    use_ssl: true
  });
  const [imports, setImports] = useState([]);
  const [syncingJobId, setSyncingJobId] = useState("");
  const [syncingMailUid, setSyncingMailUid] = useState("");
  const [jobDates, setJobDates] = useState({});
  const [jobDateErrors, setJobDateErrors] = useState({});
  const [mailSyncErrors, setMailSyncErrors] = useState({});

  async function loadImports() {
    if (!localMode) return [];
    try {
      const result = await request("/api/mail/imports");
      const imported = result.imports || [];
      setImports(imported);
      setJobDates((current) => {
        const next = { ...current };
        for (const item of imported) {
          for (const job of item.jobs || []) {
            if (!next[job.id] && job.scheduled_date) next[job.id] = job.scheduled_date;
          }
        }
        return next;
      });
      return imported;
    } catch (error) {
      setMessageKind("error");
      setMessage(error.message);
      return [];
    }
  }

  async function loadMailSettings() {
    if (!localMode) return;
    try {
      const result = await request("/api/mail/settings");
      const imap = result.imap || {};
      const configured = Boolean(imap.configured);
      setMailConfigured(configured);
      setMailSettings((current) => ({
        ...current,
        host: imap.host || current.host,
        port: imap.port || current.port,
        username: imap.user || current.username,
        inbox: imap.inbox || current.inbox,
        use_ssl: imap.ssl !== false
      }));
      if (configured) await loadMailbox();
    } catch (error) {
      setMessageKind("error");
      setMessage(error.message);
    }
  }

  useEffect(() => {
    if (localMode) {
      loadMailSettings();
      loadImports();
    }
    else loadMailbox();
  }, []);

  function updateMailSetting(name, value) {
    setMailSettings((current) => ({ ...current, [name]: value }));
  }

  async function saveMailSettings(event) {
    event.preventDefault();
    setSavingSettings(true);
    setMessage("");
    try {
      const result = await request("/api/mail/settings", {
        method: "POST",
        body: JSON.stringify(mailSettings)
      });
      if (!result.imap?.configured) {
        const missing = result.imap?.missing?.join(", ") || "IMAP設定";
        throw new Error(`必要な設定が不足しています: ${missing}`);
      }
      setMailConfigured(true);
      setMailSettings((current) => ({ ...current, password: "" }));
      const checkResult = await request("/api/mail/import?check=1");
      const status = checkResult.mail_status;
      setMessageKind("success");
      setMessage(`メール設定を保存し、IMAP接続を確認しました: ${status.user} / ${status.host}:${status.port}`);
    } catch (error) {
      setMessageKind("error");
      setMessage(error.message);
    } finally {
      setSavingSettings(false);
    }
  }

  async function loadMailbox(page = mailboxPage) {
    const requestedPage = Number.isInteger(page) && page > 0 ? page : 1;
    setLoading(true);
    setMessage("");
    try {
      const result = await request(`/api/mail/import?messages=1&page=${requestedPage}&page_size=${MAIL_PAGE_SIZE}`);
      setMessages(result.messages || []);
      setMailboxPage(Number.isInteger(result.page) && result.page > 0 ? result.page : requestedPage);
      setMailboxMeta({
        total_count: result.total_count || 0,
        total_pages: result.total_pages || 1,
        unread_count: result.unread_count || 0
      });
      setMessageKind("success");
      setMessage(`受信メール全${result.total_count || 0}件のうち、${result.displayed_count || 0}件を表示しました。`);
    } catch (error) {
      setMessageKind("error");
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function importMessage(mail) {
    setImportingUid(mail.uid);
    setMessage("");
    try {
      const result = await request("/api/mail/import", {
        method: "POST",
        body: JSON.stringify({ message_ids: [mail.id] })
      });
      const summary = result.summary;
      setMessageKind(summary.error_count ? "warning" : "success");
      setMessage(`「${mail.subject || "件名なし"}」を処理しました。（取込み ${summary.imported_count || 0}件 / 重複 ${summary.duplicate_count || 0}件 / エラー ${summary.error_count || 0}件）`);
      await Promise.all([loadMailbox(mailboxPage), loadImports()]);
    } catch (error) {
      setMessageKind("error");
      setMessage(error.message);
    } finally {
      setImportingUid("");
    }
  }

  async function syncImportedJob(job) {
    const scheduledDate = jobDates[job.id] || job.scheduled_date || "";
    if (!scheduledDate) {
      setJobDateErrors((current) => ({ ...current, [job.id]: true }));
      setMessageKind("warning");
      setMessage("作業日を入力してください。");
      return;
    }
    setJobDateErrors((current) => ({ ...current, [job.id]: false }));
    setSyncingJobId(job.id);
    setMessage("");
    try {
      const result = await request("/api/integrations/sagyou/sync", {
        method: "POST",
        body: JSON.stringify({ job_id: job.id, scheduled_date: scheduledDate })
      });
      const syncedJob = result.job || {};
      if (syncedJob.sagyou_sync_status === "synced") {
        setMessageKind("success");
        setMessage(`作業番号 ${syncedJob.work_order_number} をsagyou-appへ連携しました。`);
      } else {
        setMessageKind(syncedJob.sagyou_sync_status === "pending" ? "warning" : "error");
        setMessage(syncedJob.sagyou_last_error || "sagyou-appへ連携できませんでした。");
      }
      await loadImports();
    } catch (error) {
      setMessageKind("error");
      setMessage(error.message);
    } finally {
      setSyncingJobId("");
    }
  }

  async function syncReceivedMail(mail) {
    const dateKey = `mail-${mail.uid}`;
    const scheduledDate = jobDates[dateKey] || "";
    if (!scheduledDate) {
      setJobDateErrors((current) => ({ ...current, [dateKey]: true }));
      setMessageKind("warning");
      setMessage("作業日を入力してください。");
      return;
    }

    setJobDateErrors((current) => ({ ...current, [dateKey]: false }));
    setMailSyncErrors((current) => ({ ...current, [mail.uid]: "" }));
    setSyncingMailUid(mail.uid);
    setMessage("");
    try {
      const importResult = await request("/api/mail/import", {
        method: "POST",
        body: JSON.stringify({ message_ids: [mail.id] })
      });
      const summary = importResult.summary || {};
      if (summary.error_count && !summary.imported_count) {
        throw new Error(importResult.errors?.[0]?.error || "Excelの取込みに失敗しました。");
      }

      const latestImports = await loadImports();
      const importEntry = findImportForMail(latestImports, mail);
      const jobs = importEntry?.jobs || [];
      if (!jobs.length) {
        throw new Error("このメールから連携できる案件を作成できませんでした。Excel取込み結果を確認してください。");
      }

      const syncedJobs = await Promise.all(jobs.map(async (job) => {
        const result = await request("/api/integrations/sagyou/sync", {
          method: "POST",
          body: JSON.stringify({ job_id: job.id, scheduled_date: scheduledDate })
        });
        return result.job || {};
      }));
      await loadImports();
      const failedJob = syncedJobs.find((job) => job.sagyou_sync_status !== "synced");
      if (failedJob) {
        throw new Error(failedJob.sagyou_last_error || "sagyou-appへ連携できませんでした。");
      }

      setMessageKind("success");
      setMessage(`「${mail.subject || "件名なし"}」を取込み、sagyou-appへ連携しました。`);
    } catch (error) {
      setMailSyncErrors((current) => ({ ...current, [mail.uid]: error.message }));
      setMessageKind("error");
      setMessage(error.message);
      await loadImports();
    } finally {
      setSyncingMailUid("");
    }
  }

  async function setMessageReadState(mail, unread, announce = true) {
    if (mail.is_unread === unread) return true;
    setReadStateUpdatingUid(mail.uid);
    try {
      await request("/api/mail/import", {
        method: "POST",
        body: JSON.stringify({ action: "set_read_state", uid: mail.uid, unread })
      });
      setMessages((current) => current.map((item) => (
        item.uid === mail.uid ? { ...item, is_unread: unread } : item
      )));
      setMessageDetails((current) => current[mail.uid]
        ? { ...current, [mail.uid]: { ...current[mail.uid], is_unread: unread } }
        : current);
      setMailboxMeta((current) => ({
        ...current,
        unread_count: Math.max(0, current.unread_count + (unread ? 1 : -1))
      }));
      if (announce) {
        setMessageKind("success");
        setMessage(unread ? "メールを未読に戻しました。" : "メールを既読にしました。");
      }
      return true;
    } catch (error) {
      setMessageKind("error");
      setMessage(error.message);
      return false;
    } finally {
      setReadStateUpdatingUid("");
    }
  }

  async function changeMailboxPage(page) {
    if (page === mailboxPage || page < 1 || page > mailboxMeta.total_pages) return;
    setOpenedMessageUid("");
    await loadMailbox(page);
  }

  async function toggleMessage(mail) {
    if (openedMessageUid === mail.uid) {
      setOpenedMessageUid("");
      return;
    }
    setOpenedMessageUid(mail.uid);
    if (mail.is_import_record) return;
    if (mail.is_unread) await setMessageReadState(mail, false, false);
    if (messageDetails[mail.uid]) return;
    setDetailLoadingUid(mail.uid);
    setDetailErrors((current) => ({ ...current, [mail.uid]: "" }));
    try {
      const result = await request(`/api/mail/import?message_uid=${encodeURIComponent(mail.uid)}`);
      setMessageDetails((current) => ({ ...current, [mail.uid]: result.message }));
    } catch (error) {
      setDetailErrors((current) => ({ ...current, [mail.uid]: error.message }));
    } finally {
      setDetailLoadingUid("");
    }
  }

  function updateJobDate(jobId, value) {
    setJobDates((current) => ({ ...current, [jobId]: value }));
    if (value) setJobDateErrors((current) => ({ ...current, [jobId]: false }));
  }

  function importedJobControls(importEntry) {
    const jobs = importEntry?.jobs || [];
    if (!jobs.length) return null;
    return (
      <section className="mail-inline-integration" aria-label="sagyou-app連携">
        <div className="mail-inline-integration-heading">
          <div>
            <p className="eyebrow">SAGYOU-APP</p>
            <h4>取込案件の連携</h4>
          </div>
          <span>{jobs.length}件</span>
        </div>
        <div className="mail-import-job-list">
          {jobs.map((job) => {
            const displayStatus = normalizedSagyouStatus(job.sagyou_sync_status);
            return (
              <div className="mail-import-job-row" key={job.id}>
                <div>
                  <strong>作業番号 {job.work_order_number}</strong>
                  <span>{job.customer_name || "お客様名未設定"}</span>
                  {displayStatus !== "synced" && job.sagyou_last_error
                    ? <small>{job.sagyou_last_error}</small>
                    : null}
                </div>
                <label className={`mail-job-date ${jobDateErrors[job.id] ? "invalid" : ""}`}>
                  <span>作業日</span>
                  <input
                    type="date"
                    value={jobDates[job.id] || job.scheduled_date || ""}
                    aria-invalid={jobDateErrors[job.id] || undefined}
                    aria-describedby={jobDateErrors[job.id] ? `job-date-error-${job.id}` : undefined}
                    onChange={(event) => updateJobDate(job.id, event.target.value)}
                  />
                  {jobDateErrors[job.id] ? (
                    <small className="mail-job-validation" id={`job-date-error-${job.id}`} role="alert">
                      作業日を入力してください
                    </small>
                  ) : null}
                </label>
                <span className={`mail-sync-status ${displayStatus}`}>
                  {sagyouStatusLabel(displayStatus)}
                </span>
                <button
                  type="button"
                  className="mail-sagyou-sync-button"
                  onClick={() => syncImportedJob(job)}
                  disabled={syncingJobId === job.id}
                >
                  {syncingJobId === job.id
                    ? "連携中..."
                    : displayStatus === "synced" ? "再連携" : "sagyou-appへ連携"}
                </button>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  function receivedMailIntegrationControls(mail) {
    if (mail.is_import_record || mail.import_entry?.jobs?.length) return null;
    const detail = messageDetails[mail.uid];
    const attachments = detail?.attachments || mail.attachments || [];
    if (!attachments.some((attachment) => attachment.is_excel)) return null;
    const dateKey = `mail-${mail.uid}`;
    return (
      <section className="mail-inline-integration received" aria-label="sagyou-app連携">
        <div className="mail-inline-integration-heading">
          <div>
            <p className="eyebrow">SAGYOU-APP</p>
            <h4>Excelを取込んで連携</h4>
          </div>
          <span className="received">メール受信済み</span>
        </div>
        <div className="mail-received-integration-row">
          <p>作業日を指定すると、Excelの取込みとsagyou-appへの連携を続けて実行します。</p>
          <label className={`mail-job-date ${jobDateErrors[dateKey] ? "invalid" : ""}`}>
            <span>作業日</span>
            <input
              type="date"
              value={jobDates[dateKey] || ""}
              aria-invalid={jobDateErrors[dateKey] || undefined}
              aria-describedby={jobDateErrors[dateKey] ? `job-date-error-${dateKey}` : undefined}
              onChange={(event) => updateJobDate(dateKey, event.target.value)}
            />
            {jobDateErrors[dateKey] ? (
              <small className="mail-job-validation" id={`job-date-error-${dateKey}`} role="alert">
                作業日を入力してください
              </small>
            ) : null}
          </label>
          <button
            type="button"
            className="mail-sagyou-sync-button"
            onClick={() => syncReceivedMail(mail)}
            disabled={syncingMailUid === mail.uid || importingUid === mail.uid}
          >
            {syncingMailUid === mail.uid ? "取込・連携中..." : "sagyou-appへ連携"}
          </button>
        </div>
        {mailSyncErrors[mail.uid] ? (
          <p className="mail-direct-sync-error" role="alert">{mailSyncErrors[mail.uid]}</p>
        ) : null}
      </section>
    );
  }

  const mailRows = mailRowsForDisplay(messages, imports, mailboxPage);

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
            <a className="sidebar-nav-link active" href="/mail">メール取込み</a>
            <a className="sidebar-nav-link" href="/inventory">在庫管理</a>
            <a className="sidebar-nav-link" href="/settings">設定</a>
          </nav>
        </section>
      </aside>
      <section className="content">
        <header className="page-header">
          <div><p className="eyebrow">IMAP MAIL IMPORT</p><h1>メール取込み</h1></div>
        </header>
        <section className="details-card">
          {localMode && !mailConfigured ? (
            <div className="mail-settings-callout">
              <div>
                <p className="eyebrow">MAIL CONNECTION</p>
                <h2>メール取込みを始める準備が必要です</h2>
                <p>設定画面でメールパスワードを登録すると、受信メールを読み込めます。</p>
              </div>
              <a className="settings-link-button" href="/settings">メール設定を開く</a>
            </div>
          ) : null}
          <p>受信メールを開くと、送信者、宛先、本文、Excel内容をまとめて確認できます。取込みも各メール内から実行します。</p>
          {message ? <p className={`mail-notice ${messageKind}`} role="status">{message}</p> : null}
          <div className="mail-inbox" aria-live="polite">
            <div className="mail-inbox-heading">
              <div>
                <p className="eyebrow">INBOX</p>
                <h2>受信メール</h2>
              </div>
              <div className="mail-inbox-actions">
                {mailboxMeta.total_count ? (
                  <span>全{mailboxMeta.total_count}件・未読{mailboxMeta.unread_count}件</span>
                ) : null}
                 <button
                   className="ghost-button"
                   onClick={() => Promise.all([loadMailbox(mailboxPage), loadImports()])}
                   disabled={loading || (localMode && !mailConfigured)}
                 >
                  {loading ? "更新中..." : "受信メールを更新"}
                </button>
              </div>
            </div>
            {mailRows.length ? (
              <>
                <ol className="mail-message-list">
                  {mailRows.map((mail) => (
                  <li className={`mail-message ${mail.is_unread ? "unread" : ""} ${mail.is_import_record ? "import-record" : ""} ${openedMessageUid === mail.uid ? "open" : ""}`} key={mail.row_key || mail.id}>
                    <button
                      className="mail-message-button"
                      type="button"
                      aria-expanded={openedMessageUid === mail.uid}
                      aria-controls={`mail-detail-${mail.uid}`}
                      onClick={() => toggleMessage(mail)}
                    >
                      <div className="mail-message-state" aria-label={mail.is_unread ? "未読" : "既読"}>
                        <span />
                      </div>
                       <div className="mail-message-main">
                         <div className="mail-message-meta">
                           <div className="mail-sender-identity">
                             <strong>{mail.sender_address || "メールアドレス不明"}</strong>
                             <span>{mail.sender_name || "表示名なし"}</span>
                           </div>
                           <div className="mail-message-status-meta">
                             <span className={`mail-integration-status ${mail.integration_status || "received"}`}>
                               {mailIntegrationStatusLabel(mail.integration_status)}
                             </span>
                             <time dateTime={mail.received_at}>{formatMailDate(mail.received_at)}</time>
                           </div>
                         </div>
                         <h3>{mail.subject}</h3>
                         <span className="mail-open-label">
                           {openedMessageUid === mail.uid
                             ? "メールを閉じる ↑"
                             : mail.is_import_record ? "取込案件を表示 ↓" : "メール情報・本文・Excelを表示 ↓"}
                         </span>
                       </div>
                     </button>
                     {openedMessageUid === mail.uid ? (
                       <div className="mail-message-detail" id={`mail-detail-${mail.uid}`}>
                         {!mail.is_import_record ? <div className="mail-read-control">
                           <span className={mail.is_unread ? "unread" : "read"}>
                             {mail.is_unread ? "未読" : "既読"}
                          </span>
                          <button
                            type="button"
                            className="mail-read-toggle"
                            onClick={() => setMessageReadState(mail, !mail.is_unread)}
                            disabled={readStateUpdatingUid === mail.uid}
                          >
                             {readStateUpdatingUid === mail.uid
                               ? "変更中..."
                               : mail.is_unread ? "既読にする" : "未読に戻す"}
                           </button>
                         </div> : null}
                         {!mail.is_import_record && detailLoadingUid === mail.uid ? <p className="mail-detail-status">本文を読み込み中...</p> : null}
                         {!mail.is_import_record && detailErrors[mail.uid] ? <p className="mail-detail-error">{detailErrors[mail.uid]}</p> : null}
                         {messageDetails[mail.uid] ? (
                          <div className={`mail-detail-layout ${messageDetails[mail.uid].excel_sheets?.length ? "has-aiza" : ""}`}>
                            <div className="mail-detail-copy">
                              <dl className="mail-detail-addresses">
                                <div><dt>差出人</dt><dd>{messageDetails[mail.uid].sender_address || mail.sender_address || "-"} {messageDetails[mail.uid].sender_name || mail.sender_name || ""}</dd></div>
                                <div><dt>宛先</dt><dd>{messageDetails[mail.uid].to || "-"}</dd></div>
                                {messageDetails[mail.uid].cc ? <div><dt>CC</dt><dd>{messageDetails[mail.uid].cc}</dd></div> : null}
                                <div><dt>受信日時</dt><dd>{formatMailDate(messageDetails[mail.uid].received_at || mail.received_at)}</dd></div>
                              </dl>
                              <h4 className="mail-detail-section-title">メール本文</h4>
                              <div className="mail-detail-body" tabIndex="0" aria-label="メール本文">{messageDetails[mail.uid].body}</div>
                              {messageDetails[mail.uid].attachments?.length ? (
                                <>
                                  <div className="mail-attachments">
                                    {messageDetails[mail.uid].attachments.map((attachment, index) => (
                                      <span
                                        className={`${attachment.is_excel ? "excel" : ""} ${attachment.excel_error ? "error" : ""}`.trim()}
                                        key={`${attachment.name}-${index}`}
                                      >
                                        {attachment.name}{formatFileSize(attachment.size) ? ` · ${formatFileSize(attachment.size)}` : ""}
                                        {attachment.excel_diagnostics?.status === "ok"
                                          ? ` · 読取済み（${attachment.excel_diagnostics.selected_sheet_name}）`
                                          : attachment.excel_error ? " · 読取失敗" : ""}
                                      </span>
                                    ))}
                                  </div>
                                  {messageDetails[mail.uid].attachments.some((attachment) => attachment.excel_error) ? (
                                    <div className="mail-excel-errors" role="alert">
                                      {messageDetails[mail.uid].attachments
                                        .filter((attachment) => attachment.excel_error)
                                        .map((attachment, index) => (
                                          <p key={`${attachment.name}-error-${index}`}>
                                            <strong>{attachment.name}</strong>
                                            <span>{attachment.excel_error}</span>
                                          </p>
                                        ))}
                                    </div>
                                  ) : null}
                                </>
                              ) : null}
                              <button
                                className="mail-message-import-button"
                                onClick={() => importMessage(mail)}
                                 disabled={
                                   importingUid === mail.uid
                                   || syncingMailUid === mail.uid
                                   || !messageDetails[mail.uid].attachments?.some((attachment) => attachment.is_excel)
                                 }
                              >
                                {importingUid === mail.uid ? "このメールを取込み中..." : "このメールのExcelを取り込む"}
                              </button>
                            </div>
                            {messageDetails[mail.uid].excel_sheets?.length ? (
                              <aside className="aiza-sheet-panel" aria-label="お客様情報">
                                <div className="aiza-sheet-heading">
                                  <div><p className="eyebrow">EXCEL</p><h4>お客様情報</h4></div>
                                  <span>{messageDetails[mail.uid].excel_sheets.length}シート</span>
                                </div>
                                {messageDetails[mail.uid].excel_sheets.map((sheet, sheetIndex) => (
                                  <section className="aiza-sheet" key={`${sheet.file_name}-${sheetIndex}`}>
                                    <div className="aiza-sheet-source">
                                      <strong>{sheet.file_name}</strong>
                                      <small>{sheet.sheet_name} · {sheet.range}</small>
                                    </div>
                                    {(() => {
                                      const summaries = aizaSummarySections(sheet);
                                      return (
                                        <div className="aiza-summary-cards">
                                          {summaries.map((summary) => (
                                            <section className="aiza-summary-card" aria-label={summary.title} key={summary.title}>
                                              <div className="aiza-summary-heading">
                                                <span>{summary.title}</span>
                                                {summary.sourceLabel !== summary.title ? <strong>{summary.sourceLabel}</strong> : null}
                                              </div>
                                              <dl>
                                                {summary.fields.map((field) => (
                                                  <div key={field.key}>
                                                    <dt>{field.label}：</dt>
                                                    <dd>
                                                      {field.mapLink && field.value !== "未記載" ? (
                                                        <a
                                                          className="aiza-map-link"
                                                          href={googleMapsSearchUrl(field.value)}
                                                          target="_blank"
                                                          rel="noreferrer"
                                                          aria-label={`Googleマップで「${field.value}」を開く`}
                                                        >
                                                          <span>{field.value}</span>
                                                          <small>Googleマップで開く ↗</small>
                                                        </a>
                                                      ) : field.phoneNumber ? (
                                                        <a
                                                          className="aiza-phone-link"
                                                          href={`tel:${field.phoneNumber}`}
                                                          aria-label={`${field.phoneNumber}に電話をかける`}
                                                        >
                                                          <span>{field.value}</span>
                                                          <small>電話をかける</small>
                                                        </a>
                                                      ) : field.value}
                                                    </dd>
                                                  </div>
                                                ))}
                                              </dl>
                                            </section>
                                          ))}
                                        </div>
                                      );
                                    })()}
                                  </section>
                                ))}
                              </aside>
                            ) : null}
                           </div>
                         ) : null}
                          {mail.is_import_record && !messageDetails[mail.uid] ? (
                            <p className="mail-import-record-note">取込済みメールです。案件の連携状況をここで管理できます。</p>
                          ) : null}
                          {importedJobControls(mail.import_entry)}
                          {receivedMailIntegrationControls(mail)}
                        </div>
                     ) : null}
                  </li>
                  ))}
                </ol>
                <nav className="mail-pagination" aria-label="受信メールのページ">
                  <button
                    type="button"
                    onClick={() => changeMailboxPage(mailboxPage - 1)}
                    disabled={loading || mailboxPage <= 1}
                  >
                    前へ
                  </button>
                  <div className="mail-page-numbers">
                    {visiblePageNumbers(mailboxPage, mailboxMeta.total_pages).map((page, index, pages) => (
                      <span className="mail-page-slot" key={page}>
                        {index > 0 && page - pages[index - 1] > 1 ? <span aria-hidden="true">…</span> : null}
                        <button
                          type="button"
                          className={page === mailboxPage ? "active" : ""}
                          aria-current={page === mailboxPage ? "page" : undefined}
                          onClick={() => changeMailboxPage(page)}
                          disabled={loading}
                        >
                          {page}
                        </button>
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => changeMailboxPage(mailboxPage + 1)}
                    disabled={loading || mailboxPage >= mailboxMeta.total_pages}
                  >
                    次へ
                  </button>
                </nav>
                <p className="mail-page-summary">
                  {mailboxMeta.total_pages}ページ中 {mailboxPage}ページ目（1ページ{MAIL_PAGE_SIZE}件）
                </p>
              </>
            ) : (
              <p className="mail-inbox-empty">受信メールはまだ表示されていません。「受信メールを更新」を押してください。</p>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
