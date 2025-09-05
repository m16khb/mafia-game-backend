# Mafia Game Backend

A real-time multiplayer Mafia game backend built with **NestJS**, **TypeORM**, **MySQL**, **Redis**, and **Socket.IO** using modern **Modular Architecture** with **Repository Pattern** and **Dependency Inversion**.

## 🚀 Features

- **Real-time Multiplayer**: Socket.IO with Redis adapter for scalable real-time gameplay
- **Modular Architecture**: Domain-driven module structure with clean separation of concerns  
- **Repository Pattern**: Interface-based data access with dependency inversion
- **Type Safety**: Advanced TypeScript patterns for compile-time safety
- **Background Processing**: BullMQ for event logging and job processing
- **API Documentation**: Auto-generated Swagger UI
- **Queue Monitoring**: Bull Board dashboard for job monitoring
- **Health Checks**: Built-in health check endpoints
- **Production Ready**: Docker support and comprehensive testing

## 🛠 Tech Stack

- **Framework**: [NestJS v11](https://nestjs.com/) with Fastify adapter
- **Database**: [MySQL 8](https://www.mysql.com/) with [TypeORM](https://typeorm.io/)
- **Real-time**: [Socket.IO](https://socket.io/) with Redis adapter
- **Queue**: [BullMQ](https://bullmq.io/) with Redis
- **Validation**: [class-validator](https://github.com/typestack/class-validator) & [class-transformer](https://github.com/typestack/class-transformer)
- **Documentation**: [Swagger/OpenAPI](https://swagger.io/)
- **Testing**: [Jest](https://jestjs.io/) with SuperTest

## 📁 Project Structure

```
src/
├── entities/               # TypeORM entities with business logic
│   ├── game.entity.ts     # Core game entity
│   ├── player.entity.ts   # Player entity  
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
│   ├── message/           # Message module
│   ├── game-event/        # Game event module
│   └── health/            # Health check module
├── libs/                  # Shared libraries (@libs alias)
│   ├── redis/             # Redis module
│   ├── errors/            # Custom error classes
│   ├── filters/           # Exception filters
│   ├── interceptors/      # Request/response interceptors
│   ├── repositories/      # Repository interfaces & DI tokens
│   └── shared/dtos/       # Shared DTOs
├── app.module.ts          # Main application module
└── main.ts                # Application bootstrap
```

## 🏃‍♂️ Quick Start

### Prerequisites

- **Node.js 18+**
- **Docker & Docker Compose** (for MySQL & Redis)
- **npm** (package manager)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd mafia-game-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   # Copy and configure your environment variables
   cp .env.example .env
   ```

4. **Start infrastructure services**
   ```bash
   docker-compose up -d
   ```

5. **Run the application**
   ```bash
   # Development mode with hot reload
   npm run start:dev
   
   # Debug mode
   npm run start:debug
   
   # Production mode
   npm run start:prod
   ```

## 📊 Available Endpoints

### API Documentation
- **Swagger UI**: `http://localhost:3000/api/docs`
- **API Server**: `http://localhost:3000`
- **WebSocket**: `ws://localhost:3000`

### Admin Dashboards
- **Bull Queue Dashboard**: `http://localhost:3000/admin/queues`
- **Health Check**: `http://localhost:3000/health`

### Core API Endpoints
- `GET /games` - Get all games
- `POST /games` - Create new game
- `GET /games/:id` - Get game details
- `POST /games/:id/join` - Join game
- `POST /games/:id/start` - Start game

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode  
npm run test:watch

# Run tests with coverage
npm run test:cov

# Run E2E tests
npm run test:e2e

# Run specific test
npm test -- --testPathPattern=game.service
```

## 🔧 Development

### Code Quality

```bash
# Format code
npm run format

# Lint and fix
npm run lint

# Build application
npm run build
```

### Architecture Patterns

**Repository Pattern**: All data access is abstracted through interfaces
```typescript
// Interface in @libs/repositories
export interface IGameRepository {
  findById(id: number): Promise<Game | null>;
  save(game: Game): Promise<Game>;
}

// Implementation in module
@Injectable()
export class GameRepository implements IGameRepository {
  // Implementation details
}

// Service uses interface
export class GameService {
  constructor(
    @Inject(GAME_REPOSITORY_TOKEN)
    private readonly gameRepository: IGameRepository,
  ) {}
}
```

**Dependency Inversion**: Services depend on abstractions, not concrete implementations

**Domain-Driven Design**: Features organized by business domains (game, player, message)

## 🏗 Key Features

### Real-time Game Events
- Player join/leave
- Game state changes  
- Chat messages
- Game phase transitions

### Background Processing
- Event logging
- Game statistics
- Audit trails

### Type Safety
- Advanced TypeScript patterns
- Branded types for ID safety
- Template literal types
- Discriminated unions

### Error Handling
- Custom domain exceptions
- Global exception filters
- Structured error responses

## 🚀 Production Deployment

The application is production-ready with:

- **Docker support** for containerization
- **Health check endpoints** for monitoring
- **Structured logging** for observability
- **Graceful shutdown** handling
- **Environment-based configuration**

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes following the established patterns
4. Add tests for new functionality
5. Ensure all tests pass (`npm test`)
6. Run linting (`npm run lint`)
7. Commit your changes (`git commit -m 'Add amazing feature'`)
8. Push to the branch (`git push origin feature/amazing-feature`)
9. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🎯 Game Rules

**Mafia** is a party game of deduction and social interaction:

- **Citizens**: Identify and eliminate all Mafia members
- **Mafia**: Eliminate Citizens while remaining undetected  
- **Special Roles**: Police (investigate), Doctor (protect)
- **Phases**: Day (discussion/voting) and Night (special actions)
- **Victory**: Citizens win by eliminating all Mafia, Mafia wins by equaling/outnumbering Citizens

---

Built with ❤️ using modern NestJS architecture patterns