import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const enums = await prisma.$queryRaw<{ typname: string }[]>`
    SELECT typname FROM pg_type WHERE typname LIKE 'Game%' ORDER BY typname`;
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'game%' ORDER BY tablename`;
  const custCol = await prisma.$queryRaw<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'customers' AND column_name = 'notify_game_events'`;
  const drvCol = await prisma.$queryRaw<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'drivers' AND column_name = 'notify_game_events'`;

  console.log('Enums:', enums.map((e) => e.typname).join(', ') || '(none)');
  console.log('Tables:', tables.map((t) => t.tablename).join(', ') || '(none)');
  console.log('customers.notify_game_events:', custCol.length ? 'yes' : 'no');
  console.log('drivers.notify_game_events:', drvCol.length ? 'yes' : 'no');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
