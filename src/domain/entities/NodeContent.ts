export type ContentType =
  | "document"
  | "video"
  | "audio"
  | "voice"
  | "photo"
  | "text"
  | "other";

export interface NodeContent {
  readonly id: number;
  readonly nodeId: number;
  readonly contentType: ContentType;
  readonly sourceChatId: string;
  readonly sourceMessageId: number;
  readonly fileId: string | null;
  readonly title: string;
  readonly caption: string | null;
  readonly sortOrder: number;
  readonly isForwarded: boolean;
  readonly vaultMessageId: number | null;
  readonly createdAt: string;
}

export interface CreateNodeContentInput {
  readonly nodeId: number;
  readonly contentType: ContentType;
  readonly sourceChatId: string;
  readonly sourceMessageId: number;
  readonly fileId?: string | null;
  readonly title: string;
  readonly caption?: string | null;
  readonly isForwarded?: boolean;
  readonly vaultMessageId?: number | null;
}
