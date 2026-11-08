import { CreateNodeContentInput, NodeContent } from "../entities/NodeContent";

export interface INodeContentRepository {
  findAll(): Promise<NodeContent[]>;
  findByNodeId(nodeId: number): Promise<NodeContent[]>;
  findById(id: number): Promise<NodeContent | null>;
  create(input: CreateNodeContentInput): Promise<NodeContent>;
  delete(id: number): Promise<boolean>;
  deleteAllByNodeId(nodeId: number): Promise<number>;
  swapSortOrder(contentIdA: number, contentIdB: number): Promise<void>;
  updateSourceLocation(
    id: number,
    sourceChatId: string,
    sourceMessageId: number
  ): Promise<void>;
  updateVaultMessageId(
    id: number,
    vaultMessageId: number
  ): Promise<void>;
  updateSourceLocationsBatch(
    items: { id: number; sourceChatId: string; sourceMessageId: number }[]
  ): Promise<void>;
  countByNodeId(nodeId: number): Promise<number>;
  countAllContents(): Promise<number>;
}
