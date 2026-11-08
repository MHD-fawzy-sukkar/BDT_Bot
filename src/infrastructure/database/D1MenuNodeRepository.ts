import {
  CreateMenuNodeInput,
  MenuNode,
  MenuNodeWithCounts,
  UpdateMenuNodeInput,
} from "../../domain/entities/MenuNode";
import { IMenuNodeRepository } from "../../domain/repositories/IMenuNodeRepository";
import { TreeMemoryCache } from "../cache/TreeMemoryCache";
import { normalizeArabic } from "../../presentation/utils/arabicText";

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

function mapRowToMenuNode(row: MenuNodeRow): MenuNode {
  return {
    id: Number(row.id),
    parentId: row.parent_id !== null ? Number(row.parent_id) : null,
    title: row.title,
    description: row.description,
    sortOrder: Number(row.sort_order),
    isFullWidth: Number(row.is_full_width ?? 0) === 1,
    viewsCount: Number(row.views_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class D1MenuNodeRepository implements IMenuNodeRepository {
  constructor(private readonly db: D1Database) {}

  async findById(id: number): Promise<MenuNode | null> {
    const snapshot = await TreeMemoryCache.getSnapshot(this.db);
    return snapshot.nodesById.get(id) ?? null;
  }

  async findChildren(parentId: number | null): Promise<MenuNode[]> {
    const snapshot = await TreeMemoryCache.getSnapshot(this.db);
    return snapshot.childrenByParent.get(parentId) ?? [];
  }

  async findChildrenWithCounts(
    parentId: number | null
  ): Promise<MenuNodeWithCounts[]> {
    const snapshot = await TreeMemoryCache.getSnapshot(this.db);
    return snapshot.childrenByParent.get(parentId) ?? [];
  }

  async findChildByTitle(
    parentId: number | null,
    title: string
  ): Promise<MenuNode | null> {
    const trimmed = title.trim().replace(/\s+/g, " ");
    const snapshot = await TreeMemoryCache.getSnapshot(this.db);
    const children = snapshot.childrenByParent.get(parentId) ?? [];

    // 1. Exact string match
    const exact = children.find(
      (c) => c.title.trim().replace(/\s+/g, " ") === trimmed
    );
    if (exact) return exact;

    // 2. Normalized Arabic match (ignores tashkeel/harakat, shadda, alef variants, ta marbuta)
    const normSearch = normalizeArabic(trimmed);
    if (!normSearch) return null;

    return (
      children.find((c) => normalizeArabic(c.title) === normSearch) ?? null
    );
  }

  async findUniqueByTitle(title: string): Promise<MenuNode | null> {
    const trimmed = title.trim().replace(/\s+/g, " ");
    const snapshot = await TreeMemoryCache.getSnapshot(this.db);

    // 1. Exact match check
    const exactMatches = snapshot.allNodes.filter(
      (c) => c.title.trim().replace(/\s+/g, " ") === trimmed
    );
    if (exactMatches.length === 1) return exactMatches[0];

    // 2. Normalized Arabic match check
    const normSearch = normalizeArabic(trimmed);
    if (!normSearch) return null;

    const normMatches = snapshot.allNodes.filter(
      (c) => normalizeArabic(c.title) === normSearch
    );
    if (normMatches.length === 1) {
      return normMatches[0];
    }

    // 3. Tie-breaker: if multiple normalized matches exist, but only one is an exact match
    if (normMatches.length > 1) {
      const exactInNorm = normMatches.filter(
        (c) => c.title.trim().replace(/\s+/g, " ") === trimmed
      );
      if (exactInNorm.length === 1) {
        return exactInNorm[0];
      }
    }

    return null;
  }

  async findAllWithCounts(): Promise<MenuNodeWithCounts[]> {
    const snapshot = await TreeMemoryCache.getSnapshot(this.db);
    return snapshot.allNodes;
  }

  async getBreadcrumbPath(nodeId: number | null): Promise<MenuNode[]> {
    if (nodeId === null) {
      return [];
    }

    const snapshot = await TreeMemoryCache.getSnapshot(this.db);
    const path: MenuNode[] = [];
    let currentId: number | null = nodeId;
    let depth = 0;

    while (currentId !== null && depth < 30) {
      const node = snapshot.nodesById.get(currentId);
      if (!node) break;
      path.push(node);
      currentId = node.parentId;
      depth++;
    }

    return path.reverse();
  }

  async create(input: CreateMenuNodeInput): Promise<MenuNode> {
    const sortOrder = input.sortOrder ?? 0;
    const description = input.description ?? null;
    const isFullWidthInt = input.isFullWidth ? 1 : 0;

    const row = await this.db
      .prepare(
        `INSERT INTO menu_nodes (parent_id, title, description, sort_order, is_full_width)
         VALUES (?, ?, ?, ?, ?)
         RETURNING *`
      )
      .bind(input.parentId, input.title, description, sortOrder, isFullWidthInt)
      .first<MenuNodeRow>();

    TreeMemoryCache.invalidate();

    if (!row) {
      throw new Error("Failed to insert menu_node");
    }
    return mapRowToMenuNode(row);
  }

  async createMany(inputs: CreateMenuNodeInput[]): Promise<MenuNode[]> {
    if (inputs.length === 0) return [];

    const statements = inputs.map((input) =>
      this.db
        .prepare(
          `INSERT INTO menu_nodes (parent_id, title, description, sort_order, is_full_width)
           VALUES (?, ?, ?, ?, ?)
           RETURNING *`
        )
        .bind(
          input.parentId,
          input.title,
          input.description ?? null,
          input.sortOrder ?? 0,
          input.isFullWidth ? 1 : 0
        )
    );

    const batchResults = await this.db.batch<MenuNodeRow>(statements);
    TreeMemoryCache.invalidate();

    const created: MenuNode[] = [];
    for (const res of batchResults) {
      if (res.results && res.results.length > 0) {
        created.push(mapRowToMenuNode(res.results[0]));
      }
    }
    return created;
  }

  async update(
    id: number,
    input: UpdateMenuNodeInput
  ): Promise<MenuNode | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const nextTitle = input.title !== undefined ? input.title : existing.title;
    const nextDescription =
      input.description !== undefined ? input.description : existing.description;
    const nextSortOrder =
      input.sortOrder !== undefined ? input.sortOrder : existing.sortOrder;
    const nextFullWidth =
      input.isFullWidth !== undefined ? input.isFullWidth : existing.isFullWidth;

    const row = await this.db
      .prepare(
        `UPDATE menu_nodes
         SET title = ?, description = ?, sort_order = ?, is_full_width = ?, updated_at = datetime('now')
         WHERE id = ?
         RETURNING *`
      )
      .bind(
        nextTitle,
        nextDescription,
        nextSortOrder,
        nextFullWidth ? 1 : 0,
        id
      )
      .first<MenuNodeRow>();

    TreeMemoryCache.invalidate();
    return row ? mapRowToMenuNode(row) : null;
  }

  async delete(id: number): Promise<boolean> {
    await this.db.batch([
      this.db.prepare("PRAGMA foreign_keys = ON"),
      this.db.prepare("DELETE FROM menu_nodes WHERE id = ?").bind(id),
    ]);
    TreeMemoryCache.invalidate();
    return true;
  }

  async swapSortOrder(nodeIdA: number, nodeIdB: number): Promise<void> {
    const [nodeA, nodeB] = await Promise.all([
      this.findById(nodeIdA),
      this.findById(nodeIdB),
    ]);

    if (!nodeA || !nodeB) return;

    let orderA = nodeA.sortOrder;
    let orderB = nodeB.sortOrder;
    if (orderA === orderB) {
      orderA = nodeA.id;
      orderB = nodeB.id;
    }

    await this.db.batch([
      this.db
        .prepare(
          "UPDATE menu_nodes SET sort_order = ?, updated_at = datetime('now') WHERE id = ?"
        )
        .bind(orderB, nodeIdA),
      this.db
        .prepare(
          "UPDATE menu_nodes SET sort_order = ?, updated_at = datetime('now') WHERE id = ?"
        )
        .bind(orderA, nodeIdB),
    ]);
    TreeMemoryCache.invalidate();
  }

  async countChildren(nodeId: number | null): Promise<number> {
    const snapshot = await TreeMemoryCache.getSnapshot(this.db);
    return (snapshot.childrenByParent.get(nodeId) ?? []).length;
  }

  async incrementViews(id: number): Promise<void> {
    await this.db
      .prepare(
        "UPDATE menu_nodes SET views_count = views_count + 1 WHERE id = ?"
      )
      .bind(id)
      .run();
  }

  async getTopViewedNodes(limit: number): Promise<MenuNode[]> {
    const { results } = await this.db
      .prepare(
        "SELECT * FROM menu_nodes WHERE views_count > 0 ORDER BY views_count DESC, id ASC LIMIT ?"
      )
      .bind(limit)
      .all<MenuNodeRow>();
    return (results ?? []).map(mapRowToMenuNode);
  }

  async countAllNodes(): Promise<number> {
    const snapshot = await TreeMemoryCache.getSnapshot(this.db);
    return snapshot.allNodes.length;
  }
}
