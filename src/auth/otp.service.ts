import {
  Injectable,
  Logger,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { UserRole } from '@prisma/client';
import { OtpData } from './dto/jwt-payload.interface';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  // Redis key prefixes
  private readonly OTP_PREFIX = 'otp:';
  private readonly RATE_PREFIX = 'otp_rate:';

  // Config
  private readonly OTP_TTL_SECONDS = 300;        // 5 minutes
  private readonly MAX_ATTEMPTS = 5;
  private readonly RATE_LIMIT_WINDOW = 3600;      // 1 hour
  private readonly RATE_LIMIT_MAX_SENDS = 5;      // max OTPs per hour per phone
  private readonly isDev: boolean;

  constructor(
    private readonly configService: ConfigService,
    @InjectRedis() private readonly redis: Redis,
  ) {
    this.isDev = configService.get<string>('NODE_ENV') !== 'production';
  }

  /**
   * Generate and send OTP to phone number
   */
  async sendOtp(phone: string, role: UserRole): Promise<{ expiresInSeconds: number; otp?: string }> {
    // Rate limit: max 5 OTPs per hour per phone
    await this.checkRateLimit(phone);

    // Generate 6-digit OTP
    const otp = this.generateOtp();

    // Store in Redis with TTL
    const otpData: OtpData = {
      otp,
      phone,
      role,
      attempts: 0,
      createdAt: Date.now(),
    };

    const key = this.buildOtpKey(phone, role);
    await this.redis.setex(key, this.OTP_TTL_SECONDS, JSON.stringify(otpData));

    // Increment rate limit counter
    const rateKey = this.buildRateKey(phone);
    await this.redis.incr(rateKey);
    await this.redis.expire(rateKey, this.RATE_LIMIT_WINDOW);

    await this.deliverOtp(phone, otp);

    this.logger.log(`OTP sent to ${phone} for role ${role}`);

    // In dev mode, return OTP directly for testing
    if (this.isDev) {
      return { expiresInSeconds: this.OTP_TTL_SECONDS, otp };
    }

    return { expiresInSeconds: this.OTP_TTL_SECONDS };
  }

  /**
   * Verify OTP — returns true if valid, throws if not
   */
  async verifyOtp(phone: string, role: UserRole, submittedOtp: string): Promise<boolean> {
    const key = this.buildOtpKey(phone, role);
    const raw = await this.redis.get(key);

    if (!raw) {
      throw new BadRequestException('OTP expired or not found. Please request a new one.');
    }

    const otpData: OtpData = JSON.parse(raw);

    // Increment attempt count
    otpData.attempts += 1;

    if (otpData.attempts > this.MAX_ATTEMPTS) {
      await this.redis.del(key);
      throw new BadRequestException('Too many failed attempts. Please request a new OTP.');
    }

    if (otpData.otp !== submittedOtp) {
      // Update attempts in Redis
      await this.redis.setex(key, this.OTP_TTL_SECONDS, JSON.stringify(otpData));
      throw new BadRequestException(
        `Invalid OTP. ${this.MAX_ATTEMPTS - otpData.attempts} attempts remaining.`,
      );
    }

    // Valid — delete OTP so it can't be reused
    await this.redis.del(key);
    return true;
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private buildOtpKey(phone: string, role: UserRole): string {
    return `${this.OTP_PREFIX}${phone}:${role}`;
  }

  private buildRateKey(phone: string): string {
    return `${this.RATE_PREFIX}${phone}`;
  }

  private async checkRateLimit(phone: string): Promise<void> {
    const rateKey = this.buildRateKey(phone);
    const count = await this.redis.get(rateKey);
    if (count && parseInt(count) >= this.RATE_LIMIT_MAX_SENDS) {
      throw new HttpException(
        'Too many OTP requests. Please wait before requesting another.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async deliverOtp(phone: string, otp: string): Promise<void> {
    if (this.isDev) {
      this.logger.debug(`[DEV] OTP for ${phone}: ${otp}`);
      return;
    }

    this.logger.warn(
      `OTP stored for ${phone}; SMS delivery is handled by Firebase Authentication on the mobile client.`,
    );
  }
}
