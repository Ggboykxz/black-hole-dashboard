import { NextRequest, NextResponse } from "next/server";
import type { OcPermission } from "@/lib/opencode-types";
import {
  OC_KEY_HEADER,
  OpenCodeUnavailable,
  keyMatches,
  isLocalRequest,
  ocActiveSessions,
  ocAgents,
  ocCommands,
  ocCreateSession,
  ocInterrupt,
  ocInfo,
  ocJson,
  ocModels,
  ocPermissions,
  ocPrompt,
  ocReplyPermission,
  ocRunCommand,
  ocSessionPermissions,
  ocSessions,
  ocSetAgent,
  ocSetModel,
  pilotEnabled,
  workDir,
} from "@/lib/opencode";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * The pilot's endpoint.
 *
 * It is the **only** place where the dashboard can act instead of read, so
 * it is closed by default — but "closed by default" must not mean
 * "unusable by the person who owns the box".
 *
 * Two gates, and one of them is enough:
 *
 * * `OPENCODE_KEY` set → the browser must present that key. This is the
 *   mode for a deployment reachable from the network (Vercel, une machine
 *   exposée) : le dashboard est public, un canal vers un agent qui
 *   exécute des commandes serait une porte dérobée.
 * * `OPENCODE_KEY` absent → le poste s'ouvre **seulement pour les
 *   requêtes venant de la machine** (pas de `x-forwarded-for`, ou une IP
 *   de boucle). Sur la boîte qui entraîne, le proxy Colab se connecte
 *   localement : le site est donc utilisable tel quel, et l'opérateur
 *   écrit à l'agent sans ceremony.
 *
 * Le service garde toujours son mot de passe : il est ajouté côté serveur
 * et ne quitte jamais la machine.
 */

function denied(reason: string, status: number) {
  return NextResponse.json({ error: reason }, { status });
}

function unauthorized() {
  return NextResponse.json(
    { error: "clé absente ou incorrecte — le poste de pilotage est verrouillé" },
    { status: 401 },
  );
}

/**
 * May this request use the pilot?
 *
 * Returns the mode it was granted in, or an error to answer with.
 */
function gate(req: NextRequest): { mode: "key" | "local" } | { error: string; status: number } {
  if (pilotEnabled()) {
    return keyMatches(req.headers.get(OC_KEY_HEADER))
      ? { mode: "key" }
      : { error: "clé absente ou incorrecte — le poste de pilotage est verrouillé", status: 401 };
  }
  /* no key configured: the pilot opens on the box itself */
  if (isLocalRequest(req.headers)) return { mode: "local" };
  return {
    error:
      "le poste de pilotage n'est ouvert que depuis la machine — définis OPENCODE_KEY pour l'ouvrir à distance",
    status: 503,
  };
}

export async function GET(req: NextRequest) {
  const g = gate(req);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  /* The environments differ: the session the dashboard follows may live in
     another directory than the default one. The caller says which session
     it follows and where it lives — the per-location calls (agents,
     modèles, commandes, permissions) are asked for *that* location. */
  const followed = req.nextUrl.searchParams.get("session") ?? "";
  const location = req.nextUrl.searchParams.get("location") || workDir();

  try {
    const [info, sessions, agents, models, commands, permissions, active, own] =
      await Promise.all([
        ocInfo(),
        ocSessions(),
        ocAgents(location),
        ocModels(location),
        ocCommands(location),
        ocPermissions(location),
        ocActiveSessions(),
        followed
          ? ocSessionPermissions(followed).catch(() => [] as OcPermission[])
          : Promise.resolve([] as OcPermission[]),
      ]);

    /* The session the service considers *running* right now: this is how
       the dashboard knows the developer has just resumed a session, in
       whatever environment it lives. Everything else is a fallback. */
    const byUpdated = (
      a: (typeof sessions)[number],
      b: (typeof sessions)[number],
    ) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0);
    const running = sessions.filter((s) => active[s.id]).sort(byUpdated);
    const activeSessionID = running[0]?.id ?? null;

    /* the permissions of the followed session come first; the global list
       may still hold requests from another environment */
    const allPermissions = [...own, ...permissions].filter(
      (p, i, arr) => arr.findIndex((q) => q.id === p.id) === i,
    );

    return NextResponse.json({
      enabled: true,
      authorized: true,
      mode: g.mode,
      directory: location,
      service: { ...info, url: info.urls?.[0] ?? null },
      active,
      activeSessionID,
      sessions: sessions.map((s) => ({
        id: s.id,
        title: s.title ?? s.id,
        agent: s.agent ?? null,
        model: s.model ?? null,
        tokens: s.tokens ?? null,
        cost: s.cost ?? null,
        time: s.time ?? null,
        location: s.location?.directory ?? null,
        outcome: s.outcome ?? null,
        running: Boolean(active[s.id]),
        runningType: active[s.id]?.type ?? null,
      })),
      agents: agents
        .filter((a) => !a.hidden)
        .map((a) => ({
          id: a.id,
          name: a.name,
          description: a.description ?? null,
          mode: a.mode ?? null,
          model: a.model ?? null,
        })),
      models: models.map((m) => ({
        id: m.id,
        providerID: m.providerID,
        variant: m.variant,
        name: m.name ?? m.id,
      })),
      commands: commands.map((c) => ({
        name: c.name,
        description: c.description ?? null,
      })),
      permissions: allPermissions.map((p) => ({
        id: p.id,
        sessionID: p.sessionID,
        action: p.action,
        resources: p.resources ?? [],
        message: p.message ?? null,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status =
      e instanceof OpenCodeUnavailable ? 503 : 502;
    return NextResponse.json(
      {
        enabled: true,
        authorized: true,
        error: msg,
        service: { reachable: false },
      },
      { status },
    );
  }
}

interface ActionBody {
  action?: string;
  sessionID?: string;
  text?: string;
  title?: string;
  directory?: string;
  requestID?: string;
  decision?: "once" | "always" | "reject";
  message?: string;
  model?: { id: string; providerID: string; variant?: string };
  agent?: string;
  name?: string;
}

export async function POST(req: NextRequest) {
  const g = gate(req);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  let body: ActionBody;
  try {
    body = (await req.json()) as ActionBody;
  } catch {
    return denied("corps JSON illisible", 400);
  }

  const sessionID = body.sessionID ?? "";

  try {
    switch (body.action) {
      case "session.create": {
        /* the new session is created where the followed session lives —
           the environments differ, and a session must not be created in
           another one's directory */
        const session = await ocCreateSession(
          body.title?.trim() || "Session du dashboard",
          body.directory?.trim() || workDir(),
          body.model,
        );
        return NextResponse.json({ session });
      }
      case "prompt": {
        if (!sessionID || !body.text?.trim()) {
          return denied("session ou message manquant", 400);
        }
        await ocPrompt(sessionID, body.text);
        return NextResponse.json({ ok: true });
      }
      case "interrupt": {
        if (!sessionID) return denied("session manquante", 400);
        await ocInterrupt(sessionID);
        return NextResponse.json({ ok: true });
      }
      case "permission": {
        if (!sessionID || !body.requestID || !body.decision) {
          return denied("session, demande ou décision manquante", 400);
        }
        await ocReplyPermission(
          sessionID,
          body.requestID,
          body.decision,
          body.message,
        );
        return NextResponse.json({ ok: true });
      }
      case "model": {
        if (!sessionID || !body.model) return denied("session ou modèle manquant", 400);
        await ocSetModel(sessionID, body.model);
        return NextResponse.json({ ok: true });
      }
      case "agent": {
        if (!sessionID || !body.agent) return denied("session ou agent manquant", 400);
        await ocSetAgent(sessionID, body.agent);
        return NextResponse.json({ ok: true });
      }
      case "command": {
        if (!sessionID || !body.name || !body.text) {
          return denied("session, commande ou texte manquant", 400);
        }
        await ocRunCommand(sessionID, body.name, body.text);
        return NextResponse.json({ ok: true });
      }
      default:
        return denied(`action inconnue : ${body.action ?? "—"}`, 400);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
