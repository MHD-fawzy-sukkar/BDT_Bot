import { UpsertBotUserInput } from "../entities/BotUser";

export interface UserCountsSummary {
  readonly total: number;
  readonly active: number;
  readonly blocked: number;
  readonly activeLast24h: number;
}

export interface IBotUserRepository {
  upsertUser(input: UpsertBotUserInput): Promise<void>;
  markUserInactive(userId: string): Promise<void>;
  getActiveUserIds(): Promise<string[]>;
  getUserCounts(): Promise<UserCountsSummary>;
  getCurrentNodeId(userId: string): Promise<number | null>;
  setCurrentNodeId(userId: string, nodeId: number | null): Promise<void>;
}
