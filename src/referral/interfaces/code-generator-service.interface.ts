import { ReferralCode, Prisma } from '@prisma/client';

export interface ICodeGeneratorService {
  generateForCustomer(
    customerId: string,
    tx?: Prisma.TransactionClient
  ): Promise<ReferralCode>;
  generateUniqueCode(
    prismaClient?: Prisma.TransactionClient | any
  ): Promise<string>;
}
