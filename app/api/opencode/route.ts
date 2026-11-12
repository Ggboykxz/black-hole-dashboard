import { NextRequest, NextResponse } from "next/server";
import {
  OC_KEY_HEADER,
  OpenCodeUnavailable,
  keyMatches,
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
 * it is closed by default:
 *
 * * without `OPENCODE_KEY` in the dashboard's environment, every call
 *   answers 503 — the feature does not exist;
 * * with the key set, the browser must present it (`x-opencode-key`);
 * * the service's own password is added server-side and never leaves.
 *
 * The dashboard is published on GitHub and deployed on Vercel: a public
 * route that can run commands on the trainer's machine would be a shell
 * with a web form. The gate is the difference between a dashboard and a
 * backdoor.
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

export async function GET(req: NextRequest) {
  if (!pilotEnabled()) {
    return denied(
      "poste de pilotage désactivé — OPENCODE_KEY n'est pas défini dans l'environnement du dashboard",
      503,
    );
  }
  if (!keyMatches(req.headers.get(OC_KEY_HEADER))) return unauthorized();

  const directory = workDir();

  try {
    const [info, sessions, agents, models, commands, permissions] =
      await Promise.all([
        ocInfo(),
        ocSessions(),
        ocAgents(directory),
        ocModels(directory),
        ocCommands(directory),
        ocPermissions(directory),
      ]);

    return NextResponse.json({
      enabled: true,
      authorized: true,
      directory,
      service: { ...info, url: info.urls?.[0] ?? null },
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
      permissions: permissions.map((p) => ({
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
  requestID?: string;
  decision?: "once" | "always" | "reject";
  message?: string;
  model?: { id: string; providerID: string; variant?: string };
  agent?: string;
  name?: string;
}

export async function POST(req: NextRequest) {
  if (!pilotEnabled()) {
    return denied(
      "poste de pilotage désactivé — OPENCODE_KEY n'est pas défini dans l'environnement du dashboard",
      503,
    );
  }
  if (!keyMatches(req.headers.get(OC_KEY_HEADER))) return unauthorized();

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
        const session = await ocCreateSession(
          body.title?.trim() || "Session du dashboard",
          workDir(),
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
