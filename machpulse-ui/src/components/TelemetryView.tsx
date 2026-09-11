import React, { useState } from 'react';
import { TelemetryPoint, ReplayStatusResponse } from '../services/api';
import { 
  Activity, 
  Gauge, 
  Thermometer, 
  Zap, 
  BarChart2, 
  ArrowUpDown, 
  Filter, 
  Info, 
  Clock, 
  TrendingUp, 
  Sliders, 
  Play, 
  Pause, 
  RotateCcw, 
  FastForward, 
  CheckCircle2,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';
import { METROPT3_STATE_DISTRIBUTIONS } from '../data/metroPt3Data';

interface TelemetryViewProps {
  telemetry: TelemetryPoint[];
  replayStatus?: ReplayStatusResponse | null;
  replayLoading?: boolean;
  replayError?: string | null;
  onPlayPause?: () => void;
  onReset?: () => void;
  onSetSpeed?: (speed: number) => void;
  onRetryReplay?: () => void;
  onRefreshData?: () => void;
}

type ChannelKey = 'motor_current' | 'tp2' | 'tp3' | 'h1' | 'oil_temperature' | 'dv_pressure';

export const TelemetryView: React.FC<TelemetryViewProps> = ({
  telemetry,
  replayStatus = null,
  replayLoading = false,
  replayError = null,
  onPlayPause,
  onReset,
  onSetSpeed,
  onRetryReplay,
}) => {
  const [activeChannel, setActiveChannel] = useState<ChannelKey>('motor_current');
  const [sampleLimit, setSampleLimit] = useState<number>(60);

  const channels: Record<ChannelKey, { label: string; unit: string; description: string; role: string }> = {
    motor_current: {
      label: 'Motor Current',
      unit: 'A',
      description: '3-phase compressor electric current draw. Serves as primary load and operating-state classifier (<0.5A Off, 0.5–6A Offloaded, >6A Loaded).',
      role: 'Operating State Classifier & Load Proxy'
    },
    tp2: {
      label: 'Compressor Pressure (TP2)',
      unit: 'bar',
      description: 'Compressor output discharge line pressure. Rises to 8–10 bar during compression cycles and remains elevated during air leak events.',
      role: 'Primary Air Leak Detection Indicator'
    },
    tp3: {
      label: 'Pneumatic Panel Pressure (TP3)',
      unit: 'bar',
      description: 'Downstream main train reservoir pneumatic panel pressure (governed between 8.5 bar cut-in and 10 bar cut-out).',
      role: 'Train Air Reservoir Demand'
    },
    h1: {
      label: 'Separator Filter Drop (H1)',
      unit: 'bar',
      description: 'Cyclonic oil separator filter pressure differential. Mirrors TP2 inverse: collapses to ~0 bar during severe pneumatic air leaks.',
      role: 'Separator Integrity & Flow Divergence'
    },
    oil_temperature: {
      label: 'Oil Temperature',
      unit: '°C',
      description: 'Core rotary screw lubricating oil temperature. Subject to slow seasonal thermal drift across February to August in Porto.',
      role: 'Thermal Friction & Seasonal Confound'
    },
    dv_pressure: {
      label: 'Dryer Discharge Pressure (DV)',
      unit: 'bar',
      description: 'Air dryer tower discharge pressure drop. Drops to 0 under normal compression load; isolates F4 dryer event from earlier leaks.',
      role: 'Air Dryer Tower Regeneration'
    }
  };

  const channelMeta = channels[activeChannel];

  // Slice displayed points based on user filter (default 60)
  const displayedPoints = (telemetry || []).slice(-sampleLimit);

  // Deterministic statistics calculated from displayed window
  const values = displayedPoints.map(p => (p[activeChannel] !== null ? Number(p[activeChannel]) : 0));
  const latestVal = values.length > 0 ? values[values.length - 1] : 0;
  const minVal = values.length > 0 ? Math.min(...values) : 0;
  const maxVal = values.length > 0 ? Math.max(...values) : 0;
  const avgVal = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;

  // Operating state counts in displayed window
  const offCount = displayedPoints.filter(p => p.operating_state === 'off').length;
  const offloadedCount = displayedPoints.filter(p => p.operating_state === 'offloaded').length;
  const loadedCount = displayedPoints.filter(p => p.operating_state === 'loaded').length;

  // Multi-Scale Behaviour Over Time
  const shortTermSlice = displayedPoints.slice(-60);
  const shortTermVals = shortTermSlice.map(p => (p[activeChannel] !== null ? Number(p[activeChannel]) : 0));
  const shortTermMean = shortTermVals.length > 0 ? shortTermVals.reduce((a, b) => a + b, 0) / shortTermVals.length : 0;
  const shortTermDelta = shortTermVals.length >= 2 ? shortTermVals[shortTermVals.length - 1] - shortTermVals[0] : 0;
  const shortTermSlopeLabel = Math.abs(shortTermDelta) < 0.005 ? 'Stable / Flat' : shortTermDelta > 0 ? `Rising (+${shortTermDelta.toFixed(3)})` : `Falling (${shortTermDelta.toFixed(3)})`;

  const mediumTermVals = (telemetry || []).map(p => (p[activeChannel] !== null ? Number(p[activeChannel]) : 0));
  const mediumTermMean = mediumTermVals.length > 0 ? mediumTermVals.reduce((a, b) => a + b, 0) / mediumTermVals.length : 0;
  const mediumTermDelta = mediumTermVals.length >= 2 ? mediumTermVals[mediumTermVals.length - 1] - mediumTermVals[0] : 0;

  // 24h State-Stratified Baseline Comparison
  const dominantState = offCount >= offloadedCount && offCount >= loadedCount ? 'OFF' : loadedCount >= offloadedCount ? 'LOADED' : 'OFFLOADED';
  const baselineDistribution = METROPT3_STATE_DISTRIBUTIONS.find(d => d.state === dominantState) || METROPT3_STATE_DISTRIBUTIONS[0];
  const baselineMean = baselineDistribution.means[activeChannel];
  const baselineDelta = latestVal - baselineMean;

  // Cycling Dynamics & Operating Patterns
  let loadTransitions = 0;
  for (let i = 1; i < displayedPoints.length; i++) {
    if (displayedPoints[i].operating_state === 'loaded' && displayedPoints[i - 1].operating_state !== 'loaded') {
      loadTransitions++;
    }
  }
  const loadedDutyPct = ((loadedCount / Math.max(1, displayedPoints.length)) * 100).toFixed(1);

  // Temperature trend
  const oilTempVals = displayedPoints.map(p => (p.oil_temperature !== null ? Number(p.oil_temperature) : 0));
  const oilTempDelta = oilTempVals.length >= 2 ? oilTempVals[oilTempVals.length - 1] - oilTempVals[0] : 0;
  const oilTempSlopeLabel = Math.abs(oilTempDelta) < 0.1 ? 'Thermal Equilibrium' : oilTempDelta > 0 ? `Warming (+${oilTempDelta.toFixed(1)} °C)` : `Cooling (${oilTempDelta.toFixed(1)} °C)`;

  // SVG dimensions
  const svgWidth = 900;
  const svgHeight = 280;
  const padding = { top: 25, right: 30, bottom: 40, left: 60 };
  const valRange = Math.max(0.001, maxVal - minVal);

  const getX = (index: number) => {
    if (displayedPoints.length <= 1) return padding.left;
    return padding.left + (index / (displayedPoints.length - 1)) * (svgWidth - padding.left - padding.right);
  };

  const getY = (val: number) => {
    const norm = (val - minVal) / valRange;
    return svgHeight - padding.bottom - norm * (svgHeight - padding.top - padding.bottom);
  };

  const polylinePoints = displayedPoints
    .map((p, i) => `${getX(i)},${getY(p[activeChannel] !== null ? Number(p[activeChannel]) : minVal)}`)
    .join(' ');

  const currentReplayTime = replayStatus?.current_timestamp || (displayedPoints.length > 0 ? displayedPoints[displayedPoints.length - 1].timestamp : '2020-09-01 02:00:00');

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">

      {/* 0. Historical Telemetry Replay Control Bar */}
      <section className="bg-white border-4 border-black rounded-[32px] p-5 sm:p-6 shadow-[8px_8px_0_#000] space-y-4">
        {/* Error Banner if replay API failed */}
        {replayError && (
          <div className="flex items-center justify-between gap-3 p-3.5 bg-rose-50 border-2 border-rose-500 rounded-2xl text-xs font-mono text-rose-900 shadow-[2px_2px_0_#000]">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span className="font-bold">Replay unavailable: {replayError}</span>
            </div>
            {onRetryReplay && (
              <button
                onClick={onRetryReplay}
                className="px-3 py-1 bg-white border-2 border-rose-600 rounded-xl text-xs font-bold hover:bg-rose-100 text-rose-900 cursor-pointer flex items-center gap-1 transition-all active:translate-x-0.5 active:translate-y-0.5"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Retry</span>
              </button>
            )}
          </div>
        )}

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b-2 border-black/20 pb-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="px-3 py-1 bg-[#FFE600] border-2 border-black rounded-full text-xs font-mono font-black text-black tracking-wide shadow-[2px_2px_0_#000]">
              Historical replay • MetroPT-3 recorded data
            </span>
            {replayStatus?.completed ? (
              <span className="px-3 py-1 bg-rose-100 text-rose-900 border-2 border-black rounded-full text-xs font-mono font-black shadow-[2px_2px_0_#000]">
                REPLAY COMPLETE
              </span>
            ) : replayStatus?.running ? (
              <span className="flex items-center gap-1.5 text-xs font-mono font-black text-emerald-900 bg-[#C1F6C9] px-3 py-1 rounded-full border-2 border-black shadow-[2px_2px_0_#000]">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-ping"></span>
                PLAYING
              </span>
            ) : (
              <span className="px-3 py-1 bg-amber-100 text-amber-900 border-2 border-black rounded-full text-xs font-mono font-black shadow-[2px_2px_0_#000]">
                PAUSED
              </span>
            )}
          </div>

          {/* Controls: Play/Pause, Reset, Speed */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Play/Pause */}
            <button
              onClick={onPlayPause}
              disabled={replayLoading}
              className={`px-4 py-2 rounded-xl border-2 border-black font-mono font-black text-xs cursor-pointer shadow-[2px_2px_0_#000] flex items-center gap-2 transition-all active:translate-x-0.5 active:translate-y-0.5 ${
                replayStatus?.running
                  ? 'bg-[#FFE600] hover:bg-amber-300 text-black'
                  : 'bg-[#C1F6C9] hover:bg-[#9BE3A8] text-black'
              } ${replayLoading ? 'opacity-70 cursor-wait' : ''}`}
            >
              {replayStatus?.running ? (
                <>
                  <Pause className="w-4 h-4" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  <span>Play Replay</span>
                </>
              )}
            </button>

            {/* Reset */}
            <button
              onClick={onReset}
              disabled={replayLoading}
              className={`px-3 py-2 rounded-xl border-2 border-black font-mono font-bold text-xs bg-[#FFFDF0] hover:bg-slate-100 text-black cursor-pointer shadow-[2px_2px_0_#000] flex items-center gap-1.5 transition-all active:translate-x-0.5 active:translate-y-0.5 ${
                replayLoading ? 'opacity-70 cursor-wait' : ''
              }`}
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reset</span>
            </button>

            {/* Speeds: 1x, 5x, 20x */}
            <div className="flex items-center gap-1 bg-[#FFFDF0] p-1 rounded-xl border-2 border-black">
              {[1, 5, 20].map((s) => (
                <button
                  key={s}
                  onClick={() => onSetSpeed && onSetSpeed(s)}
                  disabled={replayLoading}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono font-black border transition-all cursor-pointer ${
                    (replayStatus?.speed || 1) === s
                      ? 'bg-black text-white border-black shadow-[1px_1px_0_#000]'
                      : 'bg-white text-black border-transparent hover:border-black'
                  }`}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Status Info Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono text-slate-700">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-sky-700 shrink-0" />
            <span>
              Replay timestamp: <strong className="text-black font-black">{currentReplayTime}</strong>
            </span>
          </div>

          <div className="flex items-center gap-4 text-[11px]">
            <span>
              Observation: <strong className="text-black font-black">{(replayStatus?.current_index ?? 0) + 1}</strong> / {replayStatus?.total_observations || 120}
            </span>
            <span>
              Speed: <strong className="text-black font-black">{replayStatus?.speed || 1}×</strong>
            </span>
          </div>
        </div>
      </section>

      {/* 1. Header Banner */}
      <div className="bg-white border-4 border-black rounded-[32px] p-6 sm:p-8 shadow-[8px_8px_0_#000]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-3 border-black pb-4">
          <div>
            <span className="text-[10px] font-mono font-black uppercase tracking-widest text-slate-500">
              HISTORICAL TELEMETRY EXPLORER
            </span>
            <h2 className="font-comic text-3xl sm:text-4xl font-bold text-black tracking-tight">
              MetroPT-3 · Historical Telemetry
            </h2>
            <p className="text-xs sm:text-sm font-bold text-slate-700 mt-1">
              Recorded observations • no synthetic sensor values. Chronological 1-minute grid sensor samples returned directly from FastAPI (<code className="font-mono text-black bg-[#FFFDF0] px-1.5 py-0.5 rounded border border-black">GET /api/machine/telemetry</code>).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-slate-600">Window:</span>
            {[30, 60, 120].map(cnt => (
              <button
                key={cnt}
                onClick={() => setSampleLimit(cnt)}
                className={`px-3 py-1 rounded-xl text-xs font-mono font-black border-2 border-black transition-all cursor-pointer ${
                  sampleLimit === cnt
                    ? 'bg-black text-white shadow-[2px_2px_0_#000]'
                    : 'bg-[#FFFDF0] text-black hover:bg-[#C1F6C9]'
                }`}
              >
                {cnt}m
              </button>
            ))}
          </div>
        </div>

        {/* Channel Selector Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-6">
          {(Object.keys(channels) as ChannelKey[]).map(ch => {
            const isActive = activeChannel === ch;
            const currentP = displayedPoints.length > 0 && displayedPoints[displayedPoints.length - 1][ch] !== null
              ? Number(displayedPoints[displayedPoints.length - 1][ch])
              : 0;
            return (
              <button
                key={ch}
                onClick={() => setActiveChannel(ch)}
                className={`p-3 rounded-2xl border-2 border-black text-left transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#70C5F8] text-black shadow-[3px_3px_0_#000] font-black'
                    : 'bg-[#FFFDF0] text-black hover:bg-slate-50 shadow-[1.5px_1.5px_0_#000]'
                }`}
              >
                <div className="text-[10px] font-mono uppercase font-bold text-slate-700 truncate">
                  {channels[ch].label.split(' ')[0]}
                </div>
                <div className="font-mono text-base font-black truncate mt-0.5">
                  {displayedPoints.length > 0 && displayedPoints[displayedPoints.length - 1][ch] !== null ? currentP.toFixed(2) : '--'} <span className="text-[10px] font-bold">{channels[ch].unit}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Primary Telemetry Waveform Card */}
      <div className="bg-white border-4 border-black rounded-[32px] p-6 sm:p-8 shadow-[8px_8px_0_#000] space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b-2 border-black/20 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-sky-700" />
              <h3 className="font-comic text-2xl font-bold text-black">
                {channelMeta.label}
              </h3>
              <span className="text-xs font-mono font-bold bg-[#C1F6C9] px-2.5 py-0.5 rounded-full border border-black">
                Unit: {channelMeta.unit}
              </span>
            </div>
            <p className="text-xs text-slate-600 font-medium mt-1">
              {channelMeta.description}
            </p>
          </div>

          <div className="text-xs font-mono text-slate-600 text-right">
            <div>Displaying {displayedPoints.length} real 1-minute samples</div>
          </div>
        </div>

        {/* Large SVG Waveform */}
        <div className="bg-[#FFFDF0] border-3 border-black rounded-2xl p-4 shadow-[4px_4px_0_#000]">
          {displayedPoints.length > 0 ? (
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="w-full h-64 sm:h-72 overflow-visible"
            >
              {/* Horizontal Gridlines & Y-Axis Labels */}
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
                      x={padding.left - 10}
                      y={y + 4}
                      textAnchor="end"
                      fontSize="11"
                      fontFamily="monospace"
                      fontWeight="bold"
                      fill="#64748b"
                    >
                      {valAtLine.toFixed(2)}
                    </text>
                  </g>
                );
              })}

              {/* Data Polyline */}
              <polyline
                fill="none"
                stroke="#000000"
                strokeWidth="2.5"
                points={polylinePoints}
              />

              {/* Data Points */}
              {displayedPoints.map((p, i) => (
                <circle
                  key={i}
                  cx={getX(i)}
                  cy={getY(p[activeChannel] !== null ? Number(p[activeChannel]) : minVal)}
                  r="3.5"
                  fill="#70C5F8"
                  stroke="#000000"
                  strokeWidth="1.5"
                />
              ))}

              {/* X-Axis Timestamps */}
              <text
                x={getX(0)}
                y={svgHeight - 10}
                fontSize="11"
                fontFamily="monospace"
                fontWeight="bold"
                fill="#475569"
              >
                {displayedPoints[0].timestamp}
              </text>
              <text
                x={getX(Math.floor(displayedPoints.length / 2))}
                y={svgHeight - 10}
                textAnchor="middle"
                fontSize="11"
                fontFamily="monospace"
                fontWeight="bold"
                fill="#475569"
              >
                {displayedPoints[Math.floor(displayedPoints.length / 2)].timestamp}
              </text>
              <text
                x={getX(displayedPoints.length - 1)}
                y={svgHeight - 10}
                textAnchor="end"
                fontSize="11"
                fontFamily="monospace"
                fontWeight="bold"
                fill="#475569"
              >
                {displayedPoints[displayedPoints.length - 1].timestamp}
              </text>
            </svg>
          ) : (
            <div className="py-20 text-center text-xs font-mono font-bold text-slate-500">
              Loading telemetry from FastAPI backend...
            </div>
          )}
        </div>

        {/* Window Summary Statistics (Deterministically calculated) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 bg-[#FFFDF0] rounded-2xl border-2 border-black text-center">
            <span className="text-[10px] font-mono font-black uppercase text-slate-500 block">LATEST VALUE</span>
            <span className="font-mono text-xl font-black text-black">
              {latestVal.toFixed(3)} {channelMeta.unit}
            </span>
          </div>

          <div className="p-3 bg-[#FFFDF0] rounded-2xl border-2 border-black text-center">
            <span className="text-[10px] font-mono font-black uppercase text-slate-500 block">WINDOW MIN</span>
            <span className="font-mono text-xl font-black text-black">
              {minVal.toFixed(3)} {channelMeta.unit}
            </span>
          </div>

          <div className="p-3 bg-[#FFFDF0] rounded-2xl border-2 border-black text-center">
            <span className="text-[10px] font-mono font-black uppercase text-slate-500 block">WINDOW MAX</span>
            <span className="font-mono text-xl font-black text-black">
              {maxVal.toFixed(3)} {channelMeta.unit}
            </span>
          </div>

          <div className="p-3 bg-[#FFFDF0] rounded-2xl border-2 border-black text-center">
            <span className="text-[10px] font-mono font-black uppercase text-slate-500 block">WINDOW MEAN</span>
            <span className="font-mono text-xl font-black text-black">
              {avgVal.toFixed(3)} {channelMeta.unit}
            </span>
          </div>
        </div>

        {/* Operating State Breakdown in Displayed Window */}
        <div className="p-4 bg-[#FFFDF0] rounded-2xl border-2 border-black flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
          <div className="font-bold text-black flex items-center gap-2">
            <Info className="w-4 h-4 text-sky-700" />
            <span>Operating State Breakdown ({displayedPoints.length} samples):</span>
          </div>
          <div className="flex items-center gap-4">
            <span>OFF: <strong>{offCount}</strong> ({((offCount / Math.max(1, displayedPoints.length)) * 100).toFixed(0)}%)</span>
            <span>OFFLOADED: <strong>{offloadedCount}</strong> ({((offloadedCount / Math.max(1, displayedPoints.length)) * 100).toFixed(0)}%)</span>
            <span>LOADED: <strong>{loadedCount}</strong> ({((loadedCount / Math.max(1, displayedPoints.length)) * 100).toFixed(0)}%)</span>
          </div>
        </div>
      </div>

      {/* 3. Behaviour Over Time (Multi-Scale View) */}
      <div className="bg-white border-4 border-black rounded-[32px] p-6 sm:p-8 shadow-[8px_8px_0_#000] space-y-6">
        <div className="border-b-2 border-black/20 pb-3">
          <span className="text-[10px] font-mono font-black uppercase tracking-widest text-slate-500">
            MULTI-SCALE BEHAVIOUR
          </span>
          <h3 className="font-comic text-2xl font-bold text-black flex items-center gap-2">
            <Clock className="w-5 h-5 text-sky-700" />
            Behaviour Over Time
          </h3>
          <p className="text-xs text-slate-600 font-medium mt-1">
            Deterministic multi-scale comparison: short-term window dynamics vs. available buffer and healthy 24h baseline distributions.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Short Term (1h) */}
          <div className="p-4 bg-[#FFFDF0] rounded-2xl border-2 border-black space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono font-black uppercase text-slate-600">SHORT TERM (1H)</span>
              <span className="px-2 py-0.5 rounded bg-black text-white font-mono text-[10px] font-bold">
                {shortTermSlice.length} samples
              </span>
            </div>
            <div className="font-mono text-2xl font-black text-black">
              {shortTermMean.toFixed(3)} <span className="text-xs font-bold text-slate-600">{channelMeta.unit}</span>
            </div>
            <div className="text-xs font-mono text-slate-700 space-y-0.5 pt-1 border-t border-black/10">
              <div>Net Change: <strong>{shortTermDelta > 0 ? '+' : ''}{shortTermDelta.toFixed(3)} {channelMeta.unit}</strong></div>
              <div className="text-[11px] text-slate-500">Trend: <strong>{shortTermSlopeLabel}</strong></div>
            </div>
          </div>

          {/* Medium Term (Available Buffer) */}
          <div className="p-4 bg-[#FFFDF0] rounded-2xl border-2 border-black space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono font-black uppercase text-slate-600">MEDIUM TERM (BUFFER)</span>
              <span className="px-2 py-0.5 rounded bg-sky-100 border border-black font-mono text-[10px] font-bold">
                {mediumTermVals.length} samples
              </span>
            </div>
            <div className="font-mono text-2xl font-black text-black">
              {mediumTermMean.toFixed(3)} <span className="text-xs font-bold text-slate-600">{channelMeta.unit}</span>
            </div>
            <div className="text-xs font-mono text-slate-700 space-y-0.5 pt-1 border-t border-black/10">
              <div>Buffer Net Delta: <strong>{mediumTermDelta > 0 ? '+' : ''}{mediumTermDelta.toFixed(3)} {channelMeta.unit}</strong></div>
              <div className="text-[11px] text-slate-500">Span: ~{Math.round(mediumTermVals.length / 60)}h continuous grid</div>
            </div>
          </div>

          {/* Long Term (24h Baseline Reference) */}
          <div className="p-4 bg-[#FFFDF0] rounded-2xl border-2 border-black space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono font-black uppercase text-slate-600">LONG TERM (24H BASELINE)</span>
              <span className="px-2 py-0.5 rounded bg-[#C1F6C9] border border-black font-mono text-[10px] font-bold">
                State: {dominantState}
              </span>
            </div>
            <div className="font-mono text-2xl font-black text-black">
              {baselineMean.toFixed(3)} <span className="text-xs font-bold text-slate-600">{channelMeta.unit}</span>
            </div>
            <div className="text-xs font-mono text-slate-700 space-y-0.5 pt-1 border-t border-black/10">
              <div>Deviation from Nominal: <strong>{baselineDelta > 0 ? '+' : ''}{baselineDelta.toFixed(3)} {channelMeta.unit}</strong></div>
              <div className="text-[11px] text-slate-500">Source: Feb 2020 Healthy Baseline</div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Operating Patterns & Compressor Cycling */}
      <div className="bg-white border-4 border-black rounded-[32px] p-6 sm:p-8 shadow-[8px_8px_0_#000] space-y-6">
        <div className="border-b-2 border-black/20 pb-3">
          <span className="text-[10px] font-mono font-black uppercase tracking-widest text-slate-500">
            PATTERN DETECTION
          </span>
          <h3 className="font-comic text-2xl font-bold text-black flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-sky-700" />
            Operating Patterns &amp; Cycling Dynamics
          </h3>
          <p className="text-xs text-slate-600 font-medium mt-1">
            Subsystem operational trends and pneumatic duty cycling derived deterministically from sensor streams.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Pressure Trend */}
          <div className="p-4 bg-[#FFFDF0] rounded-2xl border-2 border-black space-y-2">
            <span className="text-[10px] font-mono font-black uppercase text-slate-600 block">PRESSURE TREND</span>
            <div className="space-y-1 font-mono text-xs">
              <div className="flex justify-between">
                <span className="text-slate-600">TP2 Discharge:</span>
                <strong>{displayedPoints.length > 0 && displayedPoints[displayedPoints.length - 1].tp2 !== null ? Number(displayedPoints[displayedPoints.length - 1].tp2).toFixed(2) : '--'} bar</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">TP3 Panel:</span>
                <strong>{displayedPoints.length > 0 && displayedPoints[displayedPoints.length - 1].tp3 !== null ? Number(displayedPoints[displayedPoints.length - 1].tp3).toFixed(2) : '--'} bar</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">H1 Separator Drop:</span>
                <strong>{displayedPoints.length > 0 && displayedPoints[displayedPoints.length - 1].h1 !== null ? Number(displayedPoints[displayedPoints.length - 1].h1).toFixed(2) : '--'} bar</strong>
              </div>
            </div>
            <div className="text-[11px] font-bold text-slate-700 pt-1 border-t border-black/10">
              {dominantState === 'OFF' ? 'Static idle line equilibrium' : 'Pneumatic delivery cycle'}
            </div>
          </div>

          {/* Temperature Trend */}
          <div className="p-4 bg-[#FFFDF0] rounded-2xl border-2 border-black space-y-2">
            <span className="text-[10px] font-mono font-black uppercase text-slate-600 block">TEMPERATURE TREND</span>
            <div className="font-mono text-2xl font-black text-black">
              {displayedPoints.length > 0 && displayedPoints[displayedPoints.length - 1].oil_temperature !== null ? Number(displayedPoints[displayedPoints.length - 1].oil_temperature).toFixed(1) : '--'} <span className="text-xs font-bold text-slate-600">°C</span>
            </div>
            <div className="space-y-1 font-mono text-xs pt-1 border-t border-black/10">
              <div className="flex justify-between">
                <span className="text-slate-600">Window Change:</span>
                <strong>{oilTempDelta > 0 ? '+' : ''}{oilTempDelta.toFixed(1)} °C</strong>
              </div>
              <div className="text-[11px] font-bold text-slate-700">
                Thermal State: {oilTempSlopeLabel}
              </div>
            </div>
          </div>

          {/* Compressor Cycling */}
          <div className="p-4 bg-[#FFFDF0] rounded-2xl border-2 border-black space-y-2">
            <span className="text-[10px] font-mono font-black uppercase text-slate-600 block">COMPRESSOR CYCLING</span>
            <div className="font-mono text-2xl font-black text-black">
              {loadedDutyPct}% <span className="text-xs font-bold text-slate-600">duty fraction</span>
            </div>
            <div className="space-y-1 font-mono text-xs pt-1 border-t border-black/10">
              <div className="flex justify-between">
                <span className="text-slate-600">Load Transitions:</span>
                <strong>{loadTransitions} cycles</strong>
              </div>
              <div className="text-[11px] font-bold text-slate-700">
                {loadTransitions === 0 ? 'Continuous single-state operation' : 'Active intermittent duty cycle'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Historical Telemetry Sample Table */}
      <div className="bg-white border-4 border-black rounded-[32px] p-6 sm:p-8 shadow-[8px_8px_0_#000] space-y-4">
        <div className="flex items-center justify-between border-b-2 border-black/20 pb-3">
          <h4 className="font-comic text-xl font-bold text-black">
            Recent Telemetry Observations (Last 10 Samples)
          </h4>
          <span className="text-[10px] font-mono text-slate-500">
            Source: MetroPT-3 Raw Decimated Grid
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-black uppercase text-[10px] bg-[#FFFDF0]">
                <th className="p-2">Timestamp</th>
                <th className="p-2">State</th>
                <th className="p-2">Motor Curr (A)</th>
                <th className="p-2">TP2 (bar)</th>
                <th className="p-2">TP3 (bar)</th>
                <th className="p-2">H1 (bar)</th>
                <th className="p-2">Oil Temp (°C)</th>
                <th className="p-2">DV Press (bar)</th>
                <th className="p-2">DM Score</th>
                <th className="p-2">Decision</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10 font-bold">
              {displayedPoints.slice(-10).reverse().map(p => (
                <tr key={p.timestamp} className="hover:bg-slate-50">
                  <td className="p-2 font-black">{p.timestamp}</td>
                  <td className="p-2">
                    <span className={`px-2 py-0.5 rounded border border-black text-[9px] uppercase ${
                      p.operating_state === 'loaded' ? 'bg-[#70C5F8]' :
                      p.operating_state === 'offloaded' ? 'bg-[#FFE600]' :
                      'bg-slate-200'
                    }`}>
                      {p.operating_state}
                    </span>
                  </td>
                  <td className="p-2">{p.motor_current !== null ? p.motor_current.toFixed(3) : '--'}</td>
                  <td className="p-2">{p.tp2 !== null ? p.tp2.toFixed(3) : '--'}</td>
                  <td className="p-2">{p.tp3 !== null ? p.tp3.toFixed(3) : '--'}</td>
                  <td className="p-2">{p.h1 !== null ? p.h1.toFixed(3) : '--'}</td>
                  <td className="p-2">{p.oil_temperature !== null ? p.oil_temperature.toFixed(1) : '--'}</td>
                  <td className="p-2">{p.dv_pressure !== null ? p.dv_pressure.toFixed(3) : '--'}</td>
                  <td className="p-2">{p.distance !== null && p.distance !== undefined ? p.distance.toFixed(2) : '--'}</td>
                  <td className="p-2">
                    <span className={`px-1.5 py-0.5 rounded border border-black text-[9px] ${
                      p.decision === 'INSUFFICIENT EVIDENCE' ? 'bg-slate-200 text-slate-700' : 'bg-[#C1F6C9]'
                    }`}>
                      {p.decision || 'MONITOR'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
