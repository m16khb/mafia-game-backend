import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Game } from "../../entities/game.entity";
import { IGameRepository } from "@libs/repositories/game.repository.interface";

@Injectable()
export class GameRepository implements IGameRepository {
  constructor(
    @InjectRepository(Game)
    private readonly repository: Repository<Game>,
  ) {}

  create(gameData: Partial<Game>): Game {
    return this.repository.create(gameData);
  }

  async save(game: Game): Promise<Game> {
    return this.repository.save(game);
  }

  async findById(id: number): Promise<Game | null> {
    return this.repository.findOne({ where: { id } });
  }

  async findByIdWithRelations(
    id: number,
    relations: string[],
  ): Promise<Game | null> {
    return this.repository.findOne({
      where: { id },
      relations,
    });
  }

  async findAll(): Promise<Game[]> {
    return this.repository.find({
      order: { createdAt: "DESC" },
    });
  }

  async findAllWithRelations(relations: string[]): Promise<Game[]> {
    return this.repository.find({
      relations,
      order: { createdAt: "DESC" },
    });
  }

  async delete(id: number): Promise<void> {
    await this.repository.delete(id);
  }
}
