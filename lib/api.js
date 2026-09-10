export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiRequest(path, options = {}) {
  const headers = {
    Accept: "application/json",
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(path, {
    ...options,
    headers,
    credentials: "include",
    cache: "no-store"
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new ApiError(payload.error || "通信に失敗しました", response.status);
  }

  return payload;
}

export function getSession() {
  return apiRequest("/api/session");
}

export function login(id, password) {
  return apiRequest("/api/login", {
    method: "POST",
    body: JSON.stringify({ user_id: id, password })
  });
}

export function logout() {
  return apiRequest("/api/logout", { method: "POST" });
}

export function getDashboard(filters = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return apiRequest(`/api/dashboard${query ? `?${query}` : ""}`);
}

export function getInventory() {
  return apiRequest(`/api/inventory?_=${Date.now()}`);
}

export function saveInventoryProduct(product) {
  return apiRequest("/api/inventory/products", {
    method: "POST",
    body: JSON.stringify(product)
  });
}

export function deleteInventoryProduct(id) {
  return apiRequest("/api/inventory/products/delete", { method: "POST", body: JSON.stringify({ id }) });
}

export function receiveInventory(payload, isReturn = false) {
  return apiRequest(isReturn ? "/api/inventory/return" : "/api/inventory/receive", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function adjustInventory(payload) {
  return apiRequest("/api/inventory/adjust", { method: "POST", body: JSON.stringify(payload) });
}

export function reserveInventory(payload) {
  return apiRequest("/api/inventory/reservations", { method: "POST", body: JSON.stringify(payload) });
}
