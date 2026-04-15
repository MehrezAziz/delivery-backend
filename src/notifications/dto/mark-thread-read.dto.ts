import { IsString, MinLength } from 'class-validator';

export class MarkThreadReadDto {
  @IsString()
  @MinLength(3)
  groupKey!: string;
}
