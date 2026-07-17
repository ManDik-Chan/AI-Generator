export type BrainstormRole = "ANALYST" | "CREATIVE" | "CRITIC" | "PLANNER";
export type BrainstormStatus = "PENDING" | "COMPLETE" | "ERROR" | "CANCELLED";

export interface BrainstormWorkerDto {
  id?: string;
  role: BrainstormRole;
  position: number;
  label: string;
  status: BrainstormStatus;
  output: string;
  errorCode?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface BrainstormUsageDto {
  limit: number;
  used: number;
  remaining: number;
  unlimited: boolean;
}

export interface BrainstormRecoveryDto {
  id: string;
  type: "BRAINSTORM";
  status: BrainstormStatus;
  prompt: string;
  outputText: string;
  errorCode?: string;
  workers: BrainstormWorkerDto[];
  usage: BrainstormUsageDto;
  createdAt: string;
  updatedAt: string;
}
