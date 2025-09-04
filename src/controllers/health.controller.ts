import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { HealthCheckResponseDto } from '@/common/dtos/response.dtos';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({
    summary: '헬스 체크',
    description: 'API 서버 상태를 확인하는 헬스 체크 엔드포인트',
  })
  @ApiOkResponse({
    description: '서버 정상 동작',
    type: HealthCheckResponseDto,
  })
  async healthCheck(): Promise<HealthCheckResponseDto> {
    return { ok: true } as const;
  }

  @Get('status')
  @ApiOperation({
    summary: '서버 상태 정보',
    description: '서버의 상태와 기본 정보를 반환합니다.',
  })
  @ApiOkResponse({
    description: '서버 상태 정보',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'healthy' },
        timestamp: { type: 'string', example: '2025-01-01T00:00:00.000Z' },
        uptime: { type: 'number', example: 12345 },
        version: { type: 'string', example: '2.0.0' },
        environment: { type: 'string', example: 'development' },
      },
    },
  })
  async getStatus() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
    };
  }
}
