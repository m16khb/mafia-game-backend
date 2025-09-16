import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Player } from './player.entity';

export type CommunicationStyle =
  | 'aggressive'
  | 'analytical'
  | 'emotional'
  | 'quiet';
export type RiskTolerance = 'high' | 'medium' | 'low';
export type VotingTendency = 'early' | 'late' | 'follower' | 'leader';

@Entity('ai_personas')
export class AIPersona {
  @ApiProperty({ description: 'AI 페르소나 ID', example: 1 })
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @ApiProperty({
    description: '페르소나 이름',
    example: 'analytical_detective',
  })
  @Column({ type: 'varchar', length: 100, unique: true })
  name: string;

  @ApiProperty({
    description: '성격 특성 목록',
    example: ['logical', 'suspicious', 'methodical'],
  })
  @Column({ type: 'json' })
  traits: string[];

  @ApiProperty({
    description: '의사소통 스타일',
    enum: ['aggressive', 'analytical', 'emotional', 'quiet'],
    example: 'analytical',
  })
  @Column({
    type: 'enum',
    enum: ['aggressive', 'analytical', 'emotional', 'quiet'],
  })
  communicationStyle: CommunicationStyle;

  @ApiProperty({
    description: '위험 감수 성향',
    enum: ['high', 'medium', 'low'],
    example: 'low',
  })
  @Column({
    type: 'enum',
    enum: ['high', 'medium', 'low'],
  })
  riskTolerance: RiskTolerance;

  @ApiProperty({
    description: '투표 성향',
    enum: ['early', 'late', 'follower', 'leader'],
    example: 'late',
  })
  @Column({
    type: 'enum',
    enum: ['early', 'late', 'follower', 'leader'],
  })
  votingTendency: VotingTendency;

  @ApiProperty({ description: '기본 의심 수준 (1-10)', example: 8 })
  @Column({ type: 'int', unsigned: true })
  suspicionLevel: number;

  @ApiProperty({ description: '기만 능력 (1-10)', example: 6 })
  @Column({ type: 'int', unsigned: true })
  deceptionSkill: number;

  @ApiProperty({ description: '활성화 여부', example: true })
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @ApiProperty({ description: '페르소나 설명', required: false })
  @Column({ type: 'text', nullable: true })
  description?: string;

  @ApiProperty({ description: '게임 플레이 횟수', example: 15 })
  @Column({ type: 'int', unsigned: true, default: 0 })
  gamesPlayed: number;

  @ApiProperty({ description: '승률', example: 0.67 })
  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0.0 })
  winRate: number;

  @ApiProperty({ description: '평균 결정 시간 (ms)', example: 450 })
  @Column({ type: 'int', unsigned: true, nullable: true })
  averageDecisionTime?: number;

  @ApiProperty({ description: '역할별 성과 데이터 (JSON)', required: false })
  @Column({ type: 'json', nullable: true })
  rolePerformance?: Record<string, any>;

  @OneToMany(() => Player, (player) => player.aiPersonaId)
  players: Player[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Business Logic Methods

  /**
   * 페르소나가 활성 상태이고 게임에 사용 가능한지 확인
   */
  isAvailableForGame(): boolean {
    return this.isActive;
  }

  /**
   * 특성이 유효한지 검증 (2-5개 특성)
   */
  hasValidTraits(): boolean {
    return (
      Array.isArray(this.traits) &&
      this.traits.length >= 2 &&
      this.traits.length <= 5
    );
  }

  /**
   * 수치 값들이 유효한 범위 내에 있는지 검증
   */
  hasValidMetrics(): boolean {
    return (
      this.suspicionLevel >= 1 &&
      this.suspicionLevel <= 10 &&
      this.deceptionSkill >= 1 &&
      this.deceptionSkill <= 10
    );
  }

  /**
   * 페르소나가 공격적인 성향인지 확인
   */
  isAggressive(): boolean {
    return (
      this.communicationStyle === 'aggressive' ||
      this.traits.includes('aggressive') ||
      this.traits.includes('impulsive')
    );
  }

  /**
   * 페르소나가 분석적인 성향인지 확인
   */
  isAnalytical(): boolean {
    return (
      this.communicationStyle === 'analytical' ||
      this.traits.includes('logical') ||
      this.traits.includes('methodical')
    );
  }

  /**
   * 페르소나가 조용한 성향인지 확인
   */
  isQuiet(): boolean {
    return (
      this.communicationStyle === 'quiet' ||
      this.traits.includes('careful') ||
      this.traits.includes('observant')
    );
  }

  /**
   * 게임 통계 업데이트
   */
  updateGameStats(won: boolean, decisionTimeMs: number): void {
    this.gamesPlayed++;

    // Update win rate
    const totalWins =
      Math.round(this.winRate * (this.gamesPlayed - 1)) + (won ? 1 : 0);
    this.winRate = Math.round((totalWins / this.gamesPlayed) * 100) / 100;

    // Update average decision time
    if (
      this.averageDecisionTime === null ||
      this.averageDecisionTime === undefined
    ) {
      this.averageDecisionTime = decisionTimeMs;
    } else {
      this.averageDecisionTime = Math.round(
        (this.averageDecisionTime * (this.gamesPlayed - 1) + decisionTimeMs) /
          this.gamesPlayed,
      );
    }
  }

  /**
   * 역할별 성과 업데이트
   */
  updateRolePerformance(
    role: string,
    won: boolean,
    decisionTimeMs: number,
  ): void {
    if (!this.rolePerformance) {
      this.rolePerformance = {};
    }

    if (!this.rolePerformance[role]) {
      this.rolePerformance[role] = {
        gamesPlayed: 0,
        winRate: 0,
        averageDecisionTime: 0,
      };
    }

    const roleStats = this.rolePerformance[role];
    roleStats.gamesPlayed++;

    // Update role-specific win rate
    const roleWins =
      Math.round(roleStats.winRate * (roleStats.gamesPlayed - 1)) +
      (won ? 1 : 0);
    roleStats.winRate =
      Math.round((roleWins / roleStats.gamesPlayed) * 100) / 100;

    // Update role-specific decision time
    if (roleStats.averageDecisionTime === 0) {
      roleStats.averageDecisionTime = decisionTimeMs;
    } else {
      roleStats.averageDecisionTime = Math.round(
        (roleStats.averageDecisionTime * (roleStats.gamesPlayed - 1) +
          decisionTimeMs) /
          roleStats.gamesPlayed,
      );
    }

    this.rolePerformance[role] = roleStats;
  }

  /**
   * 특정 역할에서의 성과 가져오기
   */
  getRolePerformance(role: string): {
    gamesPlayed: number;
    winRate: number;
    averageDecisionTime: number;
  } | null {
    return this.rolePerformance?.[role] || null;
  }

  /**
   * 페르소나 비활성화
   */
  deactivate(): void {
    this.isActive = false;
  }

  /**
   * 페르소나 활성화
   */
  activate(): void {
    this.isActive = true;
  }

  /**
   * 성격 특성에 특정 특성이 포함되어 있는지 확인
   */
  hasTrait(trait: string): boolean {
    return this.traits.includes(trait);
  }

  /**
   * 페르소나의 신뢰도 점수 계산 (게임 경험 기반)
   */
  getReliabilityScore(): number {
    if (this.gamesPlayed === 0) return 0;

    // 게임 수, 승률, 결정 시간 일관성을 고려한 신뢰도 점수
    const experienceScore = Math.min(this.gamesPlayed / 10, 1); // 최대 10게임까지 고려
    const performanceScore = this.winRate;
    const consistencyScore = this.averageDecisionTime
      ? Math.min(1000 / this.averageDecisionTime, 1)
      : 0;

    return (
      Math.round(
        (experienceScore * 0.4 +
          performanceScore * 0.4 +
          consistencyScore * 0.2) *
          100,
      ) / 100
    );
  }
}
