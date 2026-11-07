export interface MenuNode {
  readonly id: number;
  readonly parentId: number | null;
  readonly title: string;
  readonly description: string | null;
  readonly sortOrder: number;
  readonly isFullWidth: boolean;
  readonly viewsCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MenuNodeWithCounts extends MenuNode {
  readonly childrenCount: number;
  readonly contentsCount: number;
}

export interface CreateMenuNodeInput {
  readonly parentId: number | null;
  readonly title: string;
  readonly description?: string | null;
  readonly sortOrder?: number;
  readonly isFullWidth?: boolean;
}

export interface UpdateMenuNodeInput {
  readonly title?: string;
  readonly description?: string | null;
  readonly sortOrder?: number;
  readonly isFullWidth?: boolean;
}
