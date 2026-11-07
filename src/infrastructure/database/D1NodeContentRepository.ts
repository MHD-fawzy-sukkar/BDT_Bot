import {
  ContentType,
  CreateNodeContentInput,
  NodeContent,
} from "../../domain/entities/NodeContent";
import { INodeContentRepository } from "../../domain/repositories/INodeContentRepository";
import { TreeMemoryCache } from "../cache/TreeMemoryCache";

interface NodeContentRow {
  id: number;
  node_id: number;
  content_type: ContentType;
  source_chat_id: string;
  source_message_id: number;
  file_id: string | null;
  title: string;
  caption: string | null;
  sort_order: number;
  is_forwarded?: number;
  created_at: string;
}

function mapRowToNodeContent(row: NodeContentRow): NodeContent {
  return {
    id: Number(row.id),
    nodeId: Number(row.node_id),
    contentType: row.content_type,
    sourceChatId: String(row.source_chat_id),
    sourceMessageId: Number(row.source_message_id),
    fileId: row.file_id,
    title: row.title,
    caption: row.caption,
    sortOrder: Number(row.sort_order),
    isForwarded: Number(row.is_forwarded ?? 0) === 1,
    createdAt: row.created_at,
  };
}

export class D1NodeContentRepository implements INodeContentRepository {
  constructor(private readonly db: D1Database) {}

  async findByNodeId(nodeId: number): Promise<NodeContent[]> {
    const snapshot = await TreeMemoryCache.getSnapshot(this.db);
    return snapshot.contentsByNodeId.get(nodeId) ?? [];
  }

  async findById(id: number): Promise<NodeContent | null> {
    const snapshot = await TreeMemoryCache.getSnapshot(this.db);
    return snapshot.contentsById.get(id) ?? null;
  }

  async create(input: CreateNodeContentInput): Promise<NodeContent> {
    const isForwardedInt = input.isForwarded ? 1 : 0;

    const row = await this.db
      .prepare(
        `INSERT INTO node_contents (
          node_id, content_type, source_chat_id, source_message_id, file_id, title, caption, sort_order, is_forwarded
        )
        VALUES (
          ?, ?, ?, ?, ?, ?, ?,
          COALESCE((SELECT MAX(sort_order) FROM node_contents WHERE node_id = ?), 0) + 1,
          ?
        )
        RETURNING *`
      )
      .bind(
        input.nodeId,
        input.contentType,
        input.sourceChatId,
        input.sourceMessageId,
        input.fileId ?? null,
        input.title,
        input.caption ?? null,
        input.nodeId,
        isForwardedInt
      )
      .first<NodeContentRow>();

    TreeMemoryCache.invalidate();

    if (!row) {
      throw new Error("Failed to insert node_content");
    }

    return mapRowToNodeContent(row);
  }

  async delete(id: number): Promise<boolean> {
    const res = await this.db
      .prepare("DELETE FROM node_contents WHERE id = ?")
      .bind(id)
      .run();
    TreeMemoryCache.invalidate();
    return (res.meta.changes ?? 0) > 0;
  }

  async deleteAllByNodeId(nodeId: number): Promise<number> {
    const res = await this.db
      .prepare("DELETE FROM node_contents WHERE node_id = ?")
      .bind(nodeId)
      .run();
    TreeMemoryCache.invalidate();
    return Number(res.meta.changes ?? 0);
  }

  async swapSortOrder(contentIdA: number, contentIdB: number): Promise<void> {
    const [itemA, itemB] = await Promise.all([
      this.findById(contentIdA),
      this.findById(contentIdB),
    ]);

    if (!itemA || !itemB) return;

    let orderA = itemA.sortOrder;
    let orderB = itemB.sortOrder;
    if (orderA === orderB) {
      orderA = itemA.id;
      orderB = itemB.id;
    }

    await this.db.batch([
      this.db
        .prepare("UPDATE node_contents SET sort_order = ? WHERE id = ?")
        .bind(orderB, contentIdA),
      this.db
        .prepare("UPDATE node_contents SET sort_order = ? WHERE id = ?")
        .bind(orderA, contentIdB),
    ]);
    TreeMemoryCache.invalidate();
  }

  async countByNodeId(nodeId: number): Promise<number> {
    const snapshot = await TreeMemoryCache.getSnapshot(this.db);
    return (snapshot.contentsByNodeId.get(nodeId) ?? []).length;
  }

  async countAllContents(): Promise<number> {
    const snapshot = await TreeMemoryCache.getSnapshot(this.db);
    return snapshot.contentsById.size;
  }
}
