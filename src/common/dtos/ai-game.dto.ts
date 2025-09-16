import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsEnum,
  IsOptional,
  IsBoolean,
  Min,
  Max,
  IsArray,
} from 'class-validator';

export enum AIDifficultyLevel {
  EASY = 'easy',
  MEDIUM = 'medium',
  HARD = 'hard',
}

export class CreateAIGameRequestDto {
  @ApiProperty({ description: '호스트 플레이어 이름', example: '홍길동' })
  @IsString()
  @IsNotEmpty()
  hostName: string;

  @ApiProperty({ description: '호스트 소켓 ID', example: 'socket_abc123' })
  @IsString()
  @IsNotEmpty()
  hostSocketId: string;

  @ApiProperty({
    description: 'AI 플레이어 수',
    example: 5,
    minimum: 1,
    maximum: 5,
  })
  @IsNumber()
  @Min(1)
  @Max(5)
  aiPlayerCount: number;

  @ApiPropertyOptional({
    description: 'AI 난이도 레벨',
    enum: AIDifficultyLevel,
    default: AIDifficultyLevel.MEDIUM,
  })
  @IsOptional()
  @IsEnum(AIDifficultyLevel)
  aiDifficultyLevel?: AIDifficultyLevel;

  @ApiPropertyOptional({
    description: 'AI 페르소나 세트',
    example: 'default',
    default: 'default',
  })
  @IsOptional()
  @IsString()
  aiPersonalitySet?: string;
}

export class StartAIGameRequestDto {
  @ApiProperty({ description: '게임 ID', example: 1 })
  @IsNumber()
  gameId: number;

  @ApiProperty({
    description: '시작하는 플레이어의 소켓 ID',
    example: 'socket_abc123',
  })
  @IsString()
  @IsNotEmpty()
  socketId: string;
}

export class AIDecisionResponseDto {
  @ApiProperty({ description: 'AI 결정 ID', example: 1 })
  id: number;

  @ApiProperty({ description: '플레이어 ID', example: 2 })
  playerId: number;

  @ApiProperty({ description: '결정 타입', example: 'vote' })
  decisionType: string;

  @ApiProperty({
    description: '결정 대상',
    example: 'Player3',
    required: false,
  })
  target?: string;

  @ApiProperty({
    description: '결정 메시지',
    example: 'I think Player3 is suspicious',
    required: false,
  })
  message?: string;

  @ApiProperty({
    description: '추론',
    example: 'Based on voting patterns',
    required: false,
  })
  reasoning?: string;

  @ApiProperty({ description: '신뢰도', example: 8 })
  confidence: number;

  @ApiProperty({ description: '처리 시간 (ms)', example: 450 })
  processingTime: number;

  @ApiProperty({ description: '결정 시간' })
  createdAt: Date;
}

export class AIPersonaResponseDto {
  @ApiProperty({ description: 'AI 페르소나 ID', example: 1 })
  id: number;

  @ApiProperty({
    description: '페르소나 이름',
    example: 'analytical_detective',
  })
  name: string;

  @ApiProperty({
    description: '성격 특성',
    example: ['logical', 'suspicious', 'methodical'],
  })
  traits: string[];

  @ApiProperty({ description: '의사소통 스타일', example: 'analytical' })
  communicationStyle: string;

  @ApiProperty({ description: '위험 감수 성향', example: 'low' })
  riskTolerance: string;

  @ApiProperty({ description: '투표 성향', example: 'late' })
  votingTendency: string;

  @ApiProperty({ description: '기본 의심 수준', example: 8 })
  suspicionLevel: number;

  @ApiProperty({ description: '기만 능력', example: 6 })
  deceptionSkill: number;

  @ApiProperty({ description: '게임 플레이 횟수', example: 15 })
  gamesPlayed: number;

  @ApiProperty({ description: '승률', example: 0.67 })
  winRate: number;

  @ApiProperty({ description: '페르소나 설명', required: false })
  description?: string;
}

export class AIGameStatsResponseDto {
  @ApiProperty({ description: '총 결정 수', example: 45 })
  totalDecisions: number;

  @ApiProperty({ description: '평균 신뢰도', example: 7.2 })
  averageConfidence: number;

  @ApiProperty({ description: '평균 처리 시간 (ms)', example: 650 })
  averageProcessingTime: number;

  @ApiProperty({ description: '성공률', example: 0.78 })
  successRate: number;

  @ApiProperty({ description: '예상 비용 ($)', example: 0.15 })
  estimatedCost: number;

  @ApiProperty({ description: '결정 타입별 통계' })
  decisionsByType: Record<string, number>;
}

export class HumanVoteRequestDto {
  @ApiProperty({ description: '게임 ID', example: 1 })
  @IsNumber()
  gameId: number;

  @ApiProperty({ description: '플레이어 소켓 ID', example: 'socket_abc123' })
  @IsString()
  @IsNotEmpty()
  socketId: string;

  @ApiProperty({ description: '투표 대상', example: 'Player2' })
  @IsString()
  @IsNotEmpty()
  target: string;
}

export class AIGameResponseDto {
  @ApiProperty({ description: '게임 ID', example: 1 })
  id: number;

  @ApiProperty({ description: '게임 이름', example: '홍길동의 AI 게임' })
  name: string;

  @ApiProperty({ description: '게임 상태', example: 'playing' })
  status: string;

  @ApiProperty({ description: '현재 페이즈', example: 'day_discussion' })
  currentPhase: string;

  @ApiProperty({ description: '현재 일차', example: 2 })
  dayCount: number;

  @ApiProperty({ description: 'AI 플레이어 수', example: 5 })
  aiPlayerCount: number;

  @ApiProperty({ description: 'AI 난이도 레벨', example: 'medium' })
  aiDifficultyLevel: string;

  @ApiProperty({ description: 'AI 결정 완료 여부', example: false })
  aiDecisionsComplete: boolean;

  @ApiProperty({ description: '페이즈 남은 시간 (초)', example: 120 })
  phaseRemainingTime: number;

  @ApiProperty({ description: '참여 플레이어 목록' })
  players: Array<{
    id: number;
    name: string;
    role?: string;
    isAlive: boolean;
    isAi: boolean;
    aiPersonaName?: string;
  }>;

  @ApiProperty({ description: '게임 생성 시간' })
  createdAt: Date;

  @ApiProperty({ description: '게임 시작 시간', required: false })
  startedAt?: Date;
}

export class AISystemHealthResponseDto {
  @ApiProperty({ description: 'LLM 서비스 상태', example: true })
  llmService: boolean;

  @ApiProperty({ description: '사용 가능한 페르소나 수', example: 5 })
  personaCount: number;

  @ApiProperty({ description: '시스템 상태', example: 'healthy' })
  status: 'healthy' | 'degraded' | 'unhealthy';

  @ApiProperty({ description: 'LLM 사용 통계' })
  usageStats: {
    dailySpent: number;
    dailyLimit: number;
    requestCount: number;
    remainingBudget: number;
  };
}

export class CreatePersonaRequestDto {
  @ApiProperty({ description: '페르소나 이름', example: 'strategic_analyst' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: '성격 특성 (2-5개)',
    example: ['analytical', 'patient', 'observant'],
  })
  @IsArray()
  @IsString({ each: true })
  traits: string[];

  @ApiProperty({
    description: '의사소통 스타일',
    enum: ['aggressive', 'analytical', 'emotional', 'quiet'],
    example: 'analytical',
  })
  @IsEnum(['aggressive', 'analytical', 'emotional', 'quiet'])
  communicationStyle: 'aggressive' | 'analytical' | 'emotional' | 'quiet';

  @ApiProperty({
    description: '위험 감수 성향',
    enum: ['high', 'medium', 'low'],
    example: 'medium',
  })
  @IsEnum(['high', 'medium', 'low'])
  riskTolerance: 'high' | 'medium' | 'low';

  @ApiProperty({
    description: '투표 성향',
    enum: ['early', 'late', 'follower', 'leader'],
    example: 'late',
  })
  @IsEnum(['early', 'late', 'follower', 'leader'])
  votingTendency: 'early' | 'late' | 'follower' | 'leader';

  @ApiProperty({
    description: '기본 의심 수준 (1-10)',
    example: 7,
    minimum: 1,
    maximum: 10,
  })
  @IsNumber()
  @Min(1)
  @Max(10)
  suspicionLevel: number;

  @ApiProperty({
    description: '기만 능력 (1-10)',
    example: 5,
    minimum: 1,
    maximum: 10,
  })
  @IsNumber()
  @Min(1)
  @Max(10)
  deceptionSkill: number;

  @ApiPropertyOptional({ description: '페르소나 설명' })
  @IsOptional()
  @IsString()
  description?: string;
}
