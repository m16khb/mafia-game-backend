import { Injectable, Logger, Inject } from '@nestjs/common';
import {
  PromptTemplate,
  PromptCategory,
  PromptRoleType,
} from '../../entities/prompt-template.entity';
import {
  IPromptTemplateRepository,
  PROMPT_TEMPLATE_REPOSITORY_TOKEN,
} from '../repositories';
import {
  DEFAULT_PROMPT_TEMPLATES,
  createDefaultPromptTemplates,
} from './prompts/default-templates';

@Injectable()
export class PromptTemplateService {
  private readonly logger = new Logger(PromptTemplateService.name);

  constructor(
    @Inject(PROMPT_TEMPLATE_REPOSITORY_TOKEN)
    private readonly templateRepository: IPromptTemplateRepository,
  ) {}

  async seedDefaultTemplates(): Promise<PromptTemplate[]> {
    this.logger.log('Seeding default prompt templates');

    const createdTemplates: PromptTemplate[] = [];

    for (const templateData of DEFAULT_PROMPT_TEMPLATES) {
      try {
        // Check if template already exists
        const existing = await this.templateRepository.findByName(
          templateData.name,
        );
        if (existing) {
          this.logger.log(
            `Template ${templateData.name} already exists, skipping`,
          );
          createdTemplates.push(existing);
          continue;
        }

        // Create new template
        const template = this.templateRepository.create({
          name: templateData.name,
          category: templateData.category,
          roleType: templateData.roleType,
          template: templateData.template,
          parameters: templateData.parameters,
          version: templateData.version,
          description: templateData.description,
          aiPersonaId: templateData.aiPersonaId,
          isActive: true,
          usageCount: 0,
          averageQualityScore: null,
          successRate: 0.5,
          performanceScore: 5.0,
          lastUsedAt: null,
        });

        const savedTemplate = await this.templateRepository.save(template);
        createdTemplates.push(savedTemplate);
        this.logger.log(`Created template: ${savedTemplate.name}`);
      } catch (error) {
        this.logger.error(
          `Failed to create template ${templateData.name}: ${error.message}`,
        );
      }
    }

    this.logger.log(`Seeded ${createdTemplates.length} prompt templates`);
    return createdTemplates;
  }

  async getTemplateForRoleAndCategory(
    roleType: PromptRoleType,
    category: PromptCategory,
    aiPersonaId?: number,
  ): Promise<PromptTemplate | null> {
    try {
      // Try to find persona-specific template first
      if (aiPersonaId) {
        const personaSpecific =
          await this.templateRepository.findByAIPersona(aiPersonaId);
        const matching = personaSpecific.find(
          (t) =>
            t.roleType === roleType && t.category === category && t.isActive,
        );
        if (matching) {
          return matching;
        }
      }

      // Fall back to best general template for role and category
      const templates =
        await this.templateRepository.findBestForRoleAndCategory(
          roleType,
          category,
          1,
        );
      return templates.length > 0 ? templates[0] : null;
    } catch (error) {
      this.logger.error(
        `Failed to get template for role ${roleType} category ${category}: ${error.message}`,
      );
      return null;
    }
  }

  async generatePrompt(
    templateName: string,
    parameters: Record<string, string>,
  ): Promise<string> {
    try {
      const template = await this.templateRepository.findByName(templateName);
      if (!template) {
        throw new Error(`Template ${templateName} not found`);
      }

      return template.generatePrompt(parameters);
    } catch (error) {
      this.logger.error(
        `Failed to generate prompt from template ${templateName}: ${error.message}`,
      );
      throw error;
    }
  }

  async updateTemplateUsage(
    templateName: string,
    qualityScore?: number,
    wasSuccessful?: boolean,
  ): Promise<void> {
    try {
      const template = await this.templateRepository.findByName(templateName);
      if (!template) {
        this.logger.warn(`Template ${templateName} not found for usage update`);
        return;
      }

      await this.templateRepository.updateUsageStats(
        template.id,
        qualityScore,
        wasSuccessful,
      );
      this.logger.log(`Updated usage stats for template ${templateName}`);
    } catch (error) {
      this.logger.error(
        `Failed to update template usage for ${templateName}: ${error.message}`,
      );
    }
  }

  async getTemplateStats(templateName: string): Promise<any> {
    try {
      const template = await this.templateRepository.findByName(templateName);
      if (!template) {
        return null;
      }

      return this.templateRepository.getTemplateStats(template.id);
    } catch (error) {
      this.logger.error(
        `Failed to get template stats for ${templateName}: ${error.message}`,
      );
      return null;
    }
  }

  async getAllActiveTemplates(): Promise<PromptTemplate[]> {
    return this.templateRepository.findActive();
  }

  async getTemplatesByCategory(
    category: PromptCategory,
  ): Promise<PromptTemplate[]> {
    return this.templateRepository.findByCategory(category);
  }

  async getTemplatesByRole(
    roleType: PromptRoleType,
  ): Promise<PromptTemplate[]> {
    return this.templateRepository.findByRoleType(roleType);
  }

  async createCustomTemplate(
    name: string,
    category: PromptCategory,
    roleType: PromptRoleType,
    template: string,
    parameters: string[],
    description?: string,
    aiPersonaId?: number,
  ): Promise<PromptTemplate> {
    try {
      // Check if name already exists
      const existing = await this.templateRepository.findByName(name);
      if (existing) {
        throw new Error(`Template with name ${name} already exists`);
      }

      const newTemplate = this.templateRepository.create({
        name,
        category,
        roleType,
        template,
        parameters,
        description,
        aiPersonaId,
        version: '1.0',
        isActive: true,
        usageCount: 0,
        averageQualityScore: null,
        successRate: 0.5,
        performanceScore: 5.0,
        lastUsedAt: null,
      });

      const savedTemplate = await this.templateRepository.save(newTemplate);
      this.logger.log(`Created custom template: ${savedTemplate.name}`);
      return savedTemplate;
    } catch (error) {
      this.logger.error(
        `Failed to create custom template ${name}: ${error.message}`,
      );
      throw error;
    }
  }

  async deactivateTemplate(templateName: string): Promise<void> {
    try {
      const template = await this.templateRepository.findByName(templateName);
      if (!template) {
        throw new Error(`Template ${templateName} not found`);
      }

      await this.templateRepository.softDelete(template.id);
      this.logger.log(`Deactivated template: ${templateName}`);
    } catch (error) {
      this.logger.error(
        `Failed to deactivate template ${templateName}: ${error.message}`,
      );
      throw error;
    }
  }

  async activateTemplate(templateName: string): Promise<void> {
    try {
      const template = await this.templateRepository.findByName(templateName);
      if (!template) {
        throw new Error(`Template ${templateName} not found`);
      }

      await this.templateRepository.update(template.id, { isActive: true });
      this.logger.log(`Activated template: ${templateName}`);
    } catch (error) {
      this.logger.error(
        `Failed to activate template ${templateName}: ${error.message}`,
      );
      throw error;
    }
  }

  async validateAllTemplates(): Promise<{
    valid: number;
    invalid: number;
    issues: Array<{ templateName: string; issues: string[] }>;
  }> {
    const allTemplates = await this.templateRepository.findAll();
    const results = {
      valid: 0,
      invalid: 0,
      issues: [] as Array<{ templateName: string; issues: string[] }>,
    };

    for (const template of allTemplates) {
      const validation =
        await this.templateRepository.validateTemplateIntegrity(template.id);
      if (validation.valid) {
        results.valid++;
      } else {
        results.invalid++;
        results.issues.push({
          templateName: template.name,
          issues: validation.issues,
        });
      }
    }

    this.logger.log(
      `Template validation: ${results.valid} valid, ${results.invalid} invalid`,
    );
    return results;
  }

  async cleanupUnusedTemplates(
    daysUnused = 30,
    minPerformanceScore = 3.0,
  ): Promise<void> {
    try {
      const templates =
        await this.templateRepository.findTemplatesNeedingUpdate();
      let deactivated = 0;

      for (const template of templates) {
        if (template.performanceScore < minPerformanceScore) {
          await this.templateRepository.softDelete(template.id);
          deactivated++;
          this.logger.log(
            `Deactivated low-performing template: ${template.name}`,
          );
        }
      }

      this.logger.log(
        `Cleanup completed: ${deactivated} templates deactivated`,
      );
    } catch (error) {
      this.logger.error(`Failed to cleanup unused templates: ${error.message}`);
    }
  }
}
