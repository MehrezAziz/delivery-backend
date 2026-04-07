import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class OcrExtractedDataDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  idNumber?: string;

  @IsOptional()
  @IsString()
  dateOfBirth?: string;
}

export class DeclaredProfileDataDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  idNumber?: string;

  @IsOptional()
  @IsString()
  dateOfBirth?: string;
}

export class FaceComparisonDto {
  @IsNumber()
  @Min(-1)
  @Max(1)
  similarity: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;
}

export class LivenessStepResultDto {
  @IsIn(['TURN_LEFT', 'TURN_RIGHT', 'BLINK'])
  action: 'TURN_LEFT' | 'TURN_RIGHT' | 'BLINK';

  @IsBoolean()
  passed: boolean;
}

export class LivenessResultDto {
  @IsBoolean()
  passed: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LivenessStepResultDto)
  steps?: LivenessStepResultDto[];
}

export class VerifyDocumentSubmissionDto {
  @ValidateNested()
  @Type(() => OcrExtractedDataDto)
  ocr: OcrExtractedDataDto;

  @ValidateNested()
  @Type(() => DeclaredProfileDataDto)
  declared: DeclaredProfileDataDto;

  @ValidateNested()
  @Type(() => FaceComparisonDto)
  face: FaceComparisonDto;

  @ValidateNested()
  @Type(() => LivenessResultDto)
  liveness: LivenessResultDto;

  @IsOptional()
  @IsObject()
  rawEngineOutput?: Record<string, unknown>;
}

export class CreateLivenessChallengeDto {
  @IsOptional()
  @IsString()
  @IsIn(['LOW', 'MEDIUM'])
  level?: 'LOW' | 'MEDIUM';
}
