import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "../../../lib/supabase";

export const dynamic = "force-dynamic";

function authorizationToken(request) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}

async function requireUser(request, supabase) {
  const token = authorizationToken(request);
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

async function documentPayload(supabase, documentKey, fallback) {
  const { data, error } = await supabase
    .from("app_documents")
    .select("payload")
    .eq("document_key", documentKey)
    .maybeSingle();
  if (error) throw error;
  return data?.payload ?? fallback;
}

function numberValue(value) {
  const parsed = Number(String(value ?? 0).replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function matchesFilters(record, filters) {
  const date = String(record.date_start || record.date || "");
  if (filters.date_from && date < filters.date_from) return false;
  if (filters.date_to && date > filters.date_to) return false;
  if (filters.vehicle && String(record.vehicle_number || "") !== filters.vehicle) return false;
  if (filters.status && String(record.status || "") !== filters.status) return false;
  return true;
}

function vehicleSummaries(vehicles, records) {
  const registry = vehicles && typeof vehicles === "object" && !Array.isArray(vehicles)
    ? vehicles
    : {};
  return Object.entries(registry).map(([vehicleNumber, stored]) => {
    const matching = records.filter(
      (record) => String(record.vehicle_number || "") === vehicleNumber
    );
    return {
      vehicle_number: vehicleNumber,
      display_name: stored?.display_name || "",
      driver_name: stored?.driver_name || "",
      card_number_last6: Array.isArray(stored?.card_suffixes)
        ? stored.card_suffixes[0] || ""
        : "",
      latest_date: matching.reduce(
        (latest, record) => Math.max(latest, String(record.date_start || "")),
        ""
      ),
      amount: matching.reduce((total, record) => total + numberValue(record.toll_fee), 0),
      count: matching.length
    };
  }).sort((left, right) => left.vehicle_number.localeCompare(right.vehicle_number, "ja"));
}

function payloadFor(records, vehicles, filters) {
  const filtered = records.filter((record) => matchesFilters(record, filters));
  const amount = filtered.reduce((total, record) => total + numberValue(record.toll_fee), 0);
  const dates = filtered.map((record) => String(record.date_start || record.date || "")).filter(Boolean).sort();
  const byDate = new Map();
  for (const record of filtered) {
    const date = String(record.date_start || record.date || "");
    if (!date) continue;
    byDate.set(date, (byDate.get(date) || 0) + numberValue(record.toll_fee));
  }
  return {
    records: filtered,
    summary: {
      amount,
      count: filtered.length,
      vehicles: new Set(filtered.map((record) => record.vehicle_number).filter(Boolean)).size,
      date_min: dates[0] || "",
      date_max: dates.at(-1) || "",
      daily: [...byDate.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, dailyAmount]) => ({ date, amount: dailyAmount }))
    },
    available_statuses: [...new Set(records.map((record) => record.status).filter(Boolean))].sort(),
    vehicle_summaries: vehicleSummaries(vehicles, records),
    files: []
  };
}

export async function GET(request) {
  try {
    const supabase = createAdminSupabaseClient();
    if (!(await requireUser(request, supabase))) {
      return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
    }
    const [storedRecords, vehicles] = await Promise.all([
      documentPayload(supabase, "usage_records", []),
      documentPayload(supabase, "vehicles", {})
    ]);
    const records = Array.isArray(storedRecords) ? storedRecords : [];
    const { searchParams } = new URL(request.url);
    return NextResponse.json(payloadFor(records, vehicles, {
      date_from: searchParams.get("date_from") || "",
      date_to: searchParams.get("date_to") || "",
      vehicle: searchParams.get("vehicle") || "",
      status: searchParams.get("status") || ""
    }));
  } catch (error) {
    console.error("Dashboard API failed", error);
    return NextResponse.json({ error: "ダッシュボードを読み込めませんでした。" }, { status: 500 });
  }
}
