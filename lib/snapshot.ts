import type { Snapshot } from "./types";
import local from "@/public/data/snapshot.json";

/**
 * Where the dashboard gets its data, in order of preference:
 *
 * 1. **the Hub** (`Ggboykxz/black-hole-100m-backup`) — the snapshot is
 *    rewritten by the keepalive every cycle and pushed with the working
 *    tree, so a Vercel deployment follows the run without being rebuilt.
 *    It needs `HF_TOKEN` (the dataset is private) — server-side only.
 * 2. **the file committed with the app** (`public/data/snapshot.json`) —
 *    always present, so the app works with no token, no network and no
 *    private access.
 *
 * Both are the *same artefact*, produced by the same Python script: the
 * dashboard has no parsing logic of its own.
 */

const REPO = process.env.HF_REPO ?? "Ggboykxz/black-hole-100m-backup";
const PATH_IN_REPO = "dashboard/public/data/snapshot.json";
const REVALIDATE = Number(process.env.DASHBOARD_REVALIDATE ?? 60);

function hubUrl(): string {
  return `https://huggingface.co/datasets/${REPO}/resolve/main/${PATH_IN_REPO}`;
}

export async function getSnapshot(): Promise<{
  snapshot: Snapshot;
  source: "hub" | "bundled";
  fetched_at: string;
}> {
  const token = process.env.HF_TOKEN;
  if (token) {
    try {
      const res = await fetch(hubUrl(), {
        headers: { Authorization: `Bearer ${token}` },
        next: { revalidate: REVALIDATE },
      });
      if (res.ok) {
        const json = (await res.json()) as Snapshot;
        if (json && json.status) {
          return {
            snapshot: json,
            source: "hub",
            fetched_at: new Date().toISOString(),
          };
        }
      }
    } catch {
      /* fall through to the bundled copy */
    }
  }
  return {
    snapshot: local as unknown as Snapshot,
    source: "bundled",
    fetched_at: new Date().toISOString(),
  };
}
