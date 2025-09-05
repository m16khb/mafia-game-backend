import { Game } from "../../entities/game.entity";

export interface IGameRepository {
  create(gameData: Partial<Game>): Game;
  save(game: Game): Promise<Game>;
  findById(id: number): Promise<Game | null>;
  findByIdWithRelations(id: number, relations: string[]): Promise<Game | null>;
  findAll(): Promise<Game[]>;
  findAllWithRelations(relations: string[]): Promise<Game[]>;
  delete(id: number): Promise<void>;
}
