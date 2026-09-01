import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createHash, randomUUID } from "crypto";
import { createAdminSupabaseClient } from "../../../../lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EXCEL_EXTENSIONS = new Set([".xlsx", ".xlsm", ".xls"]);
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAIL_IMPORT_PARSER_VERSION = "product-exchange-v1";
const localAuth = process.env.NEXT_PUBLIC_AUTH_MODE === "local";
const pythonApiBaseUrl = process.env.PYTHON_API_BASE_URL || "http://127.0.0.1:8765";

async function localPythonRequest(request, path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Accept", "application/json");
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("Cookie", cookie);
  const response = await fetch(`${pythonApiBaseUrl}${path}`, {
    ...options,
    headers,
    cache: "no-store"
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

function localResponse(result) {
  return NextResponse.json(result.payload, { status: result.response.status });
}

function normalizeLocalMessage(message) {
  return {
    ...message,
    sender_name: message.sender_name || "",
    sender_address: message.sender_address || message.sender || "",
    body: message.body || "本文は取込み後の履歴で確認してください。",
    is_unread: Boolean(message.is_unread),
    attachments: (message.attachments || []).map((attachment) => ({
      ...attachment,
      is_excel: isExcel(attachment.name || "")
    })),
    excel_sheets: message.excel_sheets || message.aiza_sheets || []
  };
}

async function localMailGet(request) {
  const searchParams = new URL(request.url).searchParams;
  const messagesResult = async (page = 1, pageSize = 20) => localPythonRequest(
    request,
    `/api/mail/messages?page=${encodeURIComponent(page)}&page_size=${encodeURIComponent(pageSize)}`
  );

  if (searchParams.get("check") === "1") {
    const [settings, messages] = await Promise.all([
      localPythonRequest(request, "/api/mail/settings"),
      messagesResult()
    ]);
    if (!settings.response.ok) return localResponse(settings);
    if (!messages.response.ok) return localResponse(messages);
    const imap = settings.payload.imap || {};
    const rows = messages.payload.messages || [];
    return NextResponse.json({
      mail_status: {
        connected: true,
        user: imap.user,
        host: imap.host,
        port: imap.port,
        inbox: imap.inbox,
        total_messages: messages.payload.total_count ?? rows.length,
        unread_messages: messages.payload.unread_count ?? rows.filter((message) => message.is_unread).length
      }
    });
  }

  const messageUid = searchParams.get("message_uid");
  if (messageUid) {
    const detail = await localPythonRequest(
      request,
      `/api/mail/messages?uid=${encodeURIComponent(messageUid)}`
    );
    if (!detail.response.ok) return localResponse(detail);
    return NextResponse.json({ message: normalizeLocalMessage(detail.payload.message || {}) });
  }

  if (searchParams.get("messages") === "1") {
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.min(Math.max(Number(searchParams.get("page_size")) || 20, 1), 100);
    const messages = await messagesResult(page, pageSize);
    if (!messages.response.ok) return localResponse(messages);
    const rows = (messages.payload.messages || []).map(normalizeLocalMessage);
    return NextResponse.json({
      ...messages.payload,
      messages: rows,
      displayed_count: rows.length
    });
  }

  const [imports, jobs] = await Promise.all([
    localPythonRequest(request, "/api/mail/imports"),
    localPythonRequest(request, "/api/logistics/jobs")
  ]);
  if (!imports.response.ok) return localResponse(imports);
  if (!jobs.response.ok) return localResponse(jobs);
  const mailJobs = (jobs.payload.jobs || [])
    .filter((job) => job.source === "mail_import" || job.source === "imap" || job.source_attachment_name)
    .slice(-200)
    .reverse();
  return NextResponse.json({ imports: imports.payload.imports || [], jobs: mailJobs });
}

async function localMailPost(request) {
  const body = await request.text();
  const payload = body ? JSON.parse(body) : {};
  const path = payload.action === "set_read_state"
    ? "/api/mail/read-state"
    : "/api/mail/import";
  const forwardedBody = payload.action === "set_read_state"
    ? JSON.stringify({ uid: payload.uid, unread: Boolean(payload.unread) })
    : body;
  const result = await localPythonRequest(request, path, {
    method: "POST",
    ...(forwardedBody ? { body: forwardedBody, headers: { "Content-Type": "application/json" } } : {})
  });
  return localResponse(result);
}

function authorizationToken(request) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}

async function requireUser(request, supabase) {
  const token = authorizationToken(request);
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  return error ? null : data.user || null;
}

function env(name, fallback = "") {
  return (process.env[name] || fallback).trim();
}

function imapConfig() {
  const host = env("IMAP_HOST");
  const user = env("IMAP_USER");
  const password = env("IMAP_PASSWORD");
  if (!host || !user || !password) {
    throw new Error("IMAP_HOST, IMAP_USER, and IMAP_PASSWORD must be configured.");
  }
  return {
    host,
    port: Number(env("IMAP_PORT", "993")),
    secure: true,
    auth: { user, pass: password },
    logger: false
  };
}

function safeFileName(name) {
  return String(name || "attachment.xlsx")
    .replace(/[\\/:*?"<>|\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 180) || "attachment.xlsx";
}

function isExcel(name) {
  const index = name.lastIndexOf(".");
  return index >= 0 && EXCEL_EXTENSIONS.has(name.slice(index).toLowerCase());
}

function storageFileName(sha256, originalName) {
  const extension = originalName.match(/\.(xlsx|xlsm|xls)$/i)?.[0]?.toLowerCase() || ".xlsx";
  return `${sha256}${extension}`;
}

function normalizedSheetName(value) {
  return String(value || "").normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

const AIZA_SHEET_NAME_PRIORITY = ["アイザ様", "アイザ"];
const AIZA_SHEET_SIGNATURE = {
  C9: "発注元名",
  C14: "お客様カナ名",
  C19: "品名",
  B26: "弊社問合番号"
};

function excelCellDisplayValue(cell) {
  if (!cell) return "";
  if (cell.v instanceof Date) {
    if (cell.v.getFullYear() <= 1900) return "";
    return cell.v.toISOString();
  }
  if (cell.w !== undefined && cell.w !== null) return String(cell.w).trim();
  if (cell.v !== undefined && cell.v !== null) return String(cell.v).trim();
  if (cell.f) return `=${cell.f}`;
  return "";
}

function extractAizaSheetResult(buffer, fileName) {
  const diagnostics = {
    status: "opening",
    file_name: safeFileName(fileName),
    file_type: fileName.slice(fileName.lastIndexOf(".")).toLowerCase(),
    selected_sheet_name: "",
    available_sheet_names: [],
    matched_labels: 0,
    total_labels: Object.keys(AIZA_SHEET_SIGNATURE).length,
    missing_labels: [],
    error: ""
  };
  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  } catch (error) {
    diagnostics.status = "open_error";
    diagnostics.error = `Excelファイルを開けませんでした: ${error instanceof Error ? error.message : String(error)}`;
    return { sheet: null, diagnostics };
  }
  diagnostics.available_sheet_names = [...workbook.SheetNames];
  const sheetName = AIZA_SHEET_NAME_PRIORITY
    .map((expected) => workbook.SheetNames.find(
      (name) => normalizedSheetName(name) === normalizedSheetName(expected)
    ))
    .find(Boolean);
  if (!sheetName) {
    diagnostics.status = "target_sheet_missing";
    diagnostics.error = "「アイザ様」または「アイザ」シートが見つかりませんでした。";
    return { sheet: null, diagnostics };
  }
  diagnostics.selected_sheet_name = sheetName;
  const sheet = workbook.Sheets[sheetName];
  diagnostics.missing_labels = Object.entries(AIZA_SHEET_SIGNATURE)
    .map(([address, expected]) => ({
      address,
      expected,
      actual: excelCellDisplayValue(sheet[address])
    }))
    .filter(({ expected, actual }) => !normalizedSheetName(actual).includes(normalizedSheetName(expected)));
  diagnostics.matched_labels = diagnostics.total_labels - diagnostics.missing_labels.length;
  if (diagnostics.missing_labels.length) {
    diagnostics.status = "schema_mismatch";
    diagnostics.error = "対象シートの固定項目を確認できませんでした。";
    return { sheet: null, diagnostics };
  }
  const rows = new Map();
  for (const [address, cell] of Object.entries(sheet)) {
    if (address.startsWith("!")) continue;
    const value = excelCellDisplayValue(cell);
    if (!value) continue;
    const position = XLSX.utils.decode_cell(address);
    const row = position.r + 1;
    if (!rows.has(row)) rows.set(row, []);
    rows.get(row).push({
      address,
      column: position.c + 1,
      value
    });
  }
  diagnostics.status = "ok";
  return { sheet: {
    file_name: safeFileName(fileName),
    sheet_name: sheetName,
    range: sheet["!ref"] || "",
    rows: [...rows.entries()]
      .sort(([left], [right]) => left - right)
      .map(([row, cells]) => ({
        row,
        cells: cells.sort((left, right) => left.column - right.column)
      }))
  }, diagnostics };
}

function extractAizaSheet(buffer, fileName) {
  const result = extractAizaSheetResult(buffer, fileName);
  if (!result.sheet) throw new Error(result.diagnostics.error);
  return result.sheet;
}

function datePart(value) {
  const parsed = new Date(value || Date.now());
  return Number.isNaN(parsed.valueOf()) ? new Date().toISOString().slice(0, 10) : parsed.toISOString().slice(0, 10);
}

function text(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function mailPreview(value, maxLength = 180) {
  const normalized = text(value);
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…` : normalized;
}

function mailBody(parsed) {
  let value = String(parsed.text || "").replace(/\r\n?/g, "\n").trim();
  if (!value && parsed.html) {
    value = String(parsed.html)
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p\s*>/gi, "\n\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  return value;
}

function cell(sheet, address) {
  return text(sheet?.[address]?.v);
}

function findSheet(workbook, name) {
  const sheetName = workbook.SheetNames.find((item) => item === name || item.includes(name));
  return sheetName ? workbook.Sheets[sheetName] : undefined;
}

async function excelJob(buffer, fileName) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const input = findSheet(workbook, "入力シート");
  const extract = findSheet(workbook, "データ抽出シート");
  const application = findSheet(workbook, "申請書");
  const orderFromName = fileName.match(/\b(\d{8})\b/)?.[1] || "";
  const workOrderNumber = cell(input, "D23") || orderFromName;
  const rawSheets = Object.fromEntries(workbook.SheetNames.map((sheetName) => [
    sheetName,
    XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "", raw: false })
      .slice(0, 100)
      .map((row) => row.slice(0, 50).map(text))
  ]));
  if (!workOrderNumber) return { job: null, rawSheets };
  const customerAddress = [cell(input, "D29"), cell(input, "D30"), cell(input, "D31")].filter(Boolean).join(" ");
  const deliverySummary = [cell(input, "D59"), cell(input, "D60"), cell(input, "D62"), cell(input, "D63"), cell(input, "D64")].filter(Boolean).join(" ");
  const branch = cell(input, "D11");
  const oldModel = cell(input, "D47");
  const newModel = cell(extract, "W3") || cell(extract, "H7") || oldModel;
  const yen = (value) => Number(String(value).replaceAll(",", "")) || 0;
  return {
    rawSheets,
    job: {
      id: randomUUID(),
      work_order_number: workOrderNumber,
      status: "unprocessed",
      scheduled_date: "",
      customer_name: cell(input, "D24"),
      customer_phone: cell(input, "D32"),
      customer_address: customerAddress,
      area: branch || customerAddress,
      branch,
      store_name: cell(input, "D34"),
      staff_name: cell(input, "D12"),
      old_product_model: oldModel,
      new_product_model: newModel,
      product_summary: cell(input, "D46"),
      work_summary: cell(input, "D52") || cell(input, "D49"),
      purchase_amount_yen: yen(cell(application, "F54")),
      other_fee_yen: yen(cell(application, "F55")) + yen(cell(application, "F56")) + yen(cell(application, "F57")),
      memo: [cell(input, "D49"), cell(input, "D50"), cell(input, "D58"), deliverySummary].filter(Boolean).join("\n"),
      source: "mail_import",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  };
}

function importText(value) {
  const result = String(value ?? "").replace(/\r/g, "\n").replace(/[ \t　]+/g, " ").replace(/\n+/g, " ").trim();
  return ["-", "0", "未入力", "未記入"].includes(result) ? "" : result;
}

function importCell(sheet, address) {
  return importText(sheet?.[address]?.v);
}

function importSheet(workbook, keywords, fallbackIndex) {
  const name = workbook.SheetNames.find((item) => keywords.some((keyword) => item.includes(keyword)));
  return workbook.Sheets[name || workbook.SheetNames[fallbackIndex] || ""];
}

function importAmount(value) {
  return Number(importText(value).replaceAll(",", "")) || 0;
}

function importOrderNumber(...values) {
  for (const value of values) {
    const match = String(value || "").match(/\b(\d{8})\b/);
    if (match) return match[1];
  }
  return "";
}

function worksheetRows(sheet) {
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false })
    .map((row) => row.map(importText));
}

function valueAfterLabel(rows, labels, useLast = false) {
  const matches = [];
  for (const row of rows) {
    const labelIndex = row.findIndex((value) => labels.some((label) => value.includes(label)));
    if (labelIndex < 0) continue;
    const value = row.slice(labelIndex + 1).find(Boolean) || "";
    if (value) matches.push(value);
  }
  return useLast ? matches.at(-1) || "" : matches[0] || "";
}

function valueBelowHeader(rows, labels) {
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const columnIndex = rows[rowIndex].findIndex((value) => labels.some((label) => value === label || value.includes(label)));
    if (columnIndex < 0) continue;
    for (let nextRow = rowIndex + 1; nextRow < Math.min(rows.length, rowIndex + 6); nextRow += 1) {
      const value = rows[nextRow][columnIndex] || "";
      if (value) return value;
    }
  }
  return "";
}

async function excelJobV2(buffer, fileName) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const input = importSheet(workbook, ["入力", "蜈･蜉帙"], 0);
  const extract = importSheet(workbook, ["データ", "抽出", "謚ｽ蜃ｺ", "謚懷叙"], 1);
  const application = importSheet(workbook, ["申請", "逕ｳ隲区"], 2);
  const inputRows = worksheetRows(input);
  const rawSheets = Object.fromEntries(workbook.SheetNames.map((name) => [name, worksheetRows(workbook.Sheets[name]).slice(0, 100).map((row) => row.slice(0, 80))]));
  const inquiryNumber = valueAfterLabel(inputRows, ["弊社問合番号", "問合番号"]);
  const orderNumber = importOrderNumber(inquiryNumber, fileName) || importCell(input, "D23");
  if (!orderNumber) return { job: null, rawSheets };
  const address = valueAfterLabel(inputRows, ["住所"], true) || ["D29", "D30", "D31"].map((key) => importCell(input, key)).filter(Boolean).join(" ");
  const delivery = ["D59", "D60", "D62", "D63", "D64"].map((key) => importCell(input, key)).filter(Boolean).join(" ");
  const branch = valueAfterLabel(inputRows, ["発注元名"]) || importCell(input, "D11");
  const productName = valueBelowHeader(inputRows, ["品名"]) || importCell(input, "D46");
  const productModel = valueBelowHeader(inputRows, ["品番"]) || importCell(input, "D47");
  const productRemarks = valueBelowHeader(inputRows, ["備考"]);
  const originalModel = productRemarks.match(/元商品(?:は|：|:)?\s*([^\s、]+)/)?.[1] || "";
  const oldModel = originalModel || importCell(input, "D47");
  const fields = {
    work_order_number: orderNumber, inquiry_number: inquiryNumber, branch, staff_name: valueAfterLabel(inputRows, ["担当者"], true) || importCell(input, "D12"), customer_kana: valueAfterLabel(inputRows, ["お客様カナ名"]), customer_name: valueAfterLabel(inputRows, ["名前"], true) || importCell(input, "D24"), customer_phone: valueAfterLabel(inputRows, ["電話番号"], true) || importCell(input, "D32"), customer_address: address, store_name: valueAfterLabel(inputRows, ["発注元名"]) || importCell(input, "D34"), product_summary: productName, old_product_model: oldModel, new_product_model: productModel || importCell(extract, "W3") || importCell(extract, "H7") || oldModel, product_serial: importCell(input, "D48"), quantity: valueBelowHeader(inputRows, ["数量"]), product_color: valueBelowHeader(inputRows, ["色"]), product_remarks: productRemarks, symptom: importCell(input, "D49"), request_reason: importCell(input, "D50"), application_type: "商品交換", visit_request: valueAfterLabel(inputRows, ["設置訪問日"]), product_location: valueAfterLabel(inputRows, ["商品所在"]), attendance: valueAfterLabel(inputRows, ["立会の有無"]), installation_floor: valueAfterLabel(inputRows, ["設置階"]), removal_required: valueAfterLabel(inputRows, ["既設品搬出"]), parking: valueAfterLabel(inputRows, ["駐車場"]), warranty: valueAfterLabel(inputRows, ["保証書"]), contact_timing: valueAfterLabel(inputRows, ["訪問時間連絡"]), special_notes: valueAfterLabel(inputRows, ["特記事項"]), work_note: importCell(input, "D58"), delivery_summary: delivery, approval_number: importCell(extract, "U3"), approval_comment: importCell(extract, "P3"), purchase_amount_yen: importAmount(importCell(application, "F54")), compensation_amount_yen: importAmount(importCell(application, "F55")), repair_burden_fee_yen: importAmount(importCell(application, "F56")), customer_burden_fee_yen: importAmount(importCell(application, "F57"))
  };
  const memo = Object.entries(fields).filter(([key, value]) => value && !["work_order_number", "branch", "customer_name"].includes(key)).map(([key, value]) => `${key}: ${value}`).join("\n");
  return { rawSheets, job: { id: randomUUID(), work_order_number: orderNumber, status: "unprocessed", scheduled_date: "", customer_name: fields.customer_name, customer_phone: fields.customer_phone, customer_address: address, area: branch || address, branch, store_name: fields.store_name, staff_name: fields.staff_name, old_product_model: fields.old_product_model, new_product_model: fields.new_product_model, product_summary: fields.product_summary, product_serial: fields.product_serial, work_summary: fields.application_type || fields.symptom, purchase_amount_yen: fields.purchase_amount_yen, other_fee_yen: fields.compensation_amount_yen + fields.repair_burden_fee_yen + fields.customer_burden_fee_yen, memo, raw_payload: { source_file: fileName, excel_fields: fields }, source: "mail_import", created_at: new Date().toISOString(), updated_at: new Date().toISOString() } };
}

async function documentPayload(supabase, key, fallback) {
  const { data, error } = await supabase.from("app_documents").select("payload").eq("document_key", key).maybeSingle();
  if (error) throw error;
  return data?.payload ?? fallback;
}

async function saveDocument(supabase, key, payload) {
  const { error } = await supabase.from("app_documents").upsert({
    document_key: key,
    payload,
    updated_at: new Date().toISOString()
  });
  if (error) throw error;
}

async function imapConnectionStatus() {
  const config = imapConfig();
  const client = new ImapFlow(config);
  try {
    await client.connect();
    const mailbox = await client.mailboxOpen(env("IMAP_INBOX", "INBOX"), { readOnly: true });
    const allMessages = await client.search({ all: true });
    const unreadMessages = await client.search({ seen: false });
    return {
      connected: true,
      host: config.host,
      port: config.port,
      user: config.auth.user,
      inbox: mailbox.path,
      total_messages: allMessages.length,
      unread_messages: unreadMessages.length
    };
  } finally {
    await client.logout().catch(() => undefined);
  }
}

async function imapMailboxMessages(page = 1, pageSize = 20) {
  const config = imapConfig();
  const client = new ImapFlow(config);
  try {
    await client.connect();
    await client.mailboxOpen(env("IMAP_INBOX", "INBOX"), { readOnly: true });
    const messageNumbers = await client.search({ all: true });
    const unreadMessageNumbers = await client.search({ seen: false });
    const limit = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
    const totalCount = messageNumbers.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / limit));
    const currentPage = Math.min(Math.max(Number(page) || 1, 1), totalPages);
    const end = totalCount - ((currentPage - 1) * limit);
    const start = Math.max(0, end - limit);
    const messages = [];
    for (const messageNumber of messageNumbers.slice(start, end).reverse()) {
      const message = await client.fetchOne(messageNumber, { envelope: true, flags: true, uid: true });
      const sender = message?.envelope?.from?.[0] || {};
      messages.push({
        id: message?.envelope?.messageId || String(message?.uid || messageNumber),
        uid: String(message?.uid || messageNumber),
        subject: message?.envelope?.subject || "（件名なし）",
        sender_name: sender.name || "",
        sender_address: sender.address || "",
        received_at: message?.envelope?.date?.toISOString?.() || "",
        preview: "",
        is_unread: !message?.flags?.has("\\Seen"),
        attachments: []
      });
    }
    return {
      messages,
      page: currentPage,
      page_size: limit,
      total_count: totalCount,
      total_pages: totalPages,
      unread_count: unreadMessageNumbers.length
    };
  } finally {
    await client.logout().catch(() => undefined);
  }
}

async function setImapMessageReadState(uid, unread) {
  const client = new ImapFlow(imapConfig());
  try {
    await client.connect();
    const lock = await client.getMailboxLock(env("IMAP_INBOX", "INBOX"));
    try {
      if (unread) await client.messageFlagsRemove(uid, ["\\Seen"], { uid: true });
      else await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
    } finally {
      lock.release();
    }
    return { uid: String(uid), is_unread: Boolean(unread) };
  } finally {
    await client.logout().catch(() => undefined);
  }
}

async function imapMessageDetail(uid) {
  const config = imapConfig();
  const client = new ImapFlow(config);
  try {
    await client.connect();
    await client.mailboxOpen(env("IMAP_INBOX", "INBOX"), { readOnly: true });
    const message = await client.fetchOne(uid, { source: true, envelope: true, flags: true, uid: true }, { uid: true });
    if (!message?.source) throw new Error("指定したメールを取得できませんでした。");
    const parsed = await simpleParser(message.source);
    const sender = parsed.from?.value?.[0] || {};
    const attachments = parsed.attachments.map((attachment) => {
      const name = safeFileName(attachment.filename || "添付ファイル");
      let aizaSheet = null;
      let aizaError = "";
      let excelDiagnostics = null;
      if (isExcel(name)) {
        const preview = extractAizaSheetResult(attachment.content, name);
        aizaSheet = preview.sheet;
        excelDiagnostics = preview.diagnostics;
        if (preview.diagnostics.status !== "ok") aizaError = preview.diagnostics.error;
      }
      return {
        name,
        size: attachment.size || attachment.content?.length || 0,
        is_excel: isExcel(name),
        aiza_sheet: aizaSheet,
        aiza_error: aizaError,
        excel_error: aizaError,
        excel_diagnostics: excelDiagnostics
      };
    });
    return {
      id: parsed.messageId || String(message.uid || uid),
      uid: String(message.uid || uid),
      subject: parsed.subject || "（件名なし）",
      sender_name: sender.name || "",
      sender_address: sender.address || "",
      to: parsed.to?.text || "",
      cc: parsed.cc?.text || "",
      received_at: parsed.date?.toISOString() || message.envelope?.date?.toISOString?.() || "",
      body: mailBody(parsed) || "本文はありません。",
      is_unread: !message.flags?.has("\\Seen"),
      attachments,
      excel_sheets: attachments.map((attachment) => attachment.aiza_sheet).filter(Boolean)
    };
  } finally {
    await client.logout().catch(() => undefined);
  }
}

export async function GET(request) {
  if (localAuth) return localMailGet(request);
  try {
    const supabase = createAdminSupabaseClient();
    if (!(await requireUser(request, supabase))) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
    const searchParams = new URL(request.url).searchParams;
    if (searchParams.get("check") === "1") {
      try {
        return NextResponse.json({ mail_status: await imapConnectionStatus() });
      } catch (error) {
        return NextResponse.json({
          error: error instanceof Error ? error.message : "IMAP connection check failed.",
          mail_status: { connected: false }
        }, { status: 500 });
      }
    }
    const messageUid = searchParams.get("message_uid");
    if (messageUid) {
      if (!/^\d+$/.test(messageUid)) return NextResponse.json({ error: "メールIDが正しくありません。" }, { status: 400 });
      try {
        return NextResponse.json({ message: await imapMessageDetail(messageUid) });
      } catch (error) {
        return NextResponse.json({
          error: error instanceof Error ? error.message : "メール本文を取得できませんでした。"
        }, { status: 500 });
      }
    }
    if (searchParams.get("messages") === "1") {
      try {
        const page = Math.max(1, Number(searchParams.get("page")) || 1);
        const pageSize = Math.min(Math.max(Number(searchParams.get("page_size")) || 20, 1), 100);
        const result = await imapMailboxMessages(page, pageSize);
        return NextResponse.json({ ...result, displayed_count: result.messages.length });
      } catch (error) {
        return NextResponse.json({
          error: error instanceof Error ? error.message : "受信メールを取得できませんでした。"
        }, { status: 500 });
      }
    }
    const [imports, logisticsJobs] = await Promise.all([
      documentPayload(supabase, "mail_imports", []),
      documentPayload(supabase, "logistics_jobs", [])
    ]);
    const jobs = Array.isArray(logisticsJobs)
      ? logisticsJobs.filter((job) => job?.source === "mail_import").slice(-200).reverse()
      : [];
    return NextResponse.json({ imports: Array.isArray(imports) ? imports : [], jobs });
  } catch {
    return NextResponse.json({ error: "メール取込履歴を取得できませんでした。" }, { status: 500 });
  }
}

export async function POST(request) {
  if (localAuth) return localMailPost(request);
  let client;
  try {
    const requestPayload = await request.json().catch(() => ({}));
    const selectedMessageIds = new Set(
      Array.isArray(requestPayload.message_ids)
        ? requestPayload.message_ids.map(String).filter(Boolean)
        : []
    );
    const supabase = createAdminSupabaseClient();
    const user = await requireUser(request, supabase);
    if (!user) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
    if (requestPayload.action === "set_read_state") {
      const uid = String(requestPayload.uid || "");
      if (!/^\d+$/.test(uid)) {
        return NextResponse.json({ error: "メールIDが正しくありません。" }, { status: 400 });
      }
      const message = await setImapMessageReadState(uid, Boolean(requestPayload.unread));
      return NextResponse.json({ message });
    }
    const [history, storedLogisticsJobs] = await Promise.all([
      documentPayload(supabase, "mail_imports", []),
      documentPayload(supabase, "logistics_jobs", [])
    ]);
    const imports = Array.isArray(history) ? history : [];
    const allJobs = Array.isArray(storedLogisticsJobs) ? storedLogisticsJobs : [];
    const importedHashes = new Set(
      allJobs
        .filter((job) => job.parser_version === MAIL_IMPORT_PARSER_VERSION)
        .map((job) => job.source_attachment_sha256)
        .filter(Boolean)
    );
    client = new ImapFlow(imapConfig());
    await client.connect();
    const lock = await client.getMailboxLock(env("IMAP_INBOX", "INBOX"));
    const maxMessages = Math.min(Math.max(Number(env("IMAP_MAX_MESSAGES", "20")) || 20, 1), 50);
    const imported = [];
    const errors = [];
    const messages = [];
    const diagnostics = { scanned_count: 0, keyword_match_count: 0, excel_attachment_count: 0, parsed_job_count: 0, duplicate_count: 0 };
    try {
      const messageNumbers = await client.search({ all: true });
      for (const messageNumber of messageNumbers.slice(-maxMessages).reverse()) {
        diagnostics.scanned_count += 1;
        const message = await client.fetchOne(messageNumber, { source: true, envelope: true, flags: true, uid: true });
        if (!message?.source) continue;
        const parsed = await simpleParser(message.source);
        const messageId = parsed.messageId || String(message.uid || messageNumber);
        if (
          selectedMessageIds.size
          && !selectedMessageIds.has(String(messageId))
          && !selectedMessageIds.has(String(message.uid || messageNumber))
        ) continue;
        if (messages.length < maxMessages) {
          const sender = parsed.from?.value?.[0] || {};
          messages.push({
            id: messageId,
            uid: String(message.uid || messageNumber),
            subject: parsed.subject || "（件名なし）",
            sender_name: sender.name || "",
            sender_address: sender.address || "",
            received_at: parsed.date?.toISOString() || message.envelope?.date?.toISOString?.() || "",
            preview: mailPreview(parsed.text || ""),
            is_unread: !message.flags?.has("\\Seen"),
            attachments: parsed.attachments.map((attachment) => ({
              name: safeFileName(attachment.filename || "添付ファイル"),
              size: attachment.size || attachment.content?.length || 0,
              is_excel: isExcel(attachment.filename || "")
            }))
          });
        }
        const searchableText = `${parsed.subject || ""}\n${parsed.text || ""}`;
        if (!searchableText.includes("商品交換")) continue;
        diagnostics.keyword_match_count += 1;
        const attachments = parsed.attachments.filter((attachment) => isExcel(attachment.filename || ""));
        if (!attachments.length) continue;
        diagnostics.excel_attachment_count += attachments.length;
        const savedAttachments = [];
        const jobs = [];
        for (const attachment of attachments) {
          const name = safeFileName(attachment.filename);
          try {
            if (attachment.content.length > MAX_ATTACHMENT_BYTES) throw new Error(`${name} exceeds 10 MB.`);
            const sha256 = createHash("sha256").update(attachment.content).digest("hex");
            if (importedHashes.has(sha256)) {
              diagnostics.duplicate_count += 1;
              continue;
            }
            const objectPath = `mail-imports/${datePart(parsed.date)}/${sha256.slice(0, 16)}/${storageFileName(sha256, name)}`;
            const { error: uploadError } = await supabase.storage.from("speed-etc-files").upload(objectPath, attachment.content, {
              contentType: attachment.contentType || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              upsert: false
            });
            if (uploadError && !/already exists/i.test(uploadError.message)) throw uploadError;
            const extracted = await excelJobV2(attachment.content, name);
            const aizaSheet = extractAizaSheet(attachment.content, name);
            savedAttachments.push({
              name,
              size: attachment.content.length,
              sha256,
              content_type: attachment.contentType || "",
              storage_path: objectPath,
              parsed_sheets: extracted.rawSheets,
              aiza_sheet: aizaSheet
            });
            if (extracted.job) {
              jobs.push({
                ...extracted.job,
                raw_payload: { ...extracted.job.raw_payload, aiza_sheet: aizaSheet },
                parser_version: MAIL_IMPORT_PARSER_VERSION,
                source_attachment_name: name,
                source_attachment_sha256: sha256,
                source_attachment_path: objectPath
              });
              diagnostics.parsed_job_count += 1;
            }
            importedHashes.add(sha256);
          } catch (error) {
            errors.push({
              message_uid: String(message.uid || messageNumber),
              attachment_name: name,
              error: error instanceof Error ? error.message : "添付ファイルの取込みに失敗しました。"
            });
          }
        }
        if (!savedAttachments.length) {
          continue;
        }
        const entry = {
          id: randomUUID(), source: "imap", uid: String(messageNumber), mailbox: env("IMAP_INBOX", "INBOX"),
          subject: parsed.subject || "", sender: parsed.from?.value?.[0]?.address || "", received_at: parsed.date?.toISOString() || "",
          attachments: savedAttachments, status: "saved", created_jobs: jobs.length, created_at: new Date().toISOString(), imported_by: user.email || user.id
        };
        for (const job of jobs) {
          const index = allJobs.findIndex((item) => item.work_order_number === job.work_order_number);
          if (index >= 0) allJobs[index] = { ...allJobs[index], ...job, updated_at: new Date().toISOString() };
          else allJobs.push(job);
        }
        imports.unshift(entry);
        await saveDocument(supabase, "mail_imports", imports.slice(0, 500));
        await saveDocument(supabase, "logistics_jobs", allJobs);
        imported.push(entry);
        if (imported.length >= maxMessages) break;
      }
    } finally { lock.release(); }
    return NextResponse.json({
      messages,
      imported,
      errors,
      summary: { imported_count: imported.length, displayed_count: messages.length, error_count: errors.length, ...diagnostics }
    });
  } catch (error) {
    console.error("IMAP import failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "メール取込に失敗しました。" }, { status: 500 });
  } finally {
    if (client) await client.logout().catch(() => undefined);
  }
}
