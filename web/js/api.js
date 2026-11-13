// Thin fetch wrapper for the FitNova JSON API. The profile token is the only thing kept on the device.
const TOKEN_KEY = "fitnova.token";

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(t) {
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* storage blocked */ }
}

export class ApiError extends Error {
  constructor(status, body) {
    const err = (body && body.error) || {};
    super(err.message || `Request failed (${status})`);
    this.status = status;
    this.code = err.code || "error";
    this.fields = err.fields || {};
    this.data = err;
  }
}

/** Local calendar date YYYY-MM-DD (not UTC). */
export function localToday(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export async function api(method, path, body) {
  const headers = { Accept: "application/json" };
  const token = getToken();
  if (token) headers["X-User-Token"] = token;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let res;
  try {
    res = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(0, { error: { code: "network", message: "Can't reach the FitNova server. Check that it is running." } });
  }
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const e = new ApiError(res.status, data);
    if (res.status === 401) window.dispatchEvent(new CustomEvent("fitnova:auth-lost"));
    throw e;
  }
  return data;
}

export const get = (p) => api("GET", p);
export const post = (p, b) => api("POST", p, b ?? {});
export const put = (p, b) => api("PUT", p, b ?? {});
export const patch = (p, b) => api("PATCH", p, b ?? {});
export const del = (p) => api("DELETE", p);

/** Broadcast that workout/vitals data changed so open views can refresh. */
export function notifyChange(kind) {
  window.dispatchEvent(new CustomEvent("fitnova:data-changed", { detail: { kind } }));
}
