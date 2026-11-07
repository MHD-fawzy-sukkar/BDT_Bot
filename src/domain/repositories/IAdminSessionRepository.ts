import { AdminSession, UpsertAdminSessionInput } from "../entities/AdminSession";

export interface IAdminSessionRepository {
  getSession(userId: string, chatId: string): Promise<AdminSession | null>;
  upsertSession(input: UpsertAdminSessionInput): Promise<AdminSession>;
  clearSession(userId: string, chatId: string): Promise<void>;
}
