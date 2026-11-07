export interface Env {
  readonly DB: D1Database;
  readonly BOT_TOKEN: string;
  readonly ADMIN_GROUP_ID?: string;
  readonly ADMIN_USER_IDS?: string;
  readonly WEBHOOK_SECRET?: string;
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
