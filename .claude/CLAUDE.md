# Claude Code - Detailed Development Guidelines

이 파일은 Claude Code가 프로젝트 작업 시 따라야 할 세부적인 코드 규칙과 개발 지침을 제공합니다.

## 코드 품질 및 스타일

### ESLint 규칙 준수

```typescript
// ✅ 올바른 예시
export class GameService {
  private readonly logger = new Logger(GameService.name);
  
  constructor(
    @Inject(GAME_REPOSITORY_TOKEN)
    private readonly gameRepository: IGameRepository,
  ) {}
}

// ❌ 잘못된 예시 
export class GameService {
  private logger; // 타입 명시 없음
  
  constructor(gameRepository: any) { // any 타입 사용
    this.logger = new Logger();
  }
}
```

### Prettier 포맷팅 규칙

- **세미콜론**: 항상 사용
- **따옴표**: 단일 따옴표 사용
- **들여쓰기**: 2칸 스페이스
- **줄 길이**: 최대 80자
- **후행 쉼표**: ES5 호환 위치에만 사용

### TypeScript 컴파일러 옵션 활용

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

## 상세 개발 패턴

### 1. Repository Pattern 구현

```typescript
// Repository 인터페이스 정의
export interface IGameRepository {
  create(gameData: Partial<Game>): Game;
  save(game: Game): Promise<Game>;
  findById(id: number): Promise<Game | null>;
  findByIdWithRelations(id: number, relations: string[]): Promise<Game | null>;
  delete(id: number): Promise<void>;
}

// 실제 구현
@Injectable()
export class GameRepository implements IGameRepository {
  constructor(
    @InjectRepository(Game)
    private readonly gameRepository: Repository<Game>,
  ) {}

  create(gameData: Partial<Game>): Game {
    return this.gameRepository.create(gameData);
  }

  async save(game: Game): Promise<Game> {
    return this.gameRepository.save(game);
  }

  async findById(id: number): Promise<Game | null> {
    return this.gameRepository.findOne({ where: { id } });
  }

  async findByIdWithRelations(
    id: number, 
    relations: { [key: string]: boolean }
  ): Promise<Game | null> {
    return this.gameRepository.findOne({
      where: { id },
      relations,
    });
  }

  async delete(id: number): Promise<void> {
    await this.gameRepository.delete(id);
  }
}
```

### 2. DTO 검증 규칙

```typescript
// ✅ 올바른 DTO 구현
export class CreateGameRequestDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 20)
  @ApiProperty({ description: '호스트 플레이어 이름', example: '홍길동' })
  hostName: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: '소켓 ID', example: 'socket_123' })
  hostSocketId: string;
}

// ✅ 응답 DTO with factory method
export class GameResponseDto {
  @ApiProperty({ description: '게임 ID' })
  id: number;

  @ApiProperty({ description: '게임 이름' })
  name: string;

  @ApiProperty({ description: '게임 상태', enum: ['waiting', 'playing', 'finished'] })
  status: string;

  @ApiProperty({ description: '참여 플레이어 목록', type: [PlayerResponseDto] })
  players: PlayerResponseDto[];

  static fromEntity(game: Game): GameResponseDto {
    return {
      id: game.id,
      name: game.name,
      status: game.status,
      players: game.players.map(PlayerResponseDto.fromEntity),
    };
  }
}
```

### 3. 에러 처리 표준

```typescript
// Custom Domain Exceptions
export class NotFoundError extends Error {
  constructor(entity: string, criteria: Record<string, any>) {
    super(`${entity} not found with criteria: ${JSON.stringify(criteria)}`);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

// Service에서 사용
export class GameService {
  async getGame(gameId: number): Promise<Game> {
    const game = await this.gameRepository.findById(gameId);
    
    if (!game) {
      throw new NotFoundError('Game', { id: gameId });
    }
    
    return game;
  }
}
```

### 4. Logger 사용 패턴

```typescript
@Injectable({ scope: Scope.TRANSIENT })
export class Logger extends NestLogger {
  log(message: any = ''): void {
    const requestContext = this.cls.get('request-context');
    let contextPart = '';
    
    if (requestContext) {
      const coloredRequestContext = this.wrapString(`(${requestContext})`, LOG_COLOR.GREEN);
      contextPart = `${coloredRequestContext} `;
    }
    
    const formattedMessage = typeof message === 'object' 
      ? JSON.stringify(message, null, 2) 
      : message;
    
    super.log(`${contextPart}${formattedMessage}`);
  }

  error(error: any, message?: string): void {
    const requestContext = this.cls.get('request-context');
    let contextPart = '';
    
    if (requestContext) {
      const coloredRequestContext = this.wrapString(`(${requestContext})`, LOG_COLOR.RED);
      contextPart = `${coloredRequestContext} `;
    }

    let errorMessage = message || '';
    if (error instanceof Error) {
      errorMessage += error.stack || error.message;
    }
    
    super.error(`${contextPart}${errorMessage}`);
  }
}

// 서비스에서 사용
@Injectable()
export class GameService {
  constructor(
    private readonly logger: Logger,
  ) {
    this.logger.setContext(GameService.name);
  }

  async createGame(dto: CreateGameRequestDto): Promise<Game> {
    this.logger.log(`Creating game with host: ${dto.hostName}`);
    
    try {
      // 비즈니스 로직
      const result = await this.performGameCreation(dto);
      this.logger.log(`Game created successfully: ${result.id}`);
      return result;
    } catch (error) {
      this.logger.error(error, 'Failed to create game');
      throw error;
    }
  }
}
```

### 5. WebSocket 이벤트 처리 패턴

```typescript
@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_URL },
  transports: ['websocket'],
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(
    private readonly gameService: GameService,
    private readonly logger: Logger,
  ) {
    this.logger.setContext(GameGateway.name);
  }

  @SubscribeMessage('join-game')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async handleJoinGame(
    @MessageBody() data: JoinGameDto,
    @ConnectedSocket() client: Socket,
  ): Promise<WsResponse<GameResponseDto>> {
    try {
      this.logger.log(`Player joining game: ${data.gameId}`);
      
      const game = await this.gameService.joinGame(
        data.gameId,
        data.playerName,
        client.id,
      );

      // 소켓 룸 참가
      client.join(`game-${data.gameId}`);

      // 다른 플레이어들에게 알림
      client.broadcast
        .to(`game-${data.gameId}`)
        .emit('player-joined', GameResponseDto.fromEntity(game));

      return {
        event: 'game-state',
        data: GameResponseDto.fromEntity(game),
      };
    } catch (error) {
      this.logger.error(error, `Failed to join game: ${data.gameId}`);
      
      client.emit('error', {
        message: error.message,
        code: error.constructor.name,
      });
      
      throw error;
    }
  }

  async handleConnection(client: Socket): Promise<void> {
    this.logger.log(`Client connected: ${client.id}`);
  }

  async handleDisconnect(client: Socket): Promise<void> {
    this.logger.log(`Client disconnected: ${client.id}`);
    
    try {
      // 플레이어를 모든 게임에서 제거
      await this.gameService.removePlayerFromAllGames(client.id);
    } catch (error) {
      this.logger.error(error, `Failed to cleanup player: ${client.id}`);
    }
  }
}
```

### 6. BullMQ Queue 처리 패턴

```typescript
// Queue Service 추상화
@Injectable()
export class QueueService {
  constructor(
    @InjectQueue('event-logs')
    private readonly eventLogsQueue: Queue,
    private readonly cls: ClsService,
  ) {}

  async addEventLogJob(
    gameId: number,
    eventType: string,
    eventData?: Record<string, any>,
  ): Promise<void> {
    const requestContext = this.cls.get('request-context');
    
    await this.eventLogsQueue.add('append', {
      gameId,
      eventType,
      eventData: eventData || {},
      requestContext, // 자동으로 컨텍스트 전달
    });
  }
}

// Processor 구현
@Processor('event-logs')
@Injectable()
export class EventLogsProcessor extends WorkerHost {
  constructor(
    @Inject(GAME_EVENT_REPOSITORY_TOKEN)
    private readonly gameEventRepository: IGameEventRepository,
    private readonly logger: Logger,
    private readonly cls: ClsService,
  ) {
    super();
    this.logger.setContext(EventLogsProcessor.name);
  }

  async process(job: Job<EventLogJobData, any, string>): Promise<void> {
    const { requestContext } = job.data;
    
    // CLS 컨텍스트 복원
    return this.cls.run(async () => {
      if (requestContext) {
        this.cls.set('request-context', requestContext);
      }

      this.logger.log(`Processing event log job: ${job.id}`);

      try {
        const { gameId, eventType, eventData } = job.data;

        const gameEvent = this.gameEventRepository.create({
          gameId,
          eventType,
          eventData: eventData || {},
        });

        const savedEvent = await this.gameEventRepository.save(gameEvent);

        this.logger.log(`Event log saved: ${savedEvent.id}`);
      } catch (error) {
        this.logger.error(error, `Failed to process event log job ${job.id}`);
        throw error; // 재시도를 위해 에러 재발생
      }
    });
  }
}
```

### 7. Entity Business Logic 패턴

```typescript
@Entity('games')
export class Game {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({
    type: 'enum',
    enum: ['waiting', 'playing', 'finished'],
    default: 'waiting',
  })
  status: 'waiting' | 'playing' | 'finished';

  @OneToMany(() => Player, (player) => player.game, {
    cascade: true,
    eager: true,
  })
  players: Player[];

  // 비즈니스 로직 메서드
  canStart(): boolean {
    return (
      this.status === 'waiting' &&
      this.players.length >= 4 &&
      this.players.length <= 8 &&
      this.players.every((p) => p.isReady)
    );
  }

  canAddPlayer(): boolean {
    return this.status === 'waiting' && this.players.length < 8;
  }

  start(): void {
    if (!this.canStart()) {
      throw new ValidationError('Cannot start game: requirements not met');
    }

    this.status = 'playing';
    this.assignRoles();
  }

  private assignRoles(): void {
    const playerCount = this.players.length;
    const mafiaCount = Math.floor(playerCount / 3);
    
    const shuffledPlayers = [...this.players].sort(() => Math.random() - 0.5);
    
    // 역할 배정
    for (let i = 0; i < mafiaCount; i++) {
      shuffledPlayers[i].role = 'mafia';
    }
    
    shuffledPlayers[mafiaCount].role = 'police';
    shuffledPlayers[mafiaCount + 1].role = 'doctor';
    
    for (let i = mafiaCount + 2; i < shuffledPlayers.length; i++) {
      shuffledPlayers[i].role = 'citizen';
    }
  }

  removePlayer(socketId: string): boolean {
    const playerIndex = this.players.findIndex((p) => p.socketId === socketId);
    
    if (playerIndex === -1) {
      return false;
    }

    this.players.splice(playerIndex, 1);
    return true;
  }

  isGameOver(): { isOver: boolean; winner?: 'mafia' | 'citizen' } {
    const alivePlayers = this.players.filter((p) => p.isAlive);
    const aliveMafia = alivePlayers.filter((p) => p.role === 'mafia');
    const aliveCitizens = alivePlayers.filter((p) => p.role !== 'mafia');

    if (aliveMafia.length === 0) {
      return { isOver: true, winner: 'citizen' };
    }

    if (aliveMafia.length >= aliveCitizens.length) {
      return { isOver: true, winner: 'mafia' };
    }

    return { isOver: false };
  }
}
```

### 8. 테스트 작성 패턴

```typescript
describe('GameService', () => {
  let service: GameService;
  let gameRepository: jest.Mocked<IGameRepository>;
  let playerRepository: jest.Mocked<IPlayerRepository>;

  beforeEach(async () => {
    const mockGameRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findById: jest.fn(),
      findByIdWithRelations: jest.fn(),
      delete: jest.fn(),
    };

    const mockPlayerRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findById: jest.fn(),
      findByIdAndGameId: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GameService,
        {
          provide: GAME_REPOSITORY_TOKEN,
          useValue: mockGameRepository,
        },
        {
          provide: PLAYER_REPOSITORY_TOKEN,
          useValue: mockPlayerRepository,
        },
      ],
    }).compile();

    service = module.get<GameService>(GameService);
    gameRepository = module.get(GAME_REPOSITORY_TOKEN);
    playerRepository = module.get(PLAYER_REPOSITORY_TOKEN);
  });

  describe('createGame', () => {
    it('should create game successfully', async () => {
      // Arrange
      const createGameDto = {
        hostName: '홍길동',
        hostSocketId: 'socket_123',
      };

      const mockGame = new Game();
      mockGame.id = 1;
      mockGame.name = '홍길동의 게임';

      gameRepository.create.mockReturnValue(mockGame);
      gameRepository.save.mockResolvedValue(mockGame);

      // Act
      const result = await service.createGame(createGameDto);

      // Assert
      expect(result.gameId).toBe(1);
      expect(result.game).toBe(mockGame);
      expect(gameRepository.create).toHaveBeenCalledWith({
        name: '홍길동의 게임',
        status: 'waiting',
        currentPhase: 'day',
        dayCount: 1,
        remainingTime: 0,
      });
    });

    it('should throw error when host name is invalid', async () => {
      // Arrange
      const createGameDto = {
        hostName: '',
        hostSocketId: 'socket_123',
      };

      // Act & Assert
      await expect(service.createGame(createGameDto)).rejects.toThrow(
        ValidationError,
      );
    });
  });
});
```

## 성능 최적화 가이드라인

### 1. Database Query 최적화

```typescript
// ✅ 올바른 예시 - 필요한 관계만 로드
async getGame(gameId: number): Promise<Game> {
  return this.gameRepository.findByIdWithRelations(gameId, {
    players: true,
    messages: true,
  });
}

// ❌ 잘못된 예시 - 모든 관계 로드
async getGame(gameId: number): Promise<Game> {
  return this.gameRepository.findOne({
    where: { id: gameId },
    relations: ['players', 'messages', 'gameEvents', 'players.votes'],
  });
}
```

### 2. 캐싱 전략

```typescript
@Injectable()
export class GameService {
  private readonly gameCache = new Map<number, Game>();

  async getGame(gameId: number): Promise<Game> {
    // 캐시 확인
    if (this.gameCache.has(gameId)) {
      return this.gameCache.get(gameId);
    }

    // DB에서 조회
    const game = await this.gameRepository.findByIdWithRelations(gameId, {
      players: true,
    });

    if (game) {
      // 캐시에 저장 (5분 후 만료)
      this.gameCache.set(gameId, game);
      setTimeout(() => {
        this.gameCache.delete(gameId);
      }, 5 * 60 * 1000);
    }

    return game;
  }
}
```

### 3. 메모리 누수 방지

```typescript
@WebSocketGateway()
export class GameGateway implements OnGatewayDisconnect {
  private readonly playerSockets = new Map<string, string>(); // socketId -> playerId

  async handleDisconnect(client: Socket): Promise<void> {
    try {
      // 정리 작업
      await this.cleanupPlayer(client.id);
      
      // 메모리에서 제거
      this.playerSockets.delete(client.id);
      
      // 모든 룸에서 제거
      client.leaveAll();
      
    } catch (error) {
      this.logger.error(error, 'Failed to cleanup disconnected client');
    }
  }
}
```

## 보안 고려사항

### 1. 입력 검증

```typescript
// ✅ 모든 입력에 대한 검증
export class CreateGameRequestDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 20)
  @Matches(/^[a-zA-Z0-9가-힣\s]+$/) // 특수문자 제한
  hostName: string;

  @IsString()
  @IsNotEmpty()
  @IsUUID() // UUID 형식 검증
  hostSocketId: string;
}
```

### 2. 권한 검증

```typescript
@Injectable()
export class GameService {
  async updateGameSettings(
    gameId: number, 
    playerId: number, 
    settings: UpdateGameSettingsDto
  ): Promise<Game> {
    const game = await this.getGame(gameId);
    const player = game.players.find(p => p.id === playerId);

    // 호스트 권한 확인
    if (!player?.isHost) {
      throw new ForbiddenError('Only host can update game settings');
    }

    // 게임 상태 확인
    if (game.status !== 'waiting') {
      throw new ConflictError('Cannot update settings during active game');
    }

    return this.applySettings(game, settings);
  }
}
```

### 3. 데이터 노출 방지

```typescript
export class GameResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;

  @ApiProperty()
  status: string;

  // 민감한 정보는 조건부로만 포함
  @ApiPropertyOptional()
  players?: PlayerPublicDto[];

  static fromEntity(game: Game, requestingPlayerId?: number): GameResponseDto {
    const dto = new GameResponseDto();
    dto.id = game.id;
    dto.name = game.name;
    dto.status = game.status;

    // 플레이어 정보는 필터링하여 제공
    dto.players = game.players.map(player => 
      PlayerPublicDto.fromEntity(player, requestingPlayerId)
    );

    return dto;
  }
}
```