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
import { Message } from './message.entity';
import { GameEvent } from './game-event.entity';

export type GameStatus = 'waiting' | 'playing' | 'finished';
export type GamePhase =
  | 'day'
  | 'night'
  | 'voting'
  | 'result'
  | 'day_discussion'
  | 'day_voting'
  | 'night_actions';
export type GameRole = 'citizen' | 'mafia' | 'police' | 'doctor';
export type AIDifficultyLevel = 'easy' | 'medium' | 'hard';

@Entity('games')
export class Game {
  @ApiProperty({ description: '게임 ID', example: 1 })
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @ApiProperty({ description: '게임 이름', example: 'Mafia Game #1' })
  @Column({ type: 'varchar', length: 100 })
  name: string;

  @ApiProperty({
    description: '게임 상태',
    enum: ['waiting', 'playing', 'finished'],
  })
  @Column({
    type: 'enum',
    enum: ['waiting', 'playing', 'finished'],
    default: 'waiting',
  })
  status: GameStatus;

  @ApiProperty({
    description: '현재 게임 페이즈',
    enum: [
      'day',
      'night',
      'voting',
      'result',
      'day_discussion',
      'day_voting',
      'night_actions',
    ],
  })
  @Column({
    type: 'enum',
    enum: [
      'day',
      'night',
      'voting',
      'result',
      'day_discussion',
      'day_voting',
      'night_actions',
    ],
    default: 'day',
    nullable: true,
  })
  currentPhase: GamePhase;

  @ApiProperty({ description: '현재 일차', example: 1 })
  @Column({ type: 'int', default: 1 })
  dayCount: number;

  @ApiProperty({ description: '남은 시간 (초)', example: 300 })
  @Column({ type: 'int', default: 0 })
  remainingTime: number;

  @ApiProperty({ description: '최대 플레이어 수', example: 6 })
  @Column({ type: 'int', default: 6 })
  maxPlayers: number;

  @ApiProperty({ description: '최소 플레이어 수', example: 6 })
  @Column({ type: 'int', default: 6 })
  minPlayers: number;

  @ApiProperty({ description: '낮 시간 (초)', example: 300 })
  @Column({ type: 'int', default: 300 })
  dayTimeSeconds: number;

  @ApiProperty({ description: '밤 시간 (초)', example: 180 })
  @Column({ type: 'int', default: 180 })
  nightTimeSeconds: number;

  @ApiProperty({ description: '투표 시간 (초)', example: 120 })
  @Column({ type: 'int', default: 120 })
  voteTimeSeconds: number;

  @ApiProperty({ description: 'AI 지원 여부', example: false })
  @Column({ type: 'boolean', default: false })
  allowAI: boolean;

  @ApiProperty({ description: 'AI 플레이어 수', example: 5 })
  @Column({ type: 'int', unsigned: true, default: 0 })
  aiPlayerCount: number;

  @ApiProperty({
    description: 'AI 난이도 레벨',
    enum: ['easy', 'medium', 'hard'],
    required: false,
  })
  @Column({
    type: 'enum',
    enum: ['easy', 'medium', 'hard'],
    nullable: true,
  })
  aiDifficultyLevel?: AIDifficultyLevel;

  @ApiProperty({
    description: 'AI 페르소나 세트',
    required: false,
    example: 'default',
  })
  @Column({ type: 'varchar', length: 50, nullable: true })
  aiPersonalitySet?: string;

  @ApiProperty({ description: '페이즈 시작 시간', required: false })
  @Column({ type: 'timestamp', nullable: true })
  phaseStartTime?: Date;

  @ApiProperty({
    description: '페이즈 제한 시간 (초)',
    required: false,
    example: 180,
  })
  @Column({ type: 'int', unsigned: true, nullable: true })
  phaseTimeLimit?: number;

  @ApiProperty({ description: 'AI 결정 완료 여부', example: false })
  @Column({ type: 'boolean', default: false })
  aiDecisionsComplete: boolean;

  @ApiProperty({ description: 'AI 협력 상태 (JSON)', required: false })
  @Column({ type: 'json', nullable: true })
  aiCoordinationState?: any;

  @ApiProperty({ description: '게임 생성 시간' })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({ description: '게임 시작 시간', required: false })
  @Column({ type: 'timestamp', nullable: true })
  startedAt: Date;

  @ApiProperty({ description: '게임 종료 시간', required: false })
  @Column({ type: 'timestamp', nullable: true })
  endedAt: Date;

  @ApiProperty({
    description: '승리자',
    enum: ['mafia', 'citizen'],
    required: false,
  })
  @Column({
    type: 'enum',
    enum: ['mafia', 'citizen'],
    nullable: true,
  })
  winner: 'mafia' | 'citizen';

  @ApiProperty({
    description: '참여 플레이어 목록',
    type: () => [Player],
  })
  @OneToMany(() => Player, (player) => player.game, {
    cascade: true,
    eager: true,
  })
  players: Player[];

  @ApiProperty({
    description: '채팅 메시지 목록',
    type: () => [Message],
  })
  @OneToMany(() => Message, (message) => message.game, {
    cascade: true,
    eager: true,
  })
  messages: Message[];

  @OneToMany(() => GameEvent, (gameEvent) => gameEvent.game, { cascade: true })
  gameEvents: GameEvent[];

  @UpdateDateColumn()
  updatedAt: Date;

  // Business Logic Methods
  canStart(): boolean {
    return (
      this.status === 'waiting' &&
      this.players.length >= this.minPlayers &&
      this.players.every((p) => p.isReady)
    );
  }

  canAddPlayer(): boolean {
    return this.status === 'waiting' && this.players.length < this.maxPlayers;
  }

  addPlayer(player: Player): void {
    if (!this.canAddPlayer()) {
      throw new Error('Cannot add player to game');
    }
    this.players.push(player);
  }

  removePlayer(socketId: string): boolean {
    const playerIndex = this.players.findIndex((p) => p.socketId === socketId);
    if (playerIndex === -1) return false;

    const removedPlayer = this.players[playerIndex];
    this.players.splice(playerIndex, 1);

    // 호스트가 나갔을 경우 다음 플레이어를 호스트로 지정
    if (removedPlayer.isHost && this.players.length > 0) {
      this.players[0].makeHost();
    }

    return true;
  }

  start(): void {
    if (!this.canStart()) {
      throw new Error(
        'Cannot start game: not enough players or players not ready',
      );
    }
    this.assignRoles();
    this.status = 'playing';
    this.currentPhase = 'night';
    this.startedAt = new Date();
    this.remainingTime = this.nightTimeSeconds;
  }

  finish(): void {
    this.status = 'finished';
    this.endedAt = new Date();
  }

  nextPhase(): void {
    switch (this.currentPhase) {
      case 'night':
        this.currentPhase = 'day';
        this.remainingTime = this.dayTimeSeconds;
        break;
      case 'day':
        this.currentPhase = 'voting';
        this.remainingTime = this.voteTimeSeconds;
        break;
      case 'voting':
        this.currentPhase = 'result';
        this.remainingTime = 10; // 10초 결과 표시
        break;
      case 'result':
        this.dayCount++;
        this.currentPhase = 'night';
        this.remainingTime = this.nightTimeSeconds;
        break;
    }
  }

  addMessage(message: Message): void {
    this.messages.push(message);
  }

  getAlivePlayers(): Player[] {
    return this.players.filter((p) => p.isAlive);
  }

  getMafiaPlayers(): Player[] {
    return this.players.filter((p) => p.isMafia() && p.isAlive);
  }

  getCitizenPlayers(): Player[] {
    return this.players.filter((p) => !p.isMafia() && p.isAlive);
  }

  isGameOver(): { isOver: boolean; winner?: 'mafia' | 'citizen' } {
    const aliveMafia = this.getMafiaPlayers().length;
    const aliveCitizens = this.getCitizenPlayers().length;

    if (aliveMafia === 0) {
      return { isOver: true, winner: 'citizen' };
    }
    if (aliveMafia >= aliveCitizens) {
      return { isOver: true, winner: 'mafia' };
    }
    return { isOver: false };
  }

  // AI Game Methods
  isAIGame(): boolean {
    return this.allowAI && this.aiPlayerCount > 0;
  }

  getAIPlayers(): Player[] {
    return this.players.filter((p) => p.isAi);
  }

  getHumanPlayers(): Player[] {
    return this.players.filter((p) => !p.isAi);
  }

  canStartAIGame(): boolean {
    return (
      this.status === 'waiting' &&
      this.players.length === this.aiPlayerCount + 1 && // 5 AI + 1 human
      this.getAIPlayers().every((p) => p.hasAiPersona()) &&
      this.getHumanPlayers().every((p) => p.isReady)
    );
  }

  startAIGame(): void {
    if (!this.canStartAIGame()) {
      throw new Error('Cannot start AI game: requirements not met');
    }
    this.assignRoles();
    this.status = 'playing';
    this.currentPhase = 'day_discussion';
    this.startedAt = new Date();
    this.phaseStartTime = new Date();
    this.phaseTimeLimit = 180; // 3 minutes for day discussion
    this.aiDecisionsComplete = false;
  }

  nextAIPhase(): void {
    switch (this.currentPhase) {
      case 'day_discussion':
        this.currentPhase = 'day_voting';
        this.phaseTimeLimit = 120; // 2 minutes for voting
        break;
      case 'day_voting':
        this.currentPhase = 'night_actions';
        this.phaseTimeLimit = 60; // 1 minute for night actions
        break;
      case 'night_actions':
        this.dayCount++;
        this.currentPhase = 'day_discussion';
        this.phaseTimeLimit = 180; // 3 minutes for day discussion
        break;
    }
    this.phaseStartTime = new Date();
    this.aiDecisionsComplete = false;
  }

  markAIDecisionsComplete(): void {
    this.aiDecisionsComplete = true;
  }

  areAIDecisionsPending(): boolean {
    return !this.aiDecisionsComplete;
  }

  getPhaseRemainingTime(): number {
    if (!this.phaseStartTime || !this.phaseTimeLimit) {
      return 0;
    }
    const elapsed = (Date.now() - this.phaseStartTime.getTime()) / 1000;
    return Math.max(0, this.phaseTimeLimit - elapsed);
  }

  isPhaseExpired(): boolean {
    return this.getPhaseRemainingTime() <= 0;
  }

  setAICoordinationState(state: any): void {
    this.aiCoordinationState = state;
  }

  getAICoordinationState(): any {
    return this.aiCoordinationState || {};
  }

  assignRoles(): void {
    const playerCount = this.players.length;

    // For AI games, use specific role distribution for 6 players
    if (this.isAIGame() && playerCount === 6) {
      const roles: GameRole[] = [
        'mafia',
        'mafia',
        'police',
        'doctor',
        'citizen',
        'citizen',
      ];

      // 역할 섞기
      for (let i = roles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [roles[i], roles[j]] = [roles[j], roles[i]];
      }

      // 플레이어에게 역할 배정
      this.players.forEach((player, index) => {
        player.assignRole(roles[index]);
      });
    } else {
      // Original role assignment logic for regular games
      const mafiaCount = Math.ceil(playerCount / 3);
      const policeCount = Math.max(0, playerCount - mafiaCount);
      const doctorCount = Math.max(0, playerCount - mafiaCount - policeCount);

      const roles: GameRole[] = [
        ...Array(mafiaCount).fill('mafia'),
        ...Array(policeCount).fill('police'),
        ...Array(doctorCount).fill('doctor'),
        ...Array(
          Math.max(0, playerCount - mafiaCount - policeCount - doctorCount),
        ).fill('citizen'),
      ];

      // 역할 섞기
      for (let i = roles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [roles[i], roles[j]] = [roles[j], roles[i]];
      }

      // 플레이어에게 역할 배정
      this.players.forEach((player, index) => {
        player.assignRole(roles[index]);
      });
    }
  }
}
