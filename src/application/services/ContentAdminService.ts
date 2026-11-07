import {
  CreateNodeContentInput,
  NodeContent,
} from "../../domain/entities/NodeContent";
import { IMenuNodeRepository } from "../../domain/repositories/IMenuNodeRepository";
import { INodeContentRepository } from "../../domain/repositories/INodeContentRepository";
import { AppError } from "../errors/AppError";

export class ContentAdminService {
  constructor(
    private readonly nodeRepo: IMenuNodeRepository,
    private readonly contentRepo: INodeContentRepository
  ) {}

  async attachContent(input: CreateNodeContentInput): Promise<NodeContent> {
    const node = await this.nodeRepo.findById(input.nodeId);
    if (!node) {
      throw new AppError("الزر الهدف لم يعد موجوداً.", "NODE_NOT_FOUND");
    }
    return this.contentRepo.create(input);
  }

  async getContents(nodeId: number): Promise<NodeContent[]> {
    return this.contentRepo.findByNodeId(nodeId);
  }

  async getContentById(contentId: number): Promise<NodeContent | null> {
    return this.contentRepo.findById(contentId);
  }

  async deleteContentItem(contentId: number): Promise<NodeContent> {
    const item = await this.contentRepo.findById(contentId);
    if (!item) {
      throw new AppError(
        "المحتوى غير موجود أو تم حذفه مسبقاً.",
        "CONTENT_NOT_FOUND"
      );
    }
    await this.contentRepo.delete(contentId);
    return item;
  }

  async clearAllNodeContents(nodeId: number): Promise<number> {
    return this.contentRepo.deleteAllByNodeId(nodeId);
  }

  async moveContentOrder(
    contentId: number,
    direction: "up" | "down"
  ): Promise<NodeContent> {
    const item = await this.contentRepo.findById(contentId);
    if (!item) {
      throw new AppError("العنصر غير موجود.", "CONTENT_NOT_FOUND");
    }

    const siblings = await this.contentRepo.findByNodeId(item.nodeId);
    const currentIndex = siblings.findIndex((s) => s.id === contentId);
    if (currentIndex === -1) {
      return item;
    }

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= siblings.length) {
      throw new AppError(
        direction === "up"
          ? "العنصر موجود بالفعل في أول القائمة."
          : "العنصر موجود بالفعل في آخر القائمة.",
        "BOUNDARY_REACHED"
      );
    }

    await this.contentRepo.swapSortOrder(item.id, siblings[targetIndex].id);
    return item;
  }
}
