import { IsString, IsUUID, Length, Matches } from 'class-validator';

export class UnlockGameCodeDto {
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code: string;
}

export class SubmitGameAnswerDto {
  @IsUUID()
  questionId: string;

  @IsUUID()
  optionId: string;
}

export class MarkCongratsShownDto {
  @IsUUID()
  winnerId: string;
}
