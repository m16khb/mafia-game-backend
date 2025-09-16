import {
  PromptTemplate,
  PromptCategory,
  PromptRoleType,
} from '../../entities/prompt-template.entity';

export interface IPromptTemplateRepository {
  create(templateData: Partial<PromptTemplate>): PromptTemplate;
  save(template: PromptTemplate): Promise<PromptTemplate>;
  findById(id: number): Promise<PromptTemplate | null>;
  findByName(name: string): Promise<PromptTemplate | null>;
  findAll(): Promise<PromptTemplate[]>;
  findActive(): Promise<PromptTemplate[]>;
  findByCategory(category: PromptCategory): Promise<PromptTemplate[]>;
  findByRoleType(roleType: PromptRoleType): Promise<PromptTemplate[]>;
  findByCategoryAndRole(
    category: PromptCategory,
    roleType: PromptRoleType,
  ): Promise<PromptTemplate[]>;
  findByAIPersona(aiPersonaId: number): Promise<PromptTemplate[]>;
  findByVersion(version: string): Promise<PromptTemplate[]>;
  findHighPerformance(
    minPerformanceScore?: number,
    minUsageCount?: number,
  ): Promise<PromptTemplate[]>;
  findMostUsed(limit?: number): Promise<PromptTemplate[]>;
  findByQualityScore(
    minScore?: number,
    maxScore?: number,
  ): Promise<PromptTemplate[]>;
  findBySuccessRate(
    minRate?: number,
    maxRate?: number,
  ): Promise<PromptTemplate[]>;
  findBestForRoleAndCategory(
    roleType: PromptRoleType,
    category: PromptCategory,
    limit?: number,
  ): Promise<PromptTemplate[]>;
  findSimilarTemplates(templateId: number): Promise<PromptTemplate[]>;
  update(id: number, updates: Partial<PromptTemplate>): Promise<PromptTemplate>;
  updateUsageStats(
    id: number,
    qualityScore?: number,
    wasSuccessful?: boolean,
  ): Promise<PromptTemplate>;
  delete(id: number): Promise<void>;
  softDelete(id: number): Promise<void>;
  bulkCreate(templates: Partial<PromptTemplate>[]): Promise<PromptTemplate[]>;
  bulkUpdateUsage(
    usageData: Array<{
      id: number;
      qualityScore?: number;
      wasSuccessful?: boolean;
    }>,
  ): Promise<void>;
  getTemplateStats(id: number): Promise<{
    usageCount: number;
    averageQualityScore: number;
    successRate: number;
    performanceScore: number;
    recentUsage: number[];
  } | null>;
  getCategoryStats(category: PromptCategory): Promise<{
    totalTemplates: number;
    activeTemplates: number;
    averageUsage: number;
    averagePerformance: number;
  }>;
  getRoleStats(roleType: PromptRoleType): Promise<{
    totalTemplates: number;
    activeTemplates: number;
    averageUsage: number;
    averagePerformance: number;
  }>;
  validateTemplateIntegrity(id: number): Promise<{
    valid: boolean;
    issues: string[];
  }>;
  findTemplatesNeedingUpdate(): Promise<PromptTemplate[]>;
  archiveOldVersions(keepLatestCount?: number): Promise<void>;
}
