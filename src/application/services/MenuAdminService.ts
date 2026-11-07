import { AdminActionType } from "../../domain/entities/AdminSession";
import { MenuNode } from "../../domain/entities/MenuNode";
import { IAdminSessionRepository } from "../../domain/repositories/IAdminSessionRepository";
import { IMenuNodeRepository } from "../../domain/repositories/IMenuNodeRepository";
import { AppError } from "../errors/AppError";

export class MenuAdminService {
  constructor(
    private readonly nodeRepo: IMenuNodeRepository,
    private readonly sessionRepo: IAdminSessionRepository
  ) {}

  /**
   * يضيف زرّاً واحداً أو عدة أزرار دفعة واحدة مع تحديد ما إذا كان بسطر مستقل أو طبيعي
   */
  async addChildNodesFromText(
    parentId: number | null,
    rawText: string,
    isFullWidth = false
  ): Promise<MenuNode[]> {
    const lines = rawText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) {
      throw new AppError("الرجاء إرسال اسم زر صالح غير فارغ.", "INVALID_TITLE");
    }

    for (const line of lines) {
      if (line.length > 64) {
        throw new AppError(
          `اسم الزر "${line.slice(0, 20)}..." طويل جداً (الحد الأقصى 64 حرفاً).`,
          "TITLE_TOO_LONG"
        );
      }
    }

    if (parentId !== null) {
      const parent = await this.nodeRepo.findById(parentId);
      if (!parent) {
        throw new AppError("الزر الأب لم يعد موجوداً.", "PARENT_NOT_FOUND");
      }
    }

    const existingChildren = await this.nodeRepo.findChildren(parentId);
    const maxSort = existingChildren.reduce(
      (max, item) => (item.sortOrder > max ? item.sortOrder : max),
      0
    );

    const inputs = lines.map((title, idx) => ({
      parentId,
      title,
      sortOrder: maxSort + idx + 1,
      isFullWidth,
    }));

    return this.nodeRepo.createMany(inputs);
  }

  async toggleNodeFullWidth(nodeId: number): Promise<MenuNode> {
    const existing = await this.nodeRepo.findById(nodeId);
    if (!existing) {
      throw new AppError("الزر غير موجود.", "NODE_NOT_FOUND");
    }

    const updated = await this.nodeRepo.update(nodeId, {
      isFullWidth: !existing.isFullWidth,
    });
    if (!updated) {
      throw new AppError("تعذر تحديث شكل الزر.", "UPDATE_FAILED");
    }
    return updated;
  }

  async renameNode(nodeId: number, newTitle: string): Promise<MenuNode> {
    const trimmed = newTitle.trim();
    if (!trimmed) {
      throw new AppError("الرجاء إرسال اسم غير فارغ.", "INVALID_TITLE");
    }
    if (trimmed.length > 64) {
      throw new AppError(
        "اسم الزر طويل جداً (الحد الأقصى 64 حرفاً).",
        "TITLE_TOO_LONG"
      );
    }

    const updated = await this.nodeRepo.update(nodeId, { title: trimmed });
    if (!updated) {
      throw new AppError("الزر المطلوب تعديله غير موجود.", "NODE_NOT_FOUND");
    }
    return updated;
  }

  async updateDescription(
    nodeId: number,
    description: string | null
  ): Promise<MenuNode> {
    const cleanDesc =
      description &&
      description.trim() !== "/clear" &&
      description.trim().length > 0
        ? description.trim()
        : null;

    const updated = await this.nodeRepo.update(nodeId, {
      description: cleanDesc,
    });
    if (!updated) {
      throw new AppError("الزر المطلوب تعديله غير موجود.", "NODE_NOT_FOUND");
    }
    return updated;
  }

  async deleteNode(nodeId: number): Promise<number | null> {
    const existing = await this.nodeRepo.findById(nodeId);
    if (!existing) {
      throw new AppError("الزر غير موجود أو تم حذفه مسبقاً.", "NODE_NOT_FOUND");
    }
    const parentId = existing.parentId;
    await this.nodeRepo.delete(nodeId);
    return parentId;
  }

  async moveNodeOrder(
    nodeId: number,
    direction: "up" | "down"
  ): Promise<MenuNode> {
    const node = await this.nodeRepo.findById(nodeId);
    if (!node) {
      throw new AppError("الزر غير موجود.", "NODE_NOT_FOUND");
    }

    const siblings = await this.nodeRepo.findChildren(node.parentId);
    const currentIndex = siblings.findIndex((s) => s.id === nodeId);
    if (currentIndex === -1) {
      return node;
    }

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= siblings.length) {
      throw new AppError(
        direction === "up"
          ? "الزر موجود بالفعل في أول القائمة."
          : "الزر موجود بالفعل في آخر القائمة.",
        "BOUNDARY_REACHED"
      );
    }

    const sibling = siblings[targetIndex];
    await this.nodeRepo.swapSortOrder(node.id, sibling.id);
    return node;
  }

  async getSession(userId: string, chatId: string) {
    return this.sessionRepo.getSession(userId, chatId);
  }

  async setSession(
    userId: string,
    chatId: string,
    action: AdminActionType,
    targetNodeId: number | null,
    panelMessageId?: number | null
  ) {
    return this.sessionRepo.upsertSession({
      userId,
      chatId,
      action,
      targetNodeId,
      panelMessageId,
    });
  }

  async clearSession(userId: string, chatId: string) {
    return this.sessionRepo.clearSession(userId, chatId);
  }
}
