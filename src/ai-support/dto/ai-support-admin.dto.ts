import { IsBoolean } from 'class-validator';

export class PatchAiSupportSettingsDto {
  @IsBoolean()
  enabled!: boolean;
}
