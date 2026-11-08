export interface Env {
  readonly DB: D1Database;
  readonly BOT_TOKEN: string;
  readonly ADMIN_GROUP_ID?: string;
  readonly ADMIN_USER_IDS?: string;
  readonly LOGS_TOPIC_ID?: string;
  readonly STORAGE_CHANNEL_ID?: string;
  readonly WEBHOOK_SECRET?: string;
  readonly WORKER_URL?: string;
}

export function parseAdminUserIds(raw?: string): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0)
  );
}
