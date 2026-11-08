import {
  MenuNode,
  MenuNodeWithCounts,
} from "../../domain/entities/MenuNode";
import { NodeContent } from "../../domain/entities/NodeContent";
import { IBotUserRepository } from "../../domain/repositories/IBotUserRepository";
import { IMenuNodeRepository } from "../../domain/repositories/IMenuNodeRepository";
import { INodeContentRepository } from "../../domain/repositories/INodeContentRepository";
import { AppError } from "../errors/AppError";

export interface MenuViewData {
  readonly currentNode: MenuNode | null;
  readonly breadcrumbs: MenuNode[];
  readonly breadcrumbText: string;
  readonly children: MenuNodeWithCounts[];
  readonly contents: NodeContent[];
}

export class MenuNavigationService {
  constructor(
    private readonly nodeRepo: IMenuNodeRepository,
    private readonly contentRepo: INodeContentRepository,
    private readonly userRepo: IBotUserRepository
  ) {}

  async getMenuView(nodeId: number | null): Promise<MenuViewData> {
    if (nodeId === null) {
      const children = await this.nodeRepo.findChildrenWithCounts(null);
      return {
        currentNode: null,
        breadcrumbs: [],
        breadcrumbText: "🏠 القائمة الرئيسية",
        children,
        contents: [],
      };
    }

    const currentNode = await this.nodeRepo.findById(nodeId);
    if (!currentNode) {
      throw new AppError(
        "عذراً، هذا القسم لم يعد موجوداً أو تم حذفه.",
        "NODE_NOT_FOUND"
      );
    }

    const [breadcrumbs, children, contents] = await Promise.all([
      this.nodeRepo.getBreadcrumbPath(nodeId),
      this.nodeRepo.findChildrenWithCounts(nodeId),
      this.contentRepo.findByNodeId(nodeId),
    ]);

    const titles = ["🏠 الرئيسية", ...breadcrumbs.map((b) => b.title)];
    const breadcrumbText = titles.join(" ⬅️ ");

    return {
      currentNode,
      breadcrumbs,
      breadcrumbText,
      children,
      contents,
    };
  }

  /**
   * Fetches current navigation node for user with self-healing fallback to root if node was deleted.
   */
  async getValidUserCurrentNode(userId: string): Promise<MenuNode | null> {
    const currentId = await this.userRepo.getCurrentNodeId(userId);
    if (currentId === null) {
      return null;
    }

    const node = await this.nodeRepo.findById(currentId);
    if (!node) {
      await this.userRepo.setCurrentNodeId(userId, null);
      return null;
    }
    return node;
  }

  async setUserCurrentNodeId(
    userId: string,
    nodeId: number | null
  ): Promise<void> {
    await this.userRepo.setCurrentNodeId(userId, nodeId);
  }

  async getAllNodes(): Promise<MenuNodeWithCounts[]> {
    return this.nodeRepo.findAllWithCounts();
  }

  /**
   * Precise button text resolution from reply keyboard:
   * 1. Check direct children of the user's currently open section to prevent cross-subject collisions.
   * 2. If inside a sub-section, check siblings of the current node.
   * 3. Check root-level menu buttons.
   * 4. Strict safety check: only resolve globally if the title is 100% unique across the bot.
   */
  async resolveNodeByButtonText(
    userId: string,
    buttonText: string
  ): Promise<MenuNode | null> {
    const cleanText = buttonText.trim().replace(/\s+/g, " ");
    if (!cleanText) return null;

    const currentNode = await this.getValidUserCurrentNode(userId);
    const currentParentId = currentNode ? currentNode.id : null;

    // 1. Search inside currently open section
    const directChild = await this.nodeRepo.findChildByTitle(
      currentParentId,
      cleanText
    );
    if (directChild) {
      return directChild;
    }

    // 2. Search sibling nodes if inside a sub-section
    if (currentNode && currentNode.parentId !== null) {
      const sibling = await this.nodeRepo.findChildByTitle(
        currentNode.parentId,
        cleanText
      );
      if (sibling) {
        return sibling;
      }
    }

    // 3. Search root-level menu items
    if (currentParentId !== null) {
      const rootChild = await this.nodeRepo.findChildByTitle(null, cleanText);
      if (rootChild) {
        return rootChild;
      }
    }

    // 4. Global fallback: only match if completely unique
    return this.nodeRepo.findUniqueByTitle(cleanText);
  }

  /**
   * Builds text-based hierarchy map of all bot categories and buttons.
   */
  async buildFullTreeOverview(): Promise<string> {
    const allNodes = await this.nodeRepo.findAllWithCounts();
    if (allNodes.length === 0) {
      return "🗂️ <b>هيكلية البوت فارغة حالياً.</b>";
    }

    const childrenByParent = new Map<number | null, MenuNodeWithCounts[]>();
    for (const node of allNodes) {
      const list = childrenByParent.get(node.parentId) ?? [];
      list.push(node);
      childrenByParent.set(node.parentId, list);
    }

    const lines: string[] = [
      "🗂️ <b>خريطة أقسام وقوائم البوت</b>",
      "",
      "🤖 <b>القائمة الرئيسية</b>",
    ];

    const renderBranch = (
      parentId: number | null,
      prefix: string,
      depth: number
    ) => {
      if (depth > 12) return;
      const children = childrenByParent.get(parentId) ?? [];
      children.forEach((child, idx) => {
        const isLast = idx === children.length - 1;
        const connector = isLast ? "└── " : "├── ";
        const fileBadge =
          child.contentsCount > 0 ? ` (${child.contentsCount} ملف)` : "";
        const emptyBadge =
          child.childrenCount === 0 && child.contentsCount === 0
            ? " <i>(فارغ)</i>"
            : "";

        lines.push(
          `${prefix}${connector}<b>${escapeSimpleHtml(
            child.title
          )}</b>${fileBadge}${emptyBadge}`
        );

        const nextPrefix = prefix + (isLast ? "    " : "│   ");
        renderBranch(child.id, nextPrefix, depth + 1);
      });
    };

    renderBranch(null, "", 0);

    const output = lines.join("\n");
    return output.length > 3900
      ? output.slice(0, 3900) + "\n...\n<i>(تم اختصار الخريطة لكبر حجمها)</i>"
      : output;
  }
}

function escapeSimpleHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
