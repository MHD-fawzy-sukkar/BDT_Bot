export type AdminActionType =
  | "IDLE"
  | "ADD_CHILD_NODE"
  | "ADD_CHILD_NODE_FULL"
  | "RENAME_NODE"
  | "EDIT_NODE_DESC"
  | "ADD_CONTENT"
  | "BROADCAST";

export interface AdminSession {
  readonly userId: string;
  readonly chatId: string;
  readonly action: AdminActionType;
  readonly targetNodeId: number | null;
  readonly panelMessageId: number | null;
  readonly updatedAt: string;
}

export interface UpsertAdminSessionInput {
  readonly userId: string;
  readonly chatId: string;
  readonly action: AdminActionType;
  readonly targetNodeId: number | null;
  readonly panelMessageId?: number | null;
}
