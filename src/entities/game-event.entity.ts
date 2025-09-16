import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Game } from './game.entity';

@Entity('game_events')
export class GameEvent {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ type: 'varchar', length: 50 })
  eventType: string;

  @Column({ type: 'json', nullable: true })
  eventData: Record<string, any>;

  @Column({ type: 'boolean', default: false })
  aiGenerated: boolean;

  @Column({ type: 'int', unsigned: true, nullable: true })
  aiConfidence?: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  promptTemplate?: string;

  @Column({ type: 'int', unsigned: true })
  gameId: number;

  @ManyToOne(() => Game, (game) => game.gameEvents, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'gameId' })
  game: Game;

  @CreateDateColumn()
  createdAt: Date;

  // AI-related methods
  static createAIEvent(
    gameId: number,
    eventType: string,
    eventData: Record<string, any>,
    confidence?: number,
    promptTemplate?: string,
  ): GameEvent {
    const event = new GameEvent();
    event.gameId = gameId;
    event.eventType = eventType;
    event.eventData = eventData;
    event.aiGenerated = true;
    event.aiConfidence = confidence;
    event.promptTemplate = promptTemplate;
    return event;
  }

  isAIGenerated(): boolean {
    return this.aiGenerated;
  }

  hasHighConfidence(): boolean {
    return this.aiConfidence !== undefined && this.aiConfidence >= 7;
  }

  getConfidenceLevel(): 'low' | 'medium' | 'high' | 'unknown' {
    if (this.aiConfidence === undefined) return 'unknown';
    if (this.aiConfidence >= 8) return 'high';
    if (this.aiConfidence >= 5) return 'medium';
    return 'low';
  }
}
