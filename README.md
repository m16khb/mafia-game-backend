# Mafia Game Backend

NestJS-based REST API and WebSocket server for the AI Mafia Game with TypeORM, MySQL, and Redis integration using Layered Architecture.

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- MySQL 8.0+
- Redis 6.0+
- npm (included with Node.js)

### Installation & Setup

1. **Install Dependencies**:

   ```bash
   npm install
   ```

2. **Environment Configuration**:

   ```bash
   cp .env.example .env
   # Edit .env with your database and Redis credentials
   ```

3. **Database Setup**:

   ```bash
   # Create MySQL database
   mysql -u root -p
   CREATE DATABASE mafia_game;

   # The application will auto-create tables on first run
   ```

4. **Start Development Server**:

   ```bash
   npm run start:dev
   ```

5. **Access Services**:
   - **API Server**: http://localhost:3000
   - **Swagger API Docs**: http://localhost:3000/api/docs
   - **WebSocket Server**: ws://localhost:3000

## 🏗️ Architecture

### Layered Architecture

- **Entity Layer**: TypeORM entities with embedded business logic
- **Service Layer**: Business logic and game rules
- **Controller Layer**: REST API endpoints with DTO validation
- **Gateway Layer**: Socket.IO real-time communication

### Key Technologies

- **Framework**: NestJS v11 with Fastify adapter
- **Database**: MySQL with TypeORM
- **WebSocket**: Socket.IO with Redis adapter
- **Validation**: class-validator & class-transformer
- **Documentation**: Swagger/OpenAPI
- **Testing**: Jest with SuperTest

## 📚 Development

### Available Scripts

```bash
npm run start:dev           # Development with watch mode
npm run start:debug         # Development with debugging
npm run build               # Build for production
npm run start:prod          # Start production server
npm run test                # Run unit tests
npm run test:watch          # Run tests in watch mode
npm run test:cov            # Run tests with coverage
npm run test:e2e            # Run end-to-end tests
npm run lint                # Run ESLint with auto-fix
npm run format              # Format code with Prettier
```

### Environment Variables

See `.env.example` for all available configuration options.

### API Documentation

Visit http://localhost:3000/api/docs for interactive Swagger documentation.

## 🔧 Advanced TypeScript Features

This project showcases advanced TypeScript patterns:

- **Type Inference**: Leveraging TypeScript's powerful inference engine
- **Branded Types**: Enhanced type safety for IDs and critical values
- **Conditional Types**: Complex type relationships and transformations
- **Generic Constraints**: Flexible yet constrained generic programming
- **Discriminated Unions**: Type-safe error handling and state management

For detailed TypeScript usage patterns, see [CLAUDE.md](./CLAUDE.md).

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:cov

# Run e2e tests
npm run test:e2e
```

## 🚢 Production Deployment

1. **Build the application**:

   ```bash
   npm run build
   ```

2. **Set production environment**:

   ```bash
   export NODE_ENV=production
   ```

3. **Start production server**:
   ```bash
   npm run start:prod
   ```

## 📖 Documentation

- [CLAUDE.md](./CLAUDE.md) - Comprehensive development guide with advanced TypeScript patterns
- [Swagger API Docs](http://localhost:3000/api/docs) - Interactive API documentation

## 🤝 Contributing

1. Follow the established TypeScript patterns documented in CLAUDE.md
2. Write comprehensive tests for new features
3. Update documentation when adding new patterns
4. Use conventional commit messages

## 📄 License

MIT License
