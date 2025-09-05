import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Relation,
} from "typeorm";
import { ApiProperty } from "@nestjs/swagger";
import { Game } from "./game.entity";

export type MessageType = "chat" | "system" | "game";

@Entity("messages")
export class Message {
  @ApiProperty({ description: "메시지 ID", example: 1 })
  @PrimaryGeneratedColumn({ type: "int", unsigned: true })
  id: number;

  @ApiProperty({ description: "메시지 내용", example: "안녕하세요!" })
  @Column({ type: "text" })
  content: string;

  @ApiProperty({ description: "발신자 이름", example: "Player1" })
  @Column({ type: "varchar", length: 50 })
  senderName: string;

  @ApiProperty({ description: "발신자 ID", example: 1 })
  @Column({ type: "int", unsigned: true })
  senderId: number;

  @ApiProperty({ description: "메시지 타입", enum: ["chat", "system", "game"] })
  @Column({
    type: "enum",
    enum: ["chat", "system", "game"],
    default: "chat",
  })
  type: Relation<MessageType>;

  @ApiProperty({ description: "게임 ID" })
  @Column({ type: "int", unsigned: true })
  gameId: number;

  @ManyToOne(() => Game, (game) => game.messages, { onDelete: "CASCADE" })
  @JoinColumn({ name: "gameId" })
  game: Relation<Game>;

  @ApiProperty({ description: "메시지 생성 시간" })
  @CreateDateColumn()
  createdAt: Date;
}
