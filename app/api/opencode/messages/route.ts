import { NextRequest, NextResponse } from "next/server";
import {
  OC_KEY_HEADER,
  OpenCodeUnavailable,
  keyMatches,
  isLocalRequest,
  ocMessages,
  pilotEnabled,
} from "@/lib/opencode";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** the same gate as `/api/opencode` — local requests, or the key */
function gate(req: NextRequest): { mode: "key" | "local" } | { error: string; status: number } {
  if (pilotEnabled()) {
    return keyMatches(req.headers.get(OC_KEY_HEADER))
      ? { mode: "key" }
      : {
          error: "clé absente ou incorrecte — le poste de pilotage est verrouillé",
          status: 401,
        };
  }
  if (isLocalRequest(req.headers)) return { mode: "local" };
  return {
    error:
      "le poste de pilotage n'est ouvert que depuis la machine — définis OPENCODE_KEY pour l'ouvrir à distance",
    status: 503,
  };
}

/**
 * The thread of one session.
 *
 * The chat polls it once a second — the dashboard's own cadence — instead
 * of holding a long-lived stream open: a dropped connection is then a
 * dropped *poll*, not a broken page, and the server never keeps a socket
 * for an idle tab.
 *
 * The payload is trimmed: a tool can print megabytes, and le thread du
 * dashboard n'a pas besoin de la sortie complète d'un `grep` pour être
 * lisible. Le milieu est coupé, le début et la fin restent.
 */

const MAX_OUTPUT = 4000;

function trim(text: string): string {
  if (text.length <= MAX_OUTPUT) return text;
  const head = Math.floor(MAX_OUTPUT * 0.6);
  const tail = MAX_OUTPUT - head;
  return `${text.slice(0, head)}\n… [${(text.length - MAX_OUTPUT).toLocaleString(
    "fr-FR",
  )} caractères coupés] …\n${text.slice(-tail)}`;
}

export async function GET(req: NextRequest) {
  const g = gate(req);
  if ("error" in g) {
    return NextResponse.json({ error: g.error }, { status: g.status });
  }

  const sessionID = req.nextUrl.searchParams.get("session") ?? "";
  if (!sessionID) {
    return NextResponse.json({ error: "session manquante" }, { status: 400 });
  }

  try {
    const messages = await ocMessages(sessionID, 25);
    const trimmed = messages.map((m) => ({
      ...m,
      content: m.content?.map((p) =>
        p.state?.output
          ? { ...p, state: { ...p.state, output: trim(p.state.output) } }
          : p,
      ),
    }));
    return NextResponse.json({ messages: trimmed });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: msg },
      { status: e instanceof OpenCodeUnavailable ? 503 : 502 },
    );
  }
}
