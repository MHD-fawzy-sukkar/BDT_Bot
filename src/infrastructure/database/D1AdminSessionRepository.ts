import {
  AdminActionType,
  AdminSession,
  UpsertAdminSessionInput,
} from "../../domain/entities/AdminSession";
import { IAdminSessionRepository } from "../../domain/repositories/IAdminSessionRepository";

interface AdminSessionRow {
  user_id: string;
  chat_id: string;
  action: AdminActionType;
  target_node_id: number | null;
  panel_message_id: number | null;
  updated_at: string;
}

function mapRowToAdminSession(row: AdminSessionRow): AdminSession {
  return {
    userId: String(row.user_id),
    chatId: String(row.chat_id),
    action: row.action,
    targetNodeId:
      row.target_node_id !== null ? Number(row.target_node_id) : null,
    panelMessageId:
      row.panel_message_id !== null ? Number(row.panel_message_id) : null,
    updatedAt: row.updated_at,
  };
}

export class D1AdminSessionRepository implements IAdminSessionRepository {
  constructor(private readonly db: D1Database) {}

  async getSession(
    userId: string,
    chatId: string
  ): Promise<AdminSession | null> {
    const row = await this.db
      .prepare(
        "SELECT * FROM admin_sessions WHERE user_id = ? AND chat_id = ?"
      )
      .bind(userId, chatId)
      .first<AdminSessionRow>();

    return row ? mapRowToAdminSession(row) : null;
  }

  async upsertSession(input: UpsertAdminSessionInput): Promise<AdminSession> {
    const row = await this.db
      .prepare(
        `INSERT INTO admin_sessions (user_id, chat_id, action, target_node_id, panel_message_id, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(user_id, chat_id) DO UPDATE SET
           action = excluded.action,
           target_node_id = excluded.target_node_id,
           panel_message_id = excluded.panel_message_id,
           updated_at = datetime('now')
         RETURNING *`
      )
      .bind(
        input.userId,
        input.chatId,
        input.action,
        input.targetNodeId,
        input.panelMessageId ?? null
      )
      .first<AdminSessionRow>();

    if (!row) {
      throw new Error("Failed to upsert admin session");
    }

    return mapRowToAdminSession(row);
  }

  async clearSession(userId: string, chatId: string): Promise<void> {
    await this.db
      .prepare("DELETE FROM admin_sessions WHERE user_id = ? AND chat_id = ?")
      .bind(userId, chatId)
      .run();
  }
}
