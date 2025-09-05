import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Relation,
} from "typeorm";
import { Game } from "./game.entity";

@Entity("game_events")
export class GameEvent {
  @PrimaryGeneratedColumn({ type: "int", unsigned: true })
  id: number;

  @Column({ type: "varchar", length: 50 })
  eventType: string;

  @Column({ type: "json", nullable: true })
  eventData: Record<string, any>;

  @Column({ type: "int", unsigned: true })
  gameId: number;

  @ManyToOne(() => Game, (game) => game.gameEvents, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "gameId" })
  game: Relation<Game>;

  @CreateDateColumn()
  createdAt: Date;
}
