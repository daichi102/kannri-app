"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  getInventory,
  getSession,
  receiveInventory,
  saveInventoryProduct
} from "../lib/api";

const emptyProduct = {
  jan_code: "",
  name: "",
  model: "",
  manufacturer: "AQUA",
  manufacturer_other: "",
  category: "洗濯機",
  category_other: "",
  notes: "",
  active: true
};

const movementLabels = {
  receive: "入庫",
  dispatch: "出庫",
  return: "返品",
  adjustment: "棚卸調整"
};

function formatDate(value, includeTime = false) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return String(value).replaceAll("-", "/");
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {})
  }).format(parsed);
}

function StockNumber({ label, value, tone = "" }) {
  return (
    <div className={`inventory-number ${tone}`}>
      <span>{label}</span>
      <strong>{Number(value || 0).toLocaleString("ja-JP")}</strong>
      <small>台</small>
    </div>
  );
}

export default function InventoryClient() {
  const [user, setUser] = useState(null);
  const [inventory, setInventory] = useState(null);
  const [activeView, setActiveView] = useState("stock");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [product, setProduct] = useState(emptyProduct);
  const [stockEntry, setStockEntry] = useState({ jan_code: "", quantity: 1, notes: "" });
  const [stockEntryType, setStockEntryType] = useState("receive");
  const scanRef = useRef(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [session, payload] = await Promise.all([getSession(), getInventory()]);
      setUser(session.user);
      setInventory(payload);
    } catch (exception) {
      if (exception instanceof ApiError && exception.status === 401) {
        window.location.href = "/";
        return;
      }
      setError(exception.message || "在庫情報を読み込めませんでした。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (activeView === "receive") scanRef.current?.focus();
  }, [activeView, stockEntryType]);

  const products = inventory?.products || [];
  const filteredProducts = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("ja-JP");
    if (!keyword) return products;
    return products.filter((item) =>
      [item.name, item.model, item.jan_code, item.manufacturer, item.category]
        .join(" ")
        .toLocaleLowerCase("ja-JP")
        .includes(keyword)
    );
  }, [products, search]);

  async function submitStock(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      await receiveInventory(stockEntry, stockEntryType === "return");
      setNotice(stockEntryType === "return" ? "返品を在庫へ戻しました。" : "入庫を現在庫へ反映しました。");
      setStockEntry({ jan_code: "", quantity: 1, notes: "" });
      const payload = await getInventory();
      setInventory(payload);
      requestAnimationFrame(() => scanRef.current?.focus());
    } catch (exception) {
      setError(exception.message || "在庫を更新できませんでした。");
    }
  }

  async function submitProduct(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      await saveInventoryProduct(product);
      setNotice(`${product.name}を商品マスターへ登録しました。`);
      setProduct(emptyProduct);
      setInventory(await getInventory());
    } catch (exception) {
      setError(exception.message || "商品を登録できませんでした。");
    }
  }

  function changeProduct(name, value) {
    setProduct((current) => ({ ...current, [name]: value }));
  }

  const summary = inventory?.summary || {};
  const reservations = inventory?.reservations || [];
  const movements = inventory?.movements || [];
  const activeReservations = reservations.filter((item) => item.status === "reserved");

  return (
    <main className="inventory-shell">
      <aside className="inventory-rail">
        <a className="inventory-brand" href="/">
          <span className="brand-mark">S</span>
          <span><small>SPEED ETC</small><strong>在庫管理</strong></span>
        </a>
        <nav aria-label="在庫管理メニュー">
          <button className={activeView === "stock" ? "active" : ""} onClick={() => setActiveView("stock")}>在庫一覧</button>
          <button className={activeView === "receive" ? "active" : ""} onClick={() => setActiveView("receive")}>入庫・返品</button>
          <button className={activeView === "planned" ? "active" : ""} onClick={() => setActiveView("planned")}>出庫予定</button>
          <button className={activeView === "history" ? "active" : ""} onClick={() => setActiveView("history")}>入出庫履歴</button>
          {user?.role === "admin" ? (
            <button className={activeView === "products" ? "active" : ""} onClick={() => setActiveView("products")}>商品登録</button>
          ) : null}
          <a className="inventory-settings-link" href="/settings">設定</a>
        </nav>
        <div className="inventory-rail-foot">
          <span>データ保存</span>
          <strong>{inventory?.backend === "cloud-sql-postgres" ? "Cloud SQL" : "ローカル"}</strong>
          <a href="/">ダッシュボードへ戻る</a>
        </div>
      </aside>

      <section className="inventory-main">
        <header className="inventory-header">
          <div>
            <p className="eyebrow">WAREHOUSE LEDGER</p>
            <h1>在庫管理</h1>
          </div>
          <button className="inventory-refresh" onClick={load} disabled={loading}>
            {loading ? "更新中…" : "最新の状態に更新"}
          </button>
        </header>

        {error ? <div className="inventory-alert error" role="alert">{error}</div> : null}
        {notice ? <div className="inventory-alert success" role="status">{notice}</div> : null}

        <section className="inventory-totals" aria-label="在庫集計">
          <StockNumber label="現在庫" value={summary.on_hand} />
          <StockNumber label="出庫予定" value={summary.reserved} tone="planned" />
          <StockNumber label="使用可能" value={summary.available} tone="available" />
          <StockNumber label="本日の出庫" value={summary.dispatched_today} tone="dispatched" />
        </section>

        {activeView === "stock" ? (
          <section className="inventory-panel">
            <div className="inventory-panel-heading">
              <div><span>商品別</span><h2>現在庫</h2></div>
              <label className="inventory-search">商品を検索<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="商品名・型番・JANコード" /></label>
            </div>
            <div className="stock-table-wrap">
              <table className="stock-table">
                <thead><tr><th>商品</th><th>メーカー / カテゴリー</th><th>現在庫</th><th>出庫予定</th><th>使用可能</th></tr></thead>
                <tbody>
                  {filteredProducts.map((item) => (
                    <tr key={item.id} className={!item.active ? "inactive" : ""}>
                      <td><strong>{item.name}</strong><span>{item.model}</span><code>{item.jan_code}</code></td>
                      <td>{item.manufacturer}{item.manufacturer_other ? `（${item.manufacturer_other}）` : ""}<span>{item.category}{item.category_other ? `（${item.category_other}）` : ""}</span></td>
                      <td className="quantity">{item.on_hand}</td>
                      <td className="quantity planned">{item.reserved}</td>
                      <td className={`quantity available ${item.available <= 0 ? "empty-stock" : ""}`}>{item.available}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!filteredProducts.length ? <div className="inventory-empty">商品がありません。管理者が商品を登録してください。</div> : null}
            </div>
          </section>
        ) : null}

        {activeView === "receive" ? (
          <section className="inventory-panel scan-panel">
            <div className="inventory-panel-heading"><div><span>SCAN DESK</span><h2>{stockEntryType === "return" ? "返品を在庫へ戻す" : "商品を入庫する"}</h2></div></div>
            <div className="entry-type-switch" role="group" aria-label="処理種別">
              <button className={stockEntryType === "receive" ? "active" : ""} onClick={() => setStockEntryType("receive")}>入庫</button>
              <button className={stockEntryType === "return" ? "active" : ""} onClick={() => setStockEntryType("return")}>返品</button>
            </div>
            <form className="scan-form" onSubmit={submitStock}>
              <label className="scan-field"><span>JANコード</span><input ref={scanRef} inputMode="numeric" autoComplete="off" value={stockEntry.jan_code} onChange={(event) => setStockEntry((current) => ({ ...current, jan_code: event.target.value }))} placeholder="スキャナーで読み取ってください" required /></label>
              <label><span>数量</span><input type="number" min="1" step="1" value={stockEntry.quantity} onChange={(event) => setStockEntry((current) => ({ ...current, quantity: event.target.value }))} required /></label>
              <label className="wide"><span>備考</span><input value={stockEntry.notes} onChange={(event) => setStockEntry((current) => ({ ...current, notes: event.target.value }))} placeholder="納品書番号など（任意）" /></label>
              <button type="submit">{stockEntryType === "return" ? "返品を反映" : "入庫を反映"}</button>
            </form>
            <p className="scan-hint">スキャナーがEnterを送信する設定なら、読み取り後そのまま処理できます。</p>
          </section>
        ) : null}

        {activeView === "planned" ? (
          <section className="inventory-panel">
            <div className="inventory-panel-heading"><div><span>SAGYOU-APP LINK</span><h2>出庫予定</h2></div><p>実際の持ち出し時にsagyou-appでJANコードを読み取ると出庫になります。</p></div>
            <div className="reservation-list">
              {activeReservations.map((item) => (
                <article key={item.id}>
                  <time>{formatDate(item.scheduled_date)}</time>
                  <div><strong>{item.product_name}</strong><span>{item.model} · JAN {item.jan_code}</span></div>
                  <div><small>作業番号</small><strong>{item.work_order_number}</strong></div>
                  <b>{item.quantity}台</b>
                </article>
              ))}
              {!activeReservations.length ? <div className="inventory-empty">現在、出庫予定はありません。</div> : null}
            </div>
          </section>
        ) : null}

        {activeView === "history" ? (
          <section className="inventory-panel">
            <div className="inventory-panel-heading"><div><span>AUDIT TRAIL</span><h2>入出庫履歴</h2></div></div>
            <div className="movement-list">
              {movements.map((item) => (
                <article key={item.id}>
                  <span className={`movement-type ${item.movement_type}`}>{movementLabels[item.movement_type] || item.movement_type}</span>
                  <div><strong>{item.product_name}</strong><small>{item.model} · {item.jan_code}</small></div>
                  <b className={Number(item.quantity) > 0 ? "plus" : "minus"}>{Number(item.quantity) > 0 ? "+" : ""}{item.quantity}</b>
                  <div><time>{formatDate(item.created_at, true)}</time><small>{item.created_by}</small></div>
                </article>
              ))}
              {!movements.length ? <div className="inventory-empty">入出庫履歴はまだありません。</div> : null}
            </div>
          </section>
        ) : null}

        {activeView === "products" && user?.role === "admin" ? (
          <section className="inventory-panel">
            <div className="inventory-panel-heading"><div><span>PRODUCT MASTER</span><h2>商品を登録</h2></div><p>在庫数は登録後に「入庫・返品」から反映します。</p></div>
            <form className="product-form" onSubmit={submitProduct}>
              <label><span>JANコード</span><input inputMode="numeric" value={product.jan_code} onChange={(event) => changeProduct("jan_code", event.target.value)} required /></label>
              <label><span>商品名</span><input value={product.name} onChange={(event) => changeProduct("name", event.target.value)} required /></label>
              <label><span>型番</span><input value={product.model} onChange={(event) => changeProduct("model", event.target.value)} required /></label>
              <label><span>メーカー</span><select value={product.manufacturer} onChange={(event) => changeProduct("manufacturer", event.target.value)}>{(inventory?.choices?.manufacturers || []).map((item) => <option key={item}>{item}</option>)}</select></label>
              {product.manufacturer === "その他" ? <label><span>メーカー名</span><input value={product.manufacturer_other} onChange={(event) => changeProduct("manufacturer_other", event.target.value)} /></label> : null}
              <label><span>カテゴリー</span><select value={product.category} onChange={(event) => changeProduct("category", event.target.value)}>{(inventory?.choices?.categories || []).map((item) => <option key={item}>{item}</option>)}</select></label>
              {product.category === "その他" ? <label><span>カテゴリー名</span><input value={product.category_other} onChange={(event) => changeProduct("category_other", event.target.value)} /></label> : null}
              <label className="wide"><span>備考</span><input value={product.notes} onChange={(event) => changeProduct("notes", event.target.value)} /></label>
              <button type="submit">商品を登録</button>
            </form>
          </section>
        ) : null}
      </section>
    </main>
  );
}
