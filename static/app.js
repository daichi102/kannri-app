const state = {
  activeModule: "logistics",
  jobs: [],
  sagyouSyncingJobIds: new Set(),
  jobStatuses: [],
  jobAreas: [],
  subcontractors: [],
  returnCandidates: [],
  returnSelectedIds: new Set(),
  mailSettings: null,
  mailCandidates: [],
  mailSelectedIds: new Set(),
  mailImports: [],
  vehicles: [],
  statuses: [],
  pdfs: [],
  records: [],
  selectedRecordIds: new Set(),
  certificatesByRecordId: new Map(),
  submissionAssignments: new Map(),
  analyzedPdf: "",
  croppedPdfUrl: "",
  croppedPdfFileName: "",
  pageSize: 20,
  currentPage: 1,
  session: null,
  currentRateSuggestion: null,
  showOtherRateItems: false,
};

const yen = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

const number = new Intl.NumberFormat("ja-JP");
const spimaruMessages = [
  "{name}さん、見つかっちゃった！今日もお仕事頑張ってね！",
  "{name}さん、さすがです。今日の明細チェックもスピード勝負です。",
  "{name}さん、発見ありがとうございます。今日も安全にサクッといきましょう。",
  "{name}さん、スピ丸発見！面倒な明細は早めに片付けちゃいましょう。",
  "{name}さん、今日もよろしくお願いします。ETC明細、軽やかにいきましょう。",
  "{name}さん、よく見つけましたね。今日の仕事運、ちょっと上がりました。",
  "{name}さん、スピ丸です。更新忘れがないか一緒に見ていきましょう。",
  "{name}さん、発見されました。今日もすばやく、でも丁寧に。",
  "{name}さん、おはようございます。明細管理、今日も頼りにしています。",
  "{name}さん、見つけてくれてありがとう。ひと息ついたら次へ進みましょう。",
];
let loadingDepth = 0;

function element(id) {
  return document.getElementById(id);
}

function showLoading(message = "スピ丸が処理中...") {
  loadingDepth += 1;
  const runner = element("loading-runner");
  if (!runner) return;
  element("loading-runner-text").textContent = message;
  runner.classList.remove("hidden");
}

function hideLoading() {
  loadingDepth = Math.max(0, loadingDepth - 1);
  if (loadingDepth > 0) return;
  const runner = element("loading-runner");
  if (runner) runner.classList.add("hidden");
}

function isAdmin() {
  return state.session?.role === "admin";
}

function isContractor() {
  return state.session?.role === "contractor";
}

function updateAdminControls() {
  const adminButton = element("open-admin-settings");
  if (adminButton) {
    adminButton.classList.toggle("hidden", !isAdmin());
  }
  const subcontractorNav = element("nav-subcontractors");
  if (subcontractorNav) subcontractorNav.classList.toggle("hidden", !isAdmin());
  const returnsNav = element("nav-returns");
  if (returnsNav) returnsNav.classList.toggle("hidden", isContractor());
  for (const id of ["nav-etc", "nav-mail", "open-job-dialog"]) {
    const target = element(id);
    if (target) target.classList.toggle("hidden", isContractor());
  }
}

function updateAccountPanel() {
  const user = state.session;
  element("account-user").textContent = user?.id || "未ログイン";
  element("account-role").textContent = user?.role === "admin"
    ? "管理者としてログイン中"
    : user?.role === "contractor"
      ? `業者コード ${user?.contractor_code || ""} でログイン中`
      : "一般ユーザーとしてログイン中";
  const image = element("account-avatar-image");
  const initial = element("account-avatar-initial");
  const userId = user?.id || "";
  initial.textContent = userId ? userId.trim().slice(0, 1).toUpperCase() : "?";
  if (user?.avatar_url) {
    image.src = `${user.avatar_url}&v=${Date.now()}`;
    image.classList.remove("hidden");
    initial.classList.add("hidden");
  } else {
    image.removeAttribute("src");
    image.classList.add("hidden");
    initial.classList.remove("hidden");
  }
  updateAdminControls();
}

function todayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function userDisplayName() {
  const id = state.session?.id || "ユーザー";
  return id.includes("@") ? id.split("@")[0] : id;
}

function dailySpimaruStorageKey() {
  const user = state.session?.id || "unknown";
  return `speed-etc-spimaru-found:${user}:${todayKey()}`;
}

function seededNumber(seed) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function visibleSpimaruTargets() {
  return [...document.querySelectorAll(
    ".metric-card, .panel, .freshness-banner:not(.hidden), .inspection-banner:not(.hidden), .filter-vehicle-card",
  )].filter((target) => {
    const rect = target.getBoundingClientRect();
    return (
      rect.width >= 110 &&
      rect.height >= 70 &&
      rect.bottom > 82 &&
      rect.right > 310 &&
      rect.top < window.innerHeight - 48 &&
      rect.left < window.innerWidth - 48
    );
  });
}

function placeDailySpimaru() {
  const mascot = element("daily-spimaru");
  if (!state.session || localStorage.getItem(dailySpimaruStorageKey())) {
    mascot.classList.add("hidden");
    return;
  }
  const seed = `${state.session.id}:${todayKey()}`;
  const targets = visibleSpimaruTargets();
  const target = targets[Math.floor(seededNumber(`${seed}:target`) * targets.length)];
  const edge = Math.floor(seededNumber(`${seed}:edge`) * 4);
  let position = null;

  if (target) {
    const rect = target.getBoundingClientRect();
    const xSeed = seededNumber(`${seed}:x`);
    const ySeed = seededNumber(`${seed}:y`);
    const insetX = 28 + xSeed * Math.max(8, rect.width - 56);
    const insetY = 26 + ySeed * Math.max(8, rect.height - 52);
    const peeks = [
      { left: rect.left + insetX, top: rect.top - 8, rotate: "-8deg" },
      { left: rect.right - 4, top: rect.top + insetY, rotate: "9deg" },
      { left: rect.left + insetX, top: rect.bottom - 4, rotate: "7deg" },
      { left: rect.left - 2, top: rect.top + insetY, rotate: "-10deg" },
    ];
    position = peeks[edge] || peeks[0];
  }

  if (!position) {
    const maxX = Math.max(320, window.innerWidth - 80);
    const maxY = Math.max(220, window.innerHeight - 80);
    position = {
      left: 320 + seededNumber(`${seed}:fallback-x`) * (maxX - 320),
      top: 96 + seededNumber(`${seed}:fallback-y`) * (maxY - 96),
      rotate: "-7deg",
    };
  }

  position.left = Math.min(window.innerWidth - 34, Math.max(308, position.left));
  position.top = Math.min(window.innerHeight - 34, Math.max(84, position.top));
  mascot.style.left = `${Math.round(position.left)}px`;
  mascot.style.top = `${Math.round(position.top)}px`;
  mascot.style.setProperty("--spimaru-rotate", position.rotate || "-7deg");
  mascot.classList.remove("hidden");
}

function foundDailySpimaru() {
  localStorage.setItem(dailySpimaruStorageKey(), "1");
  element("daily-spimaru").classList.add("hidden");
  const index = Math.floor(
    seededNumber(`${state.session?.id || "user"}:${todayKey()}:message`) *
      spimaruMessages.length,
  );
  const message = spimaruMessages[index].replace("{name}", userDisplayName());
  element("spimaru-message").textContent = message;
  element("spimaru-greeting").classList.remove("hidden");
}

function closeDailySpimaruGreeting() {
  element("spimaru-greeting").classList.add("hidden");
}

function showLogin(message = "", isError = true) {
  element("login-screen").classList.remove("hidden");
  const error = element("login-error");
  error.textContent = message;
  error.classList.toggle("hidden", !message);
  error.classList.toggle("login-success", Boolean(message) && !isError);
  element("login-password").value = "";
  element("login-user-id").focus();
}

function hideLogin() {
  element("login-screen").classList.add("hidden");
  element("login-error").classList.add("hidden");
  element("login-error").classList.remove("login-success");
}

function setNotice(message, isError = false) {
  const notice = element("notice");
  if (!message) {
    notice.classList.add("hidden");
    notice.textContent = "";
    return;
  }
  notice.textContent = message;
  notice.classList.remove("hidden");
  notice.classList.toggle("error", isError);
}

function setLogisticsNotice(message, isError = false) {
  const notice = element("logistics-notice");
  if (!notice) return;
  if (!message) {
    notice.classList.add("hidden");
    notice.textContent = "";
    return;
  }
  notice.textContent = message;
  notice.classList.remove("hidden");
  notice.classList.toggle("error", isError);
}

function setMailNotice(message, isError = false) {
  const notice = element("mail-notice");
  if (!notice) return;
  if (!message) {
    notice.classList.add("hidden");
    notice.textContent = "";
    return;
  }
  notice.textContent = message;
  notice.classList.remove("hidden");
  notice.classList.toggle("error", isError);
}

async function request(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    throw new Error(
      "アプリサーバーに接続できませんでした。起動状態を確認してください。",
    );
  }

  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch (error) {
    const looksLikeHtml = /^\s*<!doctype html/i.test(text) || /^\s*<html/i.test(text);
    payload = {
      error: looksLikeHtml
        ? "サーバー側のAPIが見つかりません。アプリを再起動して、最新のPythonサーバーで開き直してください。"
        : text || "サーバーから正しい応答が返りませんでした。",
    };
  }
  if (!response.ok) {
    if (response.status === 404 && url.startsWith("/api/mail/")) {
      throw new Error(
        "メール取込APIが見つかりません。起動中のアプリが古い可能性があります。アプリを一度終了して、最新フォルダの start.bat から再起動してください。",
      );
    }
    throw new Error(payload.error || "処理に失敗しました。");
  }
  return payload;
}

function filtersAsQuery() {
  const params = new URLSearchParams();
  const filters = {
    date_from: element("date-from").value,
    date_to: element("date-to").value,
    vehicle: element("vehicle-filter").value,
    status: element("status-filter").value,
  };
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  return params.toString();
}

function jobFiltersAsQuery() {
  const params = new URLSearchParams();
  const filters = {
    month: element("job-filter-month").value,
    status: element("job-filter-status").value,
    area: element("job-filter-area").value,
    vehicle: element("job-filter-vehicle").value,
    keyword: element("job-filter-keyword").value.trim(),
  };
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  return params.toString();
}

function setModule(module) {
  if (isContractor() && module !== "logistics") {
    module = "logistics";
  }
  if (!isAdmin() && module === "subcontractors") {
    module = "logistics";
  }
  state.activeModule = module;
  const showLogistics = module === "logistics";
  const showMail = module === "mail";
  const showEtc = module === "etc";
  const showReturns = module === "returns";
  const showSubcontractors = module === "subcontractors";
  element("logistics-module").classList.toggle("hidden", !showLogistics);
  element("mail-module").classList.toggle("hidden", !showMail);
  element("etc-module").classList.toggle("hidden", !showEtc);
  element("returns-module").classList.toggle("hidden", !showReturns);
  element("subcontractors-module").classList.toggle("hidden", !showSubcontractors);
  element("nav-logistics").classList.toggle("active", showLogistics);
  element("nav-mail").classList.toggle("active", showMail);
  element("nav-etc").classList.toggle("active", showEtc);
  element("nav-returns").classList.toggle("active", showReturns);
  element("nav-subcontractors").classList.toggle("active", showSubcontractors);
  document.body.dataset.module = module;
  window.requestAnimationFrame(placeDailySpimaru);
}

function updateSelect(select, values, current, emptyLabel) {
  select.replaceChildren();
  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = emptyLabel;
  select.append(emptyOption);

  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  }
  select.value = values.includes(current) ? current : "";
}

function vehicleDisplayName(vehicle) {
  return vehicle.display_name?.trim() || `車両 ${vehicle.vehicle_number}`;
}

function formatDate(value) {
  return value ? value.replaceAll("-", "/") : "";
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).replace("T", " ");
  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function daysBetweenDates(fromDate, toDate) {
  if (!fromDate || !toDate) return null;
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return Math.floor((to - from) / 86400000);
}

function freshnessLevel(vehicle, expectedDate) {
  if (vehicle.is_current) return "current";
  if (!vehicle.latest_date) return "missing";
  const lagDays = daysBetweenDates(vehicle.latest_date, expectedDate);
  if (lagDays !== null && lagDays >= 7) return "old";
  return "stale";
}

function formatDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function currentClosingPeriod(today = new Date()) {
  const year = today.getFullYear();
  const month = today.getMonth();
  const isAfterClosingDay = today.getDate() >= 15;
  const from = isAfterClosingDay
    ? new Date(year, month - 1, 16)
    : new Date(year, month - 2, 16);
  const to = isAfterClosingDay
    ? new Date(year, month, 15)
    : new Date(year, month - 1, 15);
  return {
    from: formatDateInputValue(from),
    to: formatDateInputValue(to),
  };
}

function jobStatusLabel(status) {
  return state.jobStatuses.find((item) => item.value === status)?.label || status || "新規依頼";
}

function renderJobStatusOptions(statuses) {
  const fallback = [
    { value: "unprocessed", label: "新規依頼" },
    { value: "scheduled", label: "作業報告待ち" },
    { value: "completed", label: "作業完了" },
    { value: "reported", label: "請求確定待ち" },
    { value: "billed", label: "請求確定" },
    { value: "needs_review", label: "要確認" },
  ];
  state.jobStatuses = statuses?.length ? statuses : fallback;

  const filter = element("job-filter-status");
  const currentFilter = filter.value;
  filter.replaceChildren();
  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = "すべて";
  filter.append(emptyOption);
  for (const status of state.jobStatuses) {
    const option = document.createElement("option");
    option.value = status.value;
    option.textContent = status.label;
    filter.append(option);
  }
  filter.value = state.jobStatuses.some((status) => status.value === currentFilter)
    ? currentFilter
    : "";

  const formStatus = element("job-status");
  const currentFormStatus = formStatus.value || "unprocessed";
  formStatus.replaceChildren();
  for (const status of state.jobStatuses) {
    const option = document.createElement("option");
    option.value = status.value;
    option.textContent = status.label;
    formStatus.append(option);
  }
  formStatus.value = state.jobStatuses.some((status) => status.value === currentFormStatus)
    ? currentFormStatus
    : "unprocessed";
}

function renderJobAreaOptions(areas) {
  const areaSelect = element("job-filter-area");
  state.jobAreas = areas || [];
  updateSelect(areaSelect, state.jobAreas, areaSelect.value, "すべて");
}

function renderJobVehicleFilterOptions(current = "") {
  const select = element("job-filter-vehicle");
  if (!select) return;
  const selected = String(current || select.value || "").trim();
  select.replaceChildren();
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "すべて";
  select.append(empty);

  let hasSelected = !selected;
  for (const vehicle of state.vehicles) {
    const vehicleNumber = String(vehicle.vehicle_number || "").trim();
    if (!vehicleNumber) continue;
    const option = document.createElement("option");
    option.value = vehicleNumber;
    option.textContent = `${vehicleDisplayName(vehicle)}（${vehicleNumber}）`;
    select.append(option);
    if (vehicleNumber === selected) hasSelected = true;
  }
  if (selected && !hasSelected) {
    const option = document.createElement("option");
    option.value = selected;
    option.textContent = `未登録車両 ${selected}`;
    select.append(option);
  }
  select.value = selected;
}

function updateJobMetrics(summary = {}) {
  element("job-metric-sales").textContent = yen.format(summary.sales_total_yen || 0);
  element("job-metric-count").innerHTML = `${number.format(summary.count || 0)}<small> 件</small>`;
  element("job-metric-toll").textContent = yen.format(summary.toll_total_yen || 0);
  element("job-metric-profit").textContent = yen.format(summary.gross_profit_yen || 0);
}

function subcontractorLabel(code) {
  const subcontractor = state.subcontractors.find((item) => item.contractor_code === code);
  return subcontractor
    ? `${subcontractor.contractor_code} / ${subcontractor.company_name}`
    : code || "未指定";
}

function appendJobCell(row, content, className = "") {
  const cell = document.createElement("td");
  if (className) cell.className = className;
  if (content instanceof Node) {
    cell.append(content);
  } else {
    cell.textContent = content ?? "";
  }
  row.append(cell);
  return cell;
}

function jobMainCell(job) {
  const wrapper = document.createElement("div");
  wrapper.className = "job-main-cell";
  const title = document.createElement("strong");
  title.textContent = job.work_order_number;
  const detail = document.createElement("span");
  detail.className = "job-muted";
  const productModels = [job.old_product_model, job.new_product_model]
    .filter(Boolean)
    .join(" → ");
  detail.textContent = productModels || job.product_summary || job.work_summary || "内容未入力";
  wrapper.append(title, detail);
  return wrapper;
}

function jobStatusBadge(job) {
  const badge = document.createElement("span");
  badge.className = `job-status ${job.status || "unprocessed"}`;
  badge.textContent = jobStatusLabel(job.status);
  return badge;
}

async function syncJobToSagyou(job) {
  if (!job.scheduled_date) {
    setLogisticsNotice("sagyou-appへ送る前に、案件の編集画面で作業日を設定してください。", true);
    return;
  }
  state.sagyouSyncingJobIds.add(job.id);
  renderJobTable(state.jobs);
  try {
    const payload = await request("/api/integrations/sagyou/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: job.id, scheduled_date: job.scheduled_date }),
    });
    const syncedJob = payload.job || {};
    if (syncedJob.sagyou_sync_status !== "synced") {
      throw new Error(syncedJob.sagyou_last_error || "sagyou-appへ連携できませんでした。");
    }
    setLogisticsNotice(`作業番号 ${job.work_order_number} をsagyou-appへ連携しました。`);
  } catch (error) {
    setLogisticsNotice(error.message, true);
  } finally {
    state.sagyouSyncingJobIds.delete(job.id);
    await loadLogisticsJobs();
  }
}

function jobActionCell(job) {
  const actions = document.createElement("div");
  actions.className = "job-action-group";

  const etcButton = document.createElement("button");
  etcButton.type = "button";
  etcButton.className = "job-etc-button";
  etcButton.textContent = job.toll_fee_yen > 0 ? "ETC確認" : "対象なし";
  etcButton.disabled = !(job.toll_fee_yen > 0);
  etcButton.addEventListener("click", (event) => {
    event.stopPropagation();
    openJobEtc(job);
  });

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "job-edit-button";
  editButton.textContent = "編集";
  editButton.addEventListener("click", (event) => {
    event.stopPropagation();
    openJobDialog(job);
  });

  if (job.source === "mail_import") {
    const syncButton = document.createElement("button");
    syncButton.type = "button";
    syncButton.className = "job-sagyou-button";
    syncButton.disabled = state.sagyouSyncingJobIds.has(job.id);
    syncButton.textContent = state.sagyouSyncingJobIds.has(job.id)
      ? "送信中..."
      : job.sagyou_sync_status === "synced" ? "再連携" : "sagyou連携";
    syncButton.title = job.sagyou_last_error || "sagyou-appへ案件を送信します";
    syncButton.addEventListener("click", (event) => {
      event.stopPropagation();
      syncJobToSagyou(job);
    });
    actions.append(syncButton);
  }
  actions.append(etcButton, editButton);
  return actions;
}

function renderJobTable(jobs) {
  const tbody = element("job-table-body");
  const empty = element("job-table-empty");
  tbody.replaceChildren();
  for (const job of jobs) {
    const row = document.createElement("tr");
    row.className = "job-row";
    row.addEventListener("click", () => openJobDialog(job));
    appendJobCell(row, jobStatusBadge(job));
    appendJobCell(row, jobMainCell(job));
    appendJobCell(row, formatDate(job.scheduled_date) || "未定");
    appendJobCell(row, job.customer_name || "未入力");
    appendJobCell(row, job.area || "未設定");
    appendJobCell(row, job.staff_name || job.branch || "未設定");
    appendJobCell(row, job.vehicle_number || "未設定");
    appendJobCell(row, yen.format(job.sales_total_yen || 0), "number-cell");
    appendJobCell(row, yen.format(job.toll_fee_yen || 0), "number-cell");
    appendJobCell(row, jobActionCell(job));
    tbody.append(row);
  }
  empty.classList.toggle("hidden", jobs.length > 0);
  element("job-table-count").textContent = `${number.format(jobs.length)}件`;
}

function renderLogisticsJobs(payload) {
  renderJobStatusOptions(payload.statuses || state.jobStatuses);
  renderJobAreaOptions(payload.areas || state.jobAreas);
  state.jobs = payload.jobs || [];
  updateJobMetrics(payload.summary || {});
  renderJobTable(state.jobs);

  const reviewCount = payload.summary?.needs_review_count || 0;
  if (reviewCount > 0) {
    setLogisticsNotice(`${number.format(reviewCount)}件の案件で確認が必要です。`, true);
  } else {
    setLogisticsNotice("");
  }
}

async function loadLogisticsJobs() {
  showLoading("スピ丸が案件を確認中...");
  try {
    const query = jobFiltersAsQuery();
    const payload = await request(`/api/logistics/jobs${query ? `?${query}` : ""}`);
    renderLogisticsJobs(payload);
  } catch (error) {
    setLogisticsNotice(error.message, true);
  } finally {
    hideLoading();
  }
}

function resetJobFilters() {
  element("job-filter-month").value = "";
  element("job-filter-status").value = "";
  element("job-filter-area").value = "";
  element("job-filter-vehicle").value = "";
  element("job-filter-keyword").value = "";
  loadLogisticsJobs();
}

function setReturnsNotice(message, isError = false) {
  const notice = element("returns-notice");
  notice.textContent = message;
  notice.classList.toggle("hidden", !message);
  notice.classList.toggle("error", isError);
}

function setSubcontractorNotice(message, isError = false) {
  const notice = element("subcontractor-notice");
  notice.textContent = message;
  notice.classList.toggle("hidden", !message);
  notice.classList.toggle("error", isError);
}

function renderSubcontractorOptions(current = "") {
  const select = element("job-subcontractor-code");
  if (!select) return;
  select.replaceChildren();
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "未指定";
  select.append(empty);
  for (const subcontractor of state.subcontractors) {
    const option = document.createElement("option");
    option.value = subcontractor.contractor_code;
    option.textContent = `${subcontractor.contractor_code} / ${subcontractor.company_name}`;
    select.append(option);
  }
  select.value = state.subcontractors.some((item) => item.contractor_code === current)
    ? current
    : "";
}

function renderJobVehicleOptions(current = "") {
  const select = element("job-vehicle-number");
  if (!select) return;
  const selected = String(current || select.value || "").trim();
  select.replaceChildren();

  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "未指定";
  select.append(empty);

  let hasSelected = !selected;
  for (const vehicle of state.vehicles) {
    const vehicleNumber = String(vehicle.vehicle_number || "").trim();
    if (!vehicleNumber) continue;
    const option = document.createElement("option");
    option.value = vehicleNumber;
    const displayName = vehicleDisplayName(vehicle);
    const related = Array.isArray(vehicle.related_vehicle_numbers)
      && vehicle.related_vehicle_numbers.length
      ? ` / 関連 ${vehicle.related_vehicle_numbers.join("・")}`
      : "";
    option.textContent = `${displayName}（${vehicleNumber}${related}）`;
    select.append(option);
    if (vehicleNumber === selected) hasSelected = true;
  }

  if (selected && !hasSelected) {
    const option = document.createElement("option");
    option.value = selected;
    option.textContent = `未登録車両 ${selected}`;
    select.append(option);
  }
  select.value = selected;
}

async function loadSubcontractors() {
  if (!isAdmin()) {
    state.subcontractors = [];
    renderSubcontractorOptions();
    return;
  }
  try {
    const payload = await request("/api/subcontractors");
    state.subcontractors = payload.subcontractors || [];
    renderSubcontractorOptions(element("job-subcontractor-code")?.value || "");
    renderSubcontractorTable();
  } catch (error) {
    setSubcontractorNotice(error.message, true);
  }
}

function clearSubcontractorForm() {
  element("subcontractor-form").reset();
  element("subcontractor-id").value = "";
}

function fillSubcontractorForm(subcontractor) {
  element("subcontractor-id").value = subcontractor.id || "";
  element("subcontractor-code").value = subcontractor.contractor_code || "";
  element("subcontractor-company").value = subcontractor.company_name || "";
  element("subcontractor-postal-code").value = subcontractor.postal_code || "";
  element("subcontractor-address").value = subcontractor.address || "";
  element("subcontractor-contact-name").value = subcontractor.contact_name || "";
  element("subcontractor-contact-phone").value = subcontractor.contact_phone || "";
  element("subcontractor-warehouse-address").value = subcontractor.warehouse_address || "";
  element("subcontractor-login-password").value = "";
  element("subcontractor-memo").value = subcontractor.memo || "";
}

function collectSubcontractorForm() {
  return {
    id: element("subcontractor-id").value,
    contractor_code: element("subcontractor-code").value,
    customer_number: element("subcontractor-code").value,
    company_name: element("subcontractor-company").value,
    postal_code: element("subcontractor-postal-code").value,
    address: element("subcontractor-address").value,
    contact_name: element("subcontractor-contact-name").value,
    contact_phone: element("subcontractor-contact-phone").value,
    warehouse_address: element("subcontractor-warehouse-address").value,
    login_password: element("subcontractor-login-password").value,
    memo: element("subcontractor-memo").value,
  };
}

function renderSubcontractorTable() {
  const tbody = element("subcontractor-table-body");
  if (!tbody) return;
  const empty = element("subcontractor-table-empty");
  tbody.replaceChildren();
  for (const subcontractor of state.subcontractors) {
    const row = document.createElement("tr");
    row.className = "job-row";
    row.addEventListener("click", () => fillSubcontractorForm(subcontractor));
    appendJobCell(row, subcontractor.contractor_code);
    appendJobCell(row, subcontractor.company_name);
    appendJobCell(row, [subcontractor.postal_code, subcontractor.address].filter(Boolean).join(" "));
    appendJobCell(row, subcontractor.contact_name || "未設定");
    appendJobCell(row, subcontractor.contact_phone || "未設定");
    appendJobCell(row, subcontractor.warehouse_address || "未設定");
    tbody.append(row);
  }
  empty.classList.toggle("hidden", state.subcontractors.length > 0);
  element("subcontractor-table-count").textContent = `${number.format(state.subcontractors.length)}件`;
}

async function saveSubcontractor(event) {
  event.preventDefault();
  const button = element("save-subcontractor");
  button.disabled = true;
  button.textContent = "保存中...";
  setSubcontractorNotice("");
  try {
    const payload = await request("/api/subcontractors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collectSubcontractorForm()),
    });
    clearSubcontractorForm();
    await loadSubcontractors();
    setSubcontractorNotice(`${payload.subcontractor.company_name} を保存しました。`);
  } catch (error) {
    setSubcontractorNotice(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "保存する";
  }
}

function renderReturns(payload) {
  const rows = payload.candidates || [];
  state.returnCandidates = rows;
  state.returnSelectedIds = new Set(rows.map((row) => row.id));
  const summary = payload.summary || {};
  const byDestination = summary.by_destination || {};
  element("returns-metric-count").innerHTML = `${number.format(summary.candidate_count || 0)}<small> 件</small>`;
  element("returns-metric-maizuru").innerHTML = `${number.format(byDestination.maizuru || 0)}<small> 件</small>`;
  element("returns-metric-gunma").innerHTML = `${number.format(byDestination.gunma || 0)}<small> 件</small>`;
  element("returns-metric-manifests").innerHTML = `${number.format(summary.manifest_count || 0)}<small> 件</small>`;

  const tbody = element("returns-table-body");
  const empty = element("returns-table-empty");
  tbody.replaceChildren();
  for (const row of rows) {
    const tr = document.createElement("tr");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = true;
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        state.returnSelectedIds.add(row.id);
      } else {
        state.returnSelectedIds.delete(row.id);
      }
    });
    appendJobCell(tr, checkbox);
    appendJobCell(tr, row.destination_name);
    appendJobCell(tr, row.work_order_number);
    appendJobCell(tr, row.product_summary);
    appendJobCell(tr, row.product_model);
    appendJobCell(tr, row.product_serial);
    appendJobCell(tr, row.approval_number);
    appendJobCell(tr, row.customer_name);
    appendJobCell(tr, row.application_type);
    appendJobCell(tr, row.symptom);
    tbody.append(tr);
  }
  empty.classList.toggle("hidden", rows.length > 0);
  element("returns-table-count").textContent = `${number.format(rows.length)}件`;
}

async function loadReturns() {
  if (isContractor()) return;
  showLoading("スピ丸がお帰り便を確認中...");
  try {
    const payload = await request("/api/return-shipments");
    renderReturns(payload);
    setReturnsNotice("");
  } catch (error) {
    setReturnsNotice(error.message, true);
  } finally {
    hideLoading();
  }
}

async function exportReturns() {
  const jobIds = Array.from(state.returnSelectedIds);
  if (!jobIds.length) {
    setReturnsNotice("配送表に入れる案件を選択してください。", true);
    return;
  }
  const button = element("export-returns");
  button.disabled = true;
  button.textContent = "発行中...";
  showLoading("スピ丸が配送表を作成中...");
  try {
    const payload = await request("/api/return-shipments/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_ids: jobIds }),
    });
    if (payload.manifest?.url) {
      window.open(payload.manifest.url, "_blank");
    }
    await loadReturns();
    await loadLogisticsJobs();
    setReturnsNotice(`${payload.manifest.job_count}件の配送表を発行しました。`);
  } catch (error) {
    setReturnsNotice(error.message, true);
  } finally {
    hideLoading();
    button.disabled = false;
    button.textContent = "配送表を発行";
  }
}

function rateText(value) {
  return value > 0 ? yen.format(value) : "未設定";
}

function renderRatePill(label, value, detail = "") {
  const item = document.createElement("div");
  item.className = "job-rate-pill";
  const labelElement = document.createElement("span");
  labelElement.textContent = label;
  const valueElement = document.createElement("strong");
  valueElement.textContent = value || "未設定";
  item.append(labelElement, valueElement);
  if (detail) {
    const detailElement = document.createElement("span");
    detailElement.textContent = detail;
    item.append(detailElement);
  }
  return item;
}

function renderJobRateSuggestion(job = {}) {
  const suggestion = job.rate_suggestion || {};
  state.currentRateSuggestion = suggestion;
  state.showOtherRateItems = false;
  const panel = element("job-rate-panel");
  const install = element("job-rate-install");
  const items = element("job-rate-items");
  install.replaceChildren();
  items.replaceChildren();

  const hasInstall = Boolean(suggestion.install_category || suggestion.installation_fee_yen);
  const workItems = Array.isArray(suggestion.work_items) ? suggestion.work_items : [];
  panel.classList.toggle("hidden", !hasInstall && workItems.length === 0);
  if (!hasInstall && workItems.length === 0) return;

  install.append(
    renderRatePill("機種", suggestion.matched_model || suggestion.model || "未設定"),
    renderRatePill(
      "設置費候補",
      rateText(suggestion.installation_fee_yen || 0),
      suggestion.install_category || "",
    ),
    renderRatePill(
      suggestion.removal_mode === "removal_only" ? "搬出のみ候補" : "搬出追加",
      suggestion.removal_mode === "removal_only"
        ? rateText(suggestion.removal_fee_yen || 0)
        : "追加候補で選択",
      suggestion.removal_note || suggestion.removal_category || "",
    ),
    renderRatePill(
      "下請設置費",
      rateText(suggestion.subcontract_installation_fee_yen || 0),
    ),
  );
  if (suggestion.rate_note) {
    const note = document.createElement("p");
    note.className = "job-rate-note";
    note.textContent = suggestion.rate_note;
    install.append(note);
  }

  const selected = new Set((job.selected_rate_items || []).map(String));
  for (const item of workItems) {
    const label = document.createElement("label");
    label.className = "job-rate-check";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = item.label || "";
    checkbox.dataset.fee = String(item.billable_fee_yen || 0);
    checkbox.checked = Boolean(item.selected) || selected.has(item.label);
    checkbox.addEventListener("change", updateRateOtherVisibility);
    const body = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = item.label || "作業費";
    const fee = document.createElement("span");
    fee.textContent = `請求 ${rateText(item.billable_fee_yen || 0)} / 下請 ${rateText(item.subcontract_fee_yen || 0)}`;
    const tag = document.createElement("span");
    tag.className = "job-rate-tag";
    tag.textContent = item.recommended ? "よく使う" : "その他";
    body.append(name, fee, tag);
    label.append(checkbox, body);
    label.classList.toggle("job-rate-check-other", !item.recommended);
    items.append(label);
  }
  updateRateOtherVisibility();
}

function updateRateOtherVisibility() {
  const button = element("toggle-job-rate-other");
  const otherItems = Array.from(document.querySelectorAll("#job-rate-items .job-rate-check-other"));
  if (!button) return;
  button.classList.toggle("hidden", otherItems.length === 0);
  button.textContent = state.showOtherRateItems
    ? "その他を隠す"
    : `その他を表示 (${number.format(otherItems.length)})`;
  for (const label of otherItems) {
    const checkbox = label.querySelector("input[type='checkbox']");
    label.classList.toggle(
      "hidden",
      !state.showOtherRateItems && !checkbox?.checked,
    );
  }
}

function toggleJobRateOtherItems() {
  state.showOtherRateItems = !state.showOtherRateItems;
  updateRateOtherVisibility();
}

function selectedRateItems() {
  return Array.from(document.querySelectorAll("#job-rate-items input[type='checkbox']:checked"))
    .map((input) => input.value)
    .filter(Boolean);
}

function applyJobInstallationRate() {
  const fee = state.currentRateSuggestion?.installation_fee_yen || 0;
  if (fee > 0) {
    element("job-installation-fee").value = String(fee);
  }
}

function applyJobRateItems() {
  const total = Array.from(
    document.querySelectorAll("#job-rate-items input[type='checkbox']:checked"),
  ).reduce((sum, input) => sum + Number(input.dataset.fee || 0), 0);
  element("job-other-fee").value = total ? String(total) : "0";
}

function renderJobSubcontractorStatus(job = {}) {
  const container = element("job-subcontractor-status");
  if (!container) return;
  container.replaceChildren();
  const selectedCode = element("job-subcontractor-code").value || job.subcontractor_code || "";
  container.append(
    renderRatePill("依頼先", subcontractorLabel(selectedCode)),
    renderRatePill(
      "発行状態",
      job.subcontractor_issued_at ? "発行済み" : "未発行",
      job.subcontractor_issued_at ? formatDateTime(job.subcontractor_issued_at) : "",
    ),
  );
}

function fillJobForm(job = {}) {
  const fields = {
    "job-id": "id",
    "job-work-order-number": "work_order_number",
    "job-status": "status",
    "job-scheduled-date": "scheduled_date",
    "job-customer-name": "customer_name",
    "job-area": "area",
    "job-branch": "branch",
    "job-staff-name": "staff_name",
    "job-subcontractor-code": "subcontractor_code",
    "job-vehicle-number": "vehicle_number",
    "job-store-name": "store_name",
    "job-old-product-model": "old_product_model",
    "job-new-product-model": "new_product_model",
    "job-product-summary": "product_summary",
    "job-work-summary": "work_summary",
    "job-installation-fee": "installation_fee_yen",
    "job-distance-fee": "distance_fee_yen",
    "job-toll-fee": "toll_fee_yen",
    "job-parking-fee": "parking_fee_yen",
    "job-other-fee": "other_fee_yen",
    "job-purchase-amount": "purchase_amount_yen",
    "job-subcontract-fee": "subcontract_fee_yen",
    "job-memo": "memo",
  };
  for (const [id, key] of Object.entries(fields)) {
    const input = element(id);
    const value = job[key];
    input.value = value === undefined || value === null ? "" : String(value);
  }
  if (!element("job-status").value) element("job-status").value = "unprocessed";
  renderSubcontractorOptions(job.subcontractor_code || "");
  renderJobVehicleOptions(job.vehicle_number || "");
  renderJobRateSuggestion(job);
  renderJobSubcontractorStatus(job);
}

function openJobDialog(job = null) {
  element("job-form").reset();
  element("job-dialog-title").textContent = job ? "案件の編集" : "案件の登録";
  fillJobForm(job || { status: "unprocessed" });
  element("job-dialog").showModal();
  element("job-work-order-number").focus();
}

function closeJobDialog() {
  element("job-dialog").close();
}

function collectJobForm() {
  return {
    id: element("job-id").value,
    work_order_number: element("job-work-order-number").value,
    status: element("job-status").value,
    scheduled_date: element("job-scheduled-date").value,
    customer_name: element("job-customer-name").value,
    area: element("job-area").value,
    branch: element("job-branch").value,
    staff_name: element("job-staff-name").value,
    subcontractor_code: element("job-subcontractor-code").value,
    vehicle_number: element("job-vehicle-number").value,
    store_name: element("job-store-name").value,
    old_product_model: element("job-old-product-model").value,
    new_product_model: element("job-new-product-model").value,
    product_summary: element("job-product-summary").value,
    work_summary: element("job-work-summary").value,
    installation_fee_yen: element("job-installation-fee").value,
    distance_fee_yen: element("job-distance-fee").value,
    toll_fee_yen: element("job-toll-fee").value,
    parking_fee_yen: element("job-parking-fee").value,
    other_fee_yen: element("job-other-fee").value,
    purchase_amount_yen: element("job-purchase-amount").value,
    subcontract_fee_yen: element("job-subcontract-fee").value,
    selected_rate_items: selectedRateItems(),
    memo: element("job-memo").value,
  };
}

async function issueSubcontractorJob() {
  if (!element("job-subcontractor-code").value) {
    setLogisticsNotice("依頼先業者を選択してください。", true);
    return;
  }
  const button = element("issue-subcontractor-job");
  button.disabled = true;
  button.textContent = "発行中...";
  try {
    const payload = await request("/api/logistics/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...collectJobForm(), subcontractor_issue: true }),
    });
    fillJobForm(payload.job);
    await loadLogisticsJobs();
    setLogisticsNotice(
      `作業番号 ${payload.job.work_order_number} を ${payload.job.subcontractor_name || payload.job.subcontractor_code} へ発行しました。`,
    );
  } catch (error) {
    setLogisticsNotice(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "業者へ依頼発行";
  }
}

async function saveJob(event) {
  event.preventDefault();
  const button = element("save-job");
  button.disabled = true;
  button.textContent = "保存中...";
  try {
    const payload = await request("/api/logistics/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collectJobForm()),
    });
    closeJobDialog();
    await loadLogisticsJobs();
    setLogisticsNotice(`作業番号 ${payload.job.work_order_number} を保存しました。`);
  } catch (error) {
    setLogisticsNotice(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "保存する";
  }
}

async function openJobEtc(job) {
  setModule("etc");
  if (job.scheduled_date) {
    element("date-from").value = job.scheduled_date;
    element("date-to").value = job.scheduled_date;
  }
  if (job.vehicle_number) {
    element("vehicle-filter").value = job.vehicle_number;
  }
  await loadDashboard();
  setNotice(
    `作業番号 ${job.work_order_number} のETC候補を表示しています。高速代 ${yen.format(job.toll_fee_yen || 0)} を確認してください。`,
  );
}

function renderMailSettings(payload) {
  const imap = payload.imap || payload.outlook || {};
  renderMailAutoImport(payload.auto_import || {});
  state.mailSettings = imap;
  const account = imap.user || imap.mailbox || "info_order@ithe.co.jp";
  const missing = Array.isArray(imap.missing) ? imap.missing : [];
  element("mail-metric-status").textContent = imap.configured ? "設定済み" : "未設定";
  element("mail-metric-account").textContent = account;
  element("mail-metric-category").textContent = imap.processed_folder || "Processed";
  element("mail-settings-detail").textContent = imap.configured
    ? `${imap.host}:${imap.port} / ${imap.inbox || "INBOX"}`
    : "IMAP_HOST / IMAP_USER / IMAP_PASSWORD を設定してください";

  const list = element("mail-settings-list");
  list.replaceChildren();
  const items = [
    ["受信サーバー", imap.host || ""],
    ["ポート", imap.port || ""],
    ["暗号化", imap.ssl ? "SSL/TLS" : "なし"],
    ["ユーザー", account],
    ["パスワード", imap.password_set ? "設定済み" : "未設定"],
    ["受信箱", imap.inbox || "INBOX"],
    ["処理済みフォルダ", imap.processed_folder || "Processed"],
    ["エラーフォルダ", imap.error_folder || "ImportError"],
    ["未設定項目", missing.length ? missing.join(", ") : "なし"],
  ];
  for (const [label, value] of items) {
    const row = document.createElement("div");
    row.className = "mail-settings-row";
    const labelElement = document.createElement("span");
    labelElement.textContent = label;
    const valueElement = document.createElement("strong");
    valueElement.textContent = value || "未設定";
    row.append(labelElement, valueElement);
    list.append(row);
  }
}

function renderMailAutoImport(autoImport = {}) {
  const status = element("mail-metric-auto");
  const detail = element("mail-metric-auto-detail");
  if (!status || !detail) return;
  const interval = autoImport.interval_seconds || 0;
  if (!autoImport.enabled || !interval) {
    status.textContent = "停止中";
    detail.textContent = "自動取込は未設定";
    return;
  }
  status.textContent = autoImport.running ? "実行中" : "ON";
  const minutes = Math.max(1, Math.round(interval / 60));
  const nextRun = formatDateTime(autoImport.next_run_at);
  const lastSummary = autoImport.last_summary || {};
  const lastImported = lastSummary.imported_count || 0;
  const lastJobs = lastSummary.created_jobs || 0;
  if (autoImport.last_error) {
    detail.textContent = `${minutes}分ごと / 前回エラー: ${autoImport.last_error}`;
  } else if (nextRun) {
    detail.textContent = `${minutes}分ごと / 次回 ${nextRun}`;
  } else {
    detail.textContent = `${minutes}分ごと / 前回 ${number.format(lastImported)}件・案件 ${number.format(lastJobs)}件`;
  }
}

async function loadMailSettings() {
  try {
    const payload = await request("/api/mail/settings");
    renderMailSettings(payload);
  } catch (error) {
    setMailNotice(error.message, true);
  }
}

function renderMailCandidates(messages) {
  state.mailCandidates = messages || [];
  state.mailSelectedIds = new Set(
    state.mailCandidates.map((message) => message.id).filter(Boolean),
  );
  const tbody = element("mail-candidate-body");
  const empty = element("mail-candidate-empty");
  tbody.replaceChildren();
  for (const message of state.mailCandidates) {
    const row = document.createElement("tr");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = state.mailSelectedIds.has(message.id);
    checkbox.setAttribute("aria-label", `${message.subject || "件名なし"}を取り込む`);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        state.mailSelectedIds.add(message.id);
      } else {
        state.mailSelectedIds.delete(message.id);
      }
      updateMailSelectionSummary();
    });
    appendJobCell(row, checkbox);
    appendJobCell(row, formatDate(String(message.received_at || "").slice(0, 10)) || "未設定");
    appendJobCell(row, message.subject || "件名なし");
    appendJobCell(row, message.sender || "送信者不明");
    appendJobCell(
      row,
      (message.attachments || []).map((attachment) => attachment.name).join(" / "),
    );
    tbody.append(row);
  }
  empty.classList.toggle("hidden", state.mailCandidates.length > 0);
  element("mail-metric-candidates").innerHTML =
    `${number.format(state.mailCandidates.length)}<small> 件</small>`;
  updateMailSelectionSummary();
}

function updateMailSelectionSummary() {
  const selected = state.mailSelectedIds.size;
  const total = state.mailCandidates.length;
  element("mail-candidate-count").textContent =
    total ? `${number.format(selected)} / ${number.format(total)}件` : "0件";
  const button = element("mail-run-import");
  button.disabled = total === 0 || selected === 0;
}

async function loadMailCandidates() {
  const button = element("mail-refresh");
  button.disabled = true;
  button.textContent = "確認中...";
  showLoading("スピ丸がメールを確認中...");
  setMailNotice("");
  try {
    const payload = await request("/api/mail/messages");
    renderMailCandidates(payload.messages || []);
    setMailNotice(`${number.format(payload.messages?.length || 0)}件の未処理メール候補を確認しました。`);
  } catch (error) {
    setMailNotice(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "未処理を確認";
    hideLoading();
  }
}

function renderMailImports(payload) {
  const imports = payload.imports || [];
  renderMailAutoImport(payload.auto_import || {});
  state.mailImports = imports;
  element("mail-import-count").textContent = `${number.format(imports.length)}件`;
  element("mail-metric-attachments").innerHTML =
    `${number.format(payload.summary?.saved_attachments || 0)}<small> 件</small>`;
  const list = element("mail-import-list");
  list.replaceChildren();
  if (!imports.length) {
    const empty = document.createElement("p");
    empty.className = "table-empty";
    empty.textContent = "取込履歴はまだありません";
    list.append(empty);
    return;
  }
  for (const item of imports) {
    const row = document.createElement("article");
    row.className = "mail-import-item";
    const heading = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = item.subject || "件名なし";
    const meta = document.createElement("span");
    meta.textContent = `${formatDate(String(item.received_at || "").slice(0, 10)) || "受信日不明"} / ${item.sender || "送信者不明"}`;
    heading.append(title, meta);
    const attachment = document.createElement("small");
    attachment.textContent = (item.attachments || [])
      .map((file) => file.name || file.stored_name)
      .join(" / ");
    const jobStatus = document.createElement("small");
    const createdJobs = item.created_jobs || 0;
    jobStatus.textContent = item.status === "duplicate"
      ? "同じExcelのため取込済み"
      : `案件作成 ${number.format(createdJobs)}件`;
    row.append(heading, attachment, jobStatus);
    list.append(row);
  }
}

async function loadMailImports() {
  try {
    const payload = await request("/api/mail/imports");
    renderMailImports(payload);
  } catch (error) {
    setMailNotice(error.message, true);
  }
}

async function checkMailSettings() {
  const button = element("mail-connect-outlook");
  button.disabled = true;
  button.textContent = "確認中...";
  setMailNotice("");
  try {
    await loadMailSettings();
    setMailNotice("IMAP接続設定を確認しました。未処理を確認するとメールサーバーへ接続します。");
  } catch (error) {
    setMailNotice(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "設定を確認";
  }
}

async function runMailImport() {
  const selectedIds = [...state.mailSelectedIds];
  if (!selectedIds.length) {
    setMailNotice("取り込むメールを選択してください。", true);
    return;
  }
  const button = element("mail-run-import");
  button.disabled = true;
  button.textContent = "取込中...";
  showLoading("スピ丸がExcelを案件化中...");
  setMailNotice("");
  try {
    const payload = await request("/api/mail/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message_ids: selectedIds }),
    });
    await Promise.all([loadMailImports(), loadMailCandidates()]);
    await loadLogisticsJobs();
    const importedCount = payload.summary?.imported_count || 0;
    const createdJobs = payload.summary?.created_jobs || 0;
    const duplicateCount = payload.summary?.duplicate_count || 0;
    setMailNotice(
      `${number.format(importedCount)}件のメールからExcelを保存し、${number.format(createdJobs)}件の案件を作成しました。重複 ${number.format(duplicateCount)}件。`,
      (payload.summary?.error_count || 0) > 0,
    );
  } catch (error) {
    setMailNotice(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "取り込む";
    updateMailSelectionSummary();
    hideLoading();
  }
}

function cardSuffixText(vehicle) {
  const suffixes = vehicle?.card_suffixes || [];
  if (!suffixes.length) return "ETC下6桁 未登録";
  return `ETC下6桁 ${suffixes.join(" / ")}`;
}

function recordById(recordId) {
  return state.records.find((record) => record.id === recordId);
}

function selectedRecordPdfs() {
  return new Set(
    [...state.selectedRecordIds]
      .map((recordId) => recordById(recordId)?.source_pdf || "")
      .filter(Boolean),
  );
}

function selectedSubmissionRecords() {
  return state.records
    .filter((record) => state.selectedRecordIds.has(record.id))
    .sort((left, right) =>
      `${left.date_start} ${left.time_start}`.localeCompare(
        `${right.date_start} ${right.time_start}`,
      ),
    );
}

function submissionWorkNumbers() {
  return [...new Set(
    element("submission-work-numbers").value
      .split(/[\s,、，]+/)
      .map((value) => value.trim())
      .filter(Boolean),
  )];
}

function safeFilePart(value, fallback = "") {
  const cleaned = String(value || "")
    .replace(/[\\/:*?"<>|\r\n]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[ ._]+|[ ._]+$/g, "");
  return cleaned || fallback;
}

function compactDate(value) {
  return String(value || "").replaceAll("-", "");
}

function suggestedSubmissionFileName() {
  const dateFrom = compactDate(element("submission-date-from").value);
  const dateTo = compactDate(element("submission-date-to").value);
  const title = safeFilePart(element("submission-title").value, "提出データ");
  const technician = safeFilePart(element("submission-technician").value, "技術員");
  const datePart = [dateFrom, dateTo].filter(Boolean).join("_");
  return `${safeFilePart(
    [datePart, title, technician, "ETC提出"].filter(Boolean).join("_"),
    "ETC提出用領収書",
  )}.pdf`;
}

function ensurePdfFileName(value, fallback = "ETC利用証明書.pdf") {
  const cleaned = safeFilePart(value, fallback);
  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned}.pdf`;
}

function setDefaultSubmissionDates(summary) {
  const dateFrom = element("submission-date-from");
  const dateTo = element("submission-date-to");
  const closingPeriod = currentClosingPeriod();
  if (!dateFrom.value) dateFrom.value = closingPeriod.from || summary?.date_min || "";
  if (!dateTo.value) dateTo.value = closingPeriod.to || summary?.date_max || "";
}

function releaseCroppedPdfUrl() {
  if (state.croppedPdfUrl?.startsWith("blob:")) {
    URL.revokeObjectURL(state.croppedPdfUrl);
  }
  state.croppedPdfUrl = "";
}

function clearPdfPreview({ clearAnalysis = true } = {}) {
  const frame = element("pdf-frame");
  releaseCroppedPdfUrl();
  state.croppedPdfFileName = "";
  frame.src = "about:blank";
  frame.classList.add("hidden");
  element("pdf-placeholder").classList.remove("hidden");
  element("certificate-summary").classList.add("hidden");
  element("certificate-grid").classList.add("hidden");
  if (clearAnalysis) {
    state.analyzedPdf = "";
    state.certificatesByRecordId.clear();
  }
}

function inspectionText(vehicle) {
  const expirationDate = vehicle?.inspection?.expiration_date;
  return expirationDate ? `車検 ${formatDate(expirationDate)}` : "車検 未登録";
}

function setSelectedVehicle(vehicleNumber, shouldLoad = true) {
  element("vehicle-filter").value = vehicleNumber || "";
  const vehicle = state.vehicles.find(
    (item) => item.vehicle_number === vehicleNumber,
  );
  const label = vehicle ? vehicleDisplayName(vehicle) : vehicleNumber;
  element("active-vehicle-label").textContent = vehicleNumber
    ? `${label} を表示中`
    : "全車両を表示中";
  updateVehicleCardSelection();
  if (shouldLoad) loadDashboard();
}

function renderMetrics(summary) {
  element("metric-amount").textContent = yen.format(summary.amount);
  element("metric-count").innerHTML = `${number.format(summary.count)}<small> 件</small>`;
  element("metric-vehicles").innerHTML = `${number.format(summary.vehicles)}<small> 台</small>`;
  const average = summary.count ? Math.round(summary.amount / summary.count) : 0;
  element("metric-average").textContent = yen.format(average);

  const period = summary.date_min
    ? `${summary.date_min.replaceAll("-", "/")} — ${summary.date_max.replaceAll("-", "/")}`
    : "PDFとCSVを読み込むと利用状況を表示します";
  element("period-label").textContent = period;
}

function renderVehicles(vehicles) {
  state.vehicles = vehicles;
  updateImportVehicleOptions();
  renderJobVehicleOptions();
  renderJobVehicleFilterOptions();
  const list = element("vehicle-list");
  const currentVehicle = element("vehicle-filter").value;
  list.replaceChildren();
  renderFilterVehicleCards(vehicles);

  if (!vehicles.length) {
    const empty = document.createElement("p");
    empty.className = "vehicle-empty";
    empty.textContent = "車両データがありません";
    list.append(empty);
    return;
  }

  for (const vehicle of vehicles) {
    const displayName = vehicleDisplayName(vehicle);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `vehicle-button${
      currentVehicle === vehicle.vehicle_number ? " active" : ""
    }`;
    button.title = `${displayName} のCSVとPDFを読み込む`;

    const photo = document.createElement("span");
    photo.className = "vehicle-photo";
    if (vehicle.photo_url) {
      const image = document.createElement("img");
      image.className = "vehicle-photo-image";
      image.src = vehicle.photo_url;
      image.alt = `車両 ${vehicle.vehicle_number}`;
      photo.append(image);
    } else {
      photo.textContent = "🚚";
      photo.setAttribute("aria-hidden", "true");
    }

    const info = document.createElement("span");
    const vehicleNumber = document.createElement("strong");
    vehicleNumber.className = "vehicle-number";
    vehicleNumber.textContent = displayName;
    const actualNumber = document.createElement("span");
    actualNumber.className = "vehicle-card-number";
    actualNumber.textContent = `車両番号 ${vehicle.vehicle_number}`;
    const cardSuffix = document.createElement("span");
    cardSuffix.className = "vehicle-card-number vehicle-card-card";
    cardSuffix.textContent = cardSuffixText(vehicle);
    const inspection = document.createElement("span");
    inspection.className = "vehicle-card-number";
    inspection.textContent = inspectionText(vehicle);
    info.append(vehicleNumber);
    info.append(actualNumber);
    info.append(cardSuffix);
    info.append(inspection);

    button.append(photo, info);
    button.addEventListener("click", () => {
      setSelectedVehicle(vehicle.vehicle_number, false);
      if (state.activeModule === "logistics") {
        element("job-filter-vehicle").value = vehicle.vehicle_number;
        loadLogisticsJobs();
        return;
      }
      openImportDialog(vehicle.vehicle_number);
    });
    list.append(button);
  }
  updateVehicleCardSelection();
  renderSettingsVehicleButtons();
}

function renderFilterVehicleCards(vehicles) {
  const container = element("filter-vehicle-cards");
  if (!container) return;
  container.replaceChildren();
  if (!vehicles.length) {
    const empty = document.createElement("p");
    empty.className = "filter-vehicle-empty";
    empty.textContent = "車両カードはPDF・CSVを読み込むと表示されます。";
    container.append(empty);
    return;
  }

  const allButton = document.createElement("button");
  allButton.type = "button";
  allButton.className = "filter-vehicle-card all-vehicles";
  allButton.dataset.vehicleNumber = "";
  allButton.innerHTML = "<strong>全車両</strong><span>すべて表示</span>";
  allButton.addEventListener("click", () => setSelectedVehicle(""));
  container.append(allButton);

  for (const vehicle of vehicles) {
    const displayName = vehicleDisplayName(vehicle);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "filter-vehicle-card";
    button.dataset.vehicleNumber = vehicle.vehicle_number;

    const photo = document.createElement("span");
    photo.className = "filter-vehicle-photo";
    if (vehicle.photo_url) {
      const image = document.createElement("img");
      image.src = vehicle.photo_url;
      image.alt = displayName;
      photo.append(image);
    } else {
      photo.textContent = "🚚";
      photo.setAttribute("aria-hidden", "true");
    }

    const info = document.createElement("span");
    const name = document.createElement("strong");
    name.textContent = displayName;
    const numberLabel = document.createElement("span");
    numberLabel.textContent = `車両番号 ${vehicle.vehicle_number}`;
    const cardLabel = document.createElement("span");
    cardLabel.textContent = cardSuffixText(vehicle);
    const inspectionLabel = document.createElement("span");
    inspectionLabel.textContent = inspectionText(vehicle);
    info.append(name, numberLabel, cardLabel, inspectionLabel);

    button.append(photo, info);
    button.addEventListener("click", () => setSelectedVehicle(vehicle.vehicle_number));
    container.append(button);
  }
  updateVehicleCardSelection();
}

function updateVehicleCardSelection() {
  const selected = element("vehicle-filter").value;
  for (const button of document.querySelectorAll("[data-vehicle-number]")) {
    button.classList.toggle(
      "active",
      button.dataset.vehicleNumber === selected,
    );
  }
}

function renderFreshness(freshness) {
  const banner = element("freshness-banner");
  const updateButton = element("freshness-update");
  const copy = banner.querySelector(".freshness-copy");
  let vehicleList = element("freshness-vehicle-list");
  if (!vehicleList && copy) {
    vehicleList = document.createElement("div");
    vehicleList.id = "freshness-vehicle-list";
    vehicleList.className = "freshness-vehicle-list";
    copy.append(vehicleList);
  }
  if (!freshness?.expected_date) {
    banner.classList.add("hidden");
    return;
  }
  const expected = freshness.expected_date.replaceAll("-", "/");
  const latest = freshness.latest_date
    ? freshness.latest_date.replaceAll("-", "/")
    : "データなし";
  const freshnessLevels = (freshness.vehicles || []).map((vehicle) =>
    freshnessLevel(vehicle, freshness.expected_date),
  );
  const bannerLevel = freshness.is_current
    ? "current"
    : freshnessLevels.includes("missing")
      ? "missing"
      : freshnessLevels.includes("old")
        ? "old"
        : "stale";

  banner.classList.remove("hidden");
  banner.classList.remove("current", "stale", "old", "missing");
  banner.classList.add(bannerLevel);
  if (freshness.is_current) {
    element("freshness-title").textContent = "ETCデータは最新です";
    element("freshness-message").textContent =
      `前日 ${expected} までのデータを全車両で確認しました。`;
    element("freshness-icon").textContent = "✓";
    updateButton.classList.add("hidden");
  } else {
    const staleVehicles = (freshness.vehicles || []).filter(
      (vehicle) => !vehicle.is_current,
    );
    element("freshness-title").textContent = staleVehicles.length
      ? "車両ごとの更新状況を確認してください"
      : "データの更新をしてください";
    element("freshness-message").textContent = staleVehicles.length
      ? `前日 ${expected} までのデータがない車両があります（全体の最新明細日: ${latest}）。`
      : `前日 ${expected} までのデータがありません（最新明細日: ${latest}）。`;
    element("freshness-icon").textContent = "!";
    updateButton.classList.remove("hidden");
  }
  if (vehicleList) {
    vehicleList.replaceChildren();
    for (const vehicle of freshness.vehicles || []) {
      const item = document.createElement("span");
      const level = freshnessLevel(vehicle, freshness.expected_date);
      item.className = `freshness-vehicle ${level}`;
      const label = vehicle.display_name?.trim()
        || `車両 ${vehicle.vehicle_number}`;
      const dateLabel = vehicle.latest_date
        ? formatDate(vehicle.latest_date)
        : "データなし";
      const statusLabel = {
        current: "最新",
        stale: "要更新",
        old: "古すぎ",
        missing: "未取込",
      }[level];
      item.textContent = `${label}：${dateLabel} ${statusLabel}`;
      vehicleList.append(item);
    }
  }
}

function renderInspectionAlerts(alerts) {
  const banner = element("inspection-banner");
  const list = element("inspection-alert-list");
  list.replaceChildren();
  if (!alerts?.length) {
    banner.classList.add("hidden");
    return;
  }

  banner.classList.remove("hidden");
  for (const alert of alerts) {
    const item = document.createElement("span");
    item.className = "inspection-alert-item";
    const vehicleName = alert.display_name?.trim()
      || `車両 ${alert.vehicle_number}`;
    const remaining = alert.days_remaining < 0
      ? `${Math.abs(alert.days_remaining)}日超過`
      : `あと${alert.days_remaining}日`;
    const text = document.createElement("span");
    text.textContent = `${vehicleName}：${formatDate(alert.expiration_date)}（${remaining}）`;
    item.append(text);
    if (alert.pdf_url) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "PDF";
      button.addEventListener("click", () => {
        window.open(alert.pdf_url, "_blank", "noopener");
      });
      item.append(button);
    }
    list.append(item);
  }
}

function renderChart(daily) {
  const chart = element("daily-chart");
  chart.replaceChildren();
  if (!daily.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "表示できるデータがありません";
    chart.append(empty);
    return;
  }

  const maxAmount = Math.max(...daily.map((item) => item.amount), 1);
  for (const item of daily) {
    const barItem = document.createElement("div");
    barItem.className = "bar-item";
    barItem.title = `${item.date}: ${yen.format(item.amount)}（${item.count}件）`;

    const value = document.createElement("span");
    value.className = "bar-value";
    value.textContent = item.amount >= 1000
      ? `${(item.amount / 1000).toFixed(1)}k`
      : number.format(item.amount);

    const bar = document.createElement("div");
    bar.className = "bar";
    bar.style.height = `${Math.max(4, Math.round((item.amount / maxAmount) * 142))}px`;

    const label = document.createElement("span");
    label.className = "bar-label";
    label.textContent = item.date.slice(5).replace("-", "/");

    barItem.append(value, bar, label);
    chart.append(barItem);
  }
}

function renderSources(files) {
  const sourceList = element("source-list");
  sourceList.replaceChildren();
  if (!files.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "CSVがまだ読み込まれていません";
    sourceList.append(empty);
    return;
  }

  for (const file of files) {
    const item = document.createElement("div");
    item.className = "source-item";

    const info = document.createElement("div");
    const name = document.createElement("div");
    name.className = "source-name";
    name.textContent = file.name;
    name.title = file.name;
    const meta = document.createElement("div");
    meta.className = "source-meta";
    meta.textContent = file.encoding.toUpperCase();
    info.append(name, meta);

    const count = document.createElement("span");
    count.className = "source-count";
    count.textContent = `${number.format(file.rows)}件`;

    item.append(info, count);
    sourceList.append(item);
  }
}

function statusClass(status) {
  if (status.includes("確定")) return "confirmed";
  if (status.includes("確認中")) return "pending";
  return "";
}

function appendCell(row, text, className = "") {
  const cell = document.createElement("td");
  cell.textContent = text || "—";
  if (className) cell.className = className;
  row.append(cell);
  return cell;
}

function updateSelectionToolbar() {
  const selectedCount = state.selectedRecordIds.size;
  const selectedPdfs = selectedRecordPdfs();
  element("selected-count").textContent = `${number.format(selectedCount)}件選択`;
  element("clear-selection").disabled = selectedCount === 0;
  const showButton = element("show-selected-pdf");
  showButton.disabled = selectedCount === 0 || selectedPdfs.size !== 1;
  showButton.title = selectedPdfs.size > 1
    ? "複数PDFにまたがる証明書は、PDFごとに選択してください"
    : "";
}

function updateSubmissionPanel() {
  const selectedRecords = selectedSubmissionRecords();
  const workNumbers = submissionWorkNumbers();
  const container = element("submission-selected-list");
  container.replaceChildren();

  for (const recordId of [...state.submissionAssignments.keys()]) {
    if (!state.selectedRecordIds.has(recordId)) {
      state.submissionAssignments.delete(recordId);
    }
  }

  if (!selectedRecords.length) {
    container.textContent =
      "ETC明細を選択すると、ここで作業番号を割り当てできます。";
  } else {
    for (const record of selectedRecords) {
      if (
        workNumbers.length === 1 &&
        !state.submissionAssignments.get(record.id)
      ) {
        state.submissionAssignments.set(record.id, workNumbers[0]);
      }

      const row = document.createElement("div");
      row.className = "submission-selected-row";

      const date = document.createElement("strong");
      date.textContent = `${formatDate(record.date_start)} ${record.time_start}`;

      const route = document.createElement("span");
      route.className = "submission-selected-route";
      route.textContent = `${record.entry_ic || "—"} → ${record.exit_ic || "—"}`;

      const fee = document.createElement("span");
      fee.textContent = yen.format(record.toll_fee);

      const select = document.createElement("select");
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = workNumbers.length
        ? "作業番号を選択"
        : "作業番号を入力";
      select.append(empty);
      const current = state.submissionAssignments.get(record.id) || "";
      if (current && !workNumbers.includes(current)) {
        const option = document.createElement("option");
        option.value = current;
        option.textContent = current;
        select.append(option);
      }
      for (const workNumber of workNumbers) {
        const option = document.createElement("option");
        option.value = workNumber;
        option.textContent = workNumber;
        select.append(option);
      }
      select.value = current;
      select.addEventListener("change", () => {
        if (select.value) {
          state.submissionAssignments.set(record.id, select.value);
        } else {
          state.submissionAssignments.delete(record.id);
        }
        updateSubmissionPanel();
      });

      row.append(date, route, fee, select);
      container.append(row);
    }
  }

  const title = element("submission-title").value.trim();
  const technician = element("submission-technician").value.trim();
  const dateFrom = element("submission-date-from").value;
  const dateTo = element("submission-date-to").value;
  const allAssigned = selectedRecords.every((record) =>
    state.submissionAssignments.get(record.id),
  );
  element("create-submission").disabled = !(
    selectedRecords.length &&
    title &&
    technician &&
    dateFrom &&
    dateTo &&
    allAssigned
  );
}

function renderTable(records) {
  state.records = records;
  const body = element("detail-body");
  body.replaceChildren();
  element("table-count").textContent = `${number.format(records.length)}件`;
  element("table-empty").classList.toggle("hidden", records.length > 0);

  const totalPages = Math.max(1, Math.ceil(records.length / state.pageSize));
  state.currentPage = Math.min(Math.max(state.currentPage, 1), totalPages);
  const firstIndex = (state.currentPage - 1) * state.pageSize;
  const visibleRecords = records.slice(firstIndex, firstIndex + state.pageSize);
  element("page-label").textContent =
    `${number.format(state.currentPage)} / ${number.format(totalPages)}ページ`;
  element("previous-page").disabled = state.currentPage <= 1;
  element("next-page").disabled = state.currentPage >= totalPages;

  for (const record of visibleRecords) {
    const row = document.createElement("tr");
    row.classList.toggle("row-selected", state.selectedRecordIds.has(record.id));
    const dateCell = appendCell(
      row,
      `${record.date_start.replaceAll("-", "/")} ${record.time_start}`,
    );
    const dateStrong = document.createElement("strong");
    dateStrong.textContent = dateCell.textContent;
    dateCell.replaceChildren(dateStrong);

    const routeCell = document.createElement("td");
    routeCell.className = "route-cell";
    const entry = document.createElement("span");
    entry.textContent = record.entry_ic || "—";
    const arrow = document.createElement("span");
    arrow.className = "route-arrow";
    arrow.textContent = "→";
    const exit = document.createElement("span");
    exit.textContent = record.exit_ic || "—";
    routeCell.append(entry, arrow, exit);
    row.append(routeCell);

    appendCell(row, record.vehicle_number);
    appendCell(row, record.vehicle_type);
    appendCell(row, yen.format(record.toll_fee), "number-cell");

    const statusCell = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = `status-badge ${statusClass(record.status)}`;
    badge.textContent = record.status || "—";
    statusCell.append(badge);
    row.append(statusCell);

    appendCell(row, record.source_file);

    const selectionCell = document.createElement("td");
    selectionCell.className = "selection-cell";
    const selectButton = document.createElement("button");
    const hasCertificate =
      Boolean(record.certificate_available && record.source_pdf)
      || state.certificatesByRecordId.has(record.id);
    const isSelected = state.selectedRecordIds.has(record.id);
    selectButton.type = "button";
    selectButton.className = `certificate-select${isSelected ? " selected" : ""}`;
    selectButton.textContent = isSelected ? "選択済" : "選択";
    selectButton.disabled = !hasCertificate;
    selectButton.title = hasCertificate
      ? "この利用証明書を選択"
      : "この明細に利用証明書が紐づいていません";
    selectButton.addEventListener("click", () => {
      if (state.selectedRecordIds.has(record.id)) {
        state.selectedRecordIds.delete(record.id);
      } else {
        state.selectedRecordIds.add(record.id);
      }
      renderTable(state.records);
    });
    selectionCell.append(selectButton);
    row.append(selectionCell);
    body.append(row);
  }
  updateSelectionToolbar();
  updateSubmissionPanel();
}

function renderPdfs(pdfs) {
  state.pdfs = pdfs;
  const select = element("pdf-select");
  const previousSelection = state.analyzedPdf || select.value;
  select.replaceChildren();
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = pdfs.length ? "PDFを選択してください" : "PDFがありません";
  select.append(empty);

  for (const pdf of pdfs) {
    const option = document.createElement("option");
    option.value = pdf.relative_path;
    option.textContent = pdf.name || pdf.relative_path;
    option.title = pdf.relative_path;
    select.append(option);
  }
  if (pdfs.some((pdf) => pdf.relative_path === previousSelection)) {
    select.value = previousSelection;
  } else if (state.analyzedPdf) {
    clearPdfPreview();
    state.selectedRecordIds.clear();
    renderTable(state.records);
  }
  element("analyze-pdf").disabled = !select.value;
  updateDeletePdfButton();
  updateSelectionToolbar();
}

function updateDeletePdfButton() {
  const button = element("delete-pdf");
  const canDelete = isAdmin() && Boolean(element("pdf-select").value);
  button.disabled = !canDelete;
  button.classList.toggle("hidden", !isAdmin());
  button.title = isAdmin()
    ? "選択したPDFと関連データを削除します"
    : "PDF削除は管理者だけが操作できます";
}

function addDefinition(list, label, value) {
  const term = document.createElement("dt");
  term.textContent = label;
  const description = document.createElement("dd");
  description.textContent = value || "—";
  list.append(term, description);
}

function renderCertificates(payload) {
  state.analyzedPdf = payload.file;
  state.certificatesByRecordId = new Map(
    payload.certificates
      .filter((certificate) => certificate.matched && certificate.csv_record)
      .map((certificate) => [certificate.csv_record.id, certificate]),
  );
  state.selectedRecordIds = new Set(
    [...state.selectedRecordIds].filter((recordId) =>
      state.certificatesByRecordId.has(recordId),
    ),
  );

  const summary = element("certificate-summary");
  summary.replaceChildren();
  const summaryItems = [
    ["抽出", `${number.format(payload.summary.count)}件`],
    ["明細登録", `${number.format(payload.summary.matched)}件`],
    ["未登録", `${number.format(payload.summary.unmatched)}件`],
    ["料金合計", yen.format(payload.summary.amount)],
  ];
  for (const [label, value] of summaryItems) {
    const item = document.createElement("span");
    item.textContent = label;
    const strong = document.createElement("strong");
    strong.textContent = value;
    item.append(strong);
    summary.append(item);
  }
  summary.classList.remove("hidden");

  const grid = element("certificate-grid");
  grid.replaceChildren();
  for (const certificate of payload.certificates) {
    const card = document.createElement("article");
    card.className = "certificate-card";

    const kind = document.createElement("p");
    kind.className = "certificate-kind";
    kind.textContent = "PDFから抽出した利用情報";
    const title = document.createElement("h4");
    title.textContent = "利用証明書";
    const operator = document.createElement("div");
    operator.className = "certificate-operator";
    operator.textContent = certificate.operator || "道路事業者";

    const data = document.createElement("dl");
    data.className = "certificate-data";
    addDefinition(data, "料金所(自)", certificate.entry_ic);
    addDefinition(data, "料金所(至)", certificate.exit_ic);
    addDefinition(
      data,
      "利用日時",
      `${certificate.date.replaceAll("-", "/")} ${certificate.time}`,
    );
    addDefinition(data, "車種", certificate.vehicle_type);

    const fee = document.createElement("div");
    fee.className = "certificate-fee";
    const feeLabel = document.createElement("span");
    feeLabel.textContent = "通行料金";
    const feeValue = document.createElement("strong");
    feeValue.textContent = yen.format(certificate.fee);
    fee.append(feeLabel, feeValue);

    const transaction = document.createElement("p");
    transaction.className = "certificate-number";
    transaction.textContent = "取扱番号";
    const transactionValue = document.createElement("strong");
    transactionValue.textContent = certificate.transaction_number;
    transaction.append(transactionValue);

    const badge = document.createElement("span");
    badge.className = `match-badge${certificate.matched ? "" : " unmatched"}`;
    badge.textContent = certificate.matched
      ? `${certificate.assigned_manually ? "選択車両へ登録" : "CSV一致"}${
          certificate.csv_record?.vehicle_number
            ? `・車両 ${certificate.csv_record.vehicle_number}`
            : ""
        }`
      : "要確認";

    card.append(kind, title, operator, data, fee, transaction, badge);
    grid.append(card);
  }
  grid.classList.remove("hidden");
  renderTable(state.records);
}

async function analyzePdf({
  file = "",
  requireCsvMatch = false,
  renderResult = true,
} = {}) {
  const selected = file || element("pdf-select").value;
  if (!selected) return;

  const button = element("analyze-pdf");
  button.disabled = true;
  button.textContent = "解析中…";
  setNotice("");
  try {
    const payload = await request("/api/pdf/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file: selected,
        vehicle_number: element("vehicle-filter").value,
        require_csv_match: requireCsvMatch,
      }),
    });
    if (renderResult) {
      renderCertificates(payload);
    }
    await loadDashboard();
    if (!renderResult) {
      state.analyzedPdf = "";
      state.selectedRecordIds.clear();
      clearPdfPreview();
    }
    const messages = [];
    if (payload.duplicates?.count > 0) {
      const dateMin = payload.duplicates.date_min.replaceAll("-", "/");
      const dateMax = payload.duplicates.date_max.replaceAll("-", "/");
      const period = dateMin === dateMax ? dateMin : `${dateMin}〜${dateMax}`;
      messages.push(
        `重複データが${number.format(payload.duplicates.count)}件あります。` +
          `${period}のデータを取扱番号を基準に上書き保存しました。`,
      );
    }
    if (payload.different_vehicles?.length) {
      messages.push(
        `CSVから選択車両とは異なる車番 ${payload.different_vehicles.join(
          "、",
        )} を検出し、それぞれの車番で保存しました。` +
          "同じ車両のナンバー変更なら、車両設定の「関連車番」で紐づけてください。",
      );
    }
    if (payload.summary?.unmatched > 0) {
      messages.push(
        `${number.format(
          payload.summary.unmatched,
        )}件はCSVと照合できなかったため、車両へ登録していません。`,
      );
    }
    if (messages.length) setNotice(messages.join(" "));
    return payload;
  } catch (error) {
    setNotice(error.message, true);
    return null;
  } finally {
    button.disabled = false;
    button.textContent = "証明書を解析";
  }
}

function openDeletePdfDialog() {
  const selected = element("pdf-select").value;
  if (!isAdmin()) {
    setNotice("PDF削除は管理者だけが操作できます。", true);
    return;
  }
  if (!selected) return;
  element("delete-pdf-name").textContent = selected;
  element("delete-pdf-dialog").showModal();
}

function closeDeletePdfDialog() {
  element("delete-pdf-dialog").close();
}

async function deleteSelectedPdf() {
  const selected = element("pdf-select").value;
  if (!isAdmin()) {
    closeDeletePdfDialog();
    setNotice("PDF削除は管理者だけが操作できます。", true);
    return;
  }
  if (!selected) return;

  const button = element("confirm-delete-pdf");
  button.disabled = true;
  button.textContent = "削除中…";
  setNotice("");
  try {
    const payload = await request("/api/pdf/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file: selected }),
    });
    closeDeletePdfDialog();
    state.analyzedPdf = "";
    state.certificatesByRecordId.clear();
    state.selectedRecordIds.clear();
    releaseCroppedPdfUrl();
    await loadDashboard();
    setNotice(
      `${selected} と関連する利用明細${number.format(
        payload.removed_records,
      )}件を削除しました。`,
    );
  } catch (error) {
    closeDeletePdfDialog();
    setNotice(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "削除する";
  }
}

function clearCertificateSelection() {
  state.selectedRecordIds.clear();
  renderTable(state.records);
}

function openCertificateSaveDialog() {
  if (!state.selectedRecordIds.size) return;
  const selectedPdfs = selectedRecordPdfs();
  if (selectedPdfs.size !== 1) {
    setNotice("複数PDFにまたがっています。PDFごとに証明書を選択してください。", true);
    updateSelectionToolbar();
    return;
  }
  element("certificate-save-form").reset();
  element("certificate-save-summary").textContent =
    `${number.format(state.selectedRecordIds.size)}件の利用証明書をPDFにします。`;
  element("certificate-save-dialog").showModal();
  element("certificate-file-name").focus();
}

function closeCertificateSaveDialog() {
  element("certificate-save-dialog").close();
}

async function showSelectedCertificates(event) {
  event?.preventDefault();
  if (!state.selectedRecordIds.size) return;
  const selectedPdfs = selectedRecordPdfs();
  if (selectedPdfs.size !== 1) {
    setNotice("複数PDFにまたがっています。PDFごとに証明書を選択してください。", true);
    updateSelectionToolbar();
    return;
  }
  const sourcePdf = [...selectedPdfs][0];
  const fileName = ensurePdfFileName(
    element("certificate-file-name").value,
    "ETC利用証明書.pdf",
  );

  const button = element("confirm-certificate-save");
  button.disabled = true;
  button.textContent = "作成中…";
  setNotice("");
  try {
    const payload = await request("/api/pdf/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file: sourcePdf,
        file_name: fileName,
        record_ids: [...state.selectedRecordIds],
      }),
    });
    releaseCroppedPdfUrl();
    state.croppedPdfUrl = payload.url;
    state.croppedPdfFileName = payload.file;
    state.analyzedPdf = sourcePdf;
    const pdfSelect = element("pdf-select");
    if (state.pdfs.some((pdf) => pdf.relative_path === sourcePdf)) {
      pdfSelect.value = sourcePdf;
    }

    const summary = element("certificate-summary");
    summary.replaceChildren();
    const summaryText = document.createElement("span");
    summaryText.textContent = "選択した利用証明書";
    const summaryCount = document.createElement("strong");
    summaryCount.textContent = `${number.format(state.selectedRecordIds.size)}件`;
    summaryText.append(summaryCount);
    const downloadLink = document.createElement("a");
    downloadLink.href = state.croppedPdfUrl;
    downloadLink.className = "certificate-download-link";
    downloadLink.textContent = `${payload.file} を開く`;
    summary.append(summaryText, downloadLink);
    summary.classList.remove("hidden");

    element("certificate-grid").classList.add("hidden");
    element("pdf-placeholder").classList.add("hidden");
    const frame = element("pdf-frame");
    frame.src = state.croppedPdfUrl;
    frame.classList.remove("hidden");
    closeCertificateSaveDialog();
    setNotice(`${payload.file} をNASに保存しました。`);
    element("pdf-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    setNotice(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "PDFを作成してNAS保存";
    updateSelectionToolbar();
  }
}

function openSubmissionSaveDialog() {
  updateSubmissionPanel();
  if (element("create-submission").disabled) return;
  const selectedRecords = selectedSubmissionRecords();
  const totalAmount = selectedRecords.reduce(
    (sum, record) => sum + Number(record.toll_fee || 0),
    0,
  );
  element("submission-file-name").value = suggestedSubmissionFileName();
  element("submission-save-summary").textContent =
    `${number.format(selectedRecords.length)}枚・${yen.format(totalAmount)} をNASに保存します。`;
  element("submission-save-dialog").showModal();
  element("submission-file-name").focus();
  element("submission-file-name").select();
}

function closeSubmissionSaveDialog() {
  element("submission-save-dialog").close();
}

async function createSubmissionPdf(event) {
  event?.preventDefault();
  const selectedRecords = selectedSubmissionRecords();
  const assignments = selectedRecords.map((record) => ({
    record_id: record.id,
    work_number: state.submissionAssignments.get(record.id) || "",
  }));
  const button = element("confirm-create-submission");
  button.disabled = true;
  button.textContent = "作成中…";
  setNotice("");
  element("submission-result").classList.add("hidden");
  try {
    let fileName = element("submission-file-name").value.trim();
    if (fileName && !fileName.toLowerCase().endsWith(".pdf")) {
      fileName = `${fileName}.pdf`;
    }
    const payload = await request("/api/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: element("submission-title").value.trim(),
        technician: element("submission-technician").value.trim(),
        date_from: element("submission-date-from").value,
        date_to: element("submission-date-to").value,
        file_name: fileName,
        assignments,
      }),
    });

    const result = element("submission-result");
    result.replaceChildren();
    const link = document.createElement("a");
    link.href = payload.url;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = payload.file;
    const summary = document.createElement("span");
    summary.textContent =
      ` をNASに保存しました（${number.format(payload.count)}枚・${yen.format(payload.amount)}）。`;
    result.append(link, summary);
    result.classList.remove("hidden");
    closeSubmissionSaveDialog();
    window.open(payload.url, "_blank", "noopener");
    setNotice("提出用PDFを作成しました。");
  } catch (error) {
    setNotice(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "作成して保存";
    updateSubmissionPanel();
  }
}

function renderDashboard(payload) {
  element("updated-at").textContent = new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  const vehicleSelect = element("vehicle-filter");
  const statusSelect = element("status-filter");
  updateSelect(
    vehicleSelect,
    payload.available_vehicles || [],
    vehicleSelect.value,
    "すべての車両",
  );
  updateSelect(
    statusSelect,
    payload.available_statuses || [],
    statusSelect.value,
    "すべての状態",
  );

  renderVehicles(payload.vehicle_summaries || []);
  const activeVehicle = vehicleSelect.value;
  const activeVehicleSummary = state.vehicles.find(
    (vehicle) => vehicle.vehicle_number === activeVehicle,
  );
  element("active-vehicle-label").textContent = activeVehicle
    ? `${activeVehicleSummary ? vehicleDisplayName(activeVehicleSummary) : `車両 ${activeVehicle}`} を表示中`
    : "全車両を表示中";
  updateVehicleCardSelection();
  renderFreshness(payload.freshness);
  renderInspectionAlerts(payload.inspection_alerts || []);
  renderMetrics(payload.summary);
  setDefaultSubmissionDates(payload.summary);
  renderChart(payload.summary.daily);
  renderSources(payload.files || []);
  renderTable(payload.records || []);
  renderPdfs(payload.pdfs || []);

  const messages = [...(payload.errors || [])];
  if (payload.message) messages.push(payload.message);
  setNotice(messages.join(" / "), payload.errors.length > 0);
}

async function loadDashboard() {
  state.currentPage = 1;
  try {
    const query = filtersAsQuery();
    const payload = await request(`/api/dashboard${query ? `?${query}` : ""}`);
    renderDashboard(payload);
  } catch (error) {
    setNotice(error.message, true);
  }
}

function renderSettingsVehicleButtons() {
  const container = element("settings-vehicle-buttons");
  if (!container) return;
  container.replaceChildren();
  for (const vehicle of state.vehicles) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = vehicle.display_name?.trim()
      || `車両 ${vehicle.vehicle_number}`;
    button.addEventListener("click", () => {
      element("settings-vehicle-number").value = vehicle.vehicle_number;
      element("settings-display-name").value = vehicle.display_name || "";
      element("settings-driver-name").value = vehicle.driver_name || "";
      element("settings-card-suffix").value =
        vehicle.card_suffixes?.join(", ") || "";
      element("settings-related-vehicles").value =
        vehicle.related_vehicle_numbers?.join(", ") || "";
      element("settings-vehicle-memo").value = vehicle.memo || "";
    });
    container.append(button);
  }
}

function openVehicleSettings() {
  const selectedVehicle = element("vehicle-filter").value;
  const vehicle = state.vehicles.find(
    (item) => item.vehicle_number === selectedVehicle,
  );
  element("settings-vehicle-number").value = selectedVehicle;
  element("settings-display-name").value = vehicle?.display_name || "";
  element("settings-driver-name").value = vehicle?.driver_name || "";
  element("settings-card-suffix").value = vehicle?.card_suffixes?.join(", ") || "";
  element("settings-related-vehicles").value =
    vehicle?.related_vehicle_numbers?.join(", ") || "";
  element("settings-vehicle-memo").value = vehicle?.memo || "";
  element("settings-vehicle-photo").value = "";
  renderSettingsVehicleButtons();
  element("vehicle-settings-dialog").showModal();
}

function closeVehicleSettings() {
  element("vehicle-settings-dialog").close();
}

async function saveVehicleSettings(event) {
  event.preventDefault();
  const vehicleNumber = element("settings-vehicle-number").value.trim();
  const displayName = element("settings-display-name").value.trim();
  const driverName = element("settings-driver-name").value.trim();
  const cardSuffix = element("settings-card-suffix").value.trim();
  const relatedVehicleNumbers = element("settings-related-vehicles")
    .value.split(/[,、\s]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  const memo = element("settings-vehicle-memo").value.trim();
  const photo = element("settings-vehicle-photo").files?.[0];
  const button = element("save-vehicle-settings");
  button.disabled = true;
  button.textContent = "保存中…";
  setNotice("");
  try {
    const saved = await request("/api/vehicles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vehicle_number: vehicleNumber,
        display_name: displayName,
        driver_name: driverName,
        card_suffix: cardSuffix,
        replace_card_suffixes: true,
        related_vehicle_numbers: relatedVehicleNumbers,
        memo,
      }),
    });
    let savedVehicleNumber = saved.vehicle?.vehicle_number || vehicleNumber;
    if (photo) {
      const photoSaved = await request("/api/vehicle-photo", {
        method: "POST",
        headers: {
          "Content-Type": photo.type || "application/octet-stream",
          "X-Vehicle-Number": encodeURIComponent(vehicleNumber),
          "X-File-Name": encodeURIComponent(photo.name),
        },
        body: photo,
      });
      savedVehicleNumber = photoSaved.vehicle?.vehicle_number || savedVehicleNumber;
    }
    element("vehicle-filter").value = savedVehicleNumber;
    closeVehicleSettings();
    await loadDashboard();
    setSelectedVehicle(savedVehicleNumber, false);
    setNotice(`車両 ${savedVehicleNumber} の設定を保存しました。`);
  } catch (error) {
    setNotice(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "保存する";
  }
}

function updateImportVehicleOptions() {
  const select = element("import-vehicle");
  if (!select) return;
  const current = select.value;
  select.replaceChildren();
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "車両を選択してください";
  select.append(empty);
  for (const vehicle of state.vehicles) {
    const option = document.createElement("option");
    option.value = vehicle.vehicle_number;
    const displayName = vehicle.display_name?.trim()
      || `車両 ${vehicle.vehicle_number}`;
    option.textContent = vehicle.related_vehicle_numbers?.length
      ? `${displayName}（関連: ${vehicle.related_vehicle_numbers.join(
          " / ",
        )}）`
      : displayName;
    select.append(option);
  }
  select.value = state.vehicles.some(
    (vehicle) => vehicle.vehicle_number === current,
  )
    ? current
    : "";
}

function updateImportSubmitState() {
  element("submit-import").disabled = !(
    element("import-vehicle").value &&
    element("import-csv").files?.length === 1 &&
    element("import-pdf").files?.length === 1
  );
  updateImportVehicleSummary();
  updateImportInspectionInfo();
  updateInspectionSubmitState();
}

function selectedImportVehicle() {
  const vehicleNumber = element("import-vehicle").value;
  return state.vehicles.find((vehicle) => vehicle.vehicle_number === vehicleNumber);
}

function updateImportVehicleSummary() {
  const summary = element("import-vehicle-summary");
  const vehicle = selectedImportVehicle();
  const label = summary.querySelector("strong");
  if (!vehicle) {
    summary.classList.remove("selected");
    label.textContent = "車両を選択してください";
    return;
  }
  summary.classList.add("selected");
  label.textContent = `${vehicleDisplayName(vehicle)} / 車両番号 ${vehicle.vehicle_number}`;
}

function updateImportInspectionInfo() {
  const vehicle = selectedImportVehicle();
  const inspectionBox = document.querySelector(".inspection-import-box");
  const status = element("import-inspection-status");
  const openButton = element("open-inspection-pdf");
  const expirationInput = element("inspection-expiration-date");
  const pdfInput = element("inspection-pdf");
  const adminHelp = element("inspection-admin-help");
  const saveButton = element("save-inspection-pdf");
  const canEdit = isAdmin();
  expirationInput.disabled = !canEdit;
  pdfInput.disabled = !canEdit;
  saveButton.classList.toggle("hidden", !canEdit);
  adminHelp.textContent = canEdit
    ? "PDFに文字データがある場合は自動取得します。日付だけ直す場合は満了日を変更して保存してください。"
    : "車検情報の修正は管理者だけが行えます。";
  if (!vehicle) {
    inspectionBox?.classList.remove("expiration-visible");
    status.textContent = "車両を選択してください";
    openButton.disabled = true;
    expirationInput.value = "";
    return;
  }
  const expirationDate = vehicle.inspection?.expiration_date;
  inspectionBox?.classList.toggle("expiration-visible", Boolean(expirationDate));
  status.textContent = expirationDate
    ? `車検満了日 ${formatDate(expirationDate)}`
    : "車検情報は未登録です";
  expirationInput.value = expirationDate || "";
  openButton.disabled = !vehicle.inspection?.pdf_url;
}

function updateInspectionSubmitState() {
  const vehicleNumber = element("import-vehicle").value;
  const pdfFile = element("inspection-pdf").files?.[0];
  const expirationDate = element("inspection-expiration-date").value;
  element("save-inspection-pdf").disabled = !(
    isAdmin() &&
    vehicleNumber &&
    (pdfFile || expirationDate)
  );
}

function openImportDialog(vehicleNumber = "") {
  element("import-form").reset();
  updateImportVehicleOptions();
  const selectedVehicle =
    vehicleNumber || element("vehicle-filter").value || "";
  element("import-vehicle").value = state.vehicles.some(
    (vehicle) => vehicle.vehicle_number === selectedVehicle,
  )
    ? selectedVehicle
    : "";
  updateImportSubmitState();
  updateImportInspectionInfo();
  element("import-dialog").showModal();
}

function closeImportDialog() {
  element("import-dialog").close();
  element("import-form").reset();
  updateImportSubmitState();
}

function closeDialogFromBackdrop(event, closeHandler) {
  if (event.target === event.currentTarget) closeHandler();
}

function openInspectionPdf() {
  const vehicle = selectedImportVehicle();
  if (!vehicle?.inspection?.pdf_url) return;
  window.open(vehicle.inspection.pdf_url, "_blank", "noopener");
}

async function saveInspectionPdf() {
  const vehicleNumber = element("import-vehicle").value;
  const pdfFile = element("inspection-pdf").files?.[0];
  const expirationDate = element("inspection-expiration-date").value;
  if (!isAdmin() || !vehicleNumber || (!pdfFile && !expirationDate)) {
    updateInspectionSubmitState();
    return;
  }

  const button = element("save-inspection-pdf");
  button.disabled = true;
  button.textContent = "保存中...";
  setNotice("");
  try {
    if (pdfFile) {
      await request("/api/vehicle-inspection", {
        method: "POST",
        headers: {
          "Content-Type": "application/pdf",
          "X-Vehicle-Number": encodeURIComponent(vehicleNumber),
          "X-File-Name": encodeURIComponent(pdfFile.name),
          "X-Inspection-Expiration": expirationDate,
        },
        body: pdfFile,
      });
    } else {
      await request("/api/vehicle-inspection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicle_number: vehicleNumber,
          expiration_date: expirationDate,
        }),
      });
    }
    element("inspection-pdf").value = "";
    element("inspection-expiration-date").value = "";
    element("vehicle-filter").value = vehicleNumber;
    await loadDashboard();
    updateImportVehicleOptions();
    element("import-vehicle").value = vehicleNumber;
    updateImportInspectionInfo();
    closeImportDialog();
    window.scrollTo({ top: 0, behavior: "smooth" });
    setNotice(pdfFile ? "車検PDFと満了日を保存しました。" : "車検満了日を修正しました。");
  } catch (error) {
    setNotice(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "車検情報を保存";
    updateInspectionSubmitState();
  }
}

async function submitImport(event) {
  event.preventDefault();
  const vehicleNumber = element("import-vehicle").value;
  const csvFile = element("import-csv").files?.[0];
  const pdfFile = element("import-pdf").files?.[0];
  if (!vehicleNumber || !csvFile || !pdfFile) {
    updateImportSubmitState();
    return;
  }

  const button = element("submit-import");
  button.disabled = true;
  button.textContent = "保存中 1/2…";
  setNotice("");
  try {
    const files = [csvFile, pdfFile];
    let uploadedPdfPath = "";
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      button.textContent = `保存中 ${index + 1}/2…`;
      const payload = await request("/api/files", {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-File-Name": encodeURIComponent(file.name),
        },
        body: file,
      });
      if (payload.file?.type === "pdf") {
        uploadedPdfPath = payload.file.relative_path || payload.file.name;
      }
    }

    element("vehicle-filter").value = vehicleNumber;
    await loadDashboard();
    if (!uploadedPdfPath) {
      throw new Error("取り込んだPDFを確認できませんでした。");
    }
    button.textContent = "解析中…";
    const analysisResult = await analyzePdf({
      file: uploadedPdfPath,
      requireCsvMatch: true,
      renderResult: false,
    });
    closeImportDialog();
    if (
      !analysisResult ||
      analysisResult.duplicates?.count > 0 ||
      analysisResult.different_vehicles?.length > 0 ||
      analysisResult.summary?.unmatched > 0
    ) {
      return;
    }
    setNotice("CSVとPDFを読み込み、車両別の明細を保存しました。");
  } catch (error) {
    setNotice(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "読み込む";
    updateImportSubmitState();
  }
}

function resetFilters() {
  element("date-from").value = "";
  element("date-to").value = "";
  element("vehicle-filter").value = "";
  element("status-filter").value = "";
  loadDashboard();
}

function showPdf() {
  const selected = element("pdf-select").value;
  clearPdfPreview();
  if (!selected) {
    element("analyze-pdf").disabled = true;
    updateDeletePdfButton();
    return;
  }
  state.selectedRecordIds.clear();
  renderTable(state.records);
  element("analyze-pdf").disabled = false;
  updateDeletePdfButton();
  updateSelectionToolbar();
}

async function loadSession() {
  try {
    const payload = await request("/api/session");
    state.session = payload.user;
    updateAccountPanel();
    hideLogin();
    updateDeletePdfButton();
    updateImportSubmitState();
    placeDailySpimaru();
    return true;
  } catch (error) {
    state.session = null;
    updateAccountPanel();
    showLogin(error.message);
    return false;
  }
}

async function submitLogin(event) {
  event.preventDefault();
  const button = element("login-submit");
  const error = element("login-error");
  button.disabled = true;
  button.textContent = "確認中...";
  error.classList.add("hidden");
  try {
    const payload = await request("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: element("login-user-id").value,
        password: element("login-password").value,
      }),
    });
    state.session = payload.user;
    updateAccountPanel();
    hideLogin();
    setNotice("");
    await loadDashboard();
    placeDailySpimaru();
  } catch (loginError) {
    showLogin(loginError.message);
  } finally {
    button.disabled = false;
    button.textContent = "ログイン";
  }
}

function setPasswordResetMessage(message, isError = true) {
  const target = element("password-reset-message");
  target.textContent = message;
  target.classList.toggle("hidden", !message);
  target.classList.toggle("login-success", Boolean(message) && !isError);
}

function openPasswordResetDialog() {
  element("password-reset-form").reset();
  element("reset-user-id").value = element("login-user-id").value.trim();
  setPasswordResetMessage("");
  element("password-reset-dialog").showModal();
  const focusTarget = element("reset-user-id").value
    ? element("reset-new-password")
    : element("reset-user-id");
  focusTarget.focus();
}

function closePasswordResetDialog() {
  element("password-reset-dialog").close();
  setPasswordResetMessage("");
}

async function submitPasswordReset(event) {
  event.preventDefault();
  const button = element("reset-password-submit");
  button.disabled = true;
  button.textContent = "再設定中...";
  setPasswordResetMessage("");
  const userId = element("reset-user-id").value.trim();
  try {
    await request("/api/password-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        new_password: element("reset-new-password").value,
        reset_key: element("reset-key").value,
      }),
    });
    closePasswordResetDialog();
    element("login-user-id").value = userId;
    showLogin(
      "パスワードを再設定しました。新しいパスワードでログインしてください。",
      false,
    );
  } catch (error) {
    setPasswordResetMessage(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "再設定する";
  }
}

async function logout() {
  try {
    await request("/api/logout", { method: "POST" });
  } catch (error) {
    // Cookie deletion is attempted server-side; still return to login if the request fails.
  }
  state.session = null;
  updateAccountPanel();
  element("daily-spimaru").classList.add("hidden");
  closeDailySpimaruGreeting();
  showLogin("ログアウトしました。");
}

function openAvatarPicker() {
  if (!state.session) {
    showLogin();
    return;
  }
  element("account-avatar-input").click();
}

async function uploadAccountAvatar() {
  const input = element("account-avatar-input");
  const file = input.files?.[0];
  if (!file) return;
  try {
    const payload = await request("/api/user-avatar", {
      method: "POST",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "X-File-Name": encodeURIComponent(file.name),
      },
      body: file,
    });
    state.session = payload.user;
    updateAccountPanel();
    setNotice("ログインユーザーのサムネイルを更新しました。");
  } catch (error) {
    setNotice(error.message, true);
  } finally {
    input.value = "";
  }
}

function closeAdminSettings() {
  element("admin-settings-dialog").close();
}

async function openAdminSettings() {
  element("admin-settings-dialog").showModal();
  await Promise.all([
    loadUsers(),
    loadAuditLog(),
    loadAdminMailSettings(),
    loadAdminStorageSettings(),
  ]);
}

async function loadUsers() {
  const container = element("user-list");
  container.textContent = "読み込み中...";
  try {
    const payload = await request("/api/users");
    container.replaceChildren();
    if (!payload.users?.length) {
      container.textContent = "アカウントがありません。";
      return;
    }
    for (const user of payload.users) {
      const item = document.createElement("div");
      item.className = "user-list-item";
      const name = document.createElement("strong");
      name.textContent = user.id;
      const role = document.createElement("span");
      role.textContent = user.role === "admin" ? "管理者" : "一般";
      item.append(name, role);
      container.append(item);
    }
  } catch (error) {
    container.textContent = error.message;
  }
}

function populateAdminMailSettings(imap = {}) {
  element("admin-imap-host").value = imap.host || "";
  element("admin-imap-port").value = imap.port || 993;
  element("admin-imap-user").value = imap.user || "info_order@ithe.co.jp";
  element("admin-imap-password").value = "";
  element("admin-imap-inbox").value = imap.inbox || "INBOX";
  element("admin-imap-processed-folder").value = imap.processed_folder || "Processed";
  element("admin-imap-error-folder").value = imap.error_folder || "ImportError";
  element("admin-imap-max-messages").value = imap.max_messages || 20;
  element("admin-imap-use-ssl").checked = imap.ssl !== false;
  const missing = Array.isArray(imap.missing) ? imap.missing : [];
  element("admin-mail-settings-status").textContent = imap.configured
    ? "現在のメール設定は有効です。パスワードは保存済みですが画面には表示しません。"
    : `未設定項目: ${missing.length ? missing.join(", ") : "なし"}`;
}

async function loadAdminMailSettings() {
  const status = element("admin-mail-settings-status");
  status.textContent = "現在のメール設定を読み込み中...";
  try {
    const payload = await request("/api/mail/settings");
    renderMailSettings(payload);
    populateAdminMailSettings(payload.imap || {});
  } catch (error) {
    status.textContent = error.message;
  }
}

function populateAdminStorageSettings(storage = {}) {
  element("admin-storage-backend").value = storage.backend || "local";
  element("admin-gcs-bucket").value = storage.bucket || "";
  element("admin-gcs-prefix").value = storage.prefix || "speed-etc";
  const missing = Array.isArray(storage.missing) ? storage.missing : [];
  const status = element("admin-storage-settings-status");
  if (storage.enabled && storage.configured) {
    status.textContent = `GCS保存が有効です。バケット: ${storage.bucket || ""} / フォルダ: ${storage.prefix || ""}`;
  } else if (storage.enabled) {
    status.textContent = `GCS保存は未設定です。不足: ${missing.length ? missing.join(", ") : "設定を確認してください"}`;
  } else {
    status.textContent = "現在はNASローカル保存のみです。";
  }
}

async function loadAdminStorageSettings() {
  const status = element("admin-storage-settings-status");
  status.textContent = "現在のストレージ設定を読み込み中...";
  try {
    const payload = await request("/api/system/storage");
    populateAdminStorageSettings(payload.storage || {});
  } catch (error) {
    status.textContent = error.message;
  }
}

function auditActionLabel(action) {
  const labels = {
    bootstrap_admin: "初期管理者作成",
    create_user: "アカウント作成",
    change_password: "パスワード変更",
    upload_file: "ファイル取込",
    save_settings: "設定更新",
    save_mail_settings: "メール設定更新",
    save_storage_settings: "ストレージ設定更新",
    save_vehicle: "車両設定更新",
    save_vehicle_photo: "車両写真更新",
    save_vehicle_inspection: "車検PDF保存",
    update_vehicle_inspection: "車検満了日修正",
    analyze_pdf: "PDF解析",
    delete_pdf: "PDF削除",
    create_submission: "提出PDF作成",
  };
  return labels[action] || action;
}

async function loadAuditLog() {
  const container = element("audit-log");
  container.textContent = "読み込み中...";
  try {
    const payload = await request("/api/audit-log?limit=25");
    container.replaceChildren();
    const entries = payload.entries || [];
    if (!entries.length) {
      container.textContent = "履歴はまだありません。";
      return;
    }
    for (const entry of [...entries].reverse()) {
      const item = document.createElement("div");
      item.className = "audit-log-item";
      const title = document.createElement("strong");
      title.textContent = auditActionLabel(entry.action);
      const meta = document.createElement("span");
      const target = entry.target ? ` / ${entry.target}` : "";
      meta.textContent = `${entry.at || ""} / ${entry.user_id || ""}${target}`;
      item.append(title, meta);
      container.append(item);
    }
  } catch (error) {
    container.textContent = error.message;
  }
}

async function saveMailSettings(event) {
  event.preventDefault();
  const button = element("save-mail-settings");
  button.disabled = true;
  button.textContent = "保存中...";
  setNotice("");
  try {
    const payload = await request("/api/mail/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        host: element("admin-imap-host").value,
        port: Number(element("admin-imap-port").value) || 993,
        username: element("admin-imap-user").value,
        password: element("admin-imap-password").value,
        inbox: element("admin-imap-inbox").value,
        processed_folder: element("admin-imap-processed-folder").value,
        error_folder: element("admin-imap-error-folder").value,
        max_messages: Number(element("admin-imap-max-messages").value) || 20,
        use_ssl: element("admin-imap-use-ssl").checked,
      }),
    });
    renderMailSettings(payload);
    populateAdminMailSettings(payload.imap || {});
    await loadAuditLog();
    setNotice("メールサーバー設定を保存しました。");
  } catch (error) {
    setNotice(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "メール設定を保存";
  }
}

async function saveStorageSettings(event) {
  event.preventDefault();
  const button = element("save-storage-settings");
  button.disabled = true;
  button.textContent = "保存中...";
  setNotice("");
  try {
    const payload = await request("/api/system/storage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        backend: element("admin-storage-backend").value,
        bucket: element("admin-gcs-bucket").value,
        prefix: element("admin-gcs-prefix").value,
      }),
    });
    populateAdminStorageSettings(payload.storage || {});
    await loadAuditLog();
    setNotice("Google Cloud Storage設定を保存しました。");
  } catch (error) {
    setNotice(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "ストレージ設定を保存";
  }
}

async function checkStorageSettings() {
  const button = element("check-storage-settings");
  button.disabled = true;
  button.textContent = "確認中...";
  const status = element("admin-storage-settings-status");
  try {
    const payload = await request("/api/system/storage?check=1");
    populateAdminStorageSettings(payload.storage || {});
    status.textContent = payload.check?.ok
      ? `GCS接続OKです。バケット: ${payload.check.bucket}`
      : "GCS設定を確認しました。";
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = "接続確認";
  }
}

async function changePassword(event) {
  event.preventDefault();
  const button = element("save-password");
  button.disabled = true;
  button.textContent = "変更中...";
  setNotice("");
  try {
    await request("/api/users/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        current_password: element("current-password").value,
        new_password: element("new-password").value,
      }),
    });
    element("password-form").reset();
    setNotice(
      "パスワードを変更しました。次回は新しいパスワードでログインしてください。ブラウザが古いログイン情報を覚えている場合は、一度閉じて開き直してください。",
    );
  } catch (error) {
    setNotice(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "パスワードを変更";
  }
}

async function createUserAccount(event) {
  event.preventDefault();
  const button = element("create-user");
  button.disabled = true;
  button.textContent = "作成中...";
  setNotice("");
  try {
    await request("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: element("new-user-id").value,
        password: element("new-user-password").value,
        role: element("new-user-role").value,
      }),
    });
    element("create-user-form").reset();
    await Promise.all([loadUsers(), loadAuditLog()]);
    setNotice("アカウントを作成しました。");
  } catch (error) {
    setNotice(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "アカウントを作成";
  }
}

element("nav-logistics").addEventListener("click", () => setModule("logistics"));
element("nav-etc").addEventListener("click", () => {
  setModule("etc");
  if (!state.records.length) loadDashboard();
});
element("nav-mail").addEventListener("click", () => {
  setModule("mail");
  loadMailSettings();
  loadMailImports();
});
element("nav-returns").addEventListener("click", () => {
  setModule("returns");
  loadReturns();
});
element("nav-subcontractors").addEventListener("click", () => {
  setModule("subcontractors");
  loadSubcontractors();
});
element("open-job-dialog").addEventListener("click", () => openJobDialog());
element("apply-job-filters").addEventListener("click", loadLogisticsJobs);
element("reset-job-filters").addEventListener("click", resetJobFilters);
element("job-filter-keyword").addEventListener("keydown", (event) => {
  if (event.key === "Enter") loadLogisticsJobs();
});
element("close-job-dialog").addEventListener("click", closeJobDialog);
element("cancel-job-dialog").addEventListener("click", closeJobDialog);
element("job-form").addEventListener("submit", saveJob);
element("apply-job-install-rate").addEventListener("click", applyJobInstallationRate);
element("apply-job-rate-items").addEventListener("click", applyJobRateItems);
element("toggle-job-rate-other").addEventListener("click", toggleJobRateOtherItems);
element("job-subcontractor-code").addEventListener("change", () => renderJobSubcontractorStatus());
element("issue-subcontractor-job").addEventListener("click", issueSubcontractorJob);
element("job-dialog").addEventListener("click", (event) => {
  closeDialogFromBackdrop(event, closeJobDialog);
});
element("refresh-returns").addEventListener("click", loadReturns);
element("export-returns").addEventListener("click", exportReturns);
element("subcontractor-form").addEventListener("submit", saveSubcontractor);
element("clear-subcontractor-form").addEventListener("click", clearSubcontractorForm);
element("mail-connect-outlook").addEventListener("click", checkMailSettings);
element("mail-refresh").addEventListener("click", loadMailCandidates);
element("mail-run-import").addEventListener("click", runMailImport);
element("freshness-update").addEventListener("click", () => {
  openImportDialog(element("vehicle-filter").value);
});
element("close-import-dialog").addEventListener("click", closeImportDialog);
element("cancel-import").addEventListener("click", closeImportDialog);
element("import-dialog").addEventListener("click", (event) => {
  closeDialogFromBackdrop(event, closeImportDialog);
});
element("import-form").addEventListener("submit", submitImport);
element("import-vehicle").addEventListener("change", updateImportSubmitState);
element("import-csv").addEventListener("change", updateImportSubmitState);
element("import-pdf").addEventListener("change", updateImportSubmitState);
element("inspection-pdf").addEventListener("change", updateInspectionSubmitState);
element("inspection-expiration-date").addEventListener("change", updateInspectionSubmitState);
element("save-inspection-pdf").addEventListener("click", saveInspectionPdf);
element("open-inspection-pdf").addEventListener("click", openInspectionPdf);
element("apply-filters").addEventListener("click", loadDashboard);
element("reset-filters").addEventListener("click", resetFilters);
element("pdf-select").addEventListener("change", showPdf);
element("analyze-pdf").addEventListener("click", analyzePdf);
element("delete-pdf").addEventListener("click", openDeletePdfDialog);
element("cancel-delete-pdf").addEventListener("click", closeDeletePdfDialog);
element("confirm-delete-pdf").addEventListener("click", deleteSelectedPdf);
element("clear-selection").addEventListener("click", clearCertificateSelection);
element("show-selected-pdf").addEventListener("click", openCertificateSaveDialog);
element("close-certificate-save").addEventListener("click", closeCertificateSaveDialog);
element("cancel-certificate-save").addEventListener("click", closeCertificateSaveDialog);
element("certificate-save-form").addEventListener("submit", showSelectedCertificates);
element("certificate-save-dialog").addEventListener("click", (event) => {
  closeDialogFromBackdrop(event, closeCertificateSaveDialog);
});
element("create-submission").addEventListener("click", openSubmissionSaveDialog);
element("close-submission-save").addEventListener("click", closeSubmissionSaveDialog);
element("cancel-submission-save").addEventListener("click", closeSubmissionSaveDialog);
element("submission-save-form").addEventListener("submit", createSubmissionPdf);
element("submission-save-dialog").addEventListener("click", (event) => {
  closeDialogFromBackdrop(event, closeSubmissionSaveDialog);
});
for (const id of [
  "submission-title",
  "submission-technician",
  "submission-date-from",
  "submission-date-to",
  "submission-work-numbers",
]) {
  element(id).addEventListener("input", updateSubmissionPanel);
  element(id).addEventListener("change", updateSubmissionPanel);
}
element("page-size").addEventListener("change", (event) => {
  state.pageSize = Number(event.target.value) || 20;
  state.currentPage = 1;
  renderTable(state.records);
});
element("previous-page").addEventListener("click", () => {
  state.currentPage -= 1;
  renderTable(state.records);
});
element("next-page").addEventListener("click", () => {
  state.currentPage += 1;
  renderTable(state.records);
});
element("open-vehicle-settings").addEventListener("click", openVehicleSettings);
element("close-vehicle-settings").addEventListener("click", closeVehicleSettings);
element("cancel-vehicle-settings").addEventListener("click", closeVehicleSettings);
element("vehicle-settings-form").addEventListener("submit", saveVehicleSettings);
element("account-avatar-button").addEventListener("click", openAvatarPicker);
element("account-avatar-input").addEventListener("change", uploadAccountAvatar);
element("logout-button").addEventListener("click", logout);
element("open-admin-settings").addEventListener("click", openAdminSettings);
element("close-admin-settings").addEventListener("click", closeAdminSettings);
element("password-form").addEventListener("submit", changePassword);
element("create-user-form").addEventListener("submit", createUserAccount);
element("mail-settings-form").addEventListener("submit", saveMailSettings);
element("storage-settings-form").addEventListener("submit", saveStorageSettings);
element("check-storage-settings").addEventListener("click", checkStorageSettings);
element("refresh-audit-log").addEventListener("click", loadAuditLog);
element("login-form").addEventListener("submit", submitLogin);
element("open-password-reset").addEventListener("click", openPasswordResetDialog);
element("close-password-reset").addEventListener("click", closePasswordResetDialog);
element("cancel-password-reset").addEventListener("click", closePasswordResetDialog);
element("password-reset-form").addEventListener("submit", submitPasswordReset);
element("password-reset-dialog").addEventListener("click", (event) => {
  if (event.target === element("password-reset-dialog")) closePasswordResetDialog();
});
element("daily-spimaru").addEventListener("click", foundDailySpimaru);
element("close-spimaru-greeting").addEventListener("click", closeDailySpimaruGreeting);
element("spimaru-greeting").addEventListener("click", (event) => {
  if (event.target === element("spimaru-greeting")) closeDailySpimaruGreeting();
});
window.addEventListener("resize", placeDailySpimaru);
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeDailySpimaruGreeting();
});

async function initializeApp() {
  const authenticated = await loadSession();
  if (authenticated) {
    await Promise.all([loadLogisticsJobs(), loadDashboard(), loadMailSettings(), loadMailImports()]);
    setModule("logistics");
  }
}

initializeApp();
