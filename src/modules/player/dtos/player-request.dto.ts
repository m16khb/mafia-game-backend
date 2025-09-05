import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean } from "class-validator";

export class UpdatePlayerReadyRequestDto {
  @ApiProperty({
    description: "준비 상태",
    example: true,
  })
  @IsBoolean()
  isReady: boolean;
}
