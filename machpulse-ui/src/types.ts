export type NavTab = 'OVERVIEW' | 'TELEMETRY' | 'DIAGNOSTICS' | 'MAINTENANCE' | 'VALIDATION';

export type OperationalUrgency = 'ROUTINE' | 'ELEVATED' | 'IMMEDIATE' | 'UNKNOWN';

export interface MaintenanceFindings {
  found: string;
  action: string;
  notes?: string;
  technician?: string;
}

export interface PostServiceCheck {
  baselineDmAtCreation: number;
  postServiceDm?: number;
  observedAt?: string;
  status: 'VERIFIED' | 'NOT_YET_VERIFIED' | 'AWAITING_VERIFICATION' | 'NORMAL' | 'ELEVATED' | 'INSUFFICIENT_DATA';
  assessmentNotes: string;
}

export interface MaintenanceRecord {
  id: string;
  machineId: string;
  title?: string;
  actionType: 'Inspection' | 'Maintenance';
  status: 'OPEN' | 'COMPLETED';
  isDemo?: boolean;
  createdAt: string;
  dueDate: string;
  notes: string;
  findings?: MaintenanceFindings;
  postServiceCheck?: PostServiceCheck;
  completedAt?: string;
  decisionAtCreation: string;
  anomalyDistanceAtCreation: number | null;
  operatingStateAtCreation: string;
  contributingSignalsAtCreation: string;
  coverageAtCreation?: number;
}

export type OperatingState = 'off' | 'offloaded' | 'loaded';
export type MetroPt3OperatingState = 'OFF' | 'OFFLOADED' | 'LOADED';
export type DecisionState = 'MONITOR' | 'INSPECT' | 'MAINTAIN' | 'INSUFFICIENT EVIDENCE';

export interface TelemetryReading {
  timestamp: string;
  motor_current: number;
  tp2: number;
  tp3: number;
  h1: number;
  oil_temperature: number;
  dv_pressure: number;
  operating_state: OperatingState;
  coverage?: number;
  distance?: number | null;
  decision?: DecisionState | null;
}

export interface RiskContributor {
  parameter: string;
  contributionPercent: number;
  currentValue: string;
  nominalValue: string;
  direction: 'HIGH' | 'LOW' | 'ERRATIC';
  description: string;
}

export interface Equipment {
  id: string;
  name: string;
  type: string;
  location: string;
  department: string;
  model: string;
  manufacturer: string;
  powerRatingKw: number;
  installDate: string;
  operatingState: OperatingState;
  decision: DecisionState;
  anomalyDistance: number;
  elevatedThreshold: number;
  severeThreshold: number;
  isAboveThreshold: boolean;
  qualityGatePassed: boolean;
  qualityGateCoverage: number;

  // Real sensor readings
  currentAmps: number | null;
  currentTemp: number | null;
  tp2Bar: number | null;
  tp3Bar: number | null;
  h1Bar: number | null;
  dvPressureBar: number | null;

  riskContributors: RiskContributor[];
  recentReadings: TelemetryReading[];
}

export interface MetroPt3StateDistribution {
  state: 'OFF' | 'OFFLOADED' | 'LOADED';
  sampleCount: number;
  percentage: number;
  means: {
    motor_current: number;
    tp2: number;
    tp3: number;
    h1: number;
    dv_pressure: number;
    oil_temperature: number;
  };
  stdDevs: {
    motor_current: number;
    tp2: number;
    tp3: number;
    h1: number;
    dv_pressure: number;
    oil_temperature: number;
  };
}

export interface MetroPt3BenchmarkRow {
  systemName: string;
  alertEpisodes: number | string;
  eventsCaught: string;
  falseAlarms: number | string;
  falseAlarmsPerMonth: number;
  alertPrecisionPercent: number;
  leadTimeF1: string;
  leadTimeF2: string;
  leadTimeF3: string;
  leadTimeF4: string;
  notes: string;
}
