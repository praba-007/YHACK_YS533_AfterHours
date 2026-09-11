import React, { useState } from 'react';
import { 
  MachineHealthResponse, 
  TelemetryPoint 
} from '../services/api';
import { 
  Activity, 
  ShieldCheck, 
  AlertTriangle, 
  HelpCircle,
  Clock, 
  Gauge, 
  Thermometer, 
  Zap, 
  ArrowRight,
  TrendingUp,
  Layers,
  Printer
} from 'lucide-react';
import { NavTab, OperationalUrgency } from '../types';

interface OverviewViewProps {
  machineHealth: MachineHealthResponse | null;
  telemetry: TelemetryPoint[];
  onNavigate: (tab: NavTab) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  machineHealth,
  telemetry,
  onNavigate,
}) => {
  const [selectedChannel, setSelectedChannel] = useState<'motor_current' | 'tp2' | 'tp3' | 'h1' | 'oil_temperature' | 'dv_pressure'>('motor_current');

  // Fallback defaults from real latest API state
  const decision = machineHealth?.decision || 'MONITOR';
  const operatingState = machineHealth?.operating_state || 'off';
  const anomalyDist = machineHealth?.anomaly_distance ?? 33.46;
  const elevatedThr = machineHealth?.elevated_threshold ?? 304.255;
  const severeThr = machineHealth?.severe_threshold ?? 729.718;
  const timestamp = machineHealth?.timestamp || '2020-09-01 03:59:00';
  const coverage = machineHealth?.quality_gate?.coverage ?? 1.0;

  const isInsufficientEvidence = decision === 'INSUFFICIENT EVIDENCE' || coverage < 0.6;

  // Anomaly Headroom: 100 * (1 - min(1, D_M / SevereThreshold))
  const conditionIndexVal = 100 * (1 - Math.min(1, anomalyDist / severeThr));
  const conditionIndexDisplay = isInsufficientEvidence ? 'UNKNOWN' : `${conditionIndexVal.toFixed(1)}%`;

  // P0 Operational Urgency mapping: MONITOR -> ROUTINE, INSPECT -> ELEVATED, MAINTAIN -> IMMEDIATE, INSUFFICIENT EVIDENCE -> UNKNOWN
  const operationalUrgency: OperationalUrgency = isInsufficientEvidence
    ? 'UNKNOWN'
    : decision === 'MAINTAIN'
    ? 'IMMEDIATE'
    : decision === 'INSPECT'
    ? 'ELEVATED'
    : 'ROUTINE';

  // P0 Severity Ratio: D_M / 304.25 (calibrated inspection threshold)
  const severityRatio = (anomalyDist / elevatedThr).toFixed(2);

  // Context evaluations derived from actual API values
  const unusualBehaviour = isInsufficientEvidence ? 'UNKNOWN' : anomalyDist >= severeThr ? 'CRITICAL' : anomalyDist >= elevatedThr ? 'ELEVATED' : 'LOW';
  const evidenceQuality = isInsufficientEvidence ? 'INSUFFICIENT' : coverage >= 0.8 ? 'HIGH' : 'LOW';

  // Read current readings
  const currentReadings = {
    motorCurrent: machineHealth?.sensor_readings?.motor_current_amps ?? null,
    tp2: machineHealth?.sensor_readings?.tp2_bar ?? null,
    tp3: machineHealth?.sensor_readings?.tp3_bar ?? null,
    h1: machineHealth?.sensor_readings?.h1_bar ?? null,
    oilTemp: machineHealth?.sensor_readings?.oil_temperature_c ?? null,
    dvPressure: machineHealth?.sensor_readings?.dv_pressure_bar ?? null,
  };

  // Humanize feature names cosmetically
  const formatFeatureName = (feat: string): string => {
    return feat
      .replace('H1_off_24h_p10', 'H1 Separator Drop · 24h lower percentile')
      .replace('H1_offloaded_24h_p90', 'H1 Separator Drop · Offloaded 24h upper percentile')
      .replace('H1_offloaded_24h_mean', 'H1 Separator Drop · Offloaded 24h mean')
      .replace('TP2_offloaded_24h_mean', 'TP2 Compressor Pressure · Offloaded 24h mean')
      .replace('TP2_offloaded_24h_p10', 'TP2 Compressor Pressure · Offloaded 24h lower percentile')
      .replace(/_/g, ' ');
  };

  // Channels metadata for mini-chart
  const channels = {
    motor_current: { label: 'Motor Current', unit: 'A', color: '#000000', stroke: '#000000', min: 0, max: 8 },
    tp2: { label: 'TP2 Compressor Pressure', unit: 'bar', color: '#70C5F8', stroke: '#0284c7', min: -0.5, max: 10 },
    tp3: { label: 'TP3 Panel Pressure', unit: 'bar', color: '#10b981', stroke: '#059669', min: 6, max: 10 },
    h1: { label: 'H1 Separator Drop', unit: 'bar', color: '#6366f1', stroke: '#4f46e5', min: -0.5, max: 10 },
    oil_temperature: { label: 'Oil Temperature', unit: '°C', color: '#f59e0b', stroke: '#d97706', min: 40, max: 85 },
    dv_pressure: { label: 'DV Pressure', unit: 'bar', color: '#64748b', stroke: '#475569', min: -0.1, max: 3 }
  };

  const activeChannelConfig = channels[selectedChannel];

  // SVG dimensions
  const svgWidth = 800;
  const svgHeight = 220;
  const padding = { top: 20, right: 30, bottom: 35, left: 55 };

  // Prepare chart coordinates from real telemetry points
  const pointsToRender = telemetry.length > 0 ? telemetry.slice(-40) : [];
  const chartValues = pointsToRender.map(p => Number(p[selectedChannel]) || 0);
  const minVal = chartValues.length > 0 ? Math.min(...chartValues) : 0;
  const maxVal = chartValues.length > 0 ? Math.max(...chartValues) : 1;
  const valRange = Math.max(0.01, maxVal - minVal);

  const getX = (index: number) => {
    if (pointsToRender.length <= 1) return padding.left;
    return padding.left + (index / (pointsToRender.length - 1)) * (svgWidth - padding.left - padding.right);
  };

  const getY = (val: number) => {
    const norm = (val - minVal) / valRange;
    return svgHeight - padding.bottom - norm * (svgHeight - padding.top - padding.bottom);
  };

  const polylinePoints = pointsToRender
    .map((p, i) => `${getX(i)},${getY(Number(p[selectedChannel]) || 0)}`)
    .join(' ');

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-10">
      {/* 1. Single Strong Hero Section */}
      <section className="bg-white border-4 border-black rounded-[32px] p-6 sm:p-10 shadow-[8px_8px_0_#000]">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-6 border-b-3 border-black">
          <div className="space-y-2 max-w-2xl">
            <span className="text-[11px] font-mono font-black uppercase tracking-widest text-slate-500">
              MACHINE OVERVIEW
            </span>
            <h2 className="font-comic text-3xl sm:text-5xl font-bold text-black tracking-tight leading-tight">
              Metro Air Compressor Unit 3
            </h2>
            <p className="text-base sm:text-lg font-bold text-slate-800">
              {decision === 'INSUFFICIENT EVIDENCE'
                ? 'Telemetry quality is not sufficient for a confident maintenance recommendation.'
                : decision === 'MAINTAIN'
                ? 'Severe anomaly detected. Maintenance action required.'
                : decision === 'INSPECT'
                ? 'Elevated anomaly detected. Component inspection recommended.'
                : 'Machine behaviour is within its expected operating pattern.'}
            </p>
            <p className="text-xs sm:text-sm font-semibold text-slate-600">
              {operatingState === 'off' ? 'Machine is currently idle (Motor draw < 0.5 A).' :
               operatingState === 'offloaded' ? 'Compressor running unpressurized (0.5 – 6.0 A).' :
               'Compressor actively pumping into reservoir (> 6.0 A).'}
            </p>
          </div>

          {/* Single Authoritative Decision Badge */}
          <div className="flex flex-col items-start sm:items-end shrink-0">
            <div className={`comic-badge text-xl sm:text-2xl px-6 py-2.5 ${
              decision === 'INSUFFICIENT EVIDENCE' ? 'bg-slate-200 text-slate-800' :
              decision === 'MAINTAIN' ? 'bg-[#FFB3B3] text-black' :
              decision === 'INSPECT' ? 'bg-[#FFE600] text-black' :
              'bg-[#C1F6C9] text-black'
            }`}>
              {decision}
            </div>
            <div className="text-xs font-mono font-bold text-slate-600 mt-2 text-right">
              <div>Dataset: MetroPT-3 · Historical telemetry</div>
              <div>Observation: {timestamp}</div>
            </div>
            <button
              onClick={() => window.print()}
              className="no-print mt-3 flex items-center gap-1.5 px-3.5 py-1.5 bg-[#FFE600] text-black border-2 border-black rounded-xl font-mono text-xs font-bold shadow-[2px_2px_0_#000] hover:bg-yellow-400 active:translate-x-0.5 active:translate-y-0.5 cursor-pointer transition-all"
              title="Print full machine overview report"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>PRINT REPORT</span>
            </button>
          </div>
        </div>

        {/* Compact 4-Column Intelligence & Context Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-6">
          <div className="p-4 rounded-2xl bg-[#FFFDF0] border-2 border-black">
            <span className="text-[10px] font-mono font-black uppercase text-slate-500 block">
              OPERATING STATE
            </span>
            <div className="font-comic text-2xl font-bold text-black mt-1 uppercase">
              {operatingState}
            </div>
            <span className="text-xs font-bold text-slate-600">
              {operatingState === 'off' ? 'Zero duty cycle draw (< 0.5 A)' :
               operatingState === 'offloaded' ? 'Unpressurized (0.5–6.0 A)' :
               'Full load pumping (> 6.0 A)'}
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-[#FFFDF0] border-2 border-black">
            <span className="text-[10px] font-mono font-black uppercase text-slate-500 block">
              ANOMALY HEADROOM
            </span>
            <div className="font-comic text-2xl font-bold text-black mt-1">
              {conditionIndexDisplay}
            </div>
            <span className="text-xs font-bold text-slate-600 font-mono">
              Headroom to calibrated severe boundary
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-[#FFFDF0] border-2 border-black">
            <span className="text-[10px] font-mono font-black uppercase text-slate-500 block">
              OPERATIONAL URGENCY
            </span>
            <div className={`font-comic text-2xl font-bold mt-1 uppercase ${
              operationalUrgency === 'IMMEDIATE' ? 'text-red-700' :
              operationalUrgency === 'ELEVATED' ? 'text-amber-700' :
              operationalUrgency === 'UNKNOWN' ? 'text-slate-600' :
              'text-emerald-700'
            }`}>
              {operationalUrgency}
            </div>
            <span className="text-xs font-bold text-slate-600 font-mono">
              Severity: {severityRatio}× of inspection thr
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-[#FFFDF0] border-2 border-black">
            <span className="text-[10px] font-mono font-black uppercase text-slate-500 block">
              EVIDENCE QUALITY
            </span>
            <div className="font-comic text-2xl font-bold text-black mt-1 uppercase">
              {evidenceQuality}
            </div>
            <span className="text-xs font-bold text-slate-600 font-mono">
              {(coverage * 100).toFixed(0)}% window coverage
            </span>
          </div>
        </div>

        {/* Anomaly Headroom Qualification Note */}
        <div className="pt-3 border-t border-black/10 text-[11px] font-medium text-slate-600">
          <strong>Anomaly Headroom:</strong> Headroom to calibrated severe boundary (DM = {anomalyDist.toFixed(2)}, Severe Threshold = {severeThr.toFixed(1)}). This is a condition indicator derived from anomaly distance. It is not failure probability or remaining useful life.
        </div>
      </section>

      {/* 2. Real Telemetry Section */}
      <section className="bg-white border-4 border-black rounded-[32px] p-6 sm:p-8 shadow-[8px_8px_0_#000] space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-black/20 pb-4">
          <div>
            <span className="text-[10px] font-mono font-black uppercase tracking-widest text-slate-500">
              TELEMETRY
            </span>
            <h3 className="font-comic text-2xl sm:text-3xl font-bold text-black flex items-center gap-2">
              <Activity className="w-6 h-6 text-sky-700" />
              MetroPT-3 Historical Telemetry
            </h3>
          </div>

          {/* Channel Selector Pills */}
          <div className="flex flex-wrap items-center gap-1.5 bg-[#FFFDF0] p-1.5 rounded-2xl border-2 border-black">
            {(Object.keys(channels) as Array<keyof typeof channels>).map(ch => (
              <button
                key={ch}
                onClick={() => setSelectedChannel(ch)}
                className={`px-3 py-1 rounded-xl text-xs font-black transition-all cursor-pointer ${
                  selectedChannel === ch
                    ? 'bg-black text-white shadow-[2px_2px_0_#000]'
                    : 'text-black hover:bg-[#C1F6C9]'
                }`}
              >
                {channels[ch].label.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>

        {/* Telemetry Waveform Visualization */}
        <div className="bg-[#FFFDF0] border-3 border-black rounded-2xl p-4 overflow-hidden shadow-[4px_4px_0_#000]">
          <div className="flex items-center justify-between text-xs font-mono font-bold mb-2">
            <span className="text-black font-black">
              {activeChannelConfig.label} ({activeChannelConfig.unit})
            </span>
            <span className="text-slate-600">
              {pointsToRender.length} samples from API (GET /api/machine/telemetry)
            </span>
          </div>

          {pointsToRender.length > 0 ? (
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="w-full h-48 sm:h-56 overflow-visible"
            >
              {/* Horizontal Gridlines */}
              {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
                const y = padding.top + pct * (svgHeight - padding.top - padding.bottom);
                const valAtLine = maxVal - pct * valRange;
                return (
                  <g key={idx}>
                    <line
                      x1={padding.left}
                      y1={y}
                      x2={svgWidth - padding.right}
                      y2={y}
                      stroke="#e2e8f0"
                      strokeDasharray="4 4"
                      strokeWidth="1"
                    />
                    <text
                      x={padding.left - 8}
                      y={y + 4}
                      textAnchor="end"
                      fontSize="10"
                      fontFamily="monospace"
                      fontWeight="bold"
                      fill="#64748b"
                    >
                      {valAtLine.toFixed(2)}
                    </text>
                  </g>
                );
              })}

              {/* Data Line */}
              <polyline
                fill="none"
                stroke="#000000"
                strokeWidth="2.5"
                points={polylinePoints}
              />

              {/* Data Points */}
              {pointsToRender.map((p, i) => (
                <circle
                  key={i}
                  cx={getX(i)}
                  cy={getY(Number(p[selectedChannel]) || 0)}
                  r="3.5"
                  fill="#70C5F8"
                  stroke="#000000"
                  strokeWidth="1.5"
                />
              ))}

              {/* X-axis Timestamps (first, middle, last) */}
              {pointsToRender.length > 0 && (
                <>
                  <text
                    x={getX(0)}
                    y={svgHeight - 8}
                    fontSize="10"
                    fontFamily="monospace"
                    fontWeight="bold"
                    fill="#475569"
                  >
                    {pointsToRender[0].timestamp.split(' ')[1] || pointsToRender[0].timestamp}
                  </text>
                  <text
                    x={getX(Math.floor(pointsToRender.length / 2))}
                    y={svgHeight - 8}
                    textAnchor="middle"
                    fontSize="10"
                    fontFamily="monospace"
                    fontWeight="bold"
                    fill="#475569"
                  >
                    {pointsToRender[Math.floor(pointsToRender.length / 2)].timestamp.split(' ')[1] || ''}
                  </text>
                  <text
                    x={getX(pointsToRender.length - 1)}
                    y={svgHeight - 8}
                    textAnchor="end"
                    fontSize="10"
                    fontFamily="monospace"
                    fontWeight="bold"
                    fill="#475569"
                  >
                    {pointsToRender[pointsToRender.length - 1].timestamp.split(' ')[1] || ''}
                  </text>
                </>
              )}
            </svg>
          ) : (
            <div className="py-12 text-center text-xs font-mono font-bold text-slate-500">
              Loading real telemetry from API endpoint...
            </div>
          )}
        </div>

        {/* Compact Current Reading Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
          <div className="p-3 bg-[#FFFDF0] rounded-2xl border-2 border-black text-center">
            <span className="text-[10px] font-bold text-slate-600 block">Motor Current</span>
            <span className="font-mono text-base font-black text-black">
              {currentReadings.motorCurrent !== null ? `${currentReadings.motorCurrent.toFixed(2)} A` : '—'}
            </span>
          </div>

          <div className="p-3 bg-[#FFFDF0] rounded-2xl border-2 border-black text-center">
            <span className="text-[10px] font-bold text-slate-600 block">TP2 Pressure</span>
            <span className="font-mono text-base font-black text-black">
              {currentReadings.tp2 !== null ? `${currentReadings.tp2.toFixed(2)} bar` : '—'}
            </span>
          </div>

          <div className="p-3 bg-[#FFFDF0] rounded-2xl border-2 border-black text-center">
            <span className="text-[10px] font-bold text-slate-600 block">TP3 Pressure</span>
            <span className="font-mono text-base font-black text-black">
              {currentReadings.tp3 !== null ? `${currentReadings.tp3.toFixed(2)} bar` : '—'}
            </span>
          </div>

          <div className="p-3 bg-[#FFFDF0] rounded-2xl border-2 border-black text-center">
            <span className="text-[10px] font-bold text-slate-600 block">H1 Filter Drop</span>
            <span className="font-mono text-base font-black text-black">
              {currentReadings.h1 !== null ? `${currentReadings.h1.toFixed(2)} bar` : '—'}
            </span>
          </div>

          <div className="p-3 bg-[#FFFDF0] rounded-2xl border-2 border-black text-center">
            <span className="text-[10px] font-bold text-slate-600 block">Oil Temperature</span>
            <span className="font-mono text-base font-black text-black">
              {currentReadings.oilTemp !== null ? `${currentReadings.oilTemp.toFixed(1)} °C` : '—'}
            </span>
          </div>

          <div className="p-3 bg-[#FFFDF0] rounded-2xl border-2 border-black text-center">
            <span className="text-[10px] font-bold text-slate-600 block">DV Pressure</span>
            <span className="font-mono text-base font-black text-black">
              {currentReadings.dvPressure !== null ? `${currentReadings.dvPressure.toFixed(2)} bar` : '—'}
            </span>
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <button
            onClick={() => onNavigate('TELEMETRY')}
            className="text-xs font-mono font-black text-black hover:text-sky-700 flex items-center gap-1.5 cursor-pointer underline"
          >
            <span>Open Dedicated Telemetry Explorer</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </section>

      {/* 3. Why This Decision & Maintenance Decision Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Top Model Contributors (7 cols) */}
        <section className="lg:col-span-7 bg-white border-4 border-black rounded-[32px] p-6 sm:p-8 shadow-[8px_8px_0_#000] space-y-4">
          <div className="flex items-center justify-between border-b-2 border-black/20 pb-3">
            <div>
              <span className="text-[10px] font-mono font-black uppercase tracking-widest text-slate-500">
                STATISTICAL ATTRIBUTION
              </span>
              <h3 className="font-comic text-2xl font-bold text-black flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-sky-700" />
                Top Model Contributors
              </h3>
            </div>
            <span className="text-[10px] font-mono font-bold bg-[#C1F6C9] px-2.5 py-0.5 rounded-full border border-black">
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

          <div className="space-y-3 pt-1">
            {machineHealth && machineHealth.top_contributing_sensors.length > 0 ? (
              machineHealth.top_contributing_sensors.slice(0, 4).map((cs, idx) => {
                const maxContrib = machineHealth.top_contributing_sensors[0].contribution || 1;
                const relPct = Math.round((cs.contribution / maxContrib) * 100);

                return (
                  <div key={cs.feature} className="p-3 bg-[#FFFDF0] rounded-2xl border-2 border-black space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-black text-black">{formatFeatureName(cs.feature)}</span>
                      <span className="font-mono font-black text-sky-800">
                        {relPct}% relative weight
                      </span>
                    </div>
                    <div className="h-2.5 w-full bg-slate-200 rounded-full border border-black overflow-hidden flex">
                      <div
                        className="bg-[#70C5F8] h-full"
                        style={{ width: `${Math.max(6, relPct)}%` }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-4 text-xs font-mono text-slate-600">
                Loading feature attribution vectors...
              </div>
            )}
          </div>

          <div className="pt-2 flex justify-end">
            <button
              onClick={() => onNavigate('DIAGNOSTICS')}
              className="text-xs font-mono font-black text-black hover:text-sky-700 flex items-center gap-1.5 cursor-pointer underline"
            >
              <span>View Full 5-Step Reasoning Chain</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </section>

        {/* Right: Maintenance Decision & Calibrated Boundaries (5 cols) */}
        <section className="lg:col-span-5 bg-white border-4 border-black rounded-[32px] p-6 sm:p-8 shadow-[8px_8px_0_#000] space-y-5 flex flex-col justify-between">
          <div>
            <div className="border-b-2 border-black/20 pb-3">
              <span className="text-[10px] font-mono font-black uppercase tracking-widest text-slate-500">
                DECISION SUPPORT
              </span>
              <h3 className="font-comic text-2xl font-bold text-black">
                Maintenance Decision
              </h3>
            </div>

            {/* Dynamic Directive Card */}
            <div className={`mt-4 p-5 rounded-2xl border-3 border-black space-y-3 shadow-[4px_4px_0_#000] ${
              decision === 'INSUFFICIENT EVIDENCE' ? 'bg-slate-200' :
              decision === 'MAINTAIN' ? 'bg-[#FFB3B3]' :
              decision === 'INSPECT' ? 'bg-[#FFE600]' :
              'bg-[#C1F6C9]'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-black uppercase tracking-wider block text-slate-700">
                  CURRENT DIRECTIVE
                </span>
                <span className="text-[10px] font-mono font-bold bg-white/80 px-2 py-0.5 rounded border border-black">
                  Decision Support
                </span>
              </div>
              <div className="font-comic text-3xl font-bold text-black">
                {decision}
              </div>
              <p className="text-xs font-bold text-slate-800 leading-snug">
                {decision === 'INSUFFICIENT EVIDENCE'
                  ? 'Telemetry quality is insufficient to evaluate machine condition reliably. Window coverage or continuity requirements not met.'
                  : decision === 'INSPECT'
                  ? 'Review the contributing signals and perform a maintenance inspection.'
                  : decision === 'MAINTAIN'
                  ? 'Maintenance action is indicated based on the current evidence.'
                  : 'Continue observation. No inspection is currently indicated by the model.'}
              </p>
              <div className="pt-2">
                {decision === 'INSUFFICIENT EVIDENCE' ? (
                  <button
                    onClick={() => onNavigate('DIAGNOSTICS')}
                    className="w-full py-2.5 px-4 bg-black text-white font-mono text-xs font-black rounded-xl border-2 border-black hover:bg-slate-800 transition-all shadow-[2px_2px_0_#000] flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Review Data Quality</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={() => onNavigate('MAINTENANCE')}
                    className="w-full py-2.5 px-4 bg-black text-white font-mono text-xs font-black rounded-xl border-2 border-black hover:bg-slate-800 transition-all shadow-[2px_2px_0_#000] flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Open Maintenance</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Calibrated Threshold Presentation */}
            <div className="mt-5 space-y-2">
              <span className="text-[10px] font-mono font-black uppercase tracking-wider text-slate-600 block">
                CALIBRATED THRESHOLD BOUNDARIES
              </span>
              <div className="space-y-1.5 text-xs font-mono">
                <div className="flex items-center justify-between p-2 rounded-xl bg-[#FFFDF0] border border-black font-bold">
                  <span className="text-emerald-800">MONITOR</span>
                  <span>DM &lt; {elevatedThr.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-xl bg-[#FFFDF0] border border-black font-bold">
                  <span className="text-amber-800">INSPECT (Calibrated)</span>
                  <span>DM &ge; {elevatedThr.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-xl bg-[#FFFDF0] border border-black font-bold">
                  <span className="text-red-800">MAINTAIN</span>
                  <span>DM &ge; {severeThr.toFixed(2)}</span>
                </div>
              </div>
              <p className="text-[10px] text-slate-500 font-medium pt-1">
                Threshold {elevatedThr.toFixed(2)} was calibrated on March 1–April 10 to satisfy the false alarm budget.
              </p>
            </div>
          </div>

          <div className="pt-3 border-t-2 border-black/20 flex justify-between items-center text-xs font-mono text-slate-600">
            <span>Asset: APU-COMP-03</span>
            <button
              onClick={() => onNavigate('VALIDATION')}
              className="font-black text-black hover:text-sky-700 flex items-center gap-1 cursor-pointer underline"
            >
              <span>Validation Results</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};
