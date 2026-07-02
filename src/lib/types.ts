// Types mirror the bake artifacts emitted by _bake.py.

export type PresetName = "equal" | "m_heavy" | "v_heavy" | "research_vq";
export type Floor = 0 | 1 | 10;

export interface PresetInfo {
  label: string;
  weights: Record<string, number>;
  backtest_cagr: number;
  backtest_sharpe: number;
  backtest_max_dd: number;
  backtest_universe: string;
  validated_at_floor: boolean;
  // research-prior presets (e.g. research_vq) carry these; validated presets omit them.
  is_research_prior?: boolean;
  caveat?: string;
  top_n?: number;
  hold_days?: number;
  in_sample_cagr?: number;
}

export interface Meta {
  generated_at: string;
  source_commit: string;
  default_preset: PresetName;
  default_floor: Floor;
  floors: Floor[];
  presets: Record<PresetName, PresetInfo>;
  // Research-prior presets (e.g. research_vq / Axia) carry NO validated absolute threshold,
  // so this map is intentionally partial — consumers MUST handle a missing key (fall back to
  // the default preset). A non-partial type here is what let the screener silently compare
  // composites against `undefined` and report "0 stocks above quality threshold".
  absolute_thresholds: Partial<Record<PresetName, number>>;
  absolute_threshold_stats: Record<string, Record<string, number | null>>;
  pillars: string[];
  pillar_metrics: Record<string, { key: string; name: string; higher_is_better: boolean }[]>;
  grade_percentile_map: Record<string, [number, number]>;
  grade_scores: Record<string, number>;
  rating_maps_per_preset: Record<PresetName, Record<string, [number, number]>>;
  rating_colors: Record<string, string>;
  grade_colors: Record<string, string>;
  top_portfolio_n: number;
  floor_meta: Record<string, FloorMeta>;
  screener?: ScreenerConfig;
}

export interface FilterMetric {
  key: string; name: string; type: "range" | "pct_range";
  default_min: number; default_max: number; step: number;
}
export interface PresetScreen {
  description: string;
  rating_filter: string[];
  fair_value_filter: string[];
  metric_filters: Record<string, [number, number]>;
  sort_by: string;
}
export interface ScreenerConfig {
  filterable_metrics: Record<string, FilterMetric[]>;
  preset_screens: Record<string, PresetScreen>;
}

export interface FloorMeta {
  floor: number;
  n_total: number;
  n_stocks: number;
  n_etf: number;
  sectors: string[];
}

export interface PresetCell {
  c: number | null; // authoritative composite_score
  r: string | null; // authoritative overall_rating
}

export interface Row {
  ticker: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  marketCapB: number | null;
  marketCap: number | null;
  price: number | null;
  fv: number | null; // composite fair value (preset-independent)
  qbp: number | null; // quant buy point (preset-independent)
  fvVerdict: string | null;     // FV verdict band (Python-computed)
  fvPremium: number | null;     // price vs FV premium/discount %
  qbpDistance: number | null;   // % distance from buy point
  qbpSignal: string | null;     // QBP signal label
  pillars: Record<string, number | null>;
  grades: Record<string, string | null>;
  raw: Record<string, number | null>;
  ma_score?: number | null;
  byPreset: Record<PresetName, PresetCell>;
}

export interface UniverseFile {
  meta: FloorMeta;
  rows: Row[];
}

// Detail artifacts ----------------------------------------------------------

export interface FvMethod {
  fair_value: number;
  premium_discount_pct: number;
  assumptions: Record<string, unknown>;
  _label?: string;
}
export interface FvResult {
  ticker: string;
  current_price: number;
  composite_fair_value: number;
  premium_discount_pct: number;
  verdict: string;
  verdict_color: string;
  margin_of_safety: number;
  methods: Record<string, FvMethod>;
  num_methods_used: number;
  sector: string;
  north_star_metric: string;
}
export interface QbpComponent { price: number; weight: number; description: string }
export interface QbpResult {
  ticker: string;
  current_price: number;
  buy_point: number;
  distance_pct: number;
  signal: string;
  signal_color: string;
  signal_score: number;
  components: Record<string, QbpComponent>;
  technicals: Record<string, string>;
}
export interface PillarMetricDetail {
  metric: string;
  value: string;
  grade: string;
  percentile: string;
  sector_avg: string;
  a_threshold: string;
  higher_is_better: boolean;
}
export interface PillarDetail {
  metrics: PillarMetricDetail[];
  pillar_grade: string;
  pillar_score: number;
}
export interface TickerDetail {
  pillar_detail: Record<string, PillarDetail>;
  fv: FvResult | null;
  qbp: QbpResult | null;
}

export interface PriceSeries { dates: string[]; close: number[] }
