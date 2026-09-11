import React from 'react';
import { 
  BaselinesComparisonResponse, 
  FailureEventsResponse, 
  PipelineSummaryResponse,
  QualityIndicatorsResponse
} from '../services/api';
import { 
  METROPT3_METADATA, 
  METROPT3_STATE_DISTRIBUTIONS, 
  METROPT3_BENCHMARK_RESULTS 
} from '../data/metroPt3Data';
import { 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Clock, 
  Database, 
  ArrowRight, 
  Layers, 
  BarChart3, 
  Info,
  ShieldCheck
} from 'lucide-react';

interface ValidationViewProps {
  baselines: BaselinesComparisonResponse | null;
  failureEvents: FailureEventsResponse | null;
  pipelineSummary: PipelineSummaryResponse | null;
  qualityIndicators: QualityIndicatorsResponse | null;
}

export const ValidationView: React.FC<ValidationViewProps> = ({
  baselines,
  failureEvents,
  pipelineSummary,
  qualityIndicators,
}) => {
  // Real primary results
  const recallPct = failureEvents ? Math.round(failureEvents.recall * 100) : 75;
  const detectedCount = failureEvents ? failureEvents.failures_detected : 3;
  const totalCount = failureEvents ? failureEvents.total_documented_failures : 4;
  const precisionPct = failureEvents ? (failureEvents.precision * 100).toFixed(2) : '6.02';
  const falseAlarmsPerMonth = baselines ? baselines.machpulse_mahalanobis.false_alarms_per_month.toFixed(2) : '42.91';

  // Failure event cards with honest status
  const events = [
    {
      id: 'F1',
      name: 'Failure Event #1 (Air Leak)',
      period: '2020-04-18 (24h window)',
      status: 'DETECTED DURING EVENT',
      statusType: 'detected',
      leadTime: '-19.6h from window start',
      note: 'Alert triggered at 19:36 on 18 Apr during continuous compressor loading cycle.'
    },
    {
      id: 'F2',
      name: 'Failure Event #2 (Air Leak)',
      period: '2020-05-29 (6.5h window)',
      status: 'MISSED',
      statusType: 'missed',
      leadTime: 'None (Zero lead credit)',
      note: 'Missed by model. Source maintenance log recorded a date typo ("30 Apr" entered for maintenance that followed 30 May incident).'
    },
    {
      id: 'F3',
      name: 'Failure Event #3 (Air Leak)',
      period: '2020-06-05 to 2020-06-07 (52.5h)',
      status: 'DETECTED DURING EVENT',
      statusType: 'detected',
      leadTime: '-17.8h from window start',
      note: 'Alert triggered at 03:50 on 6 Jun during progressive weekend pressure degradation.'
    },
    {
      id: 'F4',
      name: 'Failure Event #4 (Air Leak)',
      period: '2020-07-15 (4.5h window)',
      status: '+16.83H EARLY WARNING',
      statusType: 'early_warning',
      leadTime: '+16.83 hours advance notice',
      note: 'Early alert raised on 14 Jul at 21:40, providing 16.83 hours of operational advance warning prior to official maintenance report.'
    }
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-10">
      {/* 1. Header & Primary Results */}
      <section className="bg-white border-4 border-black rounded-[32px] p-6 sm:p-10 shadow-[8px_8px_0_#000]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-3 border-black pb-4 mb-6">
          <div>
            <span className="text-[10px] font-mono font-black uppercase tracking-widest text-slate-500">
              EMPIRICAL EVALUATION
            </span>
            <h2 className="font-comic text-3xl sm:text-4xl font-bold text-black tracking-tight">
              Model Validation & Benchmark
            </h2>
            <p className="text-xs sm:text-sm font-bold text-slate-700 mt-1">
              Evaluated strictly on held-out test data (April 11 – September 1, 2020) containing all documented air leak failure episodes.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold bg-[#C1F6C9] px-3 py-1.5 rounded-full border-2 border-black shadow-[2px_2px_0_#000]">
              Held-Out Test Data: Apr 11 – Sep 1
            </span>
          </div>
        </div>

        {/* Primary Result 3-Metric Hero */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-[#FFFDF0] border-3 border-black text-center">
            <span className="text-[10px] font-mono font-black uppercase text-slate-500 block">EVENT RECALL</span>
            <div className="font-comic text-4xl font-bold text-black mt-1">
              {recallPct}%
            </div>
            <span className="text-xs font-bold text-slate-600 font-mono">
              {detectedCount} of {totalCount} documented events detected
            </span>
          </div>

          <div className="p-5 rounded-2xl bg-[#FFFDF0] border-3 border-black text-center">
            <span className="text-[10px] font-mono font-black uppercase text-slate-500 block">F4 ADVANCE WARNING</span>
            <div className="font-comic text-4xl font-bold text-emerald-700 mt-1">
              +16.83h
            </div>
            <span className="text-xs font-bold text-slate-600">
              Early warning before maintenance log
            </span>
          </div>

          <div className="p-5 rounded-2xl bg-[#FFFDF0] border-3 border-black text-center">
            <span className="text-[10px] font-mono font-black uppercase text-slate-500 block">EVALUATION PRECISION</span>
            <div className="font-comic text-4xl font-bold text-black mt-1">
              {precisionPct}%
            </div>
            <span className="text-xs font-bold text-slate-600 font-mono">
              {falseAlarmsPerMonth} false alarms / month
            </span>
          </div>
        </div>
      </section>

      {/* 2. Failure Events (Honest Accounting) */}
      <section className="bg-white border-4 border-black rounded-[32px] p-6 sm:p-8 shadow-[8px_8px_0_#000] space-y-4">
        <div className="border-b-2 border-black/20 pb-3">
          <span className="text-[10px] font-mono font-black uppercase tracking-widest text-slate-500">
            EVENT ACCOUNTABILITY
          </span>
          <h3 className="font-comic text-2xl font-bold text-black">
            Documented Failure Events Performance
          </h3>
          <p className="text-xs text-slate-600 font-medium mt-1">
            F1 and F3 were detected during the active failure episode; F4 provided +16.83 hours early warning; F2 was missed.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
          {events.map(ev => {
            const isEarly = ev.statusType === 'early_warning';
            const isMissed = ev.statusType === 'missed';

            return (
              <div
                key={ev.id}
                className={`p-4 rounded-2xl border-3 border-black shadow-[4px_4px_0_#000] space-y-2.5 flex flex-col justify-between ${
                  isEarly ? 'bg-[#C1F6C9]' : isMissed ? 'bg-slate-100' : 'bg-white'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-black px-2 py-0.5 rounded bg-black text-white">
                      {ev.id}
                    </span>
                    <span className="text-[10px] font-mono text-slate-600 font-bold">
                      {ev.period}
                    </span>
                  </div>

                  <h4 className="font-comic text-lg font-bold text-black mt-2">
                    {ev.name}
                  </h4>

                  <div className="mt-2">
                    <span className={`inline-block px-2 py-0.5 rounded-md border border-black font-mono text-[10px] font-black uppercase ${
                      isEarly ? 'bg-emerald-700 text-white' :
                      isMissed ? 'bg-rose-700 text-white' :
                      'bg-[#70C5F8] text-black'
                    }`}>
                      {ev.status}
                    </span>
                  </div>

                  <div className="text-xs font-mono font-bold text-black mt-2">
                    Lead: {ev.leadTime}
                  </div>
                </div>

                <p className="text-[11px] text-slate-700 font-medium leading-relaxed pt-2 border-t border-black/10">
                  {ev.note}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. Benchmark Comparison Table (Real Data & Honest Positioning) */}
      <section className="bg-white border-4 border-black rounded-[32px] p-6 sm:p-8 shadow-[8px_8px_0_#000] space-y-6">
        <div className="border-b-2 border-black/20 pb-3">
          <span className="text-[10px] font-mono font-black uppercase tracking-widest text-slate-500">
            COMPARATIVE BASELINES
          </span>
          <h3 className="font-comic text-2xl font-bold text-black">
            System Benchmark Comparison
          </h3>
        </div>

        {/* Honest Positioning Banner */}
        <div className="p-4 rounded-2xl bg-[#FFFDF0] border-2 border-black flex items-start gap-3 text-xs font-medium text-slate-800">
          <Info className="w-5 h-5 text-sky-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <strong className="text-black font-black block">Honest Positioning & Engineering Tradeoffs:</strong>
            <p>
              MachPulse prioritizes machine-specific, explainable anomaly detection and evidence-based maintenance decisions.
              The naive fixed threshold achieves higher raw recall (100%) and fewer false alarms in this specific dataset, but provides zero advance notice and offers no multivariate attribution.
              MachPulse provides contextual, state-stratified explainability and achieved the only genuine advance warning (+16.83h on F4).
            </p>
          </div>
        </div>

        {/* Real Benchmark Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-sans text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-black uppercase text-[10px] bg-[#FFFDF0]">
                <th className="p-3">Monitoring Method</th>
                <th className="p-3">Alert Episodes</th>
                <th className="p-3">Event Recall</th>
                <th className="p-3">False Alarms / Month</th>
                <th className="p-3">Precision</th>
                <th className="p-3">Advance Warning</th>
                <th className="p-3">Explainability</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10 font-bold">
              {/* Fixed Threshold */}
              <tr className="hover:bg-slate-50">
                <td className="p-3">
                  <div className="font-black text-black">Fixed Threshold (Motor Current &gt; 4.0A sustained &ge;10m)</div>
                  <div className="text-[10px] text-slate-500 font-normal">Simple scalar rule implemented by on-board train automation</div>
                </td>
                <td className="p-3 font-mono text-sm">38</td>
                <td className="p-3 font-mono text-sm text-emerald-700 font-black">100% (4/4)</td>
                <td className="p-3 font-mono text-sm">8.03 / mo</td>
                <td className="p-3 font-mono text-sm">10.5%</td>
                <td className="p-3 font-mono text-xs text-slate-600">0.0h (Fires during)</td>
                <td className="p-3 text-xs text-slate-600 font-normal">None (Single threshold)</td>
              </tr>

              {/* LPS */}
              <tr className="hover:bg-slate-50">
                <td className="p-3">
                  <div className="font-black text-black">LPS On-Board Low Pressure Switch</div>
                  <div className="text-[10px] text-slate-500 font-normal">Train hardware pressure alarm (&lt;7.0 bar)</div>
                </td>
                <td className="p-3 font-mono text-sm">127</td>
                <td className="p-3 font-mono text-sm text-emerald-700 font-black">75% (3/4)</td>
                <td className="p-3 font-mono text-sm text-red-700">22.19 / mo</td>
                <td className="p-3 font-mono text-sm">2.36%</td>
                <td className="p-3 font-mono text-xs text-slate-600">0.0h (F4 2 days late)</td>
                <td className="p-3 text-xs text-slate-600 font-normal">Alarm bell only</td>
              </tr>

              {/* Isolation Forest */}
              <tr className="hover:bg-slate-50">
                <td className="p-3">
                  <div className="font-black text-black">Isolation Forest (Per-State Ensemble)</div>
                  <div className="text-[10px] text-slate-500 font-normal">Unsupervised tree-based partition baseline</div>
                </td>
                <td className="p-3 font-mono text-sm">28</td>
                <td className="p-3 font-mono text-sm text-amber-700 font-black">25% (1/4)</td>
                <td className="p-3 font-mono text-sm">5.50 / mo</td>
                <td className="p-3 font-mono text-sm">3.57%</td>
                <td className="p-3 font-mono text-xs text-slate-500">Not tracked</td>
                <td className="p-3 text-xs text-slate-600 font-normal">Low (Tree path heuristic)</td>
              </tr>

              {/* MachPulse */}
              <tr className="bg-[#C1F6C9]/40 border-t-2 border-black">
                <td className="p-3">
                  <div className="font-black text-black text-sm">MachPulse (State-Stratified Mahalanobis)</div>
                  <div className="text-[10px] text-slate-700 font-normal">Unsupervised multivariate distance on Feb baseline</div>
                </td>
                <td className="p-3 font-mono text-sm font-black">206</td>
                <td className="p-3 font-mono text-sm text-emerald-800 font-black">75% (3/4)</td>
                <td className="p-3 font-mono text-sm font-black">42.91 / mo</td>
                <td className="p-3 font-mono text-sm font-black">6.02%</td>
                <td className="p-3 font-mono text-xs text-black font-black">+16.83h on F4</td>
                <td className="p-3 text-xs text-emerald-800 font-black">Exact Feature Attribution</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* 4. Clean ML Methodology Flow */}
      <section className="bg-white border-4 border-black rounded-[32px] p-6 sm:p-8 shadow-[8px_8px_0_#000] space-y-6">
        <div className="border-b-2 border-black/20 pb-3">
          <span className="text-[10px] font-mono font-black uppercase tracking-widest text-slate-500">
            PIPELINE ARCHITECTURE
          </span>
          <h3 className="font-comic text-2xl font-bold text-black">
            Machine-Learning Anomaly Detection Architecture
          </h3>
          <p className="text-xs text-slate-600 font-medium mt-1">
            End-to-end processing pipeline transforming decimated raw sensor samples into calibrated maintenance decisions:
          </p>
        </div>

        {/* Linear Step-by-Step Flow */}
        <div className="grid grid-cols-1 sm:grid-cols-7 gap-2 text-center text-xs font-mono">
          <div className="p-3 rounded-2xl bg-[#FFFDF0] border-2 border-black">
            <span className="text-[9px] font-black text-slate-500 block uppercase">Step 1</span>
            <strong className="block text-black mt-1">RAW SENSORS</strong>
            <span className="text-[9px] text-slate-600 block mt-1">10s grid · 15 ch</span>
          </div>

          <div className="p-3 rounded-2xl bg-[#FFFDF0] border-2 border-black">
            <span className="text-[9px] font-black text-slate-500 block uppercase">Step 2</span>
            <strong className="block text-black mt-1">QUALITY GATE</strong>
            <span className="text-[9px] text-slate-600 block mt-1">&ge;60% coverage</span>
          </div>

          <div className="p-3 rounded-2xl bg-[#FFFDF0] border-2 border-black">
            <span className="text-[9px] font-black text-slate-500 block uppercase">Step 3</span>
            <strong className="block text-black mt-1">OPERATING STATE</strong>
            <span className="text-[9px] text-slate-600 block mt-1">Off / Idle / Loaded</span>
          </div>

          <div className="p-3 rounded-2xl bg-[#FFFDF0] border-2 border-black">
            <span className="text-[9px] font-black text-slate-500 block uppercase">Step 4</span>
            <strong className="block text-black mt-1">FEB BASELINE</strong>
            <span className="text-[9px] text-slate-600 block mt-1">μ &amp; Σ per state</span>
          </div>

          <div className="p-3 rounded-2xl bg-[#FFFDF0] border-2 border-black">
            <span className="text-[9px] font-black text-slate-500 block uppercase">Step 5</span>
            <strong className="block text-black mt-1">MULTI-WINDOWS</strong>
            <span className="text-[9px] text-slate-600 block mt-1">1h / 6h / 24h</span>
          </div>

          <div className="p-3 rounded-2xl bg-[#FFFDF0] border-2 border-black">
            <span className="text-[9px] font-black text-slate-500 block uppercase">Step 6</span>
            <strong className="block text-black mt-1">MAHALANOBIS</strong>
            <span className="text-[9px] text-slate-600 block mt-1">DM distance</span>
          </div>

          <div className="p-3 rounded-2xl bg-[#C1F6C9] border-2 border-black">
            <span className="text-[9px] font-black text-slate-700 block uppercase">Step 7</span>
            <strong className="block text-black mt-1">DECISION</strong>
            <span className="text-[9px] text-slate-800 block mt-1">Monitor/Inspect/Maint</span>
          </div>
        </div>

        {/* Dataset Provenance Footnote */}
        <div className="p-4 bg-[#FFFDF0] rounded-2xl border-2 border-black grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
          <div>
            <span className="text-slate-500 text-[10px] block">TOTAL OBSERVATIONS</span>
            <strong className="text-black">1,516,948 samples</strong>
          </div>
          <div>
            <span className="text-slate-500 text-[10px] block">WALL-CLOCK SPAN</span>
            <strong className="text-black">5,116 hours (~213 days)</strong>
          </div>
          <div>
            <span className="text-slate-500 text-[10px] block">MISSING DATA GAPS</span>
            <strong className="text-black">331 gaps (909.5h total)</strong>
          </div>
          <div>
            <span className="text-slate-500 text-[10px] block">CHRONOLOGICAL SPLIT</span>
            <strong className="text-black">Train Feb • Cal Mar • Test Apr–Aug</strong>
          </div>
        </div>
      </section>
    </div>
  );
};
