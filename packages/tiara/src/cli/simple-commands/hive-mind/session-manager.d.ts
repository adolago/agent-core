export interface HiveMindSession {
  id: string;
  swarm_id?: string;
  swarm_name?: string;
  objective?: string | null;
  status?: string;
  created_at: string | number | Date;
  updated_at: string | number | Date;
  paused_at?: string | number | Date | null;
  resumed_at?: string | number | Date | null;
  completion_percentage?: number;
  parent_pid?: number | null;
  child_pids?: number[];
  total_processes?: number;
  agent_count?: number;
  task_count?: number;
  completed_tasks?: number;
  statistics?: {
    completionPercentage?: number;
  };
}

export class HiveMindSessionManager {
  constructor(hiveMindDir?: string | null);
  getSession(sessionId: string): Promise<HiveMindSession | null>;
  getActiveSessions(): Promise<HiveMindSession[]>;
  getActiveSessionsWithProcessInfo(): Promise<HiveMindSession[]>;
  pauseSession(sessionId: string): Promise<boolean>;
  resumeSession(sessionId: string): Promise<HiveMindSession>;
  stopSession(sessionId: string): Promise<void>;
  cleanupOrphanedProcesses(): Promise<number>;
  close(): void;
}
