import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PromptTemplate,
  PromptCategory,
  PromptRoleType,
} from '../../entities/prompt-template.entity';
import { IPromptTemplateRepository } from './prompt-template.repository.interface';

@Injectable()
export class PromptTemplateRepository implements IPromptTemplateRepository {
  constructor(
    @InjectRepository(PromptTemplate)
    private readonly repository: Repository<PromptTemplate>,
  ) {}

  create(templateData: Partial<PromptTemplate>): PromptTemplate {
    return this.repository.create(templateData);
  }

  async save(template: PromptTemplate): Promise<PromptTemplate> {
    return this.repository.save(template);
  }

  async findById(id: number): Promise<PromptTemplate | null> {
    return this.repository.findOne({ where: { id } });
  }

  async findByName(name: string): Promise<PromptTemplate | null> {
    return this.repository.findOne({ where: { name } });
  }

  async findAll(): Promise<PromptTemplate[]> {
    return this.repository.find();
  }

  async findActive(): Promise<PromptTemplate[]> {
    return this.repository.find({ where: { isActive: true } });
  }

  async findByCategory(category: PromptCategory): Promise<PromptTemplate[]> {
    return this.repository.find({
      where: { category },
      order: { performanceScore: 'DESC' },
    });
  }

  async findByRoleType(roleType: PromptRoleType): Promise<PromptTemplate[]> {
    return this.repository.find({
      where: { roleType },
      order: { performanceScore: 'DESC' },
    });
  }

  async findByCategoryAndRole(
    category: PromptCategory,
    roleType: PromptRoleType,
  ): Promise<PromptTemplate[]> {
    return this.repository.find({
      where: { category, roleType },
      order: { performanceScore: 'DESC' },
    });
  }

  async findByAIPersona(aiPersonaId: number): Promise<PromptTemplate[]> {
    return this.repository.find({
      where: { aiPersonaId },
      order: { performanceScore: 'DESC' },
    });
  }

  async findByVersion(version: string): Promise<PromptTemplate[]> {
    return this.repository.find({
      where: { version },
      order: { createdAt: 'DESC' },
    });
  }

  async findHighPerformance(
    minPerformanceScore = 7.0,
    minUsageCount = 10,
  ): Promise<PromptTemplate[]> {
    return this.repository
      .createQueryBuilder('template')
      .where('template.performanceScore >= :minPerformanceScore', {
        minPerformanceScore,
      })
      .andWhere('template.usageCount >= :minUsageCount', { minUsageCount })
      .orderBy('template.performanceScore', 'DESC')
      .getMany();
  }

  async findMostUsed(limit = 20): Promise<PromptTemplate[]> {
    return this.repository
      .createQueryBuilder('template')
      .orderBy('template.usageCount', 'DESC')
      .limit(limit)
      .getMany();
  }

  async findByQualityScore(
    minScore = 0,
    maxScore = 10,
  ): Promise<PromptTemplate[]> {
    return this.repository
      .createQueryBuilder('template')
      .where('template.averageQualityScore >= :minScore', { minScore })
      .andWhere('template.averageQualityScore <= :maxScore', { maxScore })
      .orderBy('template.averageQualityScore', 'DESC')
      .getMany();
  }

  async findBySuccessRate(minRate = 0, maxRate = 1): Promise<PromptTemplate[]> {
    return this.repository
      .createQueryBuilder('template')
      .where('template.successRate >= :minRate', { minRate })
      .andWhere('template.successRate <= :maxRate', { maxRate })
      .orderBy('template.successRate', 'DESC')
      .getMany();
  }

  async findBestForRoleAndCategory(
    roleType: PromptRoleType,
    category: PromptCategory,
    limit = 5,
  ): Promise<PromptTemplate[]> {
    return this.repository
      .createQueryBuilder('template')
      .where('template.roleType = :roleType', { roleType })
      .andWhere('template.category = :category', { category })
      .andWhere('template.isActive = true')
      .orderBy('template.performanceScore', 'DESC')
      .limit(limit)
      .getMany();
  }

  async findSimilarTemplates(templateId: number): Promise<PromptTemplate[]> {
    const template = await this.findById(templateId);
    if (!template) {
      return [];
    }

    return this.repository
      .createQueryBuilder('template')
      .where('template.id != :templateId', { templateId })
      .andWhere('template.category = :category', {
        category: template.category,
      })
      .andWhere('template.roleType = :roleType', {
        roleType: template.roleType,
      })
      .orderBy('template.performanceScore', 'DESC')
      .limit(10)
      .getMany();
  }

  async update(
    id: number,
    updates: Partial<PromptTemplate>,
  ): Promise<PromptTemplate> {
    await this.repository.update(id, updates);
    const updatedTemplate = await this.findById(id);
    if (!updatedTemplate) {
      throw new Error(`PromptTemplate with id ${id} not found after update`);
    }
    return updatedTemplate;
  }

  async updateUsageStats(
    id: number,
    qualityScore?: number,
    wasSuccessful?: boolean,
  ): Promise<PromptTemplate> {
    const template = await this.findById(id);
    if (!template) {
      throw new Error(`PromptTemplate with id ${id} not found`);
    }

    // Update usage count
    template.usageCount += 1;

    // Update quality score if provided
    if (qualityScore !== undefined) {
      if (template.averageQualityScore === null) {
        template.averageQualityScore = qualityScore;
      } else {
        // Calculate running average
        template.averageQualityScore =
          (template.averageQualityScore * (template.usageCount - 1) +
            qualityScore) /
          template.usageCount;
      }
    }

    // Update success rate if provided
    if (wasSuccessful !== undefined) {
      const currentSuccesses = Math.round(
        template.successRate * (template.usageCount - 1),
      );
      const newSuccesses = currentSuccesses + (wasSuccessful ? 1 : 0);
      template.successRate = newSuccesses / template.usageCount;
    }

    // Update performance score
    template.updatePerformanceScore();
    template.lastUsedAt = new Date();

    return this.repository.save(template);
  }

  async delete(id: number): Promise<void> {
    await this.repository.delete(id);
  }

  async softDelete(id: number): Promise<void> {
    await this.repository.update(id, { isActive: false });
  }

  async bulkCreate(
    templates: Partial<PromptTemplate>[],
  ): Promise<PromptTemplate[]> {
    const entities = templates.map((data) => this.repository.create(data));
    return this.repository.save(entities);
  }

  async bulkUpdateUsage(
    usageData: Array<{
      id: number;
      qualityScore?: number;
      wasSuccessful?: boolean;
    }>,
  ): Promise<void> {
    for (const data of usageData) {
      await this.updateUsageStats(
        data.id,
        data.qualityScore,
        data.wasSuccessful,
      );
    }
  }

  async getTemplateStats(id: number): Promise<{
    usageCount: number;
    averageQualityScore: number;
    successRate: number;
    performanceScore: number;
    recentUsage: number[];
  } | null> {
    const template = await this.findById(id);
    if (!template) {
      return null;
    }

    return {
      usageCount: template.usageCount,
      averageQualityScore: template.averageQualityScore || 0,
      successRate: template.successRate,
      performanceScore: template.performanceScore,
      recentUsage: [], // TODO: Implement recent usage tracking
    };
  }

  async getCategoryStats(category: PromptCategory): Promise<{
    totalTemplates: number;
    activeTemplates: number;
    averageUsage: number;
    averagePerformance: number;
  }> {
    const templates = await this.findByCategory(category);
    const activeTemplates = templates.filter((t) => t.isActive);

    const totalUsage = templates.reduce((sum, t) => sum + t.usageCount, 0);
    const totalPerformance = templates.reduce(
      (sum, t) => sum + t.performanceScore,
      0,
    );

    return {
      totalTemplates: templates.length,
      activeTemplates: activeTemplates.length,
      averageUsage: templates.length > 0 ? totalUsage / templates.length : 0,
      averagePerformance:
        templates.length > 0 ? totalPerformance / templates.length : 0,
    };
  }

  async getRoleStats(roleType: PromptRoleType): Promise<{
    totalTemplates: number;
    activeTemplates: number;
    averageUsage: number;
    averagePerformance: number;
  }> {
    const templates = await this.findByRoleType(roleType);
    const activeTemplates = templates.filter((t) => t.isActive);

    const totalUsage = templates.reduce((sum, t) => sum + t.usageCount, 0);
    const totalPerformance = templates.reduce(
      (sum, t) => sum + t.performanceScore,
      0,
    );

    return {
      totalTemplates: templates.length,
      activeTemplates: activeTemplates.length,
      averageUsage: templates.length > 0 ? totalUsage / templates.length : 0,
      averagePerformance:
        templates.length > 0 ? totalPerformance / templates.length : 0,
    };
  }

  async validateTemplateIntegrity(id: number): Promise<{
    valid: boolean;
    issues: string[];
  }> {
    const template = await this.findById(id);
    if (!template) {
      return { valid: false, issues: ['Template not found'] };
    }

    const issues: string[] = [];

    // Validate template content
    if (!template.template || template.template.trim().length === 0) {
      issues.push('Template content is empty');
    }

    // Validate parameters
    try {
      const result = template.validateParameters(template.parameters || {});
      if (!result.valid) {
        issues.push(`Invalid parameters: ${result.errors.join(', ')}`);
      }
    } catch (error) {
      issues.push(`Parameter validation error: ${error.message}`);
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  async findTemplatesNeedingUpdate(): Promise<PromptTemplate[]> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    return this.repository
      .createQueryBuilder('template')
      .where('template.lastUsedAt < :date OR template.lastUsedAt IS NULL', {
        date: thirtyDaysAgo,
      })
      .andWhere('template.performanceScore < 5')
      .orderBy('template.performanceScore', 'ASC')
      .getMany();
  }

  async archiveOldVersions(keepLatestCount = 3): Promise<void> {
    const templates = await this.repository
      .createQueryBuilder('template')
      .select(['template.name', 'template.version'])
      .groupBy('template.name')
      .getMany();

    for (const template of templates) {
      const versions = await this.repository.find({
        where: { name: template.name },
        order: { createdAt: 'DESC' },
      });

      if (versions.length > keepLatestCount) {
        const toArchive = versions.slice(keepLatestCount);
        for (const oldVersion of toArchive) {
          await this.softDelete(oldVersion.id);
        }
      }
    }
  }
}
