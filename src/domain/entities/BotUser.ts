import { MenuNode } from "./MenuNode";

export interface BotUser {
  readonly userId: string;
  readonly username: string | null;
  readonly firstName: string | null;
  readonly isActive: boolean;
  readonly joinedAt: string;
  readonly lastActiveAt: string;
}

export interface UpsertBotUserInput {
  readonly userId: string;
  readonly username?: string | null;
  readonly firstName?: string | null;
}

export interface BotStatistics {
  readonly totalUsers: number;
  readonly activeUsers: number;
  readonly blockedUsers: number;
  readonly activeLast24h: number;
  readonly totalNodes: number;
  readonly totalContents: number;
  readonly topNodes: MenuNode[];
}
