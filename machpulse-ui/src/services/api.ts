/**
 * MachPulse API Client Service
 * Connects to live FastAPI backend at http://localhost:8000/api
 * Serves real MetroPT-3 ML pipeline results and sensor telemetry.
 */

export const API_BASE_URL = ((import.meta as any).env?.VITE_API_BASE_URL) || 'http://localhost:8000/api';

export interface HealthResponse {
  status: string;
  service: string;
}

export interface ContributingSensor {
  feature: string;
  contribution: number;
}

export interface MachineHealthResponse {
  machine_id: string;
  asset_name: string;
  timestamp: string;
  operating_state: 'off' | 'offloaded' | 'loaded';
  health_status: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';
  decision: 'MONITOR' | 'INSPECT' | 'MAINTAIN' | 'INSUFFICIENT EVIDENCE';
  anomaly_distance: number;
  elevated_threshold: number;
  severe_threshold: number;
  is_above_threshold: boolean;
  top_contributing_sensors: ContributingSensor[];
  quality_gate: {
    coverage: number;
    gate_passed: boolean;
  };
  sensor_readings: {
    motor_current_amps: number | null;
    tp2_bar: number | null;
    tp3_bar: number | null;
    h1_bar: number | null;
    oil_temperature_c: number | null;
    dv_pressure_bar: number | null;
  };
}

export interface TelemetryPoint {
  timestamp: string;
  motor_current: number | null;
  tp2: number | null;
  tp3: number | null;
  h1: number | null;
  oil_temperature: number | null;
  dv_pressure: number | null;
  operating_state: 'off' | 'offloaded' | 'loaded' | 'unknown';
  coverage: number;
  distance: number | null;
  decision: 'MONITOR' | 'INSPECT' | 'MAINTAIN' | 'INSUFFICIENT EVIDENCE' | null;
}

export interface QualityIndicatorsResponse {
  raw_rows_processed: number;
  raw_timestamp_start: string;
  raw_timestamp_end: string;
  total_grid_minutes: number;
  missing_minutes: number;
  missing_percentage: number;
  active_minutes: number;
  active_wallclock_hours: number;
  documented_gaps_count: number;
  total_gap_hours: number;
  expected_samples_per_minute: number;
  quality_gate_thresholds: {
    min_window_coverage: number;
    max_window_frozen_fraction: number;
  };
  stream_health: string;
}

export interface FailureEventDetail {
  event_id: string;
  failure_type: string;
  documented_start: string;
  documented_end: string;
  detected: boolean;
  lead_time_hours: number | null;
  first_alert_timestamp: string | null;
  first_alert_severity: string | null;
  report_note: string;
}

export interface FailureEventsResponse {
  failures_detected: number;
  total_documented_failures: number;
  recall: number;
  precision: number;
  false_alarm_episodes: number;
  false_alarm_rate_per_month: number;
  lead_credit_window_hours: number;
  events: FailureEventDetail[];
}

export interface BaselinesComparisonResponse {
  machpulse_mahalanobis: {
    recall: number;
    false_alarms_per_month: number;
    interpretable: boolean;
  };
  fixed_threshold_baseline: {
    recall: number;
    false_alarms_per_month: number;
    description: string;
  };
  lps_alarm_baseline: {
    recall: number;
    false_alarms_per_month: number;
    description: string;
  };
  isolation_forest_baseline: {
    recall: number;
    false_alarms_per_month: number;
    description: string;
  };
}

export interface PipelineSummaryResponse {
  status: string;
  model: {
    algorithm: string;
    states_fitted: string[];
    calibrated_threshold: number;
    calibrated_severe_threshold: number;
    target_false_alarm_budget_per_month: number;
  };
  features: {
    total_feature_columns: number;
    model_feature_columns_count: number;
    feature_windows: string[];
  };
  splits: {
    train_rows: number;
    calib_rows: number;
    test_rows: number;
  };
  performance: {
    total_pipeline_runtime_sec: number;
    timings_breakdown: Record<string, number>;
  };
}

// ---------------------------------------------------------------------------
// Phase 4 - Evidence-grounded AI explanation layer
// ---------------------------------------------------------------------------
export type AiRecommendedAction =
  | 'MONITOR'
  | 'INSPECT'
  | 'MAINTAIN'
  | 'INSUFFICIENT_EVIDENCE';

export interface AiExplanation {
  summary: string;
  why: string;
  evidence_points: string[];
  what_to_check: string[];
  recommended_action: AiRecommendedAction;
  confidence_statement: string;
  limitations: string[];
}

export interface AiExplainMeta {
  mode: 'llm' | 'deterministic_fallback';
  provider: string;          // "claude" | "local" | "deterministic"
  provider_label: string;    // "CLAUDE" | "LOCAL" | "DETERMINISTIC"
  model: string | null;
  fallback_reason: string | null;
  ml_decision: string;
  evidence_sufficient: boolean;
  llm_invocation_allowed: boolean;
  generated_at: string;
}

export interface AiExplainResponse {
  explanation: AiExplanation;
  meta: AiExplainMeta;
  evidence?: Record<string, unknown> | null;
}

class ApiService {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async fetchJson<T>(endpoint: string): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`API Error [${res.status}] ${res.statusText} at ${url}`);
    }
    return res.json() as Promise<T>;
  }

  private async postJson<T>(endpoint: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`API Error [${res.status}] ${res.statusText} at ${url}`);
    }
    return res.json() as Promise<T>;
  }

  async getHealth(): Promise<HealthResponse> {
    return this.fetchJson<HealthResponse>('/health');
  }

  async getMachineHealth(): Promise<MachineHealthResponse> {
    return this.fetchJson<MachineHealthResponse>('/machine/health');
  }

  async getRecentTelemetry(limit: number = 60): Promise<TelemetryPoint[]> {
    return this.fetchJson<TelemetryPoint[]>(`/machine/telemetry?limit=${limit}`);
  }

  async getQualityIndicators(): Promise<QualityIndicatorsResponse> {
    return this.fetchJson<QualityIndicatorsResponse>('/quality/indicators');
  }

  async getFailureEvents(): Promise<FailureEventsResponse> {
    return this.fetchJson<FailureEventsResponse>('/evaluation/events');
  }

  async getBaselinesComparison(): Promise<BaselinesComparisonResponse> {
    return this.fetchJson<BaselinesComparisonResponse>('/evaluation/baselines');
  }

  async getPipelineSummary(): Promise<PipelineSummaryResponse> {
    return this.fetchJson<PipelineSummaryResponse>('/evaluation/summary');
  }

  /**
   * Phase 4: structured, evidence-grounded explanation of the current ML
   * decision. Always resolves with a valid AiExplainResponse when the backend
   * is reachable - the backend serves a deterministic explanation if the LLM
   * is disabled, unavailable, or returns invalid output.
   */
  async getAiExplanation(includeEvidence = false): Promise<AiExplainResponse> {
    return this.postJson<AiExplainResponse>('/ai/explain', {
      include_evidence: includeEvidence,
    });
  }

  /**
   * Phase 5: technician-facing conversational AI assistant.
   * Sends bounded turn history and recorded maintenance history to POST /api/ai/chat.
   */
  async postAiChat(
    message: string,
    history: AiChatMessage[] = [],
    maintenanceHistory: any[] = []
  ): Promise<AiChatResponse> {
    return this.postJson<AiChatResponse>('/ai/chat', {
      message,
      history,
      maintenance_history: maintenanceHistory,
    });
  }

  /**
   * Phase 5C.1: Historical Telemetry Replay Engine methods.
   */
  async getReplayStatus(): Promise<ReplayStatusResponse> {
    return this.fetchJson<ReplayStatusResponse>('/replay/status');
  }

  async getReplayCurrent(): Promise<MachineHealthResponse> {
    return this.fetchJson<MachineHealthResponse>('/replay/current');
  }

  async startReplay(): Promise<ReplayStatusResponse> {
    return this.postJson<ReplayStatusResponse>('/replay/start', {});
  }

  async pauseReplay(): Promise<ReplayStatusResponse> {
    return this.postJson<ReplayStatusResponse>('/replay/pause', {});
  }

  async resetReplay(): Promise<ReplayStatusResponse> {
    return this.postJson<ReplayStatusResponse>('/replay/reset', {});
  }

  async setReplaySpeed(speed: number): Promise<ReplayStatusResponse> {
    return this.postJson<ReplayStatusResponse>('/replay/speed', { speed });
  }
}

// ---------------------------------------------------------------------------
// Phase 5 - Conversational Technician Assistant
// ---------------------------------------------------------------------------
export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiChatMeta {
  mode: 'llm' | 'deterministic_fallback';
  provider: string;          // "claude" | "local" | "deterministic"
  provider_label: string;    // "CLAUDE" | "LOCAL" | "DETERMINISTIC"
  model: string | null;
  fallback_reason: string | null;
  ml_decision: string;
  evidence_sufficient: boolean;
  llm_invocation_allowed: boolean;
  generated_at: string;
}

export interface AiChatResponse {
  reply: string;
  meta: AiChatMeta;
  structured_context?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Phase 5C.1 - Historical Telemetry Replay Engine
// ---------------------------------------------------------------------------
export interface ReplayStatusResponse {
  running: boolean;
  completed: boolean;
  current_index: number;
  total_observations: number;
  current_timestamp: string;
  speed: number;
  mode: string;
}

export const apiService = new ApiService();
