"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  OcMessage,
  OcPart,
  OcPermission,
  OcStatus,
} from "@/lib/opencode-types";

/**
 * The OpenCode chat — live, and pilotable.
 *
 * OpenCode runs as a client/server: the TUI talks to a background service
 * that owns the sessions, the tools and the permissions. This panel is a
 * *second* client of that service — it shows the conversations as they are
 * written and lets the operator drive them (send a message, interrupt,
 * switch model or agent, answer a permission request).
 *
 * Three rules it obeys:
 *
 * 1. **It is locked by default.** The server refuses every call unless
 *    `OPENCODE_KEY` is configured *and* the browser presents that key. The
 *    key stays in this browser (`localStorage`); it is never in the URL, in
 *    the repository, or in a commit.
 * 2. **It reads the service, it does not replace it.** Everything shown here
 *    is what the service already has: the same sessions the TUI shows.
 * 3. **It polls like the rest of the dashboard** (1 s for the thread, 3 s
 *    for the state), so a dropped connection is a dropped poll, not a
 *    broken page.
 */

const KEY_STORAGE = "bh.opencode.key";

/* ── small helpers ─────────────────────────────────────────────────────── */

function relTime(ms?: number): string {
  if (!ms) return "—";
  const d = Date.now() - ms;
  if (d < 60_000) return `il y a ${Math.max(1, Math.round(d / 1000))} s`;
  if (d < 3_600_000) return `il y a ${Math.round(d / 60_000)} min`;
  if (d < 86_400_000) return `il y a ${Math.round(d / 3_600_000)} h`;
  return `il y a ${Math.round(d / 86_400_000)} j`;
}

function int(x?: number | null): string {
  if (x === null || x === undefined) return "—";
  return Math.round(x).toLocaleString("fr-FR");
}

function compactTokens(x?: number | null): string {
  if (x === null || x === undefined) return "—";
  if (x >= 1_000_000) return `${(x / 1_000_000).toFixed(1)} M`;
  if (x >= 1_000) return `${(x / 1_000).toFixed(1)} k`;
  return String(Math.round(x));
}

/** what a tool was asked to do — one line, truncated */
function toolInput(part: OcPart): string {
  const input = part.state?.input as
    | { command?: string; filePath?: string; path?: string; pattern?: string }
    | undefined;
  if (!input) return "";
  if (typeof input.command === "string") return input.command;
  if (typeof input.filePath === "string") return input.filePath;
  if (typeof input.path === "string") return input.path;
  if (typeof input.pattern === "string") return input.pattern;
  try {
    return JSON.stringify(input).slice(0, 220);
  } catch {
    return "";
  }
}

function toolTone(status?: string): string {
  if (status === "error") return "text-bad";
  if (status === "completed") return "text-good";
  if (status === "running" || status === "streaming") return "text-accent";
  return "text-faint";
}

/* ── the pieces ────────────────────────────────────────────────────────── */

function ToolPart({ part }: { part: OcPart }) {
  const input = toolInput(part);
  const output = part.state?.output ?? "";
  const error = part.state?.error ?? "";
  return (
    <div className="mt-1.5 overflow-hidden rounded-lg border border-line/80 bg-[#0a0d13]/70">
      <div className="flex items-center gap-2 border-b border-line/70 px-2.5 py-1.5">
        <span className="rounded bg-white/[0.06] px-1.5 py-[1px] font-mono text-[9.5px] text-dim">
          {part.name ?? "outil"}
        </span>
        <span className={`font-mono text-[9px] ${toolTone(part.state?.status)}`}>
          {part.state?.status ?? "—"}
        </span>
        {part.state?.title ? (
          <span className="truncate font-mono text-[9px] text-faint">
            {part.state.title}
          </span>
        ) : null}
      </div>
      {input ? (
        <pre className="overflow-x-auto whitespace-pre-wrap break-words px-2.5 py-1.5 font-mono text-[10px] leading-relaxed text-dim">
          {input}
        </pre>
      ) : null}
      {error ? (
        <pre className="overflow-x-auto whitespace-pre-wrap break-words border-t border-line/70 px-2.5 py-1.5 font-mono text-[10px] leading-relaxed text-bad/90">
          {error}
        </pre>
      ) : output ? (
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words border-t border-line/70 px-2.5 py-1.5 font-mono text-[10px] leading-relaxed text-faint">
          {output}
        </pre>
      ) : null}
    </div>
  );
}

function Message({
  message,
  showReasoning,
}: {
  message: OcMessage;
  showReasoning: boolean;
}) {
  /* the service says what happened at the end of a run — a failed provider,
     a cancelled turn, a quota. It is shown as it is: an error is a fact,
     not a decoration. */
  if (message.type === "idle") {
    const failed = message.outcome && message.outcome !== "succeeded";
    return (
      <div className="flex items-center gap-2 text-[10px] text-faint">
        <span className="h-px flex-1 bg-line/70" />
        <span>
          {message.outcome ?? "inactif"}
          {message.error?.message ? ` — ${message.error.message}` : ""}
        </span>
        <span className="h-px flex-1 bg-line/70" />
        {failed ? <span className="text-bad">✕</span> : null}
      </div>
    );
  }

  if (message.type === "user") {
    return (
      <div className="border-l-2 border-accent/60 pl-3">
        <div className="flex items-baseline gap-2 text-[9px] uppercase tracking-[0.12em] text-faint">
          <span>vous</span>
          <span className="num normal-case tracking-normal">
            {relTime(message.time?.created)}
          </span>
        </div>
        <p className="mt-1 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-ink">
          {message.text}
        </p>
      </div>
    );
  }

  const parts = message.content ?? [];
  const texts = parts.filter((p) => p.type === "text" && p.text);
  const reasoning = parts.filter((p) => p.type === "reasoning" && p.text);
  const tools = parts.filter((p) => p.type === "tool");
  const streaming = !message.time?.completed;

  return (
    <div className="border-l-2 border-white/[0.08] pl-3">
      <div className="flex items-baseline gap-2 text-[9px] uppercase tracking-[0.12em] text-faint">
        <span>{message.agent ?? "opencode"}</span>
        {message.model ? (
          <span className="font-mono normal-case tracking-normal">
            {message.model.providerID}/{message.model.id}
          </span>
        ) : null}
        <span className="num normal-case tracking-normal">
          {relTime(message.time?.created)}
        </span>
        {streaming ? (
          <span className="flex items-center gap-1 normal-case tracking-normal text-accent">
            <span className="pulse" style={{ background: "#38bdf8" }} />
            en cours
          </span>
        ) : null}
      </div>

      {reasoning.length ? (
        showReasoning ? (
          <div className="mt-1 rounded-lg border border-line/70 bg-[#0a0d13]/50 px-2.5 py-1.5">
            <div className="mb-1 text-[9px] uppercase tracking-[0.1em] text-faint">
              raisonnement
            </div>
            {reasoning.map((p, i) => (
              <p
                key={i}
                className="whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-faint"
              >
                {p.text}
              </p>
            ))}
          </div>
        ) : (
          <div className="mt-1 text-[10px] text-faint">
            raisonnement masqué
          </div>
        )
      ) : null}

      {texts.map((p, i) => (
        <p
          key={i}
          className="mt-1 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-ink"
        >
          {p.text}
        </p>
      ))}

      {tools.map((p, i) => (
        <ToolPart key={p.id ?? i} part={p} />
      ))}

      {message.error?.message ? (
        <p className="mt-1.5 rounded-lg border border-bad/45 bg-bad/[0.06] px-2.5 py-1.5 text-[11px] leading-relaxed text-bad/90">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.1em]">
            {message.error.type ?? "erreur"}
            {message.error.status ? ` · ${message.error.status}` : ""}
          </span>
          <br />
          {message.error.message}
        </p>
      ) : null}
    </div>
  );
}

function PermissionCard({
  permission,
  onReply,
  busy,
}: {
  permission: OcPermission;
  onReply: (decision: "once" | "always" | "reject") => void;
  busy: boolean;
}) {
  return (
    <div className="rounded-lg border border-warn/45 bg-warn/[0.06] px-3 py-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[11.5px] font-medium text-warn">
          permission demandée
        </span>
        <span className="num rounded bg-warn/15 px-1.5 py-[1px] text-[10px] text-warn">
          {permission.action}
        </span>
        {permission.resources?.length ? (
          <span className="truncate font-mono text-[9.5px] text-faint">
            {permission.resources.join(" · ")}
          </span>
        ) : null}
      </div>
      {permission.message ? (
        <p className="mt-1 text-[11px] leading-relaxed text-dim">
          {permission.message}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          disabled={busy}
          onClick={() => onReply("once")}
          className="rounded-full border border-good/45 bg-good/[0.08] px-2.5 py-1 text-[10px] text-good transition-colors hover:bg-good/15 disabled:opacity-40"
        >
          une fois
        </button>
        <button
          disabled={busy}
          onClick={() => onReply("always")}
          className="rounded-full border border-accent/45 bg-accent/[0.08] px-2.5 py-1 text-[10px] text-accent transition-colors hover:bg-accent/15 disabled:opacity-40"
        >
          toujours
        </button>
        <button
          disabled={busy}
          onClick={() => onReply("reject")}
          className="rounded-full border border-bad/45 bg-bad/[0.08] px-2.5 py-1 text-[10px] text-bad transition-colors hover:bg-bad/15 disabled:opacity-40"
        >
          refuser
        </button>
      </div>
    </div>
  );
}

/* ── the panel ─────────────────────────────────────────────────────────── */

export default function OpenCodeChat() {
  const [key, setKey] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [status, setStatus] = useState<OcStatus | null>(null);
  const [locked, setLocked] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [sessionID, setSessionID] = useState<string | null>(null);
  const [messages, setMessages] = useState<OcMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [filter, setFilter] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showReasoning, setShowReasoning] = useState(false);
  const [polls, setPolls] = useState(0);
  const bottom = useRef<HTMLDivElement | null>(null);

  const authorized = Boolean(key) && !locked && !disabled;

  /* ── the key lives in this browser, nowhere else ─────────────────────── */
  useEffect(() => {
    const saved = window.localStorage.getItem(KEY_STORAGE);
    if (saved) {
      setKey(saved);
      setKeyInput(saved);
    }
  }, []);

  const call = useCallback(
    async (path: string, init?: RequestInit) => {
      const res = await fetch(path, {
        ...init,
        headers: {
          "content-type": "application/json",
          "x-opencode-key": key,
          ...(init?.headers ?? {}),
        },
        cache: "no-store",
      });
      const text = await res.text();
      let body: unknown = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = null;
      }
      if (!res.ok) {
        const msg =
          (body as { error?: string } | null)?.error ?? `HTTP ${res.status}`;
        const err = new Error(msg);
        (err as Error & { status?: number }).status = res.status;
        throw err;
      }
      return body;
    },
    [key],
  );

  /* ── the state of the service ───────────────────────────────────────── */
  const refresh = useCallback(async () => {
    if (!key) return;
    try {
      const body = (await call("/api/opencode")) as OcStatus;
      setStatus(body);
      setLocked(false);
      setDisabled(false);
      setPolls((n) => n + 1);
      setSessionID((current) => {
        if (current && body.sessions?.some((s) => s.id === current)) return current;
        return body.sessions?.[0]?.id ?? null;
      });
    } catch (e) {
      const status = (e as Error & { status?: number }).status;
      if (status === 401) setLocked(true);
      else if (status === 503) setDisabled(true);
      else {
        setStatus((s) => ({
          ...(s ?? { enabled: true, authorized: true }),
          error: e instanceof Error ? e.message : String(e),
        }));
      }
    }
  }, [call, key]);

  useEffect(() => {
    if (!key) return;
    void refresh();
  }, [key, refresh]);

  /* the state every 3 s — the service's own view */
  useEffect(() => {
    if (!authorized) return;
    const t = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, 3000);
    return () => window.clearInterval(t);
  }, [authorized, refresh]);

  /* the thread every second — the dashboard's cadence */
  useEffect(() => {
    if (!authorized || !sessionID) return;
    let alive = true;
    const tick = async () => {
      /* un onglet en arrière-plan n'a besoin de rien : on ne brûle pas le
         service (et le trainer) pour un fil que personne ne regarde */
      if (document.hidden) return;
      try {
        const body = (await call(
          `/api/opencode/messages?session=${encodeURIComponent(sessionID)}`,
        )) as { messages: OcMessage[] };
        if (alive) setMessages(body.messages ?? []);
      } catch {
        /* a dropped poll is not an error to shout about */
      }
    };
    void tick();
    const t = window.setInterval(() => void tick(), 1000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [authorized, sessionID, call]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length, sessionID]);

  /* ── the pilot's actions ────────────────────────────────────────────── */
  const act = useCallback(
    async (body: Record<string, unknown>, ok?: string) => {
      setSending(true);
      setNotice(null);
      try {
        await call("/api/opencode", { method: "POST", body: JSON.stringify(body) });
        if (ok) setNotice(ok);
        await refresh();
      } catch (e) {
        setNotice(e instanceof Error ? e.message : String(e));
      } finally {
        setSending(false);
      }
    },
    [call, refresh],
  );

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || !sessionID) return;
    setDraft("");
    await act({ action: "prompt", sessionID, text }, "message envoyé");
  }, [act, draft, sessionID]);

  const openKey = useCallback(
    (value: string) => {
      const v = value.trim();
      if (!v) return;
      window.localStorage.setItem(KEY_STORAGE, v);
      setKey(v);
      setKeyInput(v);
      setLocked(false);
    },
    [],
  );

  const sessions = useMemo(() => {
    const all = status?.sessions ?? [];
    const f = filter.trim().toLowerCase();
    return f
      ? all.filter((s) => (s.title ?? "").toLowerCase().includes(f))
      : all;
  }, [filter, status?.sessions]);

  const permissions = useMemo(
    () =>
      (status?.permissions ?? []).filter(
        (p) => !sessionID || p.sessionID === sessionID,
      ),
    [sessionID, status?.permissions],
  );

  const current = useMemo(
    () => sessions.find((s) => s.id === sessionID) ?? null,
    [sessionID, sessions],
  );

  const busy = useMemo(() => {
    const last = messages[messages.length - 1];
    if (!last) return false;
    if (last.type === "assistant") return !last.time?.completed;
    if (last.type === "user") {
      /* a user message that no assistant has answered yet */
      const born = last.time?.created ?? 0;
      return !messages.some(
        (m) => m.type === "assistant" && (m.time?.created ?? 0) > born,
      );
    }
    return false;
  }, [messages]);

  /* ── the gate ───────────────────────────────────────────────────────── */
  const gate = (() => {
    if (!key) {
      return {
        title: "Poste verrouillé",
        body: "Le poste de pilotage parle au service OpenCode de cette machine — un agent qui peut exécuter des commandes. Il est fermé par défaut : la clé se saisit ici, elle reste dans ce navigateur (localStorage), elle n'est ni dans le dépôt ni dans l'URL.",
        action: "ouvrir",
      };
    }
    if (disabled) {
      return {
        title: "Poste désactivé sur ce déploiement",
        body:
          status?.error ??
          "OPENCODE_KEY n'est pas défini dans l'environnement du dashboard : le poste reste fermé. Sur une installation publique (Vercel), c'est le comportement voulu.",
        action: null,
      };
    }
    if (locked) {
      return {
        title: "Clé refusée",
        body: "La clé présentée n'est pas celle du serveur. Elle doit correspondre à OPENCODE_KEY, dans l'environnement du dashboard.",
        action: "réessayer",
      };
    }
    if (status?.error) {
      return {
        title: "Service OpenCode injoignable",
        body: status.error,
        action: "réessayer",
      };
    }
    return null;
  })();

  return (
    <div className="space-y-3">
      {/* ── the state of the service ───────────────────────────────────── */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className={`pulse ${authorized && !status?.error ? "" : "pulse-static"}`}
              style={{ background: authorized && !status?.error ? "#34d399" : "#fbbf24" }}
            />
            <span className="text-[12.5px] font-medium text-ink">
              Poste de pilotage OpenCode
            </span>
            <span className="chip !px-2 !text-[9.5px]">
              service {status?.service?.version ?? "—"}
            </span>
            {status?.service?.pid ? (
              <span className="chip !px-2 !text-[9.5px]">pid {status.service.pid}</span>
            ) : null}
            {status?.directory ? (
              <span className="chip !px-2 !text-[9.5px]" title="répertoire de travail">
                {status.directory}
              </span>
            ) : null}
            <span className="num text-[9.5px] text-faint">
              {sessions.length} session{sessions.length > 1 ? "s" : ""} ·{" "}
              {polls} polls
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowReasoning((v) => !v)}
              className={`chip !px-2 !py-[3px] !text-[9.5px] ${
                showReasoning ? "!border-accent/45 !text-accent" : ""
              }`}
              title="afficher ou masquer le raisonnement de l'agent"
            >
              raisonnement {showReasoning ? "on" : "off"}
            </button>
            <button
              onClick={() => void refresh()}
              className="chip !px-2 !py-[3px] !text-[9.5px] hover:!border-accent/45 hover:!text-accent"
            >
              ⟳ rafraîchir
            </button>
          </div>
        </div>

        <p className="mt-2 text-[10.5px] leading-relaxed text-faint">
          Ce poste pilote l&apos;agent <strong className="text-dim">OpenCode</strong>{" "}
          de cette machine : il lit les sessions du service, envoie des
          messages, interrompt, change de modèle ou d&apos;agent et répond aux
          demandes de permission. Il ne touche ni au trainer, ni aux
          artefacts, ni à la documentation — un run en cours reste un run en
          cours.
        </p>

        {notice ? (
          <p className="mt-2 rounded-lg border border-line bg-[#0a0d13]/60 px-2.5 py-1.5 font-mono text-[10px] text-warn">
            {notice}
          </p>
        ) : null}
      </div>

      {/* ── the gate ───────────────────────────────────────────────────── */}
      {gate ? (
        <div className="card border-warn/35 p-4">
          <div className="text-[12.5px] font-medium text-warn">{gate.title}</div>
          <p className="mt-1 max-w-3xl text-[11.5px] leading-relaxed text-dim">
            {gate.body}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") openKey(keyInput);
              }}
              placeholder="clé du poste (OPENCODE_KEY)"
              className="min-w-[220px] flex-1 rounded-lg border border-line bg-[#0a0d13] px-3 py-1.5 font-mono text-[11px] text-ink outline-none focus:border-accent/45"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              onClick={() => openKey(keyInput)}
              disabled={!keyInput.trim()}
              className="rounded-full border border-accent/45 bg-accent/[0.08] px-3 py-1.5 text-[10.5px] text-accent transition-colors hover:bg-accent/15 disabled:opacity-40"
            >
              {gate.action ?? "connecter"}
            </button>
          </div>
          <p className="mt-2 font-mono text-[9.5px] text-faint">
            pour ouvrir le poste : OPENCODE_KEY=… dans l&apos;environnement du
            dashboard, puis <span className="text-dim">opencode service status</span>{" "}
            doit answered le service local
          </p>
        </div>
      ) : null}

      {/* ── the pilot ──────────────────────────────────────────────────── */}
      {authorized && !gate ? (
        <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
          {/* the sessions */}
          <div className="card flex max-h-[70vh] flex-col p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-[0.1em] text-faint">
                sessions
              </span>
              <button
                onClick={() =>
                  void act(
                    {
                      action: "session.create",
                      title: "Session du dashboard",
                      /* a new session starts on the model of the session
                         being watched — the one that is known to answer */
                      model: current?.model ?? undefined,
                    },
                    "session créée",
                  )
                }
                disabled={sending}
                className="chip !px-2 !py-[3px] !text-[9.5px] hover:!border-accent/45 hover:!text-accent disabled:opacity-40"
                title="créer une session dans le répertoire de travail"
              >
                + nouvelle
              </button>
            </div>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="filtrer par titre"
              className="mt-2 rounded-lg border border-line bg-[#0a0d13] px-2.5 py-1.5 text-[11px] text-ink outline-none focus:border-accent/45"
              spellCheck={false}
            />
            <ul className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
              {sessions.map((s) => {
                const active = s.id === sessionID;
                return (
                  <li key={s.id}>
                    <button
                      onClick={() => setSessionID(s.id)}
                      className={`w-full rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                        active
                          ? "border-accent/40 bg-accent/10"
                          : "border-transparent hover:border-line hover:bg-white/[0.03]"
                      }`}
                    >
                      <span className="block truncate text-[11.5px] text-ink">
                        {s.title ?? s.id}
                      </span>
                      <span className="num mt-0.5 flex flex-wrap items-center gap-x-2 text-[9px] text-faint">
                        <span>{relTime(s.time?.updated)}</span>
                        <span>{s.agent ?? "—"}</span>
                        <span>{compactTokens(s.tokens?.input)} in</span>
                        {s.outcome ? <span>{s.outcome}</span> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
              {!sessions.length ? (
                <li className="px-1 py-2 text-[10.5px] text-faint">
                  aucune session{locksFilter(filter) ? " pour ce filtre" : ""}
                </li>
              ) : null}
            </ul>
          </div>

          {/* the thread */}
          <div className="card flex max-h-[70vh] min-h-[520px] flex-col p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/70 pb-2">
              <div className="min-w-0">
                <div className="truncate text-[12.5px] font-medium text-ink">
                  {current?.title ?? "aucune session sélectionnée"}
                </div>
                <div className="num truncate text-[9.5px] text-faint">
                  {sessionID ?? "—"}
                  {current?.model
                    ? ` · ${current.model.providerID}/${current.model.id}`
                    : ""}
                  {current?.location ? ` · ${current.location}` : ""}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {current?.agent ? (
                  <select
                    value={current.agent}
                    onChange={(e) =>
                      void act(
                        { action: "agent", sessionID, agent: e.target.value },
                        "agent changé",
                      )
                    }
                    disabled={!sessionID || sending}
                    className="rounded-full border border-line bg-[#0a0d13] px-2 py-[3px] text-[9.5px] text-dim outline-none focus:border-accent/45 disabled:opacity-40"
                    title="agent de la session"
                  >
                    {(status?.agents ?? []).map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                    <option value={current.agent}>{current.agent}</option>
                  </select>
                ) : null}
                {current?.model ? (
                  <select
                    value={`${current.model.providerID}/${current.model.id}`}
                    onChange={(e) => {
                      const found = (status?.models ?? []).find(
                        (m) => `${m.providerID}/${m.id}` === e.target.value,
                      );
                      if (found) {
                        void act(
                          {
                            action: "model",
                            sessionID,
                            model: {
                              id: found.id,
                              providerID: found.providerID,
                              variant: found.variant,
                            },
                          },
                          "modèle changé",
                        );
                      }
                    }}
                    disabled={!sessionID || sending}
                    className="rounded-full border border-line bg-[#0a0d13] px-2 py-[3px] text-[9.5px] text-dim outline-none focus:border-accent/45 disabled:opacity-40"
                    title="modèle de la session"
                  >
                    {(status?.models ?? []).map((m) => (
                      <option
                        key={`${m.providerID}/${m.id}`}
                        value={`${m.providerID}/${m.id}`}
                      >
                        {m.name ?? m.id}
                      </option>
                    ))}
                    <option
                      value={`${current.model.providerID}/${current.model.id}`}
                    >
                      {current.model.id}
                    </option>
                  </select>
                ) : null}
                {busy ? (
                  <button
                    onClick={() =>
                      void act(
                        { action: "interrupt", sessionID },
                        "exécution interrompue",
                      )
                    }
                    disabled={sending}
                    className="rounded-full border border-bad/45 bg-bad/[0.08] px-2.5 py-[3px] text-[9.5px] text-bad transition-colors hover:bg-bad/15 disabled:opacity-40"
                  >
                    ❚❚ interrompre
                  </button>
                ) : null}
              </div>
            </div>

            {permissions.length ? (
              <div className="mt-2 space-y-2">
                {permissions.map((p) => (
                  <PermissionCard
                    key={p.id}
                    permission={p}
                    busy={sending}
                    onReply={(decision) =>
                      void act(
                        {
                          action: "permission",
                          sessionID: p.sessionID,
                          requestID: p.id,
                          decision,
                        },
                        `permission : ${decision}`,
                      )
                    }
                  />
                ))}
              </div>
            ) : null}

            {/* the thread */}
            <div className="mt-3 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
              {messages.map((m) => (
                <Message key={m.id} message={m} showReasoning={showReasoning} />
              ))}
              {!messages.length ? (
                <p className="text-[11px] text-faint">
                  {sessionID
                    ? "aucun message dans cette session — envoyez le premier."
                    : "choisissez une session à gauche."}
                </p>
              ) : null}
              <div ref={bottom} />
            </div>

            {/* the composer */}
            <div className="mt-3 border-t border-line/70 pt-3">
              {status?.commands?.length ? (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {status.commands.map((c) => (
                    <button
                      key={c.name}
                      disabled={!sessionID || sending}
                      title={c.description ?? undefined}
                      onClick={() =>
                        void act(
                          {
                            action: "command",
                            sessionID,
                            name: c.name,
                            text: draft.trim() || c.name,
                          },
                          `commande /${c.name}`,
                        )
                      }
                      className="rounded-full border border-line px-2 py-[3px] font-mono text-[9.5px] text-faint transition-colors hover:border-accent/45 hover:text-accent disabled:opacity-40"
                    >
                      /{c.name}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="flex items-end gap-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  rows={3}
                  placeholder={
                    sessionID
                      ? "écrire à l'agent… (Entrée pour envoyer, Maj+Entrée pour un saut de ligne)"
                      : "aucune session sélectionnée"
                  }
                  disabled={!sessionID}
                  className="min-h-[64px] flex-1 resize-y rounded-xl border border-line bg-[#0a0d13] px-3 py-2 text-[12px] leading-relaxed text-ink outline-none placeholder:text-faint focus:border-accent/45 disabled:opacity-50"
                />
                <button
                  onClick={() => void send()}
                  disabled={!sessionID || !draft.trim() || sending}
                  className="rounded-xl border border-accent/45 bg-accent/[0.1] px-3 py-2 text-[11px] text-accent transition-colors hover:bg-accent/20 disabled:opacity-40"
                >
                  {sending ? "envoi…" : "envoyer"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function locksFilter(filter: string): boolean {
  return filter.trim().length > 0;
}
