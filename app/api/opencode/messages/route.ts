import { NextRequest, NextResponse } from "next/server";
import {
  OC_KEY_HEADER,
  OpenCodeUnavailable,
  keyMatches,
  ocMessages,
  pilotEnabled,
} from "@/lib/opencode";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * The thread of one session.
 *
 * The chat polls it once a second — the dashboard's own cadence — instead
 * of holding a long-lived stream open: a dropped connection is then a
 * dropped *poll*, not a broken page, and the server never keeps a socket
 * for an idle tab.
 */
export async function GET(req: NextRequest) {
  if (!pilotEnabled()) {
    return NextResponse.json(
      {
        error:
          "poste de pilotage désactivé — OPENCODE_KEY n'est pas défini dans l'environnement du dashboard",
      },
      { status: 503 },
    );
  }
  if (!keyMatches(req.headers.get(OC_KEY_HEADER))) {
    return NextResponse.json(
      { error: "clé absente ou incorrecte — le poste de pilotage est verrouillé" },
      { status: 401 },
    );
  }

  const sessionID = req.nextUrl.searchParams.get("session") ?? "";
  if (!sessionID) {
    return NextResponse.json({ error: "session manquante" }, { status: 400 });
  }

  try {
    const messages = await ocMessages(sessionID, 40);
    return NextResponse.json({ messages });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: msg },
      { status: e instanceof OpenCodeUnavailable ? 503 : 502 },
    );
  }
}
