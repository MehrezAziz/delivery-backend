import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CodeGenerationFailedException } from '../exceptions/code-generation-failed.exception';
import { ReferralCode, ReferralCodeType, Prisma } from '@prisma/client';

@Injectable()
export class CodeGeneratorService {
  private readonly MAX_ATTEMPTS = 10;
  private readonly MIN_LENGTH = 6;
  private readonly MAX_LENGTH = 12;
  private readonly CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generates a unique referral code for a customer.
   * Creates a ReferralCode record with type=PERCENTAGE, value=10, active=true, ownerId=customerId.
   * Supports optional Prisma transaction client parameter for atomicity.
   * @param customerId - The ID of the customer to generate a code for
   * @param tx - Optional Prisma transaction client
   * @returns The created ReferralCode entity
   * @throws CodeGenerationFailedException if unable to generate unique code after max attempts
   */
  async generateForCustomer(
    customerId: string,
    tx?: Prisma.TransactionClient
  ): Promise<ReferralCode> {
    const prismaClient = tx || this.prisma;
    const code = await this.generateUniqueCode(prismaClient);

    return await prismaClient.referralCode.create({
      data: {
        code,
        type: ReferralCodeType.PERCENTAGE,
        value: 10,
        active: true,
        ownerId: customerId,
        createdBy: 'system',
      },
    });
  }

  /**
   * Generates a unique alphanumeric code (A-Z, 0-9) with length 6-12 characters.
   * Retries up to MAX_ATTEMPTS times if collision occurs.
   * @param prismaClient - Optional Prisma client or transaction client
   * @throws CodeGenerationFailedException if unable to generate unique code after max attempts
   */
  async generateUniqueCode(
    prismaClient?: Prisma.TransactionClient | PrismaService
  ): Promise<string> {
    const client = prismaClient || this.prisma;

    for (let attempt = 0; attempt < this.MAX_ATTEMPTS; attempt++) {
      // Generate random length between 6-12
      const length =
        Math.floor(Math.random() * (this.MAX_LENGTH - this.MIN_LENGTH + 1)) +
        this.MIN_LENGTH;

      // Generate random code
      let code = '';
      for (let i = 0; i < length; i++) {
        code += this.CHARSET.charAt(
          Math.floor(Math.random() * this.CHARSET.length)
        );
      }

      // Check uniqueness against database
      const existing = await client.referralCode.findUnique({
        where: { code },
      });

      if (!existing) {
        return code;
      }
    }

    throw new CodeGenerationFailedException();
  }
}
