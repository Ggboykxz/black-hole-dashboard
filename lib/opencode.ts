import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { timingSafeEqual } from "node:crypto";

/**
 * The bridge to the local OpenCode service.
 *
 * OpenCode runs as a **client/server**: the TUI, the SDK and the HTTP API
 * all talk to a background service that owns the sessions, the tools and the
 * permissions. This module is the dashboard's thin client of that service —
 * it discovers it, authenticates against it, and forwards calls.
 *
 * Three rules govern it:
 *
 * 1. **The service password never leaves the server.** It is read at
 *    runtime from `OPENCODE_PASSWORD` or from OpenCode's own service file
 *    (`~/.config/opencode/service.json`); it is never written to the
 *    repository, never sent to the browser, never logged.
 * 2. **The dashboard's pilot is closed by default.** It only opens when
 *    `OPENCODE_KEY` is set in the dashboard's environment *and* the browser
 *    presents that key. The dashboard is published (GitHub, Vercel); an
 *    open channel to an agent that can run commands would be a shell with a
 *    web form.
 * 3. **The dashboard stays a reader of the artefacts.** Nothing here
 *    writes to the run, to the trainer, or to the artefacts — the pilot
 *    drives OpenCode, which is a different thing entirely.
 */

/** the header the browser presents to open the pilot */
export const OC_KEY_HEADER = "x-opencode-key";

/** the service is not reachable (no URL, no CLI, service down) */
export class OpenCodeUnavailable extends Error {}

let cachedUrl: { url: string; at: number } | null = null;
const URL_TTL_MS = 30_000;

let cachedPassword: { value: string | null; at: number } | null = null;
const PASSWORD_TTL_MS = 60_000;

/** is the pilot configured at all? */
export function pilotEnabled(): boolean {
  const key = process.env.OPENCODE_KEY;
  return typeof key === "string" && key.length > 0;
}

/** constant-time comparison of the key presented by the browser */
export function keyMatches(provided: string | null | undefined): boolean {
  const expected = process.env.OPENCODE_KEY;
  if (!expected || !provided) return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Where the agent works.
 *
 * `OPENCODE_DIRECTORY` wins; otherwise the dashboard follows the service's
 * own project (the directory of the session that is already running) rather
 * than guessing a path.
 */
export function workDir(fallback = "/content"): string {
  const env = process.env.OPENCODE_DIRECTORY;
  if (env) return env;
  return fallback;
}

/**
 * The URL of the background service.
 *
 * `OPENCODE_URL` if set; otherwise `opencode service status` — the
 * documented way to ask — whose answer is cached for 30 s so a one-second
 * poll does not spawn a process per second.
 */
export async function serviceUrl(): Promise<string | null> {
  const env = process.env.OPENCODE_URL;
  if (env) return env;
  if (cachedUrl && Date.now() - cachedUrl.at < URL_TTL_MS) return cachedUrl.url;

  const bin = process.env.OPENCODE_BIN ?? "opencode";
  const out = await new Promise<string>((resolve) => {
    try {
      execFile(bin, ["service", "status"], { timeout: 5000 }, (err, stdout) =>
        resolve(err ? "" : String(stdout ?? "")),
      );
    } catch {
      resolve("");
    }
  });
  const url = out
    .split(/\s+/)
    .map((t) => t.trim())
    .find((t) => /^https?:\/\//.test(t));
  if (url) cachedUrl = { url, at: Date.now() };
  return url ?? null;
}

/** the service password — read at runtime, never written anywhere */
async function servicePassword(): Promise<string | null> {
  const env = process.env.OPENCODE_PASSWORD;
  if (env) return env;
  if (cachedPassword && Date.now() - cachedPassword.at < PASSWORD_TTL_MS) {
    return cachedPassword.value;
  }
  let value: string | null = null;
  try {
    const raw = await readFile(
      join(homedir(), ".config", "opencode", "service.json"),
      "utf8",
    );
    const parsed = JSON.parse(raw) as { password?: unknown };
    if (typeof parsed.password === "string") value = parsed.password;
  } catch {
    value = null;
  }
  cachedPassword = { value, at: Date.now() };
  return value;
}

/** an authenticated call to the service */
export async function ocFetch(
  pathname: string,
  init: RequestInit = {},
): Promise<Response> {
  const base = await serviceUrl();
  if (!base) {
    throw new OpenCodeUnavailable(
      "service OpenCode introuvable — OPENCODE_URL absent et `opencode service status` ne répond pas",
    );
  }
  const pw = await servicePassword();
  const headers = new Headers(init.headers);
  if (!headers.has("accept")) headers.set("accept", "application/json");
  if (pw) {
    headers.set(
      "authorization",
      `Basic ${Buffer.from(`opencode:${pw}`).toString("base64")}`,
    );
  }
  return fetch(new URL(pathname, base), {
    ...init,
    headers,
    cache: "no-store",
  });
}

/** an authenticated call, parsed as JSON, with the service's own error text */
export async function ocJson<T>(pathname: string, init?: RequestInit): Promise<T> {
  const res = await ocFetch(pathname, init);
  const text = await res.text();
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = JSON.parse(text) as { message?: string };
      if (body?.message) detail = body.message;
    } catch {
      /* keep the status code */
    }
    throw new Error(`${pathname} → ${detail}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}

/* ── the shapes we read (a subset of the service's OpenAPI) ───────────── */

export type {
  OcAgent,
  OcCommand,
  OcMessage,
  OcModel,
  OcModelRef,
  OcPart,
  OcPermission,
  OcServiceInfo,
  OcSession,
} from "./opencode-types";

import type {
  OcAgent,
  OcCommand,
  OcMessage,
  OcModel,
  OcModelRef,
  OcPermission,
  OcServiceInfo,
  OcSession,
} from "./opencode-types";

/* ── the calls the dashboard makes ─────────────────────────────────────── */

export async function ocInfo(): Promise<OcServiceInfo> {
  return ocJson<OcServiceInfo>("/api/info");
}

export async function ocSessions(directory?: string): Promise<OcSession[]> {
  const q = new URLSearchParams({ limit: "50", order: "desc" });
  if (directory) q.set("directory", directory);
  const res = await ocJson<{ data: OcSession[] }>(`/api/session?${q}`);
  return res?.data ?? [];
}

/**
 * The sessions the service considers *running* right now.
 *
 * This is the signal the dashboard follows to know that the developer has
 * just resumed a session: the service marks it, the dashboard switches to
 * it without being told.
 */
export async function ocActiveSessions(): Promise<
  Record<string, { type: string }>
> {
  const res = await ocJson<{ data: Record<string, { type: string }> }>(
    "/api/session/active",
  );
  return res?.data ?? {};
}

export async function ocMessages(
  sessionID: string,
  limit = 40,
): Promise<OcMessage[]> {
  const q = new URLSearchParams({ limit: String(limit), order: "desc" });
  const res = await ocJson<{ data: OcMessage[] }>(
    `/api/session/${encodeURIComponent(sessionID)}/message?${q}`,
  );
  /* the service answers newest-first; the thread reads top-down */
  return (res?.data ?? []).slice().reverse();
}

export async function ocPermissions(
  directory?: string,
): Promise<OcPermission[]> {
  const q = new URLSearchParams();
  if (directory) q.set("directory", directory);
  const res = await ocJson<{ data: OcPermission[] }>(
    `/api/permission/request${q.toString() ? `?${q}` : ""}`,
  );
  return res?.data ?? [];
}

export async function ocAgents(directory?: string): Promise<OcAgent[]> {
  const q = new URLSearchParams();
  if (directory) q.set("directory", directory);
  const res = await ocJson<{ data: OcAgent[] }>(
    `/api/agent${q.toString() ? `?${q}` : ""}`,
  );
  return res?.data ?? [];
}

export async function ocModels(directory?: string): Promise<OcModel[]> {
  const q = new URLSearchParams();
  if (directory) q.set("directory", directory);
  const res = await ocJson<{ data: OcModel[] }>(
    `/api/model${q.toString() ? `?${q}` : ""}`,
  );
  return res?.data ?? [];
}

export async function ocCommands(directory?: string): Promise<OcCommand[]> {
  const q = new URLSearchParams();
  if (directory) q.set("directory", directory);
  const res = await ocJson<{ data: OcCommand[] }>(
    `/api/command${q.toString() ? `?${q}` : ""}`,
  );
  return res?.data ?? [];
}

/* ── the pilot's actions ──────────────────────────────────────────────── */

export async function ocCreateSession(
  title: string,
  directory: string,
  model?: { id: string; providerID: string; variant?: string },
): Promise<OcSession> {
  const res = await ocJson<{ data: OcSession }>("/api/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title,
      location: { directory },
      ...(model ? { model } : {}),
    }),
  });
  return res.data;
}

export async function ocPrompt(sessionID: string, text: string): Promise<void> {
  await ocJson(`/api/session/${encodeURIComponent(sessionID)}/prompt`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
}

export async function ocInterrupt(sessionID: string): Promise<void> {
  await ocJson(`/api/session/${encodeURIComponent(sessionID)}/interrupt`, {
    method: "POST",
  });
}

export async function ocReplyPermission(
  sessionID: string,
  requestID: string,
  decision: "once" | "always" | "reject",
  message?: string,
): Promise<void> {
  await ocJson(
    `/api/session/${encodeURIComponent(sessionID)}/permission/${encodeURIComponent(requestID)}/reply`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision, message: message ?? null }),
    },
  );
}

export async function ocSetModel(
  sessionID: string,
  model: OcModelRef,
): Promise<void> {
  await ocJson(`/api/session/${encodeURIComponent(sessionID)}/model`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model }),
  });
}

export async function ocSetAgent(
  sessionID: string,
  agent: string,
): Promise<void> {
  await ocJson(`/api/session/${encodeURIComponent(sessionID)}/agent`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agent }),
  });
}

export async function ocRunCommand(
  sessionID: string,
  name: string,
  text: string,
): Promise<void> {
  await ocJson(`/api/session/${encodeURIComponent(sessionID)}/command`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, text }),
  });
}
