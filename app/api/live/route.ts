import { NextResponse } from "next/server";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { Live } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * The live endpoint.
 *
 * Two modes, and the payload says which one answered:
 *
 * * **local** — the dashboard runs on the machine that trains (the Colab
 *   box, or any host with the repository). The log tail is read *per
 *   request*, so the panel is as fresh as the trainer's last write
 *   (~26 s), plus the live GPU/process state.
 * * **hub** — the dashboard is deployed on Vercel and reads the heartbeat
 *   published by `scripts/live_sync.py` (every 30 s). The payload carries
 *   `updated_at`, and the UI shows the age of the signal.
 */

const REPO = process.env.HF_REPO ?? "Ggboykxz/black-hole-100m-backup";
const LIVE_REPO = process.env.HF_LIVE_REPO ?? "Ggboykxz/black-hole-live";
const RUN = process.env.DASHBOARD_RUN ?? "bh-005";

function repoRoot(): string {
  // dashboard/ lives inside the repository; on Vercel it does not exist
  const candidate = path.resolve(process.cwd(), "..");
  return existsSync(path.join(candidate, "runs", RUN, "log.jsonl")) ? candidate : "";
}

function tailRows(file: string, max = 20): Record<string, number | null>[] {
  const size = statSync(file).size;
  const block = 64 * 1024;
  let pos = size;
  let buf = Buffer.alloc(0);
  const rows: Record<string, number | null>[] = [];
  const fd = require("node:fs").openSync(file, "r");
  try {
    while (pos > 0 && rows.length <= max) {
      const len = Math.min(block, pos);
      pos -= len;
      const chunk = Buffer.alloc(len);
      require("node:fs").readSync(fd, chunk, 0, len, pos);
      buf = Buffer.concat([chunk, buf]);
      const lines = buf.toString("utf8").split("\n");
      buf = Buffer.from(lines[0]);
      for (let i = lines.length - 1; i >= 1; i--) {
        const line = lines[i].trim();
        if (!line) continue;
        try {
          rows.push(JSON.parse(line));
        } catch {
          continue;
        }
        if (rows.length > max) break;
      }
    }
  } finally {
    require("node:fs").closeSync(fd);
  }
  return rows.reverse().slice(-max);
}

/**
 * The system probes are expensive: `nvidia-smi` and `ps` are two processes,
 * and the dashboard may run on the trainer's own 2-vCPU box. The live feed
 * polls once a second so the UI can feel immediate, but the *hardware* state
 * does not change meaningfully in one second — cache the probes for 2 s and
 * keep reading the log tail on every request (it is a 64 KiB read).
 */
const PROBE_TTL_MS = 2000;
let gpuCache: { at: number; value: ReturnType<typeof probeGpu> } | null = null;
let procCache: { at: number; value: ReturnType<typeof probeProcesses> } | null = null;

function probeGpu() {
  try {
    const out = execFileSync(
      "nvidia-smi",
      [
        "--query-gpu=name,temperature.gpu,power.draw,power.limit,clocks.sm,clocks.max.sm,memory.used,memory.total,utilization.gpu,utilization.memory",
        "--format=csv,noheader,nounits",
      ],
      { timeout: 4000 },
    )
      .toString()
      .trim();
    if (!out) return undefined;
    const f = out.split(",").map((x) => x.trim());
    return {
      name: f[0],
      temp_c: Number(f[1]),
      power_w: Number(f[2]),
      power_limit_w: Number(f[3]),
      clock_mhz: Number(f[4]),
      clock_max_mhz: Number(f[5]),
      vram_used_gb: Number(f[6]) / 1024,
      vram_total_gb: Number(f[7]) / 1024,
      util_gpu: Number(f[8]),
      util_mem: Number(f[9]),
    };
  } catch {
    return undefined;
  }
}

function gpuState() {
  const now = Date.now();
  if (gpuCache && now - gpuCache.at < PROBE_TTL_MS) return gpuCache.value;
  const value = probeGpu();
  gpuCache = { at: now, value };
  return value;
}

function probeProcesses() {
  try {
    const out = execFileSync("ps", ["-eo", "pid,ppid,etimes,rss,args"], {
      timeout: 4000,
    })
      .toString()
      .split("\n")
      .slice(1);
    const roles: { role: string; needle: string }[] = [
      { role: "trainer", needle: "blackhole.train" },
      { role: "watchdog", needle: "scripts/train_watchdog.sh" },
      { role: "keepalive", needle: "scripts/keepalive.sh" },
      { role: "keepalive-watchdog", needle: "scripts/watch_keepalive.sh" },
    ];
    const res: NonNullable<Live["processes"]> = [];
    for (const line of out) {
      const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/);
      if (!m) continue;
      const [, pid, ppid, etimes, rss, args] = m;
      for (const r of roles) {
        // match on the *script* argument, not on any mention of it
        const argv = args.split(/\s+/);
        const script = argv[1] ?? "";
        // the trainer is `python3 -m blackhole.train …`; a shell that only
        // *mentions* it in a -c command line is not the trainer
        const hit =
          r.needle === "blackhole.train"
            ? argv.slice(0, 3).some((a) => a.includes("blackhole.train")) &&
              !argv.slice(0, 2).includes("-c")
            : script === r.needle;
        if (hit) {
          res.push({
            role: r.role,
            pid: Number(pid),
            ppid: Number(ppid),
            up_s: Number(etimes),
            rss_mb: Number(rss) / 1024,
            cmd: argv.slice(0, 3).join(" "),
          });
          break;
        }
      }
    }
    // the keepalive's heartbeat is a subshell with the same command line:
    // only the parent tells them apart (a keepalive whose parent is another
    // keepalive IS the heartbeat)
    const keepalivePids = new Set(
      res.filter((r) => r.role === "keepalive").map((r) => r.pid),
    );
    for (const r of res) {
      if (r.role === "keepalive" && r.ppid !== undefined && keepalivePids.has(r.ppid)) {
        r.role = "heartbeat";
      }
      delete (r as unknown as { ppid?: number }).ppid;
    }
    return res;
  } catch {
    return undefined;
  }
}

function processState() {
  const now = Date.now();
  if (procCache && now - procCache.at < PROBE_TTL_MS) return procCache.value;
  const value = probeProcesses();
  procCache = { at: now, value };
  return value;
}

function localLive(): Live | null {
  const root = repoRoot();
  if (!root) return null;
  const log = path.join(root, "runs", RUN, "log.jsonl");
  if (!existsSync(log)) return null;
  let cfg: Record<string, unknown> = {};
  try {
    cfg = JSON.parse(
      readFileSync(path.join(root, "runs", RUN, "train_config.json"), "utf8"),
    );
  } catch {
    /* the config is optional here */
  }
  const rows = tailRows(log, 20);
  if (!rows.length) return null;
  const last = rows[rows.length - 1];
  const maxSteps = Number(cfg.max_steps ?? 0);
  const step = Number(last.step ?? 0);
  const logEvery = Number(cfg.log_every ?? 10);
  const win = rows.slice(-20);
  const pace =
    win.length > 1
      ? win.reduce((a, r) => a + Number(r.elapsed_s ?? 0), 0) /
        win.length /
        logEvery
      : null;
  const valRow = [...rows].reverse().find((r) => r.val_loss != null);
  const ckpts = existsSync(path.join(root, "runs", RUN))
    ? require("node:fs")
        .readdirSync(path.join(root, "runs", RUN))
        .filter((f: string) => f.startsWith("ckpt_step"))
        .sort()
    : [];
  const lastCkpt = ckpts[ckpts.length - 1];
  // the GPU history is kept by scripts/live_sync.py (one sample per beat)
  let gpuHistory: Live["gpu_history"] = [];
  try {
    const gh = path.join(root, "runs", RUN, "live_gpu.json");
    if (existsSync(gh)) {
      gpuHistory = JSON.parse(readFileSync(gh, "utf8")).slice(-120);
    }
  } catch {
    /* no history yet */
  }
  return {
    // The producer's own clock: when the trainer last wrote its log line.
    // Stamping the *read* time here would make the signal look 0 s old
    // forever, and hide a trainer that stopped writing 20 minutes ago.
    updated_at: new Date(statSync(log).mtimeMs).toISOString(),
    read_at: new Date().toISOString(),
    run: RUN,
    step,
    max_steps: maxSteps,
    percent: maxSteps ? (100 * step) / maxSteps : null,
    lr: last.lr ?? null,
    train_loss: last.train_loss ?? null,
    grad_norm: last.grad_norm ?? null,
    val_loss: valRow ? Number(valRow.val_loss) : null,
    tokens_per_s: last.tokens_per_s ?? null,
    pace_s_per_step: pace,
    eta_h: maxSteps && pace ? ((maxSteps - step) * pace) / 3600 : null,
    checkpoint: lastCkpt ?? null,
    checkpoint_step: lastCkpt
      ? Number(lastCkpt.replace("ckpt_step", "").replace(".pt", ""))
      : null,
    gpu: gpuState(),
    gpu_history: gpuHistory,
    processes: processState(),
    rows: rows.map((r) => ({
      step: Number(r.step ?? 0),
      train_loss: r.train_loss ?? null,
      lr: r.lr ?? null,
      grad_norm: r.grad_norm ?? null,
      tokens_per_s: r.tokens_per_s ?? null,
      elapsed_s: r.elapsed_s ?? null,
      val_loss: r.val_loss ?? null,
    })),
    source: "local",
    age_s: 0,
  };
}

async function hubLive(): Promise<Live | null> {
  // The heartbeat dataset can be public; the private backup needs a token.
  // Trying unauthenticated first is what lets the deployed site stay live
  // without ever shipping a secret to the browser or the repo.
  const token = process.env.HF_TOKEN;
  const headers: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : {};
  for (const [repo, file] of [
    [LIVE_REPO, "live.json"],
    [REPO, `runs/${RUN}/live.json`],
  ]) {
    try {
      // The cache-buster matters: the heartbeat file changes every 30 s and
      // an edge cache that keeps serving the previous copy would freeze the
      // dashboard while looking perfectly healthy. The query string makes
      // every request a distinct object, so the origin is always asked.
      const bust = Math.floor(Date.now() / 1000);
      const res = await fetch(
        `https://huggingface.co/datasets/${repo}/resolve/main/${file}?t=${bust}`,
        { headers, cache: "no-store" },
      );
      if (!res.ok) continue;
      const json = (await res.json()) as Live;
      if (!json || !json.step) continue;
      json.source = "hub";
      json.age_s = Math.round(
        (Date.now() - new Date(json.updated_at).getTime()) / 1000,
      );
      return json;
    } catch {
      /* try the next source */
    }
  }
  return null;
}

export async function GET() {
  // Deliberately **no snapshot fallback**: the embedded snapshot has its own
  // pages, and serving it here would make a frozen state look live. When the
  // log and the heartbeat are both unreachable, the honest answer is 503 —
  // the UI then says "no live source" instead of drawing a flat line.
  const payload = localLive() ?? (await hubLive());
  if (!payload) {
    return NextResponse.json(
      {
        error:
          "no live source (neither the local log nor the Hub heartbeat). " +
          "Set HF_TOKEN, or make the heartbeat dataset public.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
