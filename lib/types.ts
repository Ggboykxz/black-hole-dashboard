/**
 * The shape of `dashboard/public/data/snapshot.json`, produced by
 * `scripts/dashboard_snapshot.py` — and by `scripts/live_sync.py` for the
 * heartbeat. The dashboard never parses the raw artefacts itself: the
 * repository's rule is *one metric, one producer*, and the dashboard is a
 * renderer, not a second producer.
 */

export interface Status {
  run: string;
  step: number;
  max_steps: number;
  percent: number | null;
  train_loss: number | null;
  lr: number | null;
  grad_norm: number | null;
  tokens_per_s: number | null;
  tokens_per_step: number;
  tokens_seen: number | null;
  tokens_this_run: number | null;
  origin_step: number | null;
  pace_s_per_step: number | null;
  eta_h: number | null;
  val_last: { step: number; loss: number } | null;
  val_best: { step: number; loss: number } | null;
  n_evals: number;
  generated_at: string;
}

export interface BenchPoint {
  step: number;
  loss: number;
  ppl: number;
  measured_at: string | null;
  delta: number | null;
  wall_s?: number;
}

export interface PairedPoint {
  step: number;
  web: number;
  reasoning: number;
  reasoning_ppl: number | null;
}

export interface SeriesPoint {
  step: number;
  loss: number;
}

export interface LrPoint {
  step: number;
  lr: number;
}

export interface GradPoint {
  step: number;
  grad: number;
}

export interface Checkpoint {
  name: string;
  step: number;
  size_gb: number;
}

export interface Gsm8kEntry {
  label: string | null;
  weights: string | null;
  n: number;
  n_correct: number;
  accuracy: number | null;
  marker_rate: number | null;
  wall_s: number | null;
  measured_at: string | null;
  extractor: string | null;
}

export interface Prediction {
  id: string;
  question: string;
  prediction: string;
  settles_with: string;
  state: string;
  verdict: "hit" | "miss" | "pending" | "other";
  raw: string;
}

export interface RegistryEntry {
  id: string;
  metric: string;
  definition: string;
  producer: string;
  artefact: string;
  comparability: string;
}

export interface Gap {
  gap: string;
  consequence: string;
  next: string;
}

export interface Part {
  label: string;
  file: string;
  tokens: number;
  bytes: number;
}

export interface SftSet {
  name: string;
  n_train: number;
  n_val: number;
  tokens_train: number | null;
  tokens_val: number | null;
  cot_repeat: number | null;
  cot_share: number | null;
  leak: number | null;
}

export interface AuditStatus {
  at?: string;
  ok?: number;
  total?: number;
  failures?: string[];
}

export interface Snapshot {
  schema: number;
  status: Status;
  benchmarks: BenchPoint[];
  paired: PairedPoint[];
  series: {
    train: SeriesPoint[];
    val: SeriesPoint[];
    lr: LrPoint[];
    grad: GradPoint[];
  };
  checkpoints: Checkpoint[];
  gsm8k: Gsm8kEntry[];
  extractor: Record<string, unknown> | null;
  mceval: Record<string, unknown> | null;
  mceval_smoke: Record<string, unknown> | null;
  drift: Record<string, unknown> | null;
  data: {
    total_tokens: number;
    reasoning_tokens: number;
    reasoning_share: number | null;
    parts: Part[];
    sha256: string | null;
    val: { file?: string; sha256?: string; n_tokens?: number } | null;
    sft_sets: SftSet[];
  };
  predictions: Prediction[];
  registry: RegistryEntry[];
  gaps: Gap[];
  audit: AuditStatus | null;
  prose: Record<string, string>;
}

/** The heartbeat published by `scripts/live_sync.py` (Hub or local). */
export interface Live {
  updated_at: string;
  /** when the API *read* the source (local mode) — not the producer's clock */
  read_at?: string;
  run: string;
  step: number;
  max_steps: number;
  percent: number | null;
  lr: number | null;
  train_loss: number | null;
  grad_norm: number | null;
  val_loss: number | null;
  tokens_per_s: number | null;
  pace_s_per_step: number | null;
  eta_h: number | null;
  checkpoint: string | null;
  checkpoint_step: number | null;
  checkpoints_local?: Checkpoint[];
  gpu_history?: {
    t: string;
    temp_c: number;
    power_w: number;
    power_limit_w: number;
    clock_mhz: number;
    clock_max_mhz: number;
    util_gpu: number;
    vram_used_gb: number;
    vram_total_gb: number;
  }[];
  gpu?: {
    name: string;
    temp_c: number;
    power_w: number;
    power_limit_w: number;
    clock_mhz: number;
    clock_max_mhz: number;
    vram_used_gb: number;
    vram_total_gb: number;
    util_gpu: number;
    util_mem: number;
  };
  processes?: {
    role: string;
    pid: number;
    ppid?: number;
    up_s: number;
    rss_mb: number;
    cmd: string;
  }[];
  disk?: { free_gb: number; total_gb: number; used_percent: number };
  benchmarks?: BenchPoint[];
  reasoning?: PairedPoint[];
  n_samples?: number | null;
  audit?: AuditStatus | null;
  watchdog_tail?: string[];
  keepalive_tail?: string[];
  rows: {
    step: number;
    train_loss: number | null;
    lr: number | null;
    grad_norm: number | null;
    tokens_per_s: number | null;
    elapsed_s: number | null;
    val_loss: number | null;
  }[];
  /**
   * "local" = read from this machine's log (true live) · "hub" = heartbeat ·
   * "snapshot" = the last embedded snapshot (no live source reached at all)
   */
  source?: "local" | "hub" | "snapshot";
  age_s?: number | null;
}
