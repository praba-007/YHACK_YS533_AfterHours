import React from 'react';
import { MachineHealthResponse } from '../services/api';
import { AiInterpretationPanel } from './AiInterpretationPanel';
import { AiAssistantPanel } from './AiAssistantPanel';
import { 
  Cpu, 
  TrendingUp, 
  ShieldCheck, 
  Layers, 
  CheckCircle2, 
  Info, 
  AlertTriangle,
  ArrowRight,
  Database,
  Sliders
} from 'lucide-react';

import { OperationalUrgency } from '../types';

interface DiagnosticsViewProps {
  machineHealth: MachineHealthResponse | null;
}

export const DiagnosticsView: React.FC<DiagnosticsViewProps> = ({
  machineHealth,
}) => {
  const decision = machineHealth?.decision || 'MONITOR';
  const operatingState = machineHealth?.operating_state || 'off';
  const anomalyDistance = machineHealth?.anomaly_distance ?? 33.46;
  const elevatedThreshold = machineHealth?.elevated_threshold ?? 304.255;
  const severeThreshold = machineHealth?.severe_threshold ?? 729.718;
  const qualityGatePassed = machineHealth?.quality_gate.gate_passed ?? true;
  const coverage = machineHealth?.quality_gate.coverage ?? 1.0;
  const motorCurrent = machineHealth?.sensor_readings.motor_current_amps ?? 0.044;

  const isInsufficientEvidence = decision === 'INSUFFICIENT EVIDENCE' || coverage < 0.6;

  // Anomaly Headroom: 100 * (1 - min(1, D_M / SevereThreshold))
  const conditionIndexVal = 100 * (1 - Math.min(1, anomalyDistance / severeThreshold));
  const conditionIndexDisplay = isInsufficientEvidence ? 'UNKNOWN' : `${conditionIndexVal.toFixed(1)}%`;

  // P0 Operational Urgency: MONITOR -> ROUTINE, INSPECT -> ELEVATED, MAINTAIN -> IMMEDIATE, INSUFFICIENT EVIDENCE -> UNKNOWN
  const operationalUrgency: OperationalUrgency = isInsufficientEvidence
    ? 'UNKNOWN'
    : decision === 'MAINTAIN'
    ? 'IMMEDIATE'
    : decision === 'INSPECT'
    ? 'ELEVATED'
    : 'ROUTINE';

  // P0 Severity Ratio: D_M / 304.25
  const severityRatio = (anomalyDistance / elevatedThreshold).toFixed(2);

  // Format feature names cosmetically while preserving meaning
  const formatFeatureName = (feat: string): string => {
    return feat
      .replace('H1_off_24h_p10', 'H1 Separator Drop · 24h lower percentile')
      .replace('H1_offloaded_24h_p90', 'H1 Separator Drop · Offloaded 24h upper percentile')
      .replace('H1_offloaded_24h_mean', 'H1 Separator Drop · Offloaded 24h mean')
      .replace('TP2_offloaded_24h_mean', 'TP2 Compressor Pressure · Offloaded 24h mean')
      .replace('TP2_offloaded_24h_p10', 'TP2 Compressor Pressure · Offloaded 24h lower percentile')
      .replace(/_/g, ' ');
  };

  const topFeatures = machineHealth?.top_contributing_sensors || [
    { feature: 'H1_off_24h_p10', contribution: 41918.916 },
    { feature: 'H1_offloaded_24h_p90', contribution: 32147.064 },
    { feature: 'H1_offloaded_24h_mean', contribution: 26570.322 },
    { feature: 'TP2_offloaded_24h_mean', contribution: 22468.891 },
    { feature: 'TP2_offloaded_24h_p10', contribution: 21836.724 },
  ];

  const maxContrib = topFeatures[0]?.contribution || 1;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-10">
      {/* 1. Header & Diagnostic Summary */}
      <section className="bg-white border-4 border-black rounded-[32px] p-6 sm:p-10 shadow-[8px_8px_0_#000]">
        <div className="border-b-3 border-black pb-4 mb-6">
          <span className="text-[10px] font-mono font-black uppercase tracking-widest text-slate-500">
            EXPLAINABLE DECISION ENGINE
          </span>
          <h2 className="font-comic text-3xl sm:text-4xl font-bold text-black tracking-tight">
            Diagnostic Summary & Attribution
          </h2>
          <p className="text-xs sm:text-sm font-bold text-slate-700 mt-1">
            Why MachPulse reached this maintenance decision: objective decomposition of the Mahalanobis anomaly distance against healthy February baseline parameters.
          </p>
        </div>

        {/* 8-Metric Diagnostic Matrix */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-3">
          <div className={`p-4 rounded-2xl border-2 border-black text-center ${
            decision === 'INSUFFICIENT EVIDENCE' ? 'bg-slate-200' :
            decision === 'MAINTAIN' ? 'bg-[#FFB3B3]' :
            decision === 'INSPECT' ? 'bg-[#FFE600]' :
            'bg-[#C1F6C9]'
          }`}>
            <span className="text-[10px] font-mono font-black uppercase text-slate-700 block">DECISION</span>
            <span className="font-comic text-2xl font-bold text-black">{decision}</span>
          </div>

          <div className="p-4 bg-[#FFFDF0] rounded-2xl border-2 border-black text-center">
            <span className="text-[10px] font-mono font-black uppercase text-slate-500 block">OPERATIONAL URGENCY</span>
            <span className={`font-comic text-2xl font-bold uppercase ${
              operationalUrgency === 'IMMEDIATE' ? 'text-red-700' :
              operationalUrgency === 'ELEVATED' ? 'text-amber-700' :
              operationalUrgency === 'UNKNOWN' ? 'text-slate-600' :
              'text-emerald-700'
            }`}>
              {operationalUrgency}
            </span>
          </div>

          <div className="p-4 bg-[#FFFDF0] rounded-2xl border-2 border-black text-center">
            <span className="text-[10px] font-mono font-black uppercase text-slate-500 block">ANOMALY HEADROOM</span>
            <span className="font-mono text-2xl font-black text-black">{conditionIndexDisplay}</span>
          </div>

          <div className="p-4 bg-[#FFFDF0] rounded-2xl border-2 border-black text-center">
            <span className="text-[10px] font-mono font-black uppercase text-slate-500 block">OPERATING STATE</span>
            <span className="font-mono text-2xl font-black text-black uppercase">{operatingState}</span>
          </div>

          <div className="p-4 bg-[#FFFDF0] rounded-2xl border-2 border-black text-center">
            <span className="text-[10px] font-mono font-black uppercase text-slate-500 block">MAHALANOBIS DM</span>
            <span className="font-mono text-2xl font-black text-black">{anomalyDistance.toFixed(2)}</span>
          </div>

          <div className="p-4 bg-[#FFFDF0] rounded-2xl border-2 border-black text-center">
            <span className="text-[10px] font-mono font-black uppercase text-slate-500 block">SEVERITY RATIO</span>
            <span className="font-mono text-2xl font-black text-slate-900">{severityRatio}×</span>
          </div>

          <div className="p-4 bg-[#FFFDF0] rounded-2xl border-2 border-black text-center">
            <span className="text-[10px] font-mono font-black uppercase text-slate-500 block">INSPECT THRESHOLD</span>
            <span className="font-mono text-2xl font-black text-amber-800">{elevatedThreshold.toFixed(2)}</span>
          </div>

          <div className="p-4 bg-[#FFFDF0] rounded-2xl border-2 border-black text-center">
            <span className="text-[10px] font-mono font-black uppercase text-slate-500 block">EVIDENCE QUALITY</span>
            <span className="font-mono text-2xl font-black text-emerald-800">{(coverage * 100).toFixed(0)}%</span>
          </div>
        </div>

        <div className="mt-4 p-3 bg-[#FFFDF0] rounded-xl border border-black/20 text-[11px] font-medium text-slate-600">
          <strong>Anomaly Headroom:</strong> Headroom to calibrated severe boundary (DM = {anomalyDistance.toFixed(2)}, Severe Threshold = {severeThreshold.toFixed(1)}). This is a condition indicator derived from anomaly distance. It is not failure probability or remaining useful life.
        </div>
      </section>

      {/* 1b. AI Interpretation (Phase 4) - explains the decision above; never changes it */}
      <AiInterpretationPanel machineHealth={machineHealth} />

      {/* 1c. Technician AI Assistant (Phase 5B) - interactive evidence-grounded chat */}
      <AiAssistantPanel machineHealth={machineHealth} />

      {/* 2. What Contributed? (Top Model Contributors) */}
      <section className="bg-white border-4 border-black rounded-[32px] p-6 sm:p-8 shadow-[8px_8px_0_#000] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b-2 border-black/20 pb-3">
          <div>
            <span className="text-[10px] font-mono font-black uppercase tracking-widest text-slate-500">
              FEATURE DECOMPOSITION
            </span>
            <h3 className="font-comic text-2xl font-bold text-black flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-sky-700" />
              Top Model Contributors
            </h3>
          </div>
          <span className="text-xs font-mono font-bold bg-[#C1F6C9] px-3 py-1 rounded-full border border-black">
            Aggregate Attribution
          </span>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-700">
            Features that contributed most strongly across the evaluated test observations.
          </p>
          <p className="text-[11px] font-medium text-slate-500 italic">
            These are statistical model contributors, not confirmed physical causes.
          </p>
        </div>

        <div className="p-3 bg-[#FFFDF0] rounded-2xl border border-black text-xs font-medium text-slate-700">
          <strong>Statistical note:</strong> Values represent statistical contribution to the Mahalanobis anomaly distance under the state-stratified covariance kernel across evaluated observations. They quantify which feature dimensions diverge most from the baseline distribution, but are statistical model contributors rather than confirmed physical causes.
        </div>

        <div className="space-y-4 pt-2">
          {topFeatures.map((feat, idx) => {
            const relWeight = Math.round((feat.contribution / maxContrib) * 100);
            return (
              <div key={feat.feature} className="p-4 bg-[#FFFDF0] rounded-2xl border-2 border-black space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                  <div>
                    <span className="font-black text-black text-sm">{formatFeatureName(feat.feature)}</span>
                    <span className="text-[11px] font-mono text-slate-500 ml-2">({feat.feature})</span>
                  </div>
                  <div className="font-mono text-right">
                    <span className="font-black text-black text-sm">{feat.contribution.toFixed(1)}</span>
                    <span className="text-slate-600 ml-1">magnitude · <strong>{relWeight}%</strong> relative weight</span>
                  </div>
                </div>

                <div className="h-3 w-full bg-slate-200 rounded-full border border-black overflow-hidden flex">
                  <div
                    className="bg-[#70C5F8] h-full"
                    style={{ width: `${Math.max(5, relWeight)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. 5-Step Reasoning Chain */}
      <section className="bg-white border-4 border-black rounded-[32px] p-6 sm:p-8 shadow-[8px_8px_0_#000] space-y-6">
        <div className="border-b-2 border-black/20 pb-3">
          <span className="text-[10px] font-mono font-black uppercase tracking-widest text-slate-500">
            AUDITABLE INFERENCE
          </span>
          <h3 className="font-comic text-2xl font-bold text-black">
            How MachPulse Reached This Decision
          </h3>
          <p className="text-xs text-slate-600 font-medium mt-1">
            Five sequential verification gates executed deterministically by the decision engine:
          </p>
        </div>

        <div className="space-y-3">
          <div className="p-4 bg-[#FFFDF0] rounded-2xl border-2 border-black flex items-start gap-3 text-xs">
            <div className={`w-8 h-8 rounded-full border-2 border-black flex items-center justify-center font-mono font-black shrink-0 ${
              isInsufficientEvidence ? 'bg-[#FFB3B3]' : 'bg-[#FFE600]'
            }`}>
              1
            </div>
            <div className="space-y-0.5">
              <div className="font-black text-black text-sm">DATA QUALITY GATE</div>
              <p className="font-medium text-slate-700">
                Recent telemetry window coverage is <strong>{(coverage * 100).toFixed(0)}%</strong> (threshold: &ge;60%). {isInsufficientEvidence ? 'Quality gate failed; insufficient evidence for health evaluation.' : 'Telemetry is verified sufficiently complete for reliable evaluation.'}
              </p>
            </div>
          </div>

          <div className="p-4 bg-[#FFFDF0] rounded-2xl border-2 border-black flex items-start gap-3 text-xs">
            <div className="w-8 h-8 rounded-full bg-[#FFE600] border-2 border-black flex items-center justify-center font-mono font-black shrink-0">
              2
            </div>
            <div className="space-y-0.5">
              <div className="font-black text-black text-sm">OPERATING STATE CLASSIFICATION</div>
              <p className="font-medium text-slate-700">
                Current sample motor current is <strong>{motorCurrent.toFixed(3)} A</strong> ({operatingState === 'off' ? '< 0.5 A' : operatingState === 'offloaded' ? '0.5 – 6.0 A' : '> 6.0 A'}), classifying the compressor state as <strong>{operatingState.toUpperCase()}</strong>. This routes the sample to the {operatingState.toUpperCase()}-state baseline covariance matrix.
              </p>
            </div>
          </div>

          <div className="p-4 bg-[#FFFDF0] rounded-2xl border-2 border-black flex items-start gap-3 text-xs">
            <div className="w-8 h-8 rounded-full bg-[#FFE600] border-2 border-black flex items-center justify-center font-mono font-black shrink-0">
              3
            </div>
            <div className="space-y-0.5">
              <div className="font-black text-black text-sm">HEALTHY BASELINE COMPARISON</div>
              <p className="font-medium text-slate-700">
                Features are centered and scaled by the state-specific mean vector μ and precision kernel Σ⁻¹ fitted on 241,000 healthy February 2020 samples.
              </p>
            </div>
          </div>

          <div className="p-4 bg-[#FFFDF0] rounded-2xl border-2 border-black flex items-start gap-3 text-xs">
            <div className="w-8 h-8 rounded-full bg-[#FFE600] border-2 border-black flex items-center justify-center font-mono font-black shrink-0">
              4
            </div>
            <div className="space-y-0.5">
              <div className="font-black text-black text-sm">ANOMALY DISTANCE COMPUTATION</div>
              <p className="font-medium text-slate-700">
                Multivariate statistical distance evaluates to <strong>DM = {anomalyDistance.toFixed(2)}</strong>. {isInsufficientEvidence ? 'Distance evaluation flagged due to quality gate.' : 'The sample is compared against expected idle telemetry distribution.'}
              </p>
            </div>
          </div>

          <div className="p-4 bg-[#FFFDF0] rounded-2xl border-2 border-black flex items-start gap-3 text-xs">
            <div className={`w-8 h-8 rounded-full border-2 border-black flex items-center justify-center font-mono font-black shrink-0 ${
              decision === 'INSUFFICIENT EVIDENCE' ? 'bg-slate-200' :
              decision === 'MAINTAIN' ? 'bg-[#FFB3B3]' :
              decision === 'INSPECT' ? 'bg-[#FFE600]' :
              'bg-[#C1F6C9]'
            }`}>
              5
            </div>
            <div className="space-y-0.5">
              <div className="font-black text-black text-sm">DECISION GATE ARBITRATION</div>
              <p className="font-medium text-slate-700">
                {decision === 'INSUFFICIENT EVIDENCE' ? (
                  <>Because window coverage is below the quality threshold, the decision gate emits <strong>INSUFFICIENT EVIDENCE</strong>. Machine condition cannot be evaluated reliably.</>
                ) : decision === 'MAINTAIN' ? (
                  <>Because DM ({anomalyDistance.toFixed(2)}) meets or exceeds the calibrated severe boundary ({severeThreshold.toFixed(2)}), the system emits <strong>MAINTAIN</strong>.</>
                ) : decision === 'INSPECT' ? (
                  <>Because DM ({anomalyDistance.toFixed(2)}) meets or exceeds the calibrated inspection boundary ({elevatedThreshold.toFixed(2)}), the system emits <strong>INSPECT</strong>.</>
                ) : (
                  <>Because DM ({anomalyDistance.toFixed(2)}) is below the calibrated inspection boundary ({elevatedThreshold.toFixed(2)}), the system emits <strong>MONITOR</strong>.</>
                )}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Small Methodology Notes (No Unnecessary Defensive Copy) */}
      <section className="p-5 bg-white border-2 border-black rounded-2xl space-y-2 text-xs text-slate-700 font-medium">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-sky-700 shrink-0 mt-0.5" />
          <div>
            <strong>LPS EXCLUDED TO PREVENT LEAKAGE:</strong> The train's low-pressure switch (LPS) alarm fired 127 times during operation. LPS is an onboard alarm signal and is excluded from model features to avoid target leakage.
          </div>
        </div>
        <div className="flex items-start gap-2 pt-1 border-t border-black/10">
          <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
          <div>
            No RUL estimate is produced. MachPulse reports anomaly condition and maintenance decisions based strictly on statistical evidence.
          </div>
        </div>
      </section>
    </div>
  );
};
