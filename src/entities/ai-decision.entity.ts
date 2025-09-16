import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Player } from './player.entity';
import { Game } from './game.entity';

export type DecisionType =
  | 'vote'
  | 'night_action'
  | 'discussion'
  | 'accusation';

@Entity('ai_decisions')
export class AIDecision {
  @ApiProperty({ description: 'AI 결정 ID', example: 1 })
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @ApiProperty({ description: '플레이어 ID' })
  @Column({ type: 'int', unsigned: true })
  playerId: number;

  @ApiProperty({ description: '게임 ID' })
  @Column({ type: 'int', unsigned: true })
  gameId: number;

  @ApiProperty({
    description: '결정 타입',
    enum: ['vote', 'night_action', 'discussion', 'accusation'],
    example: 'vote',
  })
  @Column({
    type: 'enum',
    enum: ['vote', 'night_action', 'discussion', 'accusation'],
  })
  decisionType: DecisionType;

  @ApiProperty({
    description: '결정 데이터 (대상, 추론, 대안 등)',
    example: {
      target: 'Player2',
      reasoning: 'Suspicious voting pattern',
      alternatives: ['Player3'],
    },
  })
  @Column({ type: 'json' })
  decisionData: Record<string, any>;

  @ApiProperty({ description: '사용된 프롬프트 템플릿', required: false })
  @Column({ type: 'varchar', length: 200, nullable: true })
  promptUsed?: string;

  @ApiProperty({ description: 'LLM 원시 응답', required: false })
  @Column({ type: 'text', nullable: true })
  llmResponse?: string;

  @ApiProperty({ description: '처리 시간 (ms)', example: 450 })
  @Column({ type: 'int', unsigned: true })
  processingTime: number;

  @ApiProperty({ description: 'AI 결정 신뢰도 (1-10)', example: 8 })
  @Column({ type: 'int', unsigned: true })
  confidence: number;

  @ApiProperty({ description: '게임 페이즈', required: false })
  @Column({ type: 'varchar', length: 50, nullable: true })
  gamePhase?: string;

  @ApiProperty({ description: '결정 성공 여부', required: false })
  @Column({ type: 'boolean', nullable: true })
  wasSuccessful?: boolean;

  @ApiProperty({ description: '결정 결과', required: false })
  @Column({ type: 'json', nullable: true })
  outcome?: Record<string, any>;

  @ManyToOne(() => Player, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'playerId' })
  player: Player;

  @ManyToOne(() => Game, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'gameId' })
  game: Game;

  @CreateDateColumn()
  createdAt: Date;

  // Business Logic Methods

  /**
   * 높은 신뢰도의 결정인지 확인
   */
  hasHighConfidence(): boolean {
    return this.confidence >= 7;
  }

  /**
   * 빠른 결정인지 확인 (500ms 이내)
   */
  isFastDecision(): boolean {
    return this.processingTime <= 500;
  }

  /**
   * 신뢰도 레벨 반환
   */
  getConfidenceLevel(): 'low' | 'medium' | 'high' {
    if (this.confidence >= 8) return 'high';
    if (this.confidence >= 5) return 'medium';
    return 'low';
  }

  /**
   * 처리 속도 레벨 반환
   */
  getProcessingSpeedLevel(): 'fast' | 'normal' | 'slow' {
    if (this.processingTime <= 300) return 'fast';
    if (this.processingTime <= 1000) return 'normal';
    return 'slow';
  }

  /**
   * 투표 결정인지 확인
   */
  isVoteDecision(): boolean {
    return this.decisionType === 'vote';
  }

  /**
   * 야간 액션 결정인지 확인
   */
  isNightActionDecision(): boolean {
    return this.decisionType === 'night_action';
  }

  /**
   * 토론 결정인지 확인
   */
  isDiscussionDecision(): boolean {
    return this.decisionType === 'discussion';
  }

  /**
   * 결정에 대상이 포함되어 있는지 확인
   */
  hasTarget(): boolean {
    return !!this.decisionData.target;
  }

  /**
   * 결정 대상 가져오기
   */
  getTarget(): string | null {
    return this.decisionData.target || null;
  }

  /**
   * 결정 추론 가져오기
   */
  getReasoning(): string | null {
    return this.decisionData.reasoning || null;
  }

  /**
   * 결정에 메시지가 포함되어 있는지 확인
   */
  hasMessage(): boolean {
    return !!this.decisionData.message;
  }

  /**
   * 결정 메시지 가져오기
   */
  getMessage(): string | null {
    return this.decisionData.message || null;
  }

  /**
   * 대안 선택지들 가져오기
   */
  getAlternatives(): string[] {
    return this.decisionData.alternatives || [];
  }

  /**
   * 결정 성공 여부 설정
   */
  markAsSuccessful(outcome?: Record<string, any>): void {
    this.wasSuccessful = true;
    if (outcome) {
      this.outcome = outcome;
    }
  }

  /**
   * 결정 실패 설정
   */
  markAsFailed(outcome?: Record<string, any>): void {
    this.wasSuccessful = false;
    if (outcome) {
      this.outcome = outcome;
    }
  }

  /**
   * 결정이 성공했는지 확인
   */
  isSuccessful(): boolean {
    return this.wasSuccessful === true;
  }

  /**
   * 결정이 실패했는지 확인
   */
  isFailed(): boolean {
    return this.wasSuccessful === false;
  }

  /**
   * 결정 결과가 아직 확정되지 않았는지 확인
   */
  isPending(): boolean {
    return this.wasSuccessful === null || this.wasSuccessful === undefined;
  }

  /**
   * 결정의 효율성 점수 계산 (신뢰도와 처리 속도 고려)
   */
  getEfficiencyScore(): number {
    const confidenceScore = this.confidence / 10;
    const speedScore = Math.max(0, (2000 - this.processingTime) / 2000); // 2초를 기준으로 계산
    const successBonus = this.wasSuccessful ? 0.2 : 0;

    return (
      Math.round(
        (confidenceScore * 0.5 + speedScore * 0.3 + successBonus) * 100,
      ) / 100
    );
  }

  /**
   * 결정 데이터를 안전하게 업데이트
   */
  updateDecisionData(newData: Record<string, any>): void {
    this.decisionData = {
      ...this.decisionData,
      ...newData,
    };
  }

  /**
   * 특정 데이터 필드 존재 여부 확인
   */
  hasDataField(field: string): boolean {
    return (
      this.decisionData.hasOwnProperty(field) &&
      this.decisionData[field] !== null &&
      this.decisionData[field] !== undefined
    );
  }

  /**
   * 결정이 현재 게임 페이즈에 적합한지 검증
   */
  isValidForPhase(expectedPhase: string): boolean {
    if (!this.gamePhase) return true; // 페이즈 정보가 없으면 검증 생략

    const phaseMapping: Record<string, DecisionType[]> = {
      day_discussion: ['discussion', 'accusation'],
      day_voting: ['vote'],
      night_actions: ['night_action'],
    };

    const validDecisionTypes = phaseMapping[expectedPhase];
    return validDecisionTypes
      ? validDecisionTypes.includes(this.decisionType)
      : false;
  }

  /**
   * 결정을 JSON으로 직렬화 (민감한 정보 제외)
   */
  toSafeJSON(): Record<string, any> {
    return {
      id: this.id,
      playerId: this.playerId,
      gameId: this.gameId,
      decisionType: this.decisionType,
      target: this.getTarget(),
      message: this.getMessage(),
      reasoning: this.getReasoning(),
      confidence: this.confidence,
      processingTime: this.processingTime,
      gamePhase: this.gamePhase,
      wasSuccessful: this.wasSuccessful,
      createdAt: this.createdAt,
      // LLM response와 민감한 데이터는 제외
    };
  }
}
