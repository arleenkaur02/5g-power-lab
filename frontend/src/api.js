import { localBenchmarks, localCompare, localCsv, localSimulate } from "./clientModel.js";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
    ...options,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with ${response.status}`);
  }

  return response;
}

export async function simulateScenario(payload) {
  try {
    const response = await request("/api/simulate", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return response.json();
  } catch {
    return localSimulate(payload);
  }
}

export async function compareScenario(payload) {
  try {
    const response = await request("/api/compare", {
      method: "POST",
      body: JSON.stringify({ ...payload, rats: ["LTE", "5G_NR"] }),
    });
    return response.json();
  } catch {
    return localCompare(payload);
  }
}

export async function getBenchmarks() {
  try {
    const response = await request("/api/benchmarks");
    return response.json();
  } catch {
    return localBenchmarks();
  }
}

export async function exportCsv(payload) {
  let blob;
  try {
    const response = await request("/api/export.csv", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    blob = await response.blob();
  } catch {
    blob = new Blob([localCsv(payload)], { type: "text/csv" });
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "5g_power_lab_report.csv";
  link.click();
  URL.revokeObjectURL(url);
}
