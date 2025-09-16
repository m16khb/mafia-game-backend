import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { AIPersona } from './ai-persona.entity';

export type PromptCategory =
  | 'role_action'
  | 'discussion'
  | 'voting'
  | 'coordination';
export type PromptRoleType = 'mafia' | 'police' | 'doctor' | 'citizen' | 'any';

@Entity('prompt_templates')
export class PromptTemplate {
  @ApiProperty({ description: '프롬프트 템플릿 ID', example: 1 })
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @ApiProperty({
    description: '템플릿 이름',
    example: 'mafia_night_kill_decision',
  })
  @Column({ type: 'varchar', length: 100 })
  name: string;

  @ApiProperty({
    description: '템플릿 카테고리',
    enum: ['role_action', 'discussion', 'voting', 'coordination'],
    example: 'role_action',
  })
  @Column({
    type: 'enum',
    enum: ['role_action', 'discussion', 'voting', 'coordination'],
  })
  category: PromptCategory;

  @ApiProperty({
    description: '역할 타입',
    enum: ['mafia', 'police', 'doctor', 'citizen', 'any'],
    example: 'mafia',
  })
  @Column({
    type: 'enum',
    enum: ['mafia', 'police', 'doctor', 'citizen', 'any'],
  })
  roleType: PromptRoleType;

  @ApiProperty({
    description: '프롬프트 템플릿',
    example:
      'You are a mafia member. Choose a player to eliminate tonight. Consider: {{playerList}}. Your reasoning: ',
  })
  @Column({ type: 'text' })
  template: string;

  @ApiProperty({
    description: '필수 템플릿 매개변수',
    example: ['playerList', 'gameState', 'personality'],
  })
  @Column({ type: 'json' })
  parameters: string[];

  @ApiProperty({ description: '활성화 여부', example: true })
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @ApiProperty({ description: '템플릿 버전', example: 'v1.2.0' })
  @Column({ type: 'varchar', length: 20, default: 'v1.0.0' })
  version: string;

  @ApiProperty({ description: '템플릿 설명', required: false })
  @Column({ type: 'text', nullable: true })
  description?: string;

  @ApiProperty({ description: '사용 횟수', example: 25 })
  @Column({ type: 'int', unsigned: true, default: 0 })
  usageCount: number;

  @ApiProperty({ description: '평균 응답 품질 점수 (1-10)', example: 7.8 })
  @Column({ type: 'decimal', precision: 3, scale: 2, nullable: true })
  averageQualityScore?: number;

  @ApiProperty({ description: '성공률', example: 0.85 })
  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0.0 })
  successRate: number;

  @ApiProperty({ description: '성능 점수 (0.0-10.0)', example: 7.5 })
  @Column({ type: 'decimal', precision: 3, scale: 2, default: 5.0 })
  performanceScore: number;

  @ApiProperty({ description: '마지막 사용 시간', required: false })
  @Column({ type: 'timestamp', nullable: true })
  lastUsedAt?: Date;

  @ApiProperty({ description: '연결된 AI 페르소나 ID', required: false })
  @Column({ type: 'int', unsigned: true, nullable: true })
  aiPersonaId?: number;

  @ManyToOne(() => AIPersona, { nullable: true })
  @JoinColumn({ name: 'aiPersonaId' })
  aiPersona?: AIPersona;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Business Logic Methods

  /**
   * 템플릿이 활성 상태이고 사용 가능한지 확인
   */
  isAvailableForUse(): boolean {
    return this.isActive;
  }

  /**
   * 특정 역할에 적합한 템플릿인지 확인
   */
  isValidForRole(role: PromptRoleType): boolean {
    return this.roleType === 'any' || this.roleType === role;
  }

  /**
   * 특정 카테고리에 해당하는 템플릿인지 확인
   */
  isInCategory(category: PromptCategory): boolean {
    return this.category === category;
  }

  /**
   * 필수 매개변수가 모두 제공되었는지 검증
   */
  validateParameters(providedParams: Record<string, any>): {
    valid: boolean;
    missing: string[];
    errors: string[];
  } {
    const missing = this.parameters.filter(
      (param) =>
        !(param in providedParams) ||
        providedParams[param] === null ||
        providedParams[param] === undefined,
    );

    const errors = missing.map(
      (param) => `Missing required parameter: ${param}`,
    );

    return {
      valid: missing.length === 0,
      missing,
      errors,
    };
  }

  /**
   * 템플릿에 매개변수를 적용하여 최종 프롬프트 생성
   */
  generatePrompt(parameters: Record<string, any>): string {
    const validation = this.validateParameters(parameters);
    if (!validation.valid) {
      throw new Error(
        `Missing required parameters: ${validation.missing.join(', ')}`,
      );
    }

    let prompt = this.template;

    // 매개변수를 템플릿에 삽입
    Object.entries(parameters).forEach(([key, value]) => {
      const placeholder = `{{${key}}}`;
      const stringValue =
        typeof value === 'string' ? value : JSON.stringify(value);
      prompt = prompt.replace(new RegExp(placeholder, 'g'), stringValue);
    });

    return prompt;
  }

  /**
   * 사용 통계 업데이트
   */
  recordUsage(qualityScore?: number, wasSuccessful?: boolean): void {
    this.usageCount++;

    // 품질 점수 업데이트
    if (qualityScore !== undefined) {
      if (
        this.averageQualityScore === null ||
        this.averageQualityScore === undefined
      ) {
        this.averageQualityScore = qualityScore;
      } else {
        this.averageQualityScore = Number(
          (
            (Number(this.averageQualityScore) * (this.usageCount - 1) +
              qualityScore) /
            this.usageCount
          ).toFixed(2),
        );
      }
    }

    // 성공률 업데이트
    if (wasSuccessful !== undefined) {
      const previousSuccesses =
        Number(this.successRate) * (this.usageCount - 1);
      const newSuccesses = previousSuccesses + (wasSuccessful ? 1 : 0);
      this.successRate = Number((newSuccesses / this.usageCount).toFixed(2));
    }
  }

  /**
   * 템플릿 성능 점수 계산
   */
  getPerformanceScore(): number {
    return this.performanceScore;
  }

  /**
   * 템플릿 성능 점수 업데이트
   */
  updatePerformanceScore(): void {
    const qualityWeight = 0.4;
    const successWeight = 0.4;
    const usageWeight = 0.2;

    const qualityScore = this.averageQualityScore
      ? Number(this.averageQualityScore) / 10
      : 0;
    const successScore = Number(this.successRate);
    const usageScore = Math.min(this.usageCount / 100, 1); // 최대 100회 사용 기준

    this.performanceScore = Number(
      (
        qualityScore * qualityWeight +
        successScore * successWeight +
        usageScore * usageWeight * 10
      ).toFixed(2),
    );
  }

  /**
   * 고성능 템플릿인지 확인
   */
  isHighPerformance(): boolean {
    return this.getPerformanceScore() >= 0.7 && this.usageCount >= 5;
  }

  /**
   * 템플릿에서 사용되는 플레이스홀더 추출
   */
  extractPlaceholders(): string[] {
    const placeholderRegex = /\{\{(\w+)\}\}/g;
    const placeholders: string[] = [];
    let match;

    while ((match = placeholderRegex.exec(this.template)) !== null) {
      if (!placeholders.includes(match[1])) {
        placeholders.push(match[1]);
      }
    }

    return placeholders;
  }

  /**
   * 매개변수 정의와 실제 템플릿 플레이스홀더 일치 여부 검증
   */
  validateTemplateIntegrity(): { valid: boolean; issues: string[] } {
    const templatePlaceholders = this.extractPlaceholders();
    const issues: string[] = [];

    // 정의된 매개변수가 템플릿에서 사용되지 않는 경우
    const unusedParams = this.parameters.filter(
      (param) => !templatePlaceholders.includes(param),
    );
    if (unusedParams.length > 0) {
      issues.push(`Unused parameters: ${unusedParams.join(', ')}`);
    }

    // 템플릿에서 사용된 플레이스홀더가 매개변수로 정의되지 않은 경우
    const undefinedPlaceholders = templatePlaceholders.filter(
      (placeholder) => !this.parameters.includes(placeholder),
    );
    if (undefinedPlaceholders.length > 0) {
      issues.push(
        `Undefined placeholders: ${undefinedPlaceholders.join(', ')}`,
      );
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * 템플릿 비활성화
   */
  deactivate(): void {
    this.isActive = false;
  }

  /**
   * 템플릿 활성화
   */
  activate(): void {
    this.isActive = true;
  }

  /**
   * 템플릿 복제 (새 버전 생성용)
   */
  clone(
    newName?: string,
    newVersion?: string,
  ): Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt'> {
    return {
      name: newName || `${this.name}_copy`,
      category: this.category,
      roleType: this.roleType,
      template: this.template,
      parameters: [...this.parameters],
      isActive: this.isActive,
      version: newVersion || `${this.version}_copy`,
      description: this.description,
      usageCount: 0, // 새 템플릿은 사용 횟수 리셋
      averageQualityScore: undefined,
      successRate: 0,
      aiPersonaId: this.aiPersonaId,
    } as Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt'>;
  }

  /**
   * 템플릿을 안전한 JSON으로 직렬화 (통계 포함)
   */
  toSafeJSON(): Record<string, any> {
    return {
      id: this.id,
      name: this.name,
      category: this.category,
      roleType: this.roleType,
      parameters: this.parameters,
      isActive: this.isActive,
      version: this.version,
      description: this.description,
      usageCount: this.usageCount,
      averageQualityScore: this.averageQualityScore,
      successRate: this.successRate,
      performanceScore: this.getPerformanceScore(),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      // 실제 템플릿 내용은 보안을 위해 제외
    };
  }
}
