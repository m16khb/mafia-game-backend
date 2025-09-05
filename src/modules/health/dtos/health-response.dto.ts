import { ApiProperty } from "@nestjs/swagger";

export class HealthCheckResponseDto {
  @ApiProperty({ description: "서버 상태", example: true })
  ok: true;
}
