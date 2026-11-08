import {
  MenuNode,
  MenuNodeWithCounts,
} from "../../domain/entities/MenuNode";
import { ContentType, NodeContent } from "../../domain/entities/NodeContent";

interface MenuNodeRow {
  id: number;
  parent_id: number | null;
  title: string;
  description: string | null;
  sort_order: number;
  is_full_width?: number;
  views_count?: number;
  created_at: string;
  updated_at: string;
}

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
  vault_message_id?: number | null;
  created_at: string;
}

export interface TreeSnapshot {
  readonly nodesById: Map<number, MenuNodeWithCounts>;
  readonly childrenByParent: Map<number | null, MenuNodeWithCounts[]>;
  readonly contentsByNodeId: Map<number, NodeContent[]>;
  readonly contentsById: Map<number, NodeContent>;
  readonly allNodes: MenuNodeWithCounts[];
  readonly loadedAt: number;
}

// In-memory LRU-style cache for Cloudflare Worker isolate.
// Lasts throughout the isolate lifecycle and invalidates immediately on admin mutation.
let cachedSnapshot: TreeSnapshot | null = null;
let pendingLoadPromise: Promise<TreeSnapshot> | null = null;
const CACHE_TTL_MS = 60_000; // 1 minute TTL or immediate invalidation on write

export class TreeMemoryCache {
  static invalidate(): void {
    cachedSnapshot = null;
    pendingLoadPromise = null;
  }

  static async getSnapshot(db: D1Database): Promise<TreeSnapshot> {
    const now = Date.now();
    if (cachedSnapshot && now - cachedSnapshot.loadedAt < CACHE_TTL_MS) {
      return cachedSnapshot;
    }

    if (pendingLoadPromise) {
      return pendingLoadPromise;
    }

    pendingLoadPromise = TreeMemoryCache.loadFromDatabase(db)
      .catch((err) => {
        console.error(
          "[TreeMemoryCache] Error refreshing snapshot from D1:",
          err
        );
        // Safety fallback: if temporary D1 outage occurs, serve stale cache
        if (cachedSnapshot) {
          console.warn(
            "[TreeMemoryCache] Serving stale snapshot fallback to prevent downtime"
          );
          return cachedSnapshot;
        }
        throw err;
      })
      .finally(() => {
        pendingLoadPromise = null;
      });

    return pendingLoadPromise;
  }

  private static async loadFromDatabase(db: D1Database): Promise<TreeSnapshot> {
    // Fetch all nodes and contents in a single round-trip batch
    const [nodesRes, contentsRes] = await db.batch<
      MenuNodeRow | NodeContentRow
    >([
      db.prepare(
        "SELECT * FROM menu_nodes ORDER BY sort_order ASC, id ASC"
      ),
      db.prepare(
        "SELECT * FROM node_contents ORDER BY sort_order ASC, id ASC"
      ),
    ]);

    const nodeRows = (nodesRes.results ?? []) as MenuNodeRow[];
    const contentRows = (contentsRes.results ?? []) as NodeContentRow[];

    const contentsByNodeId = new Map<number, NodeContent[]>();
    const contentsById = new Map<number, NodeContent>();

    for (const row of contentRows) {
      const item: NodeContent = {
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
        vaultMessageId:
          row.vault_message_id !== undefined && row.vault_message_id !== null
            ? Number(row.vault_message_id)
            : null,
        createdAt: row.created_at,
      };
      contentsById.set(item.id, item);
      const list = contentsByNodeId.get(item.nodeId) ?? [];
      list.push(item);
      contentsByNodeId.set(item.nodeId, list);
    }

    // Compute child counts for each node
    const childCountMap = new Map<number, number>();
    for (const row of nodeRows) {
      if (row.parent_id !== null) {
        const pid = Number(row.parent_id);
        childCountMap.set(pid, (childCountMap.get(pid) ?? 0) + 1);
      }
    }

    const nodesById = new Map<number, MenuNodeWithCounts>();
    const childrenByParent = new Map<number | null, MenuNodeWithCounts[]>();
    const allNodes: MenuNodeWithCounts[] = [];

    for (const row of nodeRows) {
      const id = Number(row.id);
      const parentId = row.parent_id !== null ? Number(row.parent_id) : null;
      const baseNode: MenuNode = {
        id,
        parentId,
        title: row.title,
        description: row.description,
        sortOrder: Number(row.sort_order),
        isFullWidth: Number(row.is_full_width ?? 0) === 1,
        viewsCount: Number(row.views_count ?? 0),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };

      const nodeWithCounts: MenuNodeWithCounts = {
        ...baseNode,
        childrenCount: childCountMap.get(id) ?? 0,
        contentsCount: (contentsByNodeId.get(id) ?? []).length,
      };

      nodesById.set(id, nodeWithCounts);
      allNodes.push(nodeWithCounts);

      const siblings = childrenByParent.get(parentId) ?? [];
      siblings.push(nodeWithCounts);
      childrenByParent.set(parentId, siblings);
    }

    const snapshot: TreeSnapshot = {
      nodesById,
      childrenByParent,
      contentsByNodeId,
      contentsById,
      allNodes,
      loadedAt: Date.now(),
    };

    cachedSnapshot = snapshot;
    return snapshot;
  }
}
