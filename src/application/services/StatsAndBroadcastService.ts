import { BotStatistics, UpsertBotUserInput } from "../../domain/entities/BotUser";
import { IBotUserRepository } from "../../domain/repositories/IBotUserRepository";
import { IMenuNodeRepository } from "../../domain/repositories/IMenuNodeRepository";
import { INodeContentRepository } from "../../domain/repositories/INodeContentRepository";

export class StatsAndBroadcastService {
  constructor(
    private readonly userRepo: IBotUserRepository,
    private readonly nodeRepo: IMenuNodeRepository,
    private readonly contentRepo: INodeContentRepository
  ) {}

  async trackUserActivity(input: UpsertBotUserInput): Promise<void> {
    await this.userRepo.upsertUser(input);
  }

  async trackNodeView(nodeId: number): Promise<void> {
    await this.nodeRepo.incrementViews(nodeId);
  }

  async markUserBlocked(userId: string): Promise<void> {
    await this.userRepo.markUserInactive(userId);
  }

  async getActiveRecipientIds(): Promise<string[]> {
    return this.userRepo.getActiveUserIds();
  }

  async getStatistics(): Promise<BotStatistics> {
    const [userCounts, totalNodes, totalContents, topNodes] = await Promise.all(
      [
        this.userRepo.getUserCounts(),
        this.nodeRepo.countAllNodes(),
        this.contentRepo.countAllContents(),
        this.nodeRepo.getTopViewedNodes(5),
      ]
    );

    return {
      totalUsers: userCounts.total,
      activeUsers: userCounts.active,
      blockedUsers: userCounts.blocked,
      activeLast24h: userCounts.activeLast24h,
      totalNodes,
      totalContents,
      topNodes,
    };
  }
}
