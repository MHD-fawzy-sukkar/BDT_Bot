import { UpsertBotUserInput } from "../../domain/entities/BotUser";
import {
  IBotUserRepository,
  UserCountsSummary,
} from "../../domain/repositories/IBotUserRepository";

export class D1BotUserRepository implements IBotUserRepository {
  constructor(private readonly db: D1Database) {}

  async upsertUser(input: UpsertBotUserInput): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO bot_users (user_id, username, first_name, is_active, joined_at, last_active_at)
         VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))
         ON CONFLICT(user_id) DO UPDATE SET
           username = excluded.username,
           first_name = excluded.first_name,
           is_active = 1,
           last_active_at = datetime('now')`
      )
      .bind(input.userId, input.username ?? null, input.firstName ?? null)
      .run();
  }

  async markUserInactive(userId: string): Promise<void> {
    await this.db
      .prepare("UPDATE bot_users SET is_active = 0 WHERE user_id = ?")
      .bind(userId)
      .run();
  }

  async getActiveUserIds(): Promise<string[]> {
    const { results } = await this.db
      .prepare("SELECT user_id FROM bot_users WHERE is_active = 1")
      .all<{ user_id: string }>();

    return (results ?? []).map((r) => String(r.user_id));
  }

  async getUserCounts(): Promise<UserCountsSummary> {
    const row = await this.db
      .prepare(
        `SELECT
           COUNT(*) AS total,
           COALESCE(SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END), 0) AS active,
           COALESCE(SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END), 0) AS blocked,
           COALESCE(SUM(CASE WHEN last_active_at >= datetime('now', '-1 day') THEN 1 ELSE 0 END), 0) AS active_24h
         FROM bot_users`
      )
      .first<{
        total: number;
        active: number;
        blocked: number;
        active_24h: number;
      }>();

    return {
      total: Number(row?.total ?? 0),
      active: Number(row?.active ?? 0),
      blocked: Number(row?.blocked ?? 0),
      activeLast24h: Number(row?.active_24h ?? 0),
    };
  }

  async getCurrentNodeId(userId: string): Promise<number | null> {
    const row = await this.db
      .prepare("SELECT current_node_id FROM bot_users WHERE user_id = ?")
      .bind(userId)
      .first<{ current_node_id: number | null }>();

    return row && row.current_node_id !== null
      ? Number(row.current_node_id)
      : null;
  }

  async setCurrentNodeId(
    userId: string,
    nodeId: number | null
  ): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO bot_users (user_id, current_node_id, is_active, joined_at, last_active_at)
         VALUES (?, ?, 1, datetime('now'), datetime('now'))
         ON CONFLICT(user_id) DO UPDATE SET
           current_node_id = excluded.current_node_id,
           is_active = 1,
           last_active_at = datetime('now')`
      )
      .bind(userId, nodeId)
      .run();
  }
}
