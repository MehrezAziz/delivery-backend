  // ============================================
  // Testing
  // ============================================

import { PrismaClient, UserRole, SuperUserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // ============================================
  // 1. Create Countries
  // ============================================
  console.log('Creating countries...');
  const tunisia = await prisma.country.upsert({
    where: { isoCode: 'TN' },
    update: {},
    create: {
      name: 'Tunisia',
      isoCode: 'TN',
      currencyCode: 'TND',
      currencySymbol: 'د.ت',
      isActive: true,
    },
  });

  // ============================================
  // 2. Create Governorates
  // ============================================
  console.log('Creating governorates...');
  const tunis = await prisma.governorate.upsert({
    where: { id: 'tunis-gov' },
    update: {},
    create: {
      id: 'tunis-gov',
      nameGovernorate: 'Tunis',
      countryId: tunisia.id,
    },
  });

  const ariana = await prisma.governorate.upsert({
    where: { id: 'ariana-gov' },
    update: {},
    create: {
      id: 'ariana-gov',
      nameGovernorate: 'Ariana',
      countryId: tunisia.id,
    },
  });

  // ============================================
  // 3. Create Delegations
  // ============================================
  console.log('Creating delegations...');
  const carthage = await prisma.delegation.upsert({
    where: { id: 'carthage-del' },
    update: {},
    create: {
      id: 'carthage-del',
      nameDelegation: 'Carthage',
      maxConfirmationDelayMinutes: 15,
      governorateId: tunis.id,
    },
  });

  const laMarsa = await prisma.delegation.upsert({
    where: { id: 'lamarsa-del' },
    update: {},
    create: {
      id: 'lamarsa-del',
      nameDelegation: 'La Marsa',
      maxConfirmationDelayMinutes: 15,
      governorateId: tunis.id,
    },
  });

  // ============================================
  // 4. Create Pricing Policy
  // ============================================
  console.log('Creating pricing policy...');
  await prisma.countryPricingPolicy.upsert({
    where: { id: 'tunisia-pricing-1' },
    update: {},
    create: {
      id: 'tunisia-pricing-1',
      pricePerKm: 2.5,
      baseFee: 5.0,
      baseWeight: 5.0,
      extraWeightStep: 1.0,
      extraWeightPrice: 0.5,
      nightFee: 3.0,
      platformFee: 1.5,
      maxNegativeDays: 7,
      deliveryZoneType: 'SAME_GOVERNORATE',
      isActive: true,
      countryId: tunisia.id,
    },
  });

  // ============================================
  // 5. Create SuperUsers (Admin & Customer Service)
  // ============================================
  console.log('Creating super users...');
  
  // Hash password for super users
  const hashedPassword = await bcrypt.hash('admin123456', 10);
  
  const adminUser = await prisma.superUser.upsert({
    where: { email: 'admin@delivery.com' },
    update: { superPassword: hashedPassword },
    create: {
      telephone: '+21611111111',
      pseudo: 'admin',
      email: 'admin@delivery.com',
      superPassword: hashedPassword,
      role: SuperUserRole.ADMIN,
      status: UserStatus.ACTIVE,
    },
  });

  await prisma.admin.upsert({
    where: { superUserId: adminUser.id },
    update: {},
    create: {
      superUserId: adminUser.id,
    },
  });

  const csUser = await prisma.superUser.upsert({
    where: { email: 'support@delivery.com' },
    update: { superPassword: hashedPassword },
    create: {
      telephone: '+21622222222',
      pseudo: 'support',
      email: 'support@delivery.com',
      superPassword: hashedPassword,
      role: SuperUserRole.CUSTOMER_SERVICE,
      status: UserStatus.ACTIVE,
    },
  });

  await prisma.customerService.upsert({
    where: { superUserId: csUser.id },
    update: {},
    create: {
      superUserId: csUser.id,
    },
  });

  // ============================================
  // 6. Create Test Users (Customer & Driver)
  // ============================================
  console.log('Creating test users...');

  // Test Customer
  const customerUser = await prisma.user.upsert({
    where: { phone: '+21612345678' },
    update: {},
    create: {
      phone: '+21612345678',
      firstName: 'Ahmed',
      secondName: 'Ben Ali',
      myEmail: 'ahmed@example.com',
      role: UserRole.CUSTOMER,
      status: UserStatus.ACTIVE,
    },
  });

  const customer = await prisma.customer.upsert({
    where: { userId: customerUser.id },
    update: {},
    create: {
      userId: customerUser.id,
      completedOrders: 0,
    },
  });

  // Create wallet for customer
  await prisma.digitalWallet.upsert({
    where: { customerId: customer.id },
    update: {},
    create: {
      customerId: customer.id,
      balance: 100.0,
      currency: 'TND',
      countryId: tunisia.id,
      discount: 0,
    },
  });

  // Test Driver
  const driverUser = await prisma.user.upsert({
    where: { phone: '+21698765432' },
    update: {},
    create: {
      phone: '+21698765432',
      firstName: 'Mohamed',
      secondName: 'Trabelsi',
      myEmail: 'mohamed@example.com',
      role: UserRole.DRIVER,
      status: UserStatus.ACTIVE,
    },
  });

  const driver = await prisma.driver.upsert({
    where: { userId: driverUser.id },
    update: {},
    create: {
      userId: driverUser.id,
      vehicleType: 'Motorcycle',
      status: 'VERIFIED',
      approvedAt: new Date(),
      description: 'Experienced delivery driver',
    },
  });

  // Create driver account
  await prisma.driverAccount.upsert({
    where: { driverId: driver.id },
    update: {},
    create: {
      driverId: driver.id,
      balance: 50.0,
      currency: 'TND',
      completedDeliveries: 0,
    },
  });

  // ============================================
  // 7. Create Addresses
  // ============================================
  console.log('Creating addresses...');
  
  await prisma.address.create({
    data: {
      latitude: 36.8065,
      longitude: 10.1815,
      street: '123 Avenue Habib Bourguiba',
      delegationId: carthage.id,
      userId: customerUser.id,
    },
  });

  await prisma.address.create({
    data: {
      latitude: 36.8785,
      longitude: 10.3250,
      street: '456 Rue de la République',
      delegationId: laMarsa.id,
      userId: driverUser.id,
    },
  });

  console.log('✅ Seed completed successfully!');
  console.log('\n📝 Test Credentials:');
  console.log('─────────────────────────────────────');
  console.log('Customer Phone: +21612345678');
  console.log('Driver Phone: +21698765432');
  console.log('Admin Email: admin@delivery.com');
  console.log('Admin Password: admin123456');
  console.log('Support Email: support@delivery.com');
  console.log('Support Password: admin123456');
  console.log('─────────────────────────────────────');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
