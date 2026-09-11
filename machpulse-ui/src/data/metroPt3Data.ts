import { 
  MetroPt3StateDistribution, 
  MetroPt3BenchmarkRow, 
  MetroPt3OperatingState
} from '../types';

export const METROPT3_METADATA = {
  title: 'MetroPT-3 Train Auxiliary Power Unit (APU) Air Compressor Dataset',
  source: 'Metro do Porto light-rail APU compressor telemetry (Knorr-Bremse VV120-T)',
  rawRowsDecimated: 1516948,
  nominalSamplingRateHz: 0.1, // 10 seconds interval
  originalDocClaimHz: 1.0,
  fileSizeMb: 218,
  calendarSpan: '2020-02-01 00:00:00 to 2020-09-01 03:59:50',
  totalCalendarHours: 5116,
  actualOperatingHours: 4214,
  missingGapsCount: 331,
  missingHoursTotal: 909.5,
  documentedFailureMode: 'Air leak (High stress) — single class, n=4 events',
  sensorColumns: [
    { name: 'TP2', type: 'Analogue', unit: 'bar', role: 'Feature (Compressor output pressure)' },
    { name: 'TP3', type: 'Analogue', unit: 'bar', role: 'Feature (Pneumatic panel pressure)' },
    { name: 'H1', type: 'Analogue', unit: 'bar', role: 'Feature (Separator drop; r = -0.961 with TP2 under load)' },
    { name: 'DV_pressure', type: 'Analogue', unit: 'bar', role: 'Feature (Dryer discharge drop; 0 under load)' },
    { name: 'Reservoirs', type: 'Analogue', unit: 'bar', role: 'Dropped (Duplicate of TP3, Pearson r = 1.000)' },
    { name: 'Oil_temperature', type: 'Analogue', unit: '°C', role: 'Feature (Compressor oil temp; seasonal drift noted)' },
    { name: 'Motor_current', type: 'Analogue', unit: 'A', role: 'Primary Feature & State Classifier (3-phase draw)' },
    { name: 'COMP', type: 'Digital', unit: '{0,1}', role: 'Auxiliary (Air intake valve active when off/offloaded)' },
    { name: 'DV_eletric', type: 'Digital', unit: '{0,1}', role: 'Auxiliary (Outlet valve active under load)' },
    { name: 'Towers', type: 'Digital', unit: '{0,1}', role: 'Auxiliary (Dryer tower 1 vs tower 2)' },
    { name: 'MPG', type: 'Digital', unit: '{0,1}', role: 'Auxiliary (Compressor start trigger at <8.2 bar)' },
    { name: 'LPS', type: 'Digital', unit: '{0,1}', role: 'EXCLUDED FROM MODEL — On-board alarm (<7 bar); used as benchmark' },
    { name: 'Pressure_switch', type: 'Digital', unit: '{0,1}', role: 'Auxiliary (Dryer discharge detector)' },
    { name: 'Oil_level', type: 'Digital', unit: '{0,1}', role: 'Auxiliary (Active when oil low)' },
    { name: 'Caudal_impulses', type: 'Digital', unit: '{0,1}', role: 'Auxiliary (Flow pulse proxy)' },
  ]
};

export const METROPT3_FAILURE_EVENTS = [
  {
    id: 'F1',
    name: 'Failure Window #1 (Air Leak)',
    start: '2020-04-18 00:00:00',
    end: '2020-04-18 23:59:50',
    durationHours: 24,
    failureType: 'Air leak',
    rowsPresent: 8663,
    documentedReport: 'Air leak on APU discharge line, compressor continuously loaded',
    leadTimeHours: -19.6,
    leadTimeDisplay: 'Detected during window (-19.6h)',
    detected: true,
    reportNote: 'First alert at 2020-04-18 19:36:00 (INSPECT)'
  },
  {
    id: 'F2',
    name: 'Failure Window #2 (Air Leak)',
    start: '2020-05-29 23:30:00',
    end: '2020-05-30 06:00:00',
    durationHours: 6.5,
    failureType: 'Air leak',
    rowsPresent: 2366,
    documentedReport: 'Maintenance on 30 Apr (Documentation typo in source: actually follows 30 May)',
    leadTimeHours: null,
    leadTimeDisplay: 'Missed',
    detected: false,
    reportNote: 'Missed — Maintenance report timestamp recorded as 30 Apr instead of 30 May'
  },
  {
    id: 'F3',
    name: 'Failure Window #3 (Air Leak)',
    start: '2020-06-05 10:00:00',
    end: '2020-06-07 14:30:00',
    durationHours: 52.5,
    failureType: 'Air leak',
    rowsPresent: 17315,
    documentedReport: 'Maintenance on 8 Jun at 16:00',
    leadTimeHours: -17.83,
    leadTimeDisplay: 'Detected during window (-17.8h)',
    detected: true,
    reportNote: 'First alert at 2020-06-06 03:50:00 (INSPECT)'
  },
  {
    id: 'F4',
    name: 'Failure Window #4 (Air Leak)',
    start: '2020-07-15 14:30:00',
    end: '2020-07-15 19:00:00',
    durationHours: 4.5,
    failureType: 'Air leak',
    rowsPresent: 1627,
    documentedReport: 'Maintenance on 16 Jul at 00:00',
    leadTimeHours: 16.83,
    leadTimeDisplay: '+16.83h early warning',
    detected: true,
    reportNote: 'Early predictive alert raised at 2020-07-14 21:40:00 (+16.83h ahead of official report)'
  }
];

export const METROPT3_STATE_DISTRIBUTIONS: MetroPt3StateDistribution[] = [
  {
    state: 'OFF',
    sampleCount: 828253,
    percentage: 54.6,
    means: {
      motor_current: 0.04,
      tp2: -0.01,
      tp3: 8.92,
      h1: 8.28,
      dv_pressure: 0.01,
      oil_temperature: 56.4
    },
    stdDevs: {
      motor_current: 0.03,
      tp2: 0.05,
      tp3: 0.35,
      h1: 0.22,
      dv_pressure: 0.04,
      oil_temperature: 4.2
    }
  },
  {
    state: 'OFFLOADED',
    sampleCount: 617398,
    percentage: 40.7,
    means: {
      motor_current: 3.82,
      tp2: 1.84,
      tp3: 9.04,
      h1: 7.62,
      dv_pressure: 0.03,
      oil_temperature: 59.8
    },
    stdDevs: {
      motor_current: 0.45,
      tp2: 0.82,
      tp3: 0.42,
      h1: 0.74,
      dv_pressure: 0.08,
      oil_temperature: 4.8
    }
  },
  {
    state: 'LOADED',
    sampleCount: 71297,
    percentage: 4.7,
    means: {
      motor_current: 7.45,
      tp2: 8.12,
      tp3: 9.18,
      h1: 0.12,
      dv_pressure: 0.00,
      oil_temperature: 66.2
    },
    stdDevs: {
      motor_current: 0.62,
      tp2: 0.54,
      tp3: 0.38,
      h1: 0.18,
      dv_pressure: 0.02,
      oil_temperature: 5.1
    }
  }
];

export const METROPT3_BENCHMARK_RESULTS: MetroPt3BenchmarkRow[] = [
  {
    systemName: 'Fixed Threshold (Motor Current > 4.0A sustained >= 10m)',
    alertEpisodes: 38,
    eventsCaught: '4 / 4 (100%)',
    falseAlarms: 34,
    falseAlarmsPerMonth: 8.03,
    alertPrecisionPercent: 10.5,
    leadTimeF1: 'Detected during window',
    leadTimeF2: 'Missed',
    leadTimeF3: 'Detected during window',
    leadTimeF4: 'Detected during window',
    notes: 'Simple heuristic baseline. 100% recall with 8.03 false alarms/month; zero advance lead time.'
  },
  {
    systemName: 'LPS On-Board Low Pressure Switch',
    alertEpisodes: 127,
    eventsCaught: '3 / 4 (75%)',
    falseAlarms: 124,
    falseAlarmsPerMonth: 22.19,
    alertPrecisionPercent: 2.36,
    leadTimeF1: 'Fired during event',
    leadTimeF2: 'Missed',
    leadTimeF3: 'Fired during event',
    leadTimeF4: 'Fired 2 days late (July 17)',
    notes: 'Existing train hardware alarm (<7.0 bar). Severe alarm fatigue: 22.19 false alarms/month.'
  },
  {
    systemName: 'Isolation Forest (Secondary Benchmark)',
    alertEpisodes: 28,
    eventsCaught: '1 / 4 (25%)',
    falseAlarms: 27,
    falseAlarmsPerMonth: 5.50,
    alertPrecisionPercent: 3.57,
    leadTimeF1: 'Missed',
    leadTimeF2: 'Missed',
    leadTimeF3: 'Missed',
    leadTimeF4: 'Not tracked',
    notes: 'Per-state Isolation Forest. Misses 3 out of 4 events; 25% recall. Lead time not evaluated in benchmark.'
  },
  {
    systemName: 'MachPulse (State-Stratified Mahalanobis Distance)',
    alertEpisodes: 206,
    eventsCaught: '3 / 4 (75%)',
    falseAlarms: 203,
    falseAlarmsPerMonth: 42.91,
    alertPrecisionPercent: 6.02,
    leadTimeF1: '-19.6h (during)',
    leadTimeF2: 'Missed',
    leadTimeF3: '-17.8h (during)',
    leadTimeF4: '+16.83h early warning',
    notes: 'Trained strictly unsupervised on Feb baseline. 75% recall (3/4 events caught) with +16.83h advance warning on F4.'
  }
];

export function getOperatingState(motorCurrentAmps: number): MetroPt3OperatingState {
  if (motorCurrentAmps < 0.5) return 'OFF';
  if (motorCurrentAmps <= 6.0) return 'OFFLOADED';
  return 'LOADED';
}
