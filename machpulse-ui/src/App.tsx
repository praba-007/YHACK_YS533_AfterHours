import React, { useState, useEffect, useCallback, useRef } from 'react';
import { NavTab } from './types';
import { Header } from './components/Header';
import { OverviewView } from './components/OverviewView';
import { TelemetryView } from './components/TelemetryView';
import { DiagnosticsView } from './components/DiagnosticsView';
import { MaintenanceView } from './components/MaintenanceView';
import { ValidationView } from './components/ValidationView';
import { 
  apiService, 
  MachineHealthResponse, 
  TelemetryPoint, 
  ReplayStatusResponse,
  BaselinesComparisonResponse,
  FailureEventsResponse,
  PipelineSummaryResponse,
  QualityIndicatorsResponse
} from './services/api';

export default function App() {
  const [currentTab, setCurrentTab] = useState<NavTab>('OVERVIEW');

  // Dynamic backend API states (streamed / replayed)
  const [machineHealth, setMachineHealth] = useState<MachineHealthResponse | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryPoint[]>([]);
  const [replayStatus, setReplayStatus] = useState<ReplayStatusResponse | null>(null);
  const [replayLoading, setReplayLoading] = useState<boolean>(false);
  const [replayError, setReplayError] = useState<string | null>(null);

  // Static pipeline & evaluation states (loaded once on mount)
  const [baselines, setBaselines] = useState<BaselinesComparisonResponse | null>(null);
  const [failureEvents, setFailureEvents] = useState<FailureEventsResponse | null>(null);
  const [pipelineSummary, setPipelineSummary] = useState<PipelineSummaryResponse | null>(null);
  const [qualityIndicators, setQualityIndicators] = useState<QualityIndicatorsResponse | null>(null);

  // Keep a ref to running state to optimize interval duration
  const isRunningRef = useRef<boolean>(false);
  isRunningRef.current = replayStatus?.running ?? false;

  // 1. Fetch static evaluation data on mount
  useEffect(() => {
    let isMounted = true;
    const fetchStaticData = async () => {
      try {
        const [base, evs, summary, quality] = await Promise.all([
          apiService.getBaselinesComparison().catch(() => null),
          apiService.getFailureEvents().catch(() => null),
          apiService.getPipelineSummary().catch(() => null),
          apiService.getQualityIndicators().catch(() => null),
        ]);
        if (isMounted) {
          if (base) setBaselines(base);
          if (evs) setFailureEvents(evs);
          if (summary) setPipelineSummary(summary);
          if (quality) setQualityIndicators(quality);
        }
      } catch (err) {
        console.warn('Static API fetch warning:', err);
      }
    };
    fetchStaticData();
    return () => { isMounted = false; };
  }, []);

  // 2. Fetch dynamic telemetry & machine health & replay status
  const fetchDynamicData = useCallback(async () => {
    try {
      const [status, mh, tel] = await Promise.all([
        apiService.getReplayStatus().catch(() => null),
        apiService.getMachineHealth().catch(() => null),
        apiService.getRecentTelemetry(120).catch(() => []),
      ]);

      if (status) {
        setReplayStatus(status);
        setReplayError(null);
      }
      if (mh) setMachineHealth(mh);
      if (tel && tel.length > 0) setTelemetry(tel);
    } catch (err) {
      console.warn('Dynamic telemetry fetch warning:', err);
    }
  }, []);

  // 3. Unified Adaptive Polling Loop
  useEffect(() => {
    fetchDynamicData();

    // 600ms when actively replaying for smooth chart/position tracking; 2000ms when paused
    const pollIntervalMs = isRunningRef.current ? 600 : 2000;
    const interval = setInterval(fetchDynamicData, pollIntervalMs);

    return () => clearInterval(interval);
  }, [fetchDynamicData, replayStatus?.running, replayStatus?.speed]);

  // 4. Centralized Replay Control Handlers
  const handlePlayPause = useCallback(async () => {
    setReplayLoading(true);
    setReplayError(null);
    try {
      let res: ReplayStatusResponse;
      if (replayStatus?.running) {
        res = await apiService.pauseReplay();
      } else {
        res = await apiService.startReplay();
      }
      setReplayStatus(res);
      await fetchDynamicData();
    } catch (err) {
      console.error('Replay control error:', err);
      setReplayError('Replay control failed. Please check FastAPI backend connection.');
    } finally {
      setReplayLoading(false);
    }
  }, [replayStatus?.running, fetchDynamicData]);

  const handleReset = useCallback(async () => {
    setReplayLoading(true);
    setReplayError(null);
    try {
      const res = await apiService.resetReplay();
      setReplayStatus(res);
      await fetchDynamicData();
    } catch (err) {
      console.error('Replay reset error:', err);
      setReplayError('Replay reset failed. Please check FastAPI backend connection.');
    } finally {
      setReplayLoading(false);
    }
  }, [fetchDynamicData]);

  const handleSetSpeed = useCallback(async (speed: number) => {
    setReplayLoading(true);
    setReplayError(null);
    try {
      const res = await apiService.setReplaySpeed(speed);
      setReplayStatus(res);
      await fetchDynamicData();
    } catch (err) {
      console.error('Replay speed error:', err);
      setReplayError('Replay speed update failed.');
    } finally {
      setReplayLoading(false);
    }
  }, [fetchDynamicData]);

  const handleRetryReplay = useCallback(async () => {
    setReplayError(null);
    await fetchDynamicData();
  }, [fetchDynamicData]);

  return (
    <div className="min-h-screen bg-[#FFFDF0] text-black flex flex-col font-sans selection:bg-[#FFE600] selection:text-black">
      {/* Global Header */}
      <Header
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
      />

      {/* Main Content: 5 Core Screens */}
      <main className="flex-1 pb-16">
        {currentTab === 'OVERVIEW' && (
          <OverviewView
            machineHealth={machineHealth}
            telemetry={telemetry}
            onNavigate={setCurrentTab}
          />
        )}

        {currentTab === 'TELEMETRY' && (
          <TelemetryView
            telemetry={telemetry}
            replayStatus={replayStatus}
            replayLoading={replayLoading}
            replayError={replayError}
            onPlayPause={handlePlayPause}
            onReset={handleReset}
            onSetSpeed={handleSetSpeed}
            onRetryReplay={handleRetryReplay}
          />
        )}

        {currentTab === 'DIAGNOSTICS' && (
          <DiagnosticsView
            machineHealth={machineHealth}
          />
        )}

        {currentTab === 'MAINTENANCE' && (
          <MaintenanceView
            machineHealth={machineHealth}
            telemetry={telemetry}
          />
        )}

        {currentTab === 'VALIDATION' && (
          <ValidationView
            baselines={baselines}
            failureEvents={failureEvents}
            pipelineSummary={pipelineSummary}
            qualityIndicators={qualityIndicators}
          />
        )}
      </main>
    </div>
  );
}
