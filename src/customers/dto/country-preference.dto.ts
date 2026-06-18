import { IsBoolean } from 'class-validator';

export class UpsertCountryPreferenceDto {
  @IsBoolean()
  codOnly: boolean;
}
