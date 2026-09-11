import React, { useCallback, useEffect, useState } from 'react';
import {
  apiService,
  AiExplainResponse,
  MachineHealthResponse,
} from '../services/api';
import {
  Sparkles,
  RefreshCw,
  Info,
  AlertTriangle,
  ListChecks,
  HelpCircle,
} from 'lucide-react';

interface AiInterpretationPanelProps {
  machineHealth: MachineHealthResponse | null;
}

const FALLBACK_REASON_LABEL: Record<string, string> = {
  insufficient_evidence:
    'Evidence quality gate not met — the model is not asked to interpret an insufficient-evidence state.',
  llm_disabled: 'No AI provider is configured; showing the deterministic MachPulse explanation.',
  provider_unavailable: 'AI provider unavailable; showing the deterministic MachPulse explanation.',
  timeout: 'AI provider timed out; showing the deterministic MachPulse explanation.',
  invalid_output: 'AI response failed validation; showing the deterministic MachPulse explanation.',
  llm_attempted_override:
    'AI response tried to change the ML decision and was rejected; showing the deterministic MachPulse explanation.',
  forbidden_content:
    'AI response contained an unsupported claim (e.g. RUL / failure probability) and was rejected.',
  provider_exception: 'AI provider error; showing the deterministic MachPulse explanation.',
};

export const AiInterpretationPanel: React.FC<AiInterpretationPanelProps> = ({
  machineHealth,
}) => {
  const [data, setData] = useState<AiExplainResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decisionKey = machineHealth?.decision ?? 'PENDING';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiService.getAiExplanation(false);
      setData(res);
    } catch (err) {
      setError(
        'Could not reach the MachPulse AI explanation endpoint (GET /api/ai/explain). The ML decision above is unaffected.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh whenever the underlying ML decision changes.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisionKey]);

  const meta = data?.meta;
  const explanation = data?.explanation;
  const isLlm = meta?.mode === 'llm';
  const providerLabel = meta?.provider_label ?? 'DETERMINISTIC';

  return (
    <section className="bg-white border-4 border-black rounded-[32px] p-6 sm:p-8 shadow-[8px_8px_0_#000] space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b-2 border-black/20 pb-4">
        <div>
          <span className="text-[10px] font-mono font-black uppercase tracking-widest text-slate-500">
            TECHNICIAN ASSISTANCE
          </span>
          <h3 className="font-comic text-2xl font-bold text-black flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-sky-700" />
            AI Interpretation
            <span
              className={`text-[10px] font-mono font-black px-2 py-0.5 rounded-full border-2 border-black ${
                isLlm ? 'bg-[#70C5F8] text-black' : 'bg-slate-200 text-slate-700'
              }`}
              title={
                isLlm
                  ? `Explanation phrased by the ${providerLabel} provider`
                  : 'Deterministic MachPulse explanation (no model output used)'
              }
            >
              {providerLabel}
            </span>
          </h3>
          <p className="text-xs text-slate-600 font-medium mt-1">
            The ML pipeline decides. This panel only restates the evidence in plain language — it
            never changes the decision, and never produces RUL or failure probabilities.
          </p>
        </div>

        <button
          onClick={load}
          disabled={loading}
          className="shrink-0 px-3 py-1.5 rounded-xl border-2 border-black text-xs font-mono font-black bg-[#FFFDF0] hover:bg-[#C1F6C9] cursor-pointer shadow-[2px_2px_0_#000] flex items-center gap-2 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>{loading ? 'Loading' : 'Refresh'}</span>
        </button>
      </div>

      {/* Mode / provenance note */}
      {meta && (
        <div
          className={`p-3 rounded-xl border text-[11px] font-medium flex items-start gap-2 ${
            isLlm
              ? 'bg-[#FFFDF0] border-black/20 text-slate-600'
              : 'bg-[#FFFDF0] border-black/30 text-slate-700'
          }`}
        >
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-sky-700" />
          <span>
            <strong>{isLlm ? `Phrased by ${providerLabel}` : 'Deterministic explanation'}</strong>
            {meta.model ? ` (${meta.model}).` : '.'}{' '}
            {meta.fallback_reason
              ? FALLBACK_REASON_LABEL[meta.fallback_reason] ?? meta.fallback_reason
              : 'Grounded strictly in the structured MachPulse evidence for this observation.'}{' '}
            ML decision: <strong>{meta.ml_decision}</strong>.
          </span>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl border-2 border-black bg-[#FFB3B3] text-black text-xs font-bold flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading && !explanation && (
        <div className="py-8 text-center text-xs font-mono font-bold text-slate-500">
          Requesting evidence-grounded interpretation…
        </div>
      )}

      {explanation && (
        <div className="space-y-6">
          {/* Summary */}
          <div>
            <span className="text-[10px] font-mono font-black uppercase tracking-widest text-slate-500 block">
              SUMMARY
            </span>
            <p className="text-sm font-bold text-black mt-1 leading-snug">
              {explanation.summary}
            </p>
            <div className="mt-2">
              <span className="text-[10px] font-mono font-bold text-slate-500 uppercase">
                Recommended action (matches ML decision):
              </span>{' '}
              <span
                className={`inline-block px-2 py-0.5 rounded-md border border-black font-mono text-[10px] font-black uppercase ${
                  explanation.recommended_action === 'MAINTAIN'
                    ? 'bg-[#FFB3B3]'
                    : explanation.recommended_action === 'INSPECT'
                    ? 'bg-[#FFE600]'
                    : explanation.recommended_action === 'INSUFFICIENT_EVIDENCE'
                    ? 'bg-slate-200 text-slate-700'
                    : 'bg-[#C1F6C9]'
                }`}
              >
                {explanation.recommended_action.replace('_', ' ')}
              </span>
            </div>
          </div>

          {/* Why this decision */}
          <div>
            <span className="text-[10px] font-mono font-black uppercase tracking-widest text-slate-500 block">
              WHY THIS DECISION
            </span>
            <p className="text-xs text-slate-800 font-medium mt-1 leading-relaxed">
              {explanation.why}
            </p>
            {explanation.evidence_points.length > 0 && (
              <ul className="mt-2 space-y-1">
                {explanation.evidence_points.map((pt, i) => (
                  <li
                    key={i}
                    className="text-[11px] font-mono text-slate-700 flex items-start gap-2"
                  >
                    <span className="text-sky-700 font-black">•</span>
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* What to check */}
          {explanation.what_to_check.length > 0 && (
            <div>
              <span className="text-[10px] font-mono font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                <ListChecks className="w-3.5 h-3.5 text-sky-700" />
                WHAT TO CHECK
              </span>
              <div className="mt-2 space-y-2">
                {explanation.what_to_check.map((step, i) => (
                  <div
                    key={i}
                    className="p-3 bg-[#FFFDF0] rounded-2xl border-2 border-black flex items-start gap-3 text-xs"
                  >
                    <span className="font-mono font-black text-slate-500 shrink-0">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="text-slate-800 font-medium">{step}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Confidence statement */}
          {explanation.confidence_statement && (
            <div className="p-3 bg-[#FFFDF0] rounded-xl border border-black/30 text-[11px] font-medium text-slate-600 flex items-start gap-2">
              <HelpCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-500" />
              <span>{explanation.confidence_statement}</span>
            </div>
          )}

          {/* Limitations */}
          {explanation.limitations.length > 0 && (
            <div>
              <span className="text-[10px] font-mono font-black uppercase tracking-widest text-slate-500 block">
                LIMITATIONS
              </span>
              <ul className="mt-2 space-y-1">
                {explanation.limitations.map((lim, i) => (
                  <li
                    key={i}
                    className="text-[11px] text-slate-600 font-medium flex items-start gap-2"
                  >
                    <span className="text-slate-400 font-black">–</span>
                    <span>{lim}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
