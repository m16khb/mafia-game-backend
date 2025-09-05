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
}
