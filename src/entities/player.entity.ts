import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Game, GameRole } from './game.entity';

@Entity('players')
export class Player {
  @ApiProperty({ description: '플레이어 ID', example: 1 })
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @ApiProperty({ description: '플레이어 이름', example: 'Player1' })
  @Column({ type: 'varchar', length: 50 })
  name: string;

  @ApiProperty({ description: '소켓 ID', example: 'socket_123' })
  @Column({ type: 'varchar', length: 100 })
  socketId: string;

  @ApiProperty({ description: '생존 여부', example: true })
  @Column({ type: 'boolean', default: true })
  isAlive: boolean;

  @ApiProperty({ description: '준비 상태', example: false })
  @Column({ type: 'boolean', default: false })
  isReady: boolean;

  @ApiProperty({ description: '호스트 여부', example: false })
  @Column({ type: 'boolean', default: false })
  isHost: boolean;

  @ApiProperty({ description: 'AI 플레이어 여부', example: false })
  @Column({ type: 'boolean', default: false })
  isAi: boolean;

  @ApiProperty({ description: 'AI 페르소나 ID', required: false, example: 1 })
  @Column({ type: 'int', unsigned: true, nullable: true })
  aiPersonaId?: number;

  @ApiProperty({
    description: 'AI 결정 타임아웃 (ms)',
    required: false,
    example: 30000,
  })
  @Column({ type: 'int', unsigned: true, nullable: true })
  aiDecisionTimeout?: number;

  @ApiProperty({
    description: '현재 AI 전략',
    required: false,
    example: 'mafia_coordination',
  })
  @Column({ type: 'varchar', length: 100, nullable: true })
  currentStrategy?: string;

  @ApiProperty({ description: '마지막 결정 시간', required: false })
  @Column({ type: 'timestamp', nullable: true })
  lastDecisionTime?: Date;

  @ApiProperty({
    description: '평균 응답 시간 (ms)',
    required: false,
    example: 450,
  })
  @Column({ type: 'int', unsigned: true, nullable: true })
  responseTime?: number;

  @ApiProperty({
    description: '플레이어 역할',
    enum: ['citizen', 'mafia', 'police', 'doctor'],
    required: false,
  })
  @Column({
    type: 'enum',
    enum: ['citizen', 'mafia', 'police', 'doctor'],
    nullable: true,
  })
  role?: GameRole;

  @ApiProperty({ description: '게임 ID' })
  @Column({ type: 'int', unsigned: true })
  gameId: number;

  @ManyToOne(() => Game, (game) => game.players, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'gameId' })
  game: Game;

  @CreateDateColumn()
  createdAt: Date;

  // Business Logic Methods
  assignRole(role: GameRole): void {
    this.role = role;
  }

  makeHost(): void {
    this.isHost = true;
  }

  toggleReady(): void {
    this.isReady = !this.isReady;
  }

  kill(): void {
    this.isAlive = false;
  }

  revive(): void {
    this.isAlive = true;
  }

  isMafia(): boolean {
    return this.role === 'mafia';
  }

  isPolice(): boolean {
    return this.role === 'police';
  }

  isDoctor(): boolean {
    return this.role === 'doctor';
  }

  isCitizen(): boolean {
    return this.role === 'citizen';
  }

  /**
   * AI 페르소나 ID를 설정합니다.
   */
  assignAiPersona(personaId: number, strategy?: string): void {
    if (!this.isAi) {
      throw new Error('Cannot assign persona to non-AI player');
    }
    this.aiPersonaId = personaId;
    if (strategy) {
      this.currentStrategy = strategy;
    }
  }

  /**
   * AI 페르소나가 할당되어 있는지 확인합니다.
   */
  hasAiPersona(): boolean {
    return this.isAi && !!this.aiPersonaId;
  }

  /**
   * AI 페르소나 할당을 해제합니다.
   */
  clearAiPersona(): void {
    this.aiPersonaId = undefined;
    this.currentStrategy = undefined;
  }

  /**
   * AI 결정 시간을 기록합니다.
   */
  recordDecisionTime(decisionTimeMs: number): void {
    if (!this.isAi) {
      throw new Error('Cannot record decision time for non-AI player');
    }

    this.lastDecisionTime = new Date();

    // Calculate running average response time
    if (this.responseTime === null || this.responseTime === undefined) {
      this.responseTime = decisionTimeMs;
    } else {
      // Simple exponential moving average (factor of 0.3)
      this.responseTime = Math.round(
        this.responseTime * 0.7 + decisionTimeMs * 0.3,
      );
    }
  }

  /**
   * AI 전략을 업데이트합니다.
   */
  updateStrategy(strategy: string): void {
    if (!this.isAi) {
      throw new Error('Cannot update strategy for non-AI player');
    }
    this.currentStrategy = strategy;
  }

  /**
   * AI 결정 타임아웃을 설정합니다.
   */
  setDecisionTimeout(timeoutMs: number): void {
    if (!this.isAi) {
      throw new Error('Cannot set decision timeout for non-AI player');
    }
    this.aiDecisionTimeout = timeoutMs;
  }

  /**
   * AI 플레이어의 결정 타임아웃을 가져옵니다. (기본값 30초)
   */
  getDecisionTimeout(): number {
    return this.aiDecisionTimeout || 30000;
  }
}
