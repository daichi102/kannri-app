import { createBrowserSupabaseClient } from "./supabase";

const localAuth = process.env.NEXT_PUBLIC_AUTH_MODE === "local";

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiRequest(path, options = {}) {
  let accessToken = "";
  if (!localAuth) {
    const supabase = createBrowserSupabaseClient();
    const { data: sessionData } = await supabase.auth.getSession();
    accessToken = sessionData.session?.access_token || "";
  }
  const headers = {
    Accept: "application/json",
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
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
  if (localAuth) return apiRequest("/api/session");
  return createBrowserSupabaseClient().auth.getUser().then(({ data, error }) => {
    if (error) throw new ApiError(error.message, 401);
    if (!data.user) throw new ApiError("ログインが必要です。", 401);
    return { user: publicUser(data.user) };
  });
}

export function login(id, password) {
  if (localAuth) {
    return apiRequest("/api/login", {
      method: "POST",
      body: JSON.stringify({ user_id: id, password })
    });
  }
  return createBrowserSupabaseClient().auth.signInWithPassword({ email: id, password })
    .then(({ data, error }) => {
      if (error) throw new ApiError(error.message, 401);
      return { user: publicUser(data.user) };
    });
}

export function logout() {
  if (localAuth) return apiRequest("/api/logout", { method: "POST" });
  return createBrowserSupabaseClient().auth.signOut();
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
  return apiRequest("/api/inventory");
}

export function saveInventoryProduct(product) {
  return apiRequest("/api/inventory/products", {
    method: "POST",
    body: JSON.stringify(product)
  });
}

export function receiveInventory(payload, isReturn = false) {
  return apiRequest(isReturn ? "/api/inventory/return" : "/api/inventory/receive", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

function publicUser(user) {
  return {
    id: user.email || user.id,
    role: user.app_metadata?.role || user.user_metadata?.role || "user"
  };
}
