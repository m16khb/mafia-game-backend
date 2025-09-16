# CLAUDE.md

This file provides high-level guidance to Claude Code (claude.ai/code) when working with this repository. For detailed code rules and implementation patterns, see `.claude/CLAUDE.md`.

## Project Overview

**Mafia Game Backend** - Real-time multiplayer mafia game backend built with NestJS, TypeORM, MySQL, Redis, and Socket.IO using Layered Architecture.

**Key URLs:**

- API Server: http://localhost:3000
- WebSocket Server: ws://localhost:3000
- Swagger API Docs: http://localhost:3000/api/docs
- Bull Queue Dashboard: http://localhost:3000/admin/queues
- Frontend Client: http://localhost:3001 (separate project)

## Package Manager

**IMPORTANT: Always use npm, never use pnpm or yarn for this project.**

## Development Commands

```bash
npm install                  # Install dependencies
npm run start:dev           # Start development server with watch mode (port 3000)
npm run start:debug         # Start with debugging and watch mode
npm run build               # Build application
npm run test                # Run unit tests with Jest
npm run test:watch          # Run tests in watch mode
npm run test:cov            # Run tests with coverage report
npm run test:e2e            # Run end-to-end tests
npm run format              # Format code with Prettier
npm run lint                # Run ESLint with auto-fix
```

**Development Infrastructure:**

```bash
docker-compose up -d        # Start MySQL & Redis containers
docker-compose down         # Stop containers
```

## Architecture Overview

This project uses **Layered Architecture** with the following structure:

### Core Layers

```
src/
├── entities/               # TypeORM entities with business logic
│   ├── game.entity.ts     # Core game entity with business methods
│   ├── player.entity.ts   # Player entity with role management
│   ├── message.entity.ts  # Chat message entity
│   └── game-event.entity.ts # Event logging entity
├── modules/               # Feature modules (domain-driven)
│   ├── game/              # Game module
│   │   ├── dtos/          # Game-specific DTOs
│   │   ├── game.controller.ts
│   │   ├── game.service.ts
│   │   ├── game.gateway.ts
│   │   ├── game.repository.ts
│   │   └── game.module.ts
│   ├── player/            # Player module
│   │   ├── dtos/          # Player-specific DTOs
│   │   ├── player.service.ts
│   │   ├── player.repository.ts
│   │   └── player.module.ts
│   ├── message/           # Message module
│   │   ├── dtos/          # Message-specific DTOs
│   │   ├── message.service.ts
│   │   ├── message.repository.ts
│   │   └── message.module.ts
│   ├── game-event/        # Game event module
│   │   ├── event-logs.processor.ts
│   │   ├── game-event.service.ts
│   │   ├── game-event.repository.ts
│   │   └── game-event.module.ts
│   └── health/            # Health check module
│       ├── dtos/          # Health-specific DTOs
│       ├── health.controller.ts
│       └── health.module.ts
├── libs/                  # Shared libraries (@libs alias)
│   ├── redis/             # Redis module
│   │   ├── redis.service.ts
│   │   ├── redis-io.adapter.ts
│   │   ├── redis.module.ts
│   │   └── index.ts
│   ├── ai/                # AI player management (NEW - feature/001-ai-5)
│   │   ├── ai.service.ts
│   │   ├── ai.module.ts
│   │   ├── personas/      # AI personality definitions
│   │   └── strategies/    # Role-specific AI strategies
│   ├── llm/               # LLM integration (NEW - feature/001-ai-5)
│   │   ├── llm.service.ts
│   │   ├── llm.module.ts
│   │   └── prompts/       # Prompt templates
│   ├── errors/            # Custom error classes
│   ├── filters/           # Exception filters
│   ├── interceptors/      # Request/response interceptors
│   ├── repositories/      # Repository interfaces & tokens
│   └── shared/dtos/       # Shared DTOs (ApiResponse, etc.)
├── app.module.ts          # Main application module
└── main.ts                # Application bootstrap with Fastify
```

### Key Technologies

- **Framework**: NestJS v11 with Fastify adapter (not Express)
- **Database**: MySQL 8 with TypeORM (synchronize enabled in dev)
- **WebSocket**: Socket.IO with Redis adapter for scaling
- **Queue**: BullMQ with Redis for background jobs
- **Validation**: class-validator & class-transformer
- **Documentation**: Swagger/OpenAPI at `/api/docs`
- **Monitoring**: Bull Board dashboard at `/admin/queues`
- **Testing**: Jest with SuperTest for e2e tests
- **AI Integration**: OpenRouter API for LLM services (feature/5-feature-create-llmservice)

## Business Logic Patterns

### Entity-Driven Business Logic

Entities contain core business methods and validation:

```typescript
// Game entity contains business logic
class Game {
  canStart(): boolean {
    return (
      this.status === 'waiting' &&
      this.players.length >= this.minPlayers &&
      this.players.every((p) => p.isReady)
    );
  }

  start(): void {
    if (!this.canStart()) {
      throw new Error('Cannot start game');
    }
    this.assignRoles();
    this.status = 'playing';
    // ... more logic
  }

  // Type-safe role management
  getMafiaPlayers(): Player[] {
    return this.players.filter((p) => p.isMafia() && p.isAlive);
  }
}
```

### Service Layer Pattern

Services orchestrate business operations with repository pattern and dependency inversion:

```typescript
@Injectable()
export class GameService {
  constructor(
    @Inject(GAME_REPOSITORY_TOKEN)
    private readonly gameRepository: IGameRepository,
    @Inject(PLAYER_REPOSITORY_TOKEN)
    private readonly playerRepository: IPlayerRepository,
    @InjectQueue('event-logs') private eventLogsQueue: Queue,
  ) {}

  async createGame(
    hostName: string,
    socketId: string,
  ): Promise<{ gameId: number; game: Game }> {
    // Business orchestration
    const game = this.gameRepository.create({ name: `${hostName}의 게임` });
    const savedGame = await this.gameRepository.save(game);

    // Queue background job
    await this.addEventLogJob(savedGame.id, 'game-created', { hostName });

    return { gameId: savedGame.id, game: savedGame };
  }
}
```

### WebSocket Event Handling

Real-time communication uses Socket.IO with room-based broadcasting:

```typescript
@WebSocketGateway({ cors: { origin: process.env.FRONTEND_URL } })
export class GameGateway {
  @SubscribeMessage('join-game')
  async handleJoinGame(
    @MessageBody() data: { gameId: number; playerName: string },
    @ConnectedSocket() client: Socket,
  ) {
    const game = await this.gameService.joinGame(
      data.gameId,
      data.playerName,
      client.id,
    );

    // Join socket room for game-specific events
    client.join(`game-${data.gameId}`);

    // Broadcast to all players in the game
    this.server
      .to(`game-${data.gameId}`)
      .emit('player-joined', GameResponseDto.fromEntity(game));
  }
}
```

## Data Flow Architecture

### Request/Response Flow

1. **REST API**: HTTP requests → Controllers → Services → Entities → Database
2. **WebSocket**: Socket events → Gateways → Services → Entities → Database
3. **Background Jobs**: Services → BullMQ → EventLogsProcessor → Database

### Error Handling Strategy

- Custom domain exceptions in `@libs/errors/`
- Global exception filter `DomainExceptionFilter`
- Type-safe error responses in module-specific DTOs

### Queue Processing

Background event logging using BullMQ:

```typescript
// Add job in service
await this.eventLogsQueue.add('log-event', {
  gameId: game.id,
  eventType: 'player-joined',
  eventData: { playerName, playerId },
});

// Process in background
@Processor('event-logs')
export class EventLogsProcessor extends WorkerHost {
  async process(job: Job<EventLogJobData>): Promise<void> {
    // Save to database asynchronously
  }
}
```

## Database Design

### Entity Relationships

- **Game** ↔ **Player** (One-to-Many with cascade)
- **Game** ↔ **Message** (One-to-Many with eager loading)
- **Game** ↔ **GameEvent** (One-to-Many for audit trail)

### Important Database Features

- **Auto-increment IDs** for all entities
- **Enum types** for game status, phases, and roles
- **Eager loading** for players and messages on Game entity
- **Cascade operations** for related entities
- **Synchronize enabled** in development (auto-schema updates)

## Testing Strategy

### Test Structure

- **Unit tests**: `*.spec.ts` files alongside source code
- **E2E tests**: `/test/*.e2e-spec.ts` files using SuperTest
- **Test configuration**: Jest with ts-jest transformer
- **Coverage**: Available via `npm run test:cov`

### Running Specific Tests

```bash
npm test -- --testPathPattern=game.service  # Run specific service tests
npm run test:e2e                           # Run all e2e tests
npm run test:watch                         # Watch mode for development
```

## Environment Configuration

Required environment variables:

```
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=mafia_user
DB_PASSWORD=mafia_pass123
DB_DATABASE=mafia_game
REDIS_HOST=localhost
REDIS_PORT=6379
FRONTEND_URL=http://localhost:3000
NODE_ENV=development

# AI Integration (feature/001-ai-5)
OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_MODEL_ROUTINE=anthropic/claude-3-haiku
OPENROUTER_MODEL_STRATEGY=openai/gpt-4-turbo
OPENROUTER_DAILY_LIMIT=10.00
AI_DECISION_TIMEOUT=30000
AI_CONCURRENT_LIMIT=5
AI_CACHE_TTL=30
AI_DEFAULT_PERSONALITY_SET=default
```

## TypeScript Architecture

### Advanced Type Safety Features

This project leverages advanced TypeScript features for compile-time safety:

- **Branded Types**: Prevent ID mix-ups with type-safe identifiers
- **Template Literal Types**: Type-safe string patterns for events and routes
- **Conditional Types**: Different return shapes based on input parameters
- **Discriminated Unions**: Type-safe state management
- **Assertion Functions**: Runtime validation with compile-time narrowing
- **Mapped Types**: Type-safe validation and transformation rules

### TypeScript Configuration

Strict TypeScript configuration with:
- `strict: true`
- `noImplicitAny: true` 
- `strictNullChecks: true`
- `noUncheckedIndexedAccess: true`
- `exactOptionalPropertyTypes: true`

### Code Quality Standards

- **ESLint**: TypeScript strict mode with `@typescript-eslint` rules
- **Prettier**: Consistent formatting (single quotes, 2-space indent, 80 chars)
- **Validation**: All DTOs use class-validator decorators
- **Error Handling**: Custom domain exceptions only
- **Dependency Injection**: NestJS container for all services

## Development Workflow

When implementing new features:

1. **Define DTOs** with validation in respective module `dtos/` folders
2. **Create repository interface** in `@libs/repositories/` if needed
3. **Implement repository** in the module with dependency injection
4. **Update entities** with business logic if needed
5. **Implement service methods** with repository interfaces for orchestration
6. **Add controller endpoints** for REST API
7. **Add gateway handlers** for WebSocket events
8. **Test with Swagger UI** at http://localhost:3000/api/docs
9. **Run linting and tests** before committing

## Infrastructure Dependencies

### Required Services

- **MySQL 8**: Primary database (docker-compose provided)
- **Redis**: Session storage and Socket.IO adapter (docker-compose provided)
- **Node.js 18+**: Runtime environment
- **Frontend client**: Separate project consuming this API

### Key Features

- **Real-time gameplay**: Socket.IO with Redis scaling
- **Background processing**: BullMQ for event logging
- **API documentation**: Auto-generated Swagger UI
- **Queue monitoring**: Bull Board dashboard
- **Health checks**: `/health` endpoint for monitoring
