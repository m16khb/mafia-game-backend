import { ApiProperty } from "@nestjs/swagger";

export class ApiResponseDto {
  @ApiProperty({ description: "성공 여부", example: true })
  success: boolean;

  @ApiProperty({ description: "응답 메시지", required: false })
  message?: string;

  @ApiProperty({ description: "에러 코드", required: false })
  error?: string;
}
