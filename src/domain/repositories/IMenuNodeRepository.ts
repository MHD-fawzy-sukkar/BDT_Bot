import {
  CreateMenuNodeInput,
  MenuNode,
  MenuNodeWithCounts,
  UpdateMenuNodeInput,
} from "../entities/MenuNode";

export interface IMenuNodeRepository {
  findById(id: number): Promise<MenuNode | null>;
  findChildren(parentId: number | null): Promise<MenuNode[]>;
  findChildrenWithCounts(parentId: number | null): Promise<MenuNodeWithCounts[]>;
  findChildByTitle(
    parentId: number | null,
    title: string
  ): Promise<MenuNode | null>;
  findUniqueByTitle(title: string): Promise<MenuNode | null>;
  findAllWithCounts(): Promise<MenuNodeWithCounts[]>;
  getBreadcrumbPath(nodeId: number | null): Promise<MenuNode[]>;
  create(input: CreateMenuNodeInput): Promise<MenuNode>;
  createMany(inputs: CreateMenuNodeInput[]): Promise<MenuNode[]>;
  update(id: number, input: UpdateMenuNodeInput): Promise<MenuNode | null>;
  delete(id: number): Promise<boolean>;
  swapSortOrder(nodeIdA: number, nodeIdB: number): Promise<void>;
  countChildren(nodeId: number | null): Promise<number>;
  incrementViews(id: number): Promise<void>;
  getTopViewedNodes(limit: number): Promise<MenuNode[]>;
  countAllNodes(): Promise<number>;
}
