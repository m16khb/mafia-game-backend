import { ApiProperty } from '@nestjs/swagger';

export class ApiResponse<T> {
  @ApiProperty({ description: '성공 여부', example: true })
  success: boolean;

  @ApiProperty({ description: '응답 데이터' })
  data: T;

  @ApiProperty({
    description: '응답 메시지',
    example: '요청이 성공적으로 처리되었습니다.',
  })
  message: string;

  @ApiProperty({
    description: '에러 코드',
    required: false,
    example: 'VALIDATION_ERROR',
  })
  errorCode?: string;

  @ApiProperty({ description: '타임스탬프', example: '2024-01-15T10:30:00Z' })
  timestamp?: string;

  constructor(success: boolean, data: T, message: string, errorCode?: string) {
    this.success = success;
    this.data = data;
    this.message = message;
    this.errorCode = errorCode;
    this.timestamp = new Date().toISOString();
  }

  static success<T>(
    data: T,
    message = '요청이 성공적으로 처리되었습니다.',
  ): ApiResponse<T> {
    return new ApiResponse(true, data, message);
  }

  static error<T>(message: string, errorCode?: string): ApiResponse<T> {
    return new ApiResponse(false, null as T, message, errorCode);
  }
}
