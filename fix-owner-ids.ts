import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixOwnerIds() {
  console.log('Starting to fix referral code owner_id values...');

  // Get all referral codes with owner_id
  const referralCodes = await prisma.referralCode.findMany({
    where: {
      ownerId: { not: null },
    },
  });

  console.log(`Found ${referralCodes.length} referral codes with owner_id`);

  for (const code of referralCodes) {
    console.log(`\nProcessing referral code: ${code.code} (ID: ${code.id})`);
    console.log(`Current owner_id: ${code.ownerId}`);

    // Check if owner_id is a valid customer ID
    const customer = await prisma.customer.findUnique({
      where: { id: code.ownerId! },
    });

    if (customer) {
      console.log(`✓ Owner ID is valid - Customer ID: ${customer.id}`);
      continue;
    }

    // If not valid, this might be a user_id instead of customer_id
    // Try to find customer by user_id
    const customerByUserId = await prisma.customer.findUnique({
      where: { userId: code.ownerId! },
    });

    if (customerByUserId) {
      console.log(`✗ Owner ID was user_id, updating to customer_id: ${customerByUserId.id}`);
      await prisma.referralCode.update({
        where: { id: code.id },
        data: { ownerId: customerByUserId.id },
      });
      console.log(`✓ Updated successfully`);
    } else {
      console.log(`✗ Could not find customer for owner_id: ${code.ownerId}`);
      console.log(`  Setting owner_id to NULL`);
      await prisma.referralCode.update({
        where: { id: code.id },
        data: { ownerId: null },
      });
    }
  }

  console.log('\n✓ Finished fixing owner_id values');
}

fixOwnerIds()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
