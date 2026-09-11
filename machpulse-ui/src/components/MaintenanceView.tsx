import React, { useState, useEffect } from 'react';
import { MachineHealthResponse, TelemetryPoint } from '../services/api';
import { MaintenanceRecord, MaintenanceFindings, PostServiceCheck, OperationalUrgency } from '../types';
import { 
  ClipboardCheck, 
  AlertCircle, 
  CheckCircle2, 
  Plus, 
  Trash2, 
  FileText, 
  Info, 
  ShieldAlert, 
  ChevronDown, 
  ChevronUp, 
  X, 
  Check, 
  HelpCircle, 
  FileCheck, 
  Layers, 
  Sparkles,
  RotateCcw
} from 'lucide-react';

interface MaintenanceViewProps {
  machineHealth: MachineHealthResponse | null;
  telemetry?: TelemetryPoint[];
}

const STORAGE_KEY = 'machpulse_maintenance_records';

const INITIAL_DEMO_RECORDS: MaintenanceRecord[] = [
  {
    id: 'demo_rec_01',
    machineId: 'APU-COMP-03',
    title: 'Compressor inspection',
    actionType: 'Inspection',
    status: 'OPEN',
    isDemo: true,
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    notes: 'Example inspection action for workflow demonstration.',
    decisionAtCreation: 'INSPECT',
    anomalyDistanceAtCreation: null,
    operatingStateAtCreation: 'DEMO / ILLUSTRATIVE',
    contributingSignalsAtCreation: 'Illustrative demo evidence — not a historical MetroPT-3 observation.',
    coverageAtCreation: undefined,
  },
  {
    id: 'demo_rec_02',
    machineId: 'APU-COMP-03',
    title: 'Compressor service',
    actionType: 'Maintenance',
    status: 'COMPLETED',
    isDemo: true,
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    dueDate: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    completedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    notes: 'Demonstration of the maintenance completion workflow.',
    decisionAtCreation: 'MAINTAIN',
    anomalyDistanceAtCreation: null,
    operatingStateAtCreation: 'DEMO / ILLUSTRATIVE',
    contributingSignalsAtCreation: 'Illustrative demo evidence — not a historical MetroPT-3 observation.',
    coverageAtCreation: undefined,
    findings: {
      found: 'Illustrative demo finding — replace with actual technician observation.',
      action: 'Illustrative demo completion note — replace with actual service action.',
      notes: 'Illustrative demo record for workflow demonstration.',
      technician: 'Demo workflow',
    },
    postServiceCheck: {
      baselineDmAtCreation: 0,
      status: 'AWAITING_VERIFICATION',
      assessmentNotes: 'Illustrative demo state. Actual post-service verification requires subsequent machine telemetry after a real maintenance action.',
    },
  },
];

export const MaintenanceView: React.FC<MaintenanceViewProps> = ({
  machineHealth,
  telemetry = [],
}) => {
  // Current API / Model evidence
  const decision = machineHealth?.decision || 'MONITOR';
  const operatingState = (machineHealth?.operating_state || 'off').toUpperCase();
  const anomalyDist = machineHealth?.anomaly_distance ?? 33.46;
  const elevatedThr = machineHealth?.elevated_threshold ?? 304.255;
  const severeThr = machineHealth?.severe_threshold ?? 729.718;
  const observationTime = machineHealth?.timestamp || '2020-09-01 03:59:00';
  const coverage = machineHealth?.quality_gate?.coverage ?? 1.0;
  
  // Operational Urgency (Deterministic mapping)
  const urgency: OperationalUrgency = 
    decision === 'MAINTAIN' ? 'IMMEDIATE' :
    decision === 'INSPECT' ? 'ELEVATED' :
    decision === 'MONITOR' ? 'ROUTINE' : 'UNKNOWN';

  // Anomaly Headroom: 100 * (1 - min(1, D_M / SevereThreshold))
  const conditionIndex = decision === 'INSUFFICIENT EVIDENCE' 
    ? null 
    : Math.max(0, Math.min(100, 100 * (1 - Math.min(1, anomalyDist / severeThr))));

  // Severity Ratio: D_M / elevatedThreshold (304.255)
  const severityRatio = (anomalyDist / elevatedThr).toFixed(2);

  // Format top contributing feature names for snapshot
  const topSignalsSummary = machineHealth?.top_contributing_sensors?.slice(0, 3).map(s => 
    s.feature
      .replace('H1_off_24h_p10', 'H1 Separator Drop (24h lower percentile)')
      .replace('H1_offloaded_24h_p90', 'H1 Separator Drop (Offloaded 24h p90)')
      .replace('H1_offloaded_24h_mean', 'H1 Separator Drop (Offloaded 24h mean)')
      .replace('TP2_offloaded_24h_mean', 'TP2 Compressor Pressure (Offloaded 24h mean)')
      .replace(/_/g, ' ')
  ).join(' • ') || 'H1 Separator Drop • TP2 Compressor Pressure';

  // Local state for user records
  const [records, setRecords] = useState<MaintenanceRecord[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
      return INITIAL_DEMO_RECORDS;
    } catch {
      return INITIAL_DEMO_RECORDS;
    }
  });

  // Creation form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [actionType, setActionType] = useState<'Inspection' | 'Maintenance'>(
    decision === 'MAINTAIN' ? 'Maintenance' : 'Inspection'
  );
  const [dueDate, setDueDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  // Service Findings Modal state (Action Closure)
  const [completingRecord, setCompletingRecord] = useState<MaintenanceRecord | null>(null);
  const [findingsFound, setFindingsFound] = useState<string>('');
  const [findingsAction, setFindingsAction] = useState<string>('');
  const [findingsNotes, setFindingsNotes] = useState<string>('');
  const [findingsError, setFindingsError] = useState<string | null>(null);

  // Inspection Guidance Accordion State
  const [showGuidance, setShowGuidance] = useState<boolean>(decision === 'INSPECT' || decision === 'MAINTAIN');

  // Sync to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch (err) {
      console.error('Failed to save maintenance records to localStorage:', err);
    }
  }, [records]);

  // Handle resetting demo workflow records
  const handleResetDemoWorkflow = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_DEMO_RECORDS));
    } catch (err) {
      console.error('Failed to reset maintenance records in localStorage:', err);
    }
    setRecords(INITIAL_DEMO_RECORDS);
    setCompletingRecord(null);
    setIsFormOpen(false);
  };

  // Handle open creation form
  const openFormWithAction = (type: 'Inspection' | 'Maintenance') => {
    setActionType(type);
    setIsFormOpen(true);
    const formElement = document.getElementById('record-action-form');
    if (formElement) {
      formElement.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Handle creating a new record
  const handleCreateRecord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dueDate) {
      setFormError('Please select a target due date for this maintenance action.');
      return;
    }
    if (!notes.trim()) {
      setFormError('Please provide notes describing the scheduled check or inspection scope.');
      return;
    }

    const newRecord: MaintenanceRecord = {
      id: 'maint_' + Date.now().toString(),
      machineId: 'APU-COMP-03',
      title: actionType === 'Maintenance' ? 'Compressor service' : 'Compressor inspection',
      actionType,
      status: 'OPEN',
      isDemo: false,
      createdAt: new Date().toISOString(),
      dueDate,
      notes: notes.trim(),
      decisionAtCreation: decision,
      anomalyDistanceAtCreation: anomalyDist,
      operatingStateAtCreation: operatingState,
      contributingSignalsAtCreation: topSignalsSummary,
      coverageAtCreation: coverage,
    };

    setRecords(prev => [newRecord, ...prev]);
    setDueDate('');
    setNotes('');
    setFormError(null);
    setIsFormOpen(false);
  };

  // Open Service Findings form when completing an action
  const startCompletionFlow = (rec: MaintenanceRecord) => {
    setCompletingRecord(rec);
    setFindingsFound('');
    setFindingsAction('');
    setFindingsNotes('');
    setFindingsError(null);
  };

  // Submit Service Findings and close action
  const handleCompleteWithFindings = (e: React.FormEvent) => {
    e.preventDefault();
    if (!completingRecord) return;

    if (!findingsFound.trim()) {
      setFindingsError('Please describe what was found during the inspection or service.');
      return;
    }
    if (!findingsAction.trim()) {
      setFindingsError('Please describe what action was performed.');
      return;
    }

    const completedTime = new Date().toISOString();

    // Evaluate Post-Service Check from real telemetry
    // Check if any telemetry points exist strictly after record creation/completion
    const createdTimestamp = new Date(completingRecord.createdAt).getTime();
    const postPoints = telemetry.filter(t => new Date(t.timestamp).getTime() > createdTimestamp);

    let postCheck: PostServiceCheck;
    if (postPoints.length >= 2) {
      const latestPt = postPoints[postPoints.length - 1];
      const observedDm = latestPt.distance ?? anomalyDist;
      const isNormal = observedDm < elevatedThr;
      postCheck = {
        baselineDmAtCreation: completingRecord.anomalyDistanceAtCreation ?? anomalyDist,
        postServiceDm: observedDm,
        observedAt: latestPt.timestamp,
        status: isNormal ? 'VERIFIED' : 'NOT_YET_VERIFIED',
        assessmentNotes: isNormal 
          ? 'Subsequent telemetry is consistent with the monitored condition.'
          : 'Additional telemetry is required before assessing the post-service condition.',
      };
    } else {
      postCheck = {
        baselineDmAtCreation: completingRecord.anomalyDistanceAtCreation ?? anomalyDist,
        status: 'AWAITING_VERIFICATION',
        assessmentNotes: 'MachPulse will compare subsequent machine observations against the current condition baseline.',
      };
    }

    const findings: MaintenanceFindings = {
      found: findingsFound.trim(),
      action: findingsAction.trim(),
      notes: findingsNotes.trim() || undefined,
      technician: 'Demo technician',
    };

    setRecords(prev => prev.map(rec => {
      if (rec.id === completingRecord.id) {
        return {
          ...rec,
          status: 'COMPLETED',
          completedAt: completedTime,
          findings,
          postServiceCheck: postCheck,
        };
      }
      return rec;
    }));

    setCompletingRecord(null);
    setFindingsFound('');
    setFindingsAction('');
    setFindingsNotes('');
    setFindingsError(null);
  };

  // Delete record
  const handleDeleteRecord = (id: string) => {
    setRecords(prev => prev.filter(rec => rec.id !== id));
  };

  // Helper to categorize open items relative to today
  const getRecordDueCategory = (rec: MaintenanceRecord): 'COMPLETED' | 'ATTENTION' | 'UPCOMING' => {
    if (rec.status === 'COMPLETED') return 'COMPLETED';
    if (!rec.dueDate) return 'UPCOMING';

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(rec.dueDate);
    due.setHours(0, 0, 0, 0);

    return due.getTime() <= today.getTime() ? 'ATTENTION' : 'UPCOMING';
  };

  const attentionRecords = records.filter(r => getRecordDueCategory(r) === 'ATTENTION');
  const upcomingRecords = records.filter(r => getRecordDueCategory(r) === 'UPCOMING');
  const completedRecords = records.filter(r => r.status === 'COMPLETED');

  // Format date helper
  const formatDateDisplay = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-10">
      {/* 1. Machine Context & Current Recommendation Hero */}
      <section className="bg-white border-4 border-black rounded-[32px] p-6 sm:p-10 shadow-[8px_8px_0_#000] space-y-6">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-6 border-b-3 border-black">
          <div className="space-y-2 max-w-2xl">
            <span className="text-[10px] font-mono font-black uppercase tracking-widest text-slate-500">
              MAINTENANCE DECISION SUPPORT &amp; WORKFLOW
            </span>
            <h2 className="font-comic text-3xl sm:text-5xl font-bold text-black tracking-tight leading-tight">
              Metro Air Compressor Unit 3
            </h2>
            <p className="text-base sm:text-lg font-bold text-slate-800">
              {decision === 'INSUFFICIENT EVIDENCE' ? 'Telemetry quality is insufficient to evaluate machine condition reliably.' :
               decision === 'INSPECT' ? 'Inspection recommended based on elevated anomaly evidence.' :
               decision === 'MAINTAIN' ? 'Maintenance recommended based on severe multi-sensor divergence.' :
               'Machine behaviour is within its expected operating pattern.'}
            </p>
            <p className="text-xs sm:text-sm font-semibold text-slate-600">
              Asset: APU-COMP-03 · MetroPT-3 Historical Telemetry
            </p>
          </div>

          {/* Current Recommendation Card */}
          <div className="flex flex-col items-start lg:items-end shrink-0 w-full sm:w-auto">
            <div className={`comic-badge text-xl sm:text-2xl px-6 py-2.5 w-full sm:w-auto text-center ${
              decision === 'MAINTAIN' ? 'bg-[#FFB3B3] text-black' :
              decision === 'INSPECT' ? 'bg-[#FFE600] text-black' :
              decision === 'INSUFFICIENT EVIDENCE' ? 'bg-slate-200 text-slate-800' :
              'bg-[#C1F6C9] text-black'
            }`}>
              {decision === 'INSPECT' ? 'INSPECTION RECOMMENDED' :
               decision === 'MAINTAIN' ? 'MAINTENANCE RECOMMENDED' :
               decision === 'INSUFFICIENT EVIDENCE' ? 'INSUFFICIENT EVIDENCE' :
               'MONITOR'}
            </div>
            <div className="text-xs font-mono font-bold text-slate-600 mt-2 text-left lg:text-right">
              <div>Observation: {observationTime}</div>
              <div>DM {anomalyDist.toFixed(2)} {anomalyDist < elevatedThr ? `< ${elevatedThr.toFixed(1)}` : `≥ ${elevatedThr.toFixed(1)}`}</div>
            </div>
          </div>
        </div>

        {/* Intelligence Matrix (P0 Deterministic Metrics) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
          {/* Anomaly Headroom */}
          <div className="p-4 rounded-2xl bg-[#FFFDF0] border-2 border-black">
            <span className="text-[10px] font-mono font-black uppercase text-slate-500 block">
              ANOMALY HEADROOM
            </span>
            <div className="font-mono text-2xl font-black text-black mt-1">
              {conditionIndex !== null ? `${conditionIndex.toFixed(1)}%` : 'UNKNOWN'}
            </div>
            <span className="text-[11px] font-bold text-slate-600 block mt-0.5">
              {conditionIndex !== null ? 'Headroom to severe boundary' : 'Insufficient evidence'}
            </span>
          </div>

          {/* Operational Urgency */}
          <div className="p-4 rounded-2xl bg-[#FFFDF0] border-2 border-black">
            <span className="text-[10px] font-mono font-black uppercase text-slate-500 block">
              OPERATIONAL URGENCY
            </span>
            <div className={`font-comic text-2xl font-bold mt-1 ${
              urgency === 'IMMEDIATE' ? 'text-red-700' :
              urgency === 'ELEVATED' ? 'text-amber-700' :
              urgency === 'UNKNOWN' ? 'text-slate-500' :
              'text-emerald-800'
            }`}>
              {urgency}
            </div>
            <span className="text-[11px] font-bold text-slate-600 block mt-0.5">
              Severity ratio: {severityRatio}× threshold
            </span>
          </div>

          {/* Operating State */}
          <div className="p-4 rounded-2xl bg-[#FFFDF0] border-2 border-black">
            <span className="text-[10px] font-mono font-black uppercase text-slate-500 block">
              OPERATING STATE
            </span>
            <div className="font-comic text-2xl font-bold text-black mt-1">
              {operatingState}
            </div>
            <span className="text-[11px] font-bold text-slate-600 block mt-0.5">
              Active load mode at observation
            </span>
          </div>

          {/* Top Divergence Contributors */}
          <div className="p-4 rounded-2xl bg-[#FFFDF0] border-2 border-black">
            <span className="text-[10px] font-mono font-black uppercase text-slate-500 block">
              TOP MODEL CONTRIBUTORS
            </span>
            <div className="font-mono text-xs font-bold text-slate-900 mt-1.5 line-clamp-2">
              {topSignalsSummary}
            </div>
            <span className="text-[10px] font-bold text-slate-500 block mt-1">
              Statistical model contributors across test observations
            </span>
          </div>
        </div>

        {/* Condition Qualification Note */}
        <div className="p-3 bg-[#FFFDF0] rounded-xl border border-black/30 text-[11px] text-slate-600 font-medium">
          <strong className="text-black font-bold">Operational Context:</strong> Headroom to the calibrated severe anomaly boundary (DM = {anomalyDist.toFixed(2)}, Severe Threshold = {severeThr.toFixed(1)}). This is a condition indicator derived from anomaly distance. It is not failure probability or remaining useful life.
        </div>

        {/* Recommendation Directive & Quick Entry CTA */}
        <div className={`p-5 rounded-2xl border-3 border-black flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
          decision === 'MAINTAIN' ? 'bg-[#FFB3B3]' :
          decision === 'INSPECT' ? 'bg-[#FFE600]' :
          decision === 'INSUFFICIENT EVIDENCE' ? 'bg-slate-200' :
          'bg-[#FFFDF0]'
        }`}>
          <div className="space-y-1">
            <span className="text-[10px] font-mono font-black uppercase tracking-wider text-slate-700 block">
              ACTION DIRECTIVE
            </span>
            <p className="text-sm font-bold text-black">
              {decision === 'INSPECT'
                ? 'Review the contributing signals and perform a guided maintenance inspection.'
                : decision === 'MAINTAIN'
                ? 'Maintenance action should be scheduled based on severe multi-sensor divergence.'
                : decision === 'INSUFFICIENT EVIDENCE'
                ? 'Telemetry quality is insufficient to evaluate machine condition reliably. Review data quality or collect additional telemetry.'
                : 'No maintenance action currently indicated. Continue standard telemetry observation.'}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
            {decision === 'INSPECT' && (
              <button
                onClick={() => openFormWithAction('Inspection')}
                className="w-full sm:w-auto px-5 py-2.5 bg-black text-white font-mono text-xs font-black rounded-xl border-2 border-black hover:bg-slate-800 transition-all shadow-[2px_2px_0_#000] flex items-center justify-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Create Inspection</span>
              </button>
            )}
            {decision === 'MAINTAIN' && (
              <button
                onClick={() => openFormWithAction('Maintenance')}
                className="w-full sm:w-auto px-5 py-2.5 bg-black text-white font-mono text-xs font-black rounded-xl border-2 border-black hover:bg-slate-800 transition-all shadow-[2px_2px_0_#000] flex items-center justify-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Schedule Maintenance</span>
              </button>
            )}
            {decision === 'MONITOR' && (
              <button
                onClick={() => openFormWithAction('Inspection')}
                className="w-full sm:w-auto px-5 py-2.5 bg-white text-black font-mono text-xs font-black rounded-xl border-2 border-black hover:bg-[#C1F6C9] transition-all shadow-[2px_2px_0_#000] flex items-center justify-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Log Service / Inspection</span>
              </button>
            )}
            {decision === 'INSUFFICIENT EVIDENCE' && (
              <button
                onClick={() => openFormWithAction('Inspection')}
                className="w-full sm:w-auto px-5 py-2.5 bg-white text-black font-mono text-xs font-black rounded-xl border-2 border-black hover:bg-slate-100 transition-all shadow-[2px_2px_0_#000] flex items-center justify-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Review Data Quality</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 2. P2 Technician Inspection Guidance (Controlled Component-Level) */}
      <section className="bg-white border-4 border-black rounded-[32px] p-6 sm:p-8 shadow-[8px_8px_0_#000] space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-2 border-black/20 pb-4">
          <div>
            <span className="text-[10px] font-mono font-black uppercase tracking-widest text-slate-500">
              TECHNICIAN INSPECTION GUIDANCE
            </span>
            <h3 className="font-comic text-2xl font-bold text-black flex items-center gap-2">
              <ClipboardCheck className="w-6 h-6 text-sky-700" />
              Inspection Guidance by Feature Dimension
            </h3>
            <p className="text-xs text-slate-600 font-medium mt-1">
              Deterministic directional checks mapped to physical MetroPT-3 compressor components. These are inspection directions, not confirmed faults.
            </p>
          </div>

          <button
            onClick={() => setShowGuidance(!showGuidance)}
            className="px-4 py-2 rounded-xl border-2 border-black text-xs font-mono font-black bg-[#FFFDF0] hover:bg-[#FFE600] cursor-pointer shadow-[2px_2px_0_#000] flex items-center gap-2 shrink-0"
          >
            {showGuidance ? (
              <>
                <ChevronUp className="w-4 h-4" />
                <span>Hide Guidance</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                <span>View Inspection Guidance</span>
              </>
            )}
          </button>
        </div>

        {/* Non-causal Disclaimer */}
        <div className="p-3 bg-[#FFFDF0] rounded-xl border border-black/40 flex items-start gap-2.5 text-xs text-slate-700">
          <Info className="w-4 h-4 text-sky-700 shrink-0 mt-0.5" />
          <div>
            <strong className="text-black font-bold">Important Defensibility Principle:</strong> Statistical divergence indicates anomalous multivariate correlation; it is not physical causation. Use this guidance to direct physical inspection. Do not assume component failure prior to verification.
          </div>
        </div>

        {showGuidance && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
            {/* Component 1: H1 Separator / Dryer Path */}
            <div className="p-5 rounded-2xl bg-[#FFFDF0] border-2 border-black space-y-3">
              <div className="flex items-center justify-between border-b border-black/10 pb-2">
                <span className="font-mono text-xs font-black uppercase text-black bg-[#FFE600] px-2 py-0.5 rounded border border-black">
                  SIGNAL: H1 (Air Dryer Filter)
                </span>
                <span className="text-[10px] font-mono font-bold text-slate-500">Pneumatic System</span>
              </div>
              <div>
                <span className="text-[10px] font-mono font-black text-slate-500 uppercase block">WHY</span>
                <p className="text-xs text-slate-800 font-medium mt-0.5">
                  Statistical divergence detected in H1 differential pressure across the adsorption dryer and separator stage.
                </p>
              </div>
              <div>
                <span className="text-[10px] font-mono font-black text-slate-500 uppercase block">WHAT TO REVIEW</span>
                <p className="text-xs text-slate-800 font-medium mt-0.5">
                  Review relevant pneumatic path and separator/pressure behaviour. Consider inspecting separator filter differential, condensation drain valves, and pressure drop across the drying unit. Verify according to approved maintenance procedure.
                </p>
              </div>
              <div>
                <span className="text-[10px] font-mono font-black text-slate-500 uppercase block">WHAT TO RECORD</span>
                <p className="text-xs text-slate-800 font-medium mt-0.5">
                  Filter differential pressure drop, condensation drainage volume, and physical signs of desiccant oil contamination.
                </p>
              </div>
              <div className="text-[10px] font-mono text-slate-500 pt-1 border-t border-black/10">
                Reference: Subsystem verification · Follow approved facility maintenance standard
              </div>
            </div>

            {/* Component 2: TP2 Compressor Discharge & Line */}
            <div className="p-5 rounded-2xl bg-[#FFFDF0] border-2 border-black space-y-3">
              <div className="flex items-center justify-between border-b border-black/10 pb-2">
                <span className="font-mono text-xs font-black uppercase text-black bg-[#FFE600] px-2 py-0.5 rounded border border-black">
                  SIGNAL: TP2 (Compressor Pressure)
                </span>
                <span className="text-[10px] font-mono font-bold text-slate-500">Discharge Path</span>
              </div>
              <div>
                <span className="text-[10px] font-mono font-black text-slate-500 uppercase block">WHY</span>
                <p className="text-xs text-slate-800 font-medium mt-0.5">
                  Divergence in compressor head discharge pressure (TP2) relative to operating state baseline.
                </p>
              </div>
              <div>
                <span className="text-[10px] font-mono font-black text-slate-500 uppercase block">WHAT TO REVIEW</span>
                <p className="text-xs text-slate-800 font-medium mt-0.5">
                  Review compressor-side pressure behaviour. Consider inspecting compressor discharge line, non-return check valve, unloader valve cycling, and safety valve seats. Verify according to approved maintenance procedure.
                </p>
              </div>
              <div>
                <span className="text-[10px] font-mono font-black text-slate-500 uppercase block">WHAT TO RECORD</span>
                <p className="text-xs text-slate-800 font-medium mt-0.5">
                  Discharge manifold pressure at peak load, check valve sealing integrity, and transition time between offloaded and loaded states.
                </p>
              </div>
              <div className="text-[10px] font-mono text-slate-500 pt-1 border-t border-black/10">
                Reference: Subsystem verification · Follow approved facility maintenance standard
              </div>
            </div>

            {/* Component 3: Oil Temperature & Thermal Regulation */}
            <div className="p-5 rounded-2xl bg-[#FFFDF0] border-2 border-black space-y-3">
              <div className="flex items-center justify-between border-b border-black/10 pb-2">
                <span className="font-mono text-xs font-black uppercase text-black bg-[#FFE600] px-2 py-0.5 rounded border border-black">
                  SIGNAL: Oil Temperature
                </span>
                <span className="text-[10px] font-mono font-bold text-slate-500">Thermal Subsystem</span>
              </div>
              <div>
                <span className="text-[10px] font-mono font-black text-slate-500 uppercase block">WHY</span>
                <p className="text-xs text-slate-800 font-medium mt-0.5">
                  Divergence in oil temperature trajectory during continuous compressor loading episodes.
                </p>
              </div>
              <div>
                <span className="text-[10px] font-mono font-black text-slate-500 uppercase block">WHAT TO REVIEW</span>
                <p className="text-xs text-slate-800 font-medium mt-0.5">
                  Review oil-temperature trend and relevant maintenance procedure. Consider inspecting cooling radiator airflow, radiator fin cleanliness, oil level, and thermostatic bypass valve. Verify according to approved maintenance procedure.
                </p>
              </div>
              <div>
                <span className="text-[10px] font-mono font-black text-slate-500 uppercase block">WHAT TO RECORD</span>
                <p className="text-xs text-slate-800 font-medium mt-0.5">
                  Oil sight glass level, radiator fin visual cleanliness, and temperature rise slope during continuous 10-minute load.
                </p>
              </div>
              <div className="text-[10px] font-mono text-slate-500 pt-1 border-t border-black/10">
                Reference: Subsystem verification · Follow approved facility maintenance standard
              </div>
            </div>

            {/* Component 4: Motor Current & Mechanical Drive */}
            <div className="p-5 rounded-2xl bg-[#FFFDF0] border-2 border-black space-y-3">
              <div className="flex items-center justify-between border-b border-black/10 pb-2">
                <span className="font-mono text-xs font-black uppercase text-black bg-[#FFE600] px-2 py-0.5 rounded border border-black">
                  SIGNAL: Motor Current
                </span>
                <span className="text-[10px] font-mono font-bold text-slate-500">Drive Subsystem</span>
              </div>
              <div>
                <span className="text-[10px] font-mono font-black text-slate-500 uppercase block">WHY</span>
                <p className="text-xs text-slate-800 font-medium mt-0.5">
                  Divergence in electrical drive draw relative to operating state load demand.
                </p>
              </div>
              <div>
                <span className="text-[10px] font-mono font-black text-slate-500 uppercase block">WHAT TO REVIEW</span>
                <p className="text-xs text-slate-800 font-medium mt-0.5">
                  Review electrical supply stability and motor drive mechanical load. Consider inspecting mechanical resistance in compressor bearings, coupling alignment, and terminal connections. Verify according to approved maintenance procedure.
                </p>
              </div>
              <div>
                <span className="text-[10px] font-mono font-black text-slate-500 uppercase block">WHAT TO RECORD</span>
                <p className="text-xs text-slate-800 font-medium mt-0.5">
                  Operating phase current balance, terminal connection torque, and any audible bearing roughness under unpowered manual spin.
                </p>
              </div>
              <div className="text-[10px] font-mono text-slate-500 pt-1 border-t border-black/10">
                Reference: Subsystem verification · Follow approved facility maintenance standard
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 3. Service / Inspection Entry Form (Collapsible / Triggerable) */}
      <section id="record-action-form" className="bg-white border-4 border-black rounded-[32px] p-6 sm:p-8 shadow-[8px_8px_0_#000] space-y-6">
        <div className="flex items-center justify-between border-b-2 border-black/20 pb-4">
          <div>
            <span className="text-[10px] font-mono font-black uppercase tracking-widest text-slate-500">
              SERVICE / INSPECTION TRACKING
            </span>
            <h3 className="font-comic text-2xl font-bold text-black flex items-center gap-2">
              <ClipboardCheck className="w-6 h-6 text-sky-700" />
              Schedule Maintenance Action
            </h3>
            <p className="text-xs text-slate-600 font-medium mt-1">
              Records are created explicitly by the technician and capture a permanent snapshot of real model evidence at creation time.
            </p>
          </div>

          <button
            onClick={() => setIsFormOpen(!isFormOpen)}
            className="px-4 py-1.5 rounded-xl border-2 border-black text-xs font-mono font-black bg-[#FFFDF0] hover:bg-[#C1F6C9] cursor-pointer shadow-[2px_2px_0_#000]"
          >
            {isFormOpen ? 'Cancel' : '+ New Record'}
          </button>
        </div>

        {/* Honest Persistence Disclaimer */}
        <div className="p-3.5 bg-[#FFFDF0] rounded-2xl border-2 border-black flex items-start gap-3 text-xs text-slate-800 font-medium">
          <Info className="w-4 h-4 text-sky-700 shrink-0 mt-0.5" />
          <div>
            <strong className="text-black font-black">Storage &amp; Provenance Transparency:</strong>
            <p className="mt-0.5">
              Records persist locally in browser storage (<code className="font-mono bg-white px-1 py-0.5 rounded border border-black text-[11px]">localStorage</code>) for this hackathon MVP. No enterprise CMMS or fake maintenance database is fabricated.
            </p>
          </div>
        </div>

        {isFormOpen && (
          <form onSubmit={handleCreateRecord} className="p-6 bg-[#FFFDF0] rounded-2xl border-3 border-black space-y-5 shadow-[4px_4px_0_#000]">
            {formError && (
              <div className="p-3 bg-[#FFB3B3] text-black border-2 border-black rounded-xl text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-900" />
                <span>{formError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Action Type */}
              <div className="space-y-1.5">
                <label className="text-xs font-mono font-black text-black block uppercase">
                  Action Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setActionType('Inspection')}
                    className={`py-2 px-3 rounded-xl border-2 border-black font-mono text-xs font-bold cursor-pointer transition-all ${
                      actionType === 'Inspection'
                        ? 'bg-black text-white shadow-[2px_2px_0_#000]'
                        : 'bg-white text-black hover:bg-slate-100'
                    }`}
                  >
                    Inspection
                  </button>
                  <button
                    type="button"
                    onClick={() => setActionType('Maintenance')}
                    className={`py-2 px-3 rounded-xl border-2 border-black font-mono text-xs font-bold cursor-pointer transition-all ${
                      actionType === 'Maintenance'
                        ? 'bg-black text-white shadow-[2px_2px_0_#000]'
                        : 'bg-white text-black hover:bg-slate-100'
                    }`}
                  >
                    Maintenance
                  </button>
                </div>
              </div>

              {/* Due Date (User-Selected, never fabricated) */}
              <div className="space-y-1.5">
                <label className="text-xs font-mono font-black text-black block uppercase">
                  Target Due Date (Required)
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full py-2 px-3 rounded-xl border-2 border-black bg-white font-mono text-xs font-bold text-black shadow-[2px_2px_0_#000] focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-mono font-black text-black block uppercase">
                Technician Notes / Scope (Required)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="e.g., Review H1 separator pressure differential and inspect discharge line for air leaks."
                className="w-full p-3 rounded-xl border-2 border-black bg-white font-sans text-xs text-black placeholder-slate-400 shadow-[2px_2px_0_#000] focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>

            {/* Evidence Snapshot Preview */}
            <div className="p-3 bg-white rounded-xl border border-black/40 space-y-1 text-xs font-mono text-slate-700">
              <div className="text-[10px] uppercase font-black text-slate-500">
                Automatic Evidence Snapshot to be Captured:
              </div>
              <div className="text-black font-bold">
                Directive: <span className="underline">{decision}</span> · DM: <strong>{anomalyDist.toFixed(2)}</strong> · State: <strong>{operatingState}</strong>
              </div>
              <div className="text-[11px] text-slate-600 truncate">
                Signals: {topSignalsSummary}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="px-4 py-2 rounded-xl border-2 border-black bg-white text-xs font-mono font-bold cursor-pointer hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2 rounded-xl border-2 border-black bg-[#C1F6C9] hover:bg-emerald-300 text-black font-mono text-xs font-black shadow-[2px_2px_0_#000] cursor-pointer"
              >
                Save Record
              </button>
            </div>
          </form>
        )}
      </section>

      {/* 4. Maintenance Follow-up & Reminders Queue */}
      <section className="bg-white border-4 border-black rounded-[32px] p-6 sm:p-8 shadow-[8px_8px_0_#000] space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-2 border-black/20 pb-3">
          <div>
            <span className="text-[10px] font-mono font-black uppercase tracking-widest text-slate-500">
              ACTION QUEUE &amp; REMINDERS
            </span>
            <h3 className="font-comic text-2xl font-bold text-black">
              Maintenance Queue
            </h3>
            <p className="text-xs text-slate-600 font-medium mt-1">
              Tracking user-created and demo follow-up items. Closing an action requires empirical findings to complete the service loop.
            </p>
          </div>

          <button
            onClick={handleResetDemoWorkflow}
            title="Reset maintenance demonstration workflow records to initial demo state"
            className="px-3.5 py-1.5 rounded-xl border-2 border-black text-xs font-mono font-bold bg-[#FFFDF0] hover:bg-slate-100 cursor-pointer shadow-[2px_2px_0_#000] flex items-center gap-1.5 self-start sm:self-auto shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-700" />
            <span>Reset Demo Workflow</span>
          </button>
        </div>

        {/* Demo Workflow Banner (P1-1 Requirement) */}
        <div className="p-3.5 bg-[#FFFDF0] rounded-2xl border-2 border-black flex items-start gap-3 text-xs text-slate-800 font-medium">
          <Info className="w-4 h-4 text-sky-700 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] font-black uppercase px-2 py-0.5 bg-[#FFE600] text-black rounded border border-black">
                DEMO WORKFLOW DATA
              </span>
              <span className="text-[11px] font-bold text-slate-600">
                Operational Demonstration Loop
              </span>
            </div>
            <p className="text-xs text-slate-700 font-medium pt-0.5">
              Example service records demonstrate the maintenance workflow. They are not historical MetroPT-3 maintenance records.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Column A: Needs Attention (Overdue / Due Today) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-2xl bg-[#FFB3B3] border-2 border-black">
              <span className="font-mono text-xs font-black text-black uppercase">
                NEEDS ATTENTION
              </span>
              <span className="font-mono text-xs font-black px-2 py-0.5 rounded-full bg-white border border-black">
                {attentionRecords.length}
              </span>
            </div>

            <div className="space-y-3">
              {attentionRecords.length > 0 ? (
                attentionRecords.map(rec => (
                  <div key={rec.id} className="p-4 rounded-2xl bg-[#FFFDF0] border-2 border-black shadow-[3px_3px_0_#000] space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="font-comic font-bold text-black text-sm">{rec.title || rec.actionType}</span>
                        {rec.isDemo && (
                          <span className="font-mono text-[9px] font-black px-1.5 py-0.2 rounded bg-slate-200 text-slate-700 border border-slate-400">
                            DEMO
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-[10px] font-black px-2 py-0.5 rounded bg-[#FFB3B3] border border-black">
                        Due: {formatDateDisplay(rec.dueDate)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-800 font-medium leading-snug">
                      {rec.notes}
                    </p>
                    <div className="text-[10px] font-mono text-slate-600 pt-1 border-t border-black/10">
                      Triggered by: <strong>{rec.decisionAtCreation}</strong> {rec.isDemo ? '(Demo record)' : rec.anomalyDistanceAtCreation !== null ? `(DM ${rec.anomalyDistanceAtCreation.toFixed(1)})` : ''}
                    </div>
                    <div className="flex items-center justify-between pt-2">
                      <button
                        onClick={() => startCompletionFlow(rec)}
                        className="px-3 py-1 bg-black text-white text-[11px] font-mono font-bold rounded-lg hover:bg-slate-800 cursor-pointer"
                      >
                        Mark Complete
                      </button>
                      <button
                        onClick={() => handleDeleteRecord(rec.id)}
                        className="text-slate-400 hover:text-red-700 p-1 cursor-pointer"
                        title="Delete Record"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-4 rounded-2xl bg-[#FFFDF0] border border-dashed border-black/30 text-center text-xs font-mono text-slate-500">
                  No items requiring immediate attention.
                </div>
              )}
            </div>
          </div>

          {/* Column B: Upcoming */}
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-2xl bg-[#70C5F8] border-2 border-black">
              <span className="font-mono text-xs font-black text-black uppercase">
                UPCOMING
              </span>
              <span className="font-mono text-xs font-black px-2 py-0.5 rounded-full bg-white border border-black">
                {upcomingRecords.length}
              </span>
            </div>

            <div className="space-y-3">
              {upcomingRecords.length > 0 ? (
                upcomingRecords.map(rec => (
                  <div key={rec.id} className="p-4 rounded-2xl bg-[#FFFDF0] border-2 border-black shadow-[3px_3px_0_#000] space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="font-comic font-bold text-black text-sm">{rec.title || rec.actionType}</span>
                        {rec.isDemo && (
                          <span className="font-mono text-[9px] font-black px-1.5 py-0.2 rounded bg-slate-200 text-slate-700 border border-slate-400">
                            DEMO
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-[10px] font-black px-2 py-0.5 rounded bg-white border border-black">
                        Due: {formatDateDisplay(rec.dueDate)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-800 font-medium leading-snug">
                      {rec.notes}
                    </p>
                    <div className="text-[10px] font-mono text-slate-600 pt-1 border-t border-black/10">
                      Triggered by: <strong>{rec.decisionAtCreation}</strong> {rec.isDemo ? '(Demo record)' : rec.anomalyDistanceAtCreation !== null ? `(DM ${rec.anomalyDistanceAtCreation.toFixed(1)})` : ''}
                    </div>
                    <div className="flex items-center justify-between pt-2">
                      <button
                        onClick={() => startCompletionFlow(rec)}
                        className="px-3 py-1 bg-black text-white text-[11px] font-mono font-bold rounded-lg hover:bg-slate-800 cursor-pointer"
                      >
                        Mark Complete
                      </button>
                      <button
                        onClick={() => handleDeleteRecord(rec.id)}
                        className="text-slate-400 hover:text-red-700 p-1 cursor-pointer"
                        title="Delete Record"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-4 rounded-2xl bg-[#FFFDF0] border border-dashed border-black/30 text-center text-xs font-mono text-slate-500">
                  No upcoming scheduled items.
                </div>
              )}
            </div>
          </div>

          {/* Column C: Completed */}
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-2xl bg-[#C1F6C9] border-2 border-black">
              <span className="font-mono text-xs font-black text-black uppercase">
                COMPLETED
              </span>
              <span className="font-mono text-xs font-black px-2 py-0.5 rounded-full bg-white border border-black">
                {completedRecords.length}
              </span>
            </div>

            <div className="space-y-3">
              {completedRecords.length > 0 ? (
                completedRecords.slice(0, 5).map(rec => (
                  <div key={rec.id} className="p-4 rounded-2xl bg-[#FFFDF0] border-2 border-black shadow-[3px_3px_0_#000] space-y-2 opacity-95">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="font-comic font-bold text-black text-sm">{rec.title || rec.actionType}</span>
                        {rec.isDemo && (
                          <span className="font-mono text-[9px] font-black px-1.5 py-0.2 rounded bg-slate-200 text-slate-700 border border-slate-400">
                            DEMO
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-[10px] font-black px-2 py-0.5 rounded bg-[#C1F6C9] border border-black">
                        Completed {rec.completedAt ? formatDateDisplay(rec.completedAt) : ''}
                      </span>
                    </div>
                    {rec.findings && (
                      <div className="text-xs text-slate-800 font-medium leading-snug space-y-1">
                        <div><strong className="text-black">Done:</strong> {rec.findings.action}</div>
                      </div>
                    )}
                    <div className="text-[10px] font-mono text-slate-600 pt-1 border-t border-black/10 flex items-center justify-between">
                      <span>Baseline: {rec.isDemo ? 'Demo record' : rec.anomalyDistanceAtCreation !== null ? `DM ${rec.anomalyDistanceAtCreation.toFixed(1)}` : 'N/A'}</span>
                      <button
                        onClick={() => handleDeleteRecord(rec.id)}
                        className="text-slate-400 hover:text-red-700 p-0.5 cursor-pointer"
                        title="Delete Record"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-4 rounded-2xl bg-[#FFFDF0] border border-dashed border-black/30 text-center text-xs font-mono text-slate-500">
                  No completed actions recorded yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 5. Complete Maintenance History with Timeline & Genuine Evidence Snapshots */}
      <section className="bg-white border-4 border-black rounded-[32px] p-6 sm:p-8 shadow-[8px_8px_0_#000] space-y-6">
        <div className="border-b-2 border-black/20 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-[10px] font-mono font-black uppercase tracking-widest text-slate-500">
              AUDIT TRAIL &amp; SERVICE TIMELINE
            </span>
            <h3 className="font-comic text-2xl font-bold text-black">
              Maintenance History &amp; Decision Snapshots
            </h3>
            <p className="text-xs text-slate-600 font-medium mt-1">
              Historical record of technician interventions, captured ML evidence snapshots, and post-service verification telemetry.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleResetDemoWorkflow}
              title="Reset records to default demonstration state"
              className="px-3 py-1 rounded-xl border-2 border-black text-xs font-mono font-bold bg-[#FFFDF0] hover:bg-slate-100 cursor-pointer shadow-[2px_2px_0_#000] flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-700" />
              <span>Reset</span>
            </button>
            <span className="font-mono text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-full border border-black/20">
              Total Records: {records.length}
            </span>
          </div>
        </div>

        {records.length > 0 ? (
          <div className="relative pl-6 sm:pl-8 border-l-3 border-black space-y-8 my-4">
            {records.map((rec) => {
              const dateObj = new Date(rec.createdAt);
              const monthStr = dateObj.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
              const dayStr = dateObj.getDate();

              return (
                <div key={rec.id} className="relative group space-y-3">
                  {/* Timeline Node */}
                  <div className={`absolute -left-[35px] sm:-left-[43px] top-1.5 w-6 h-6 rounded-full border-2 border-black flex items-center justify-center ${
                    rec.status === 'COMPLETED' ? 'bg-[#C1F6C9]' :
                    getRecordDueCategory(rec) === 'ATTENTION' ? 'bg-[#FFB3B3]' :
                    'bg-[#70C5F8]'
                  }`}>
                    {rec.status === 'COMPLETED' ? (
                      <Check className="w-3 h-3 text-black stroke-[3]" />
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-black" />
                    )}
                  </div>

                  {/* Header Row */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs font-black uppercase text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-black/20">
                        {monthStr} {dayStr}
                      </span>
                      <span className="font-comic font-bold text-black text-xl">
                        {rec.title || rec.actionType.toUpperCase()}
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-full border border-black font-mono text-[10px] font-black uppercase ${
                        rec.status === 'COMPLETED' ? 'bg-[#C1F6C9] text-black' :
                        getRecordDueCategory(rec) === 'ATTENTION' ? 'bg-[#FFB3B3] text-black' :
                        'bg-[#70C5F8] text-black'
                      }`}>
                        {rec.status}
                      </span>
                      {rec.isDemo && (
                        <span className="font-mono text-[9px] font-black px-2 py-0.5 rounded bg-[#FFFDF0] text-slate-800 border border-black">
                          DEMO WORKFLOW RECORD
                        </span>
                      )}
                    </div>

                    <div className="font-mono text-xs text-slate-500">
                      Logged: {formatDateDisplay(rec.createdAt)}
                      {rec.completedAt && ` · Completed: ${formatDateDisplay(rec.completedAt)}`}
                    </div>
                  </div>

                  {/* Scope / Notes */}
                  <div className="text-xs text-slate-800 font-medium pl-1">
                    <strong className="text-black font-bold">Scope / Notes:</strong> {rec.notes}
                  </div>

                  {/* Service Findings (if completed) */}
                  {rec.findings && (
                    <div className="p-4 rounded-xl bg-[#FFFDF0] border-2 border-black space-y-2 text-xs">
                      <div className="text-[10px] font-mono font-black uppercase text-slate-600 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <FileCheck className="w-3.5 h-3.5 text-sky-700" />
                          Technician Service Findings:
                        </span>
                        <span className="font-bold text-slate-500">
                          {rec.findings.technician || 'Demo workflow'}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                        <div>
                          <span className="text-[10px] font-mono font-bold text-slate-500 block">FINDINGS (WHAT WAS FOUND):</span>
                          <p className="text-slate-900 font-medium mt-0.5">{rec.findings.found}</p>
                        </div>
                        <div>
                          <span className="text-[10px] font-mono font-bold text-slate-500 block">COMPLETION NOTE (WHAT WAS DONE):</span>
                          <p className="text-slate-900 font-medium mt-0.5">{rec.findings.action}</p>
                        </div>
                      </div>
                      {rec.findings.notes && (
                        <div className="pt-1 border-t border-black/10">
                          <span className="text-[10px] font-mono font-bold text-slate-500 block">ADDITIONAL OBSERVATIONS:</span>
                          <p className="text-slate-700 font-medium mt-0.5">{rec.findings.notes}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Evidence Snapshot */}
                  {rec.isDemo ? (
                    <div className="p-3 bg-white rounded-xl border border-black/40 text-xs font-mono text-slate-700 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-bold text-black">Evidence Snapshot:</span> Decision: <strong>{rec.decisionAtCreation}</strong> · <span className="bg-slate-100 px-2 py-0.5 rounded border border-black/20 font-bold text-slate-700">DEMO / ILLUSTRATIVE</span>
                      </div>
                      <div className="text-[11px] text-slate-600 truncate max-w-md italic">
                        {rec.contributingSignalsAtCreation}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-white rounded-xl border border-black/40 text-xs font-mono text-slate-700 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-bold text-black">Evidence Snapshot at Creation:</span> Decision: <strong>{rec.decisionAtCreation}</strong> · DM: <strong>{rec.anomalyDistanceAtCreation !== null ? rec.anomalyDistanceAtCreation.toFixed(2) : 'N/A'}</strong> · State: <strong>{rec.operatingStateAtCreation}</strong> · Coverage: <strong>{rec.coverageAtCreation !== undefined ? `${(rec.coverageAtCreation * 100).toFixed(0)}%` : '100%'}</strong>
                      </div>
                      <div className="text-[11px] text-slate-600 truncate max-w-md">
                        Top Model Contributors: {rec.contributingSignalsAtCreation}
                      </div>
                    </div>
                  )}

                  {/* Post-Service Follow-up Check */}
                  {rec.status === 'COMPLETED' && (
                    rec.isDemo ? (
                      <div className="p-3.5 rounded-xl bg-slate-50 border border-black/30 text-xs font-mono space-y-1.5">
                        <div className="text-[10px] font-black uppercase tracking-wider text-slate-600 flex items-center justify-between">
                          <span>POST-SERVICE TELEMETRY VERIFICATION</span>
                          <span className="text-[10px] font-normal text-slate-500">Demo workflow state</span>
                        </div>
                        <div className="text-slate-800 font-medium flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase border bg-slate-200 text-slate-800 border-black/30">
                            DEMO STATE
                          </span>
                          <span className="text-slate-700">
                            Illustrative demo state. Actual post-service verification requires subsequent machine telemetry after a real maintenance action.
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3.5 rounded-xl bg-slate-50 border border-black/30 text-xs font-mono space-y-1.5">
                        <div className="text-[10px] font-black uppercase tracking-wider text-slate-600 flex items-center justify-between">
                          <span>POST-SERVICE TELEMETRY VERIFICATION</span>
                          <span className="text-[10px] font-normal text-slate-500">Baseline DM at creation: {rec.anomalyDistanceAtCreation !== null ? rec.anomalyDistanceAtCreation.toFixed(2) : 'N/A'}</span>
                        </div>
                        <div className="text-slate-800 font-medium flex items-center gap-2">
                          {rec.postServiceCheck ? (
                            <>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${
                                rec.postServiceCheck.status === 'VERIFIED'
                                  ? 'bg-[#C1F6C9] text-black border-black'
                                  : 'bg-slate-200 text-slate-800 border-black/30'
                              }`}>
                                {rec.postServiceCheck.status === 'VERIFIED' ? 'VERIFIED' : 'AWAITING VERIFICATION'}
                              </span>
                              <span>
                                {rec.postServiceCheck.assessmentNotes}
                                {rec.postServiceCheck.postServiceDm !== undefined && ` (Post-service DM: ${rec.postServiceCheck.postServiceDm.toFixed(2)})`}
                              </span>
                            </>
                          ) : (
                            <span className="text-slate-600 font-medium italic">
                              Awaiting telemetry verification — MachPulse will compare subsequent machine observations against the current condition baseline.
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  )}

                  {/* Action / Delete bar */}
                  <div className="flex items-center justify-between pt-1 text-xs">
                    {rec.status === 'OPEN' ? (
                      <button
                        onClick={() => startCompletionFlow(rec)}
                        className="px-3 py-1 bg-black text-white font-mono text-[11px] font-bold rounded-lg hover:bg-slate-800 cursor-pointer"
                      >
                        Complete Action &amp; Log Findings
                      </button>
                    ) : (
                      <span className="text-emerald-800 font-mono text-[11px] font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Action Verified &amp; Closed
                      </span>
                    )}

                    <button
                      onClick={() => handleDeleteRecord(rec.id)}
                      className="text-slate-400 hover:text-red-700 font-mono text-[11px] flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Remove</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-8 rounded-2xl bg-[#FFFDF0] border-2 border-dashed border-black/30 text-center space-y-2">
            <p className="text-sm font-bold text-slate-800">
              No maintenance records recorded yet.
            </p>
            <p className="text-xs font-medium text-slate-600 max-w-md mx-auto">
              All records in MachPulse are created explicitly by reliability engineers responding to model directives. Use the &quot;Schedule Maintenance Action&quot; tool above to log an inspection or service action.
            </p>
          </div>
        )}
      </section>

      {/* 6. Technical References */}
      <section className="bg-white border-4 border-black rounded-[32px] p-6 sm:p-8 shadow-[8px_8px_0_#000] space-y-4">
        <div className="border-b-2 border-black/20 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="text-[10px] font-mono font-black uppercase tracking-widest text-slate-500">
              TECHNICAL REFERENCES
            </span>
            <h3 className="font-comic text-2xl font-bold text-black flex items-center gap-2">
              <FileText className="w-6 h-6 text-slate-700" />
              Technical References
            </h3>
            <p className="text-xs text-slate-600 font-medium mt-0.5">
              Reference documents can be attached when available.
            </p>
          </div>
          <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full border border-black/20">
            Document Repository
          </span>
        </div>

        <div className="p-5 bg-[#FFFDF0] rounded-2xl border-2 border-black space-y-2 text-xs text-slate-700">
          <div className="font-bold text-black text-sm">No technical documents attached.</div>
          <p>MachPulse does not fabricate OEM manuals or maintenance procedures.</p>
          <p className="text-slate-500 text-[11px]">
            Attach approved machine documentation to enable document-grounded inspection guidance.
          </p>
        </div>
      </section>

      {/* 7. Architecture Status: Spare Parts & AI Troubleshooting Readiness */}
      <section className="bg-white border-4 border-black rounded-[32px] p-6 sm:p-8 shadow-[8px_8px_0_#000] space-y-4">
        <div className="border-b-2 border-black/20 pb-3">
          <span className="text-[10px] font-mono font-black uppercase tracking-widest text-slate-500">
            SYSTEM ARCHITECTURE &amp; SCOPE DEFENSE
          </span>
          <h3 className="font-comic text-2xl font-bold text-black flex items-center gap-2">
            <Layers className="w-6 h-6 text-slate-800" />
            Phase 3 Subsystem Scope Boundaries
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-[#FFFDF0] border-2 border-black space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-black text-black uppercase">
                SPARE PARTS
              </span>
              <span className="font-mono text-[10px] font-bold px-2 py-0.5 bg-slate-200 text-slate-800 rounded border border-black/30">
                NOT ENABLED
              </span>
            </div>
            <p className="text-xs text-slate-700 font-medium">
              Part recommendations are not enabled for this dataset. No prices, suppliers, part numbers, or stock levels are fabricated.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-[#FFFDF0] border-2 border-black space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-black text-black uppercase">
                AI Troubleshooting
              </span>
              <span className="font-mono text-[10px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-900 rounded border border-emerald-400">
                DETERMINISTIC ONLY
              </span>
            </div>
            <p className="text-xs text-slate-700 font-medium">
              AI assistance is evidence-grounded and does not replace the ML decision or technician judgement.
            </p>
          </div>
        </div>
      </section>

      {/* SERVICE FINDINGS MODAL (Action Closure) */}
      {completingRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white border-4 border-black rounded-[32px] max-w-xl w-full p-6 sm:p-8 shadow-[8px_8px_0_#000] space-y-5">
            <div className="flex items-center justify-between border-b-2 border-black pb-3">
              <div>
                <span className="text-[10px] font-mono font-black uppercase tracking-widest text-slate-500">
                  ACTION CLOSURE &amp; FINDINGS
                </span>
                <h3 className="font-comic text-2xl font-bold text-black">
                  Service Completion &amp; Findings
                </h3>
              </div>
              <button
                onClick={() => setCompletingRecord(null)}
                className="p-1.5 rounded-lg border-2 border-black hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5 text-black" />
              </button>
            </div>

            <p className="text-xs text-slate-700 font-medium">
              Closing <strong className="text-black">{completingRecord.title || completingRecord.actionType}</strong> scheduled on {formatDateDisplay(completingRecord.dueDate)}. Record technician findings and completed actions before logging telemetry verification.
            </p>

            <div className="p-3 bg-[#FFFDF0] rounded-xl border border-black/30 text-[11px] text-slate-600 font-medium">
              <strong className="text-black font-bold">Important:</strong> A completed maintenance action logs technician findings and initiates post-service telemetry verification. It does not automatically assume the machine has returned to normal condition.
            </div>

            {findingsError && (
              <div className="p-3 bg-[#FFB3B3] text-black border-2 border-black rounded-xl text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-900" />
                <span>{findingsError}</span>
              </div>
            )}

            <form onSubmit={handleCompleteWithFindings} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-mono font-black text-black block uppercase">
                  FINDINGS <span className="text-red-600">*</span>
                </label>
                <textarea
                  value={findingsFound}
                  onChange={(e) => setFindingsFound(e.target.value)}
                  rows={2}
                  placeholder="Describe what was found during maintenance..."
                  className="w-full p-3 rounded-xl border-2 border-black bg-[#FFFDF0] font-sans text-xs text-black placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-mono font-black text-black block uppercase">
                  COMPLETION NOTE <span className="text-red-600">*</span>
                </label>
                <textarea
                  value={findingsAction}
                  onChange={(e) => setFindingsAction(e.target.value)}
                  rows={2}
                  placeholder="What action was performed?"
                  className="w-full p-3 rounded-xl border-2 border-black bg-[#FFFDF0] font-sans text-xs text-black placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-mono font-black text-black block uppercase">
                  OPTIONAL NOTES
                </label>
                <input
                  type="text"
                  value={findingsNotes}
                  onChange={(e) => setFindingsNotes(e.target.value)}
                  placeholder="Additional technician observations or follow-up notes..."
                  className="w-full py-2 px-3 rounded-xl border-2 border-black bg-[#FFFDF0] font-sans text-xs text-black placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-black/20 text-[11px] font-mono text-slate-600 flex items-center justify-between">
                <span>Baseline anomaly distance: <strong>DM {completingRecord.anomalyDistanceAtCreation.toFixed(2)}</strong> ({completingRecord.decisionAtCreation})</span>
                <span className="text-[10px] bg-slate-200 px-2 py-0.5 rounded border border-black/20 font-bold">Demo technician</span>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCompletingRecord(null)}
                  className="px-4 py-2 rounded-xl border-2 border-black bg-white text-xs font-mono font-bold cursor-pointer hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 rounded-xl border-2 border-black bg-[#C1F6C9] hover:bg-emerald-300 text-black font-mono text-xs font-black shadow-[2px_2px_0_#000] cursor-pointer"
                >
                  Submit Findings &amp; Complete
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
