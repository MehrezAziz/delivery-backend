import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // Clean existing data (in reverse order of dependencies)
  console.log('🧹 Cleaning existing data...');
  await prisma.message.deleteMany();
  await prisma.chatRoom.deleteMany();
  await prisma.rating.deleteMany();
  await prisma.driverLocation.deleteMany();
  await prisma.cashTransaction.deleteMany();
  await prisma.driverAssignment.deleteMany();
  await prisma.walletTransaction.deleteMany();
  await prisma.withdrawalRequest.deleteMany();
  await prisma.digitalWallet.deleteMany();
  await prisma.referralCommission.deleteMany();
  await prisma.order.deleteMany();
  await prisma.address.deleteMany();
  await prisma.userRestriction.deleteMany();
  await prisma.supportTicket.deleteMany();
  await prisma.dispute.deleteMany();
  await prisma.document.deleteMany();
  await prisma.driverVerification.deleteMany();
  await prisma.driverPerformanceMetrics.deleteMany();
  await prisma.timePeriod.deleteMany();
  await prisma.dayAvailability.deleteMany();
  await prisma.weeklyAvailability.deleteMany();
  await prisma.driverTransaction.deleteMany();
  await prisma.driverAccount.deleteMany();
  await prisma.driver.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.user.deleteMany();
  await prisma.customerService.deleteMany();
  await prisma.admin.deleteMany();
  await prisma.superUser.deleteMany();
  await prisma.countryPricingPolicy.deleteMany();
  await prisma.delegation.deleteMany();
  await prisma.governorate.deleteMany();
  await prisma.country.deleteMany();
  await prisma.referralCode.deleteMany();

  console.log('✅ Cleaned existing data');

  // 1. Create Countries
  console.log('🌍 Creating countries...');
  const tunisia = await prisma.country.create({
    data: {
      name: 'Tunisia',
      isoCode: 'TN',
      currencyCode: 'TND',
      currencySymbol: 'د.ت',
      isActive: true,
    },
  });

  const france = await prisma.country.create({
    data: {
      name: 'France',
      isoCode: 'FR',
      currencyCode: 'EUR',
      currencySymbol: '€',
      isActive: true,
    },
  });

  console.log(`✅ Created countries: ${tunisia.name}, ${france.name}`);

  // 2. Create Governorates
  console.log('🏛️ Creating governorates...');
  const tunis = await prisma.governorate.create({
    data: {
      nameGovernorate: 'Tunis',
      countryId: tunisia.id,
    },
  });

  const sfax = await prisma.governorate.create({
    data: {
      nameGovernorate: 'Sfax',
      countryId: tunisia.id,
    },
  });

  console.log(`✅ Created governorates: ${tunis.nameGovernorate}, ${sfax.nameGovernorate}`);

  // 3. Create Delegations
  console.log('📍 Creating delegations...');
  const tunisCentre = await prisma.delegation.create({
    data: {
      nameDelegation: 'Tunis Centre',
      maxConfirmationDelayMinutes: 15,
      governorateId: tunis.id,
    },
  });

  const laMarsa = await prisma.delegation.create({
    data: {
      nameDelegation: 'La Marsa',
      maxConfirmationDelayMinutes: 15,
      governorateId: tunis.id,
    },
  });

  const sfaxVille = await prisma.delegation.create({
    data: {
      nameDelegation: 'Sfax Ville',
      maxConfirmationDelayMinutes: 20,
      governorateId: sfax.id,
    },
  });

  console.log(`✅ Created delegations: ${tunisCentre.nameDelegation}, ${laMarsa.nameDelegation}, ${sfaxVille.nameDelegation}`);

  // 4. Create Pricing Policies for Tunisia
  console.log('💰 Creating pricing policies...');
  const pricingSameDelegation = await prisma.countryPricingPolicy.create({
    data: {
      countryId: tunisia.id,
      deliveryZoneType: 'SAME_DELEGATION',
      pricePerKm: 1.5,
      baseFee: 5.0,
      baseWeight: 5.0,
      extraWeightStep: 1.0,
      extraWeightPrice: 0.5,
      nightFee: 2.0,
      platformFee: 1.0,
      maxNegativeDays: 7,
      isActive: true,
    },
  });

  const pricingSameGovernorate = await prisma.countryPricingPolicy.create({
    data: {
      countryId: tunisia.id,
      deliveryZoneType: 'SAME_GOVERNORATE',
      pricePerKm: 2.0,
      baseFee: 8.0,
      baseWeight: 5.0,
      extraWeightStep: 1.0,
      extraWeightPrice: 0.75,
      nightFee: 3.0,
      platformFee: 1.5,
      maxNegativeDays: 7,
      isActive: true,
    },
  });

  const pricingDifferentGovernorate = await prisma.countryPricingPolicy.create({
    data: {
      countryId: tunisia.id,
      deliveryZoneType: 'DIFFERENT_GOVERNORATE',
      pricePerKm: 3.0,
      baseFee: 15.0,
      baseWeight: 5.0,
      extraWeightStep: 1.0,
      extraWeightPrice: 1.0,
      nightFee: 5.0,
      platformFee: 2.0,
      maxNegativeDays: 7,
      isActive: true,
    },
  });

  const pricingDifferentCountry = await prisma.countryPricingPolicy.create({
    data: {
      countryId: tunisia.id,
      deliveryZoneType: 'DIFFERENT_COUNTRY',
      pricePerKm: 5.0,
      baseFee: 30.0,
      baseWeight: 5.0,
      extraWeightStep: 1.0,
      extraWeightPrice: 2.0,
      nightFee: 10.0,
      platformFee: 5.0,
      maxNegativeDays: 7,
      isActive: true,
    },
  });

  console.log('✅ Created 4 pricing policies for Tunisia');

  // 5. Create Admin
  console.log('👨‍💼 Creating admin...');
  const hashedAdminPassword = await bcrypt.hash('Admin123456', 10);
  const adminSuperUser = await prisma.superUser.create({
    data: {
      telephone: '+21612345678',
      pseudo: 'admin1',
      email: 'admin@delivery.com',
      superPassword: hashedAdminPassword,
      role: 'ADMIN',
      status: 'ACTIVE',
    },
  });

  const admin = await prisma.admin.create({
    data: {
      superUserId: adminSuperUser.id,
    },
  });

  console.log(`✅ Created admin: ${adminSuperUser.pseudo}`);

  // 6. Create Customer Service
  console.log('🎧 Creating customer service...');
  const hashedCSPassword = await bcrypt.hash('Support123', 10);
  const csSuperUser = await prisma.superUser.create({
    data: {
      telephone: '+21655555555',
      pseudo: 'cs_support1',
      email: 'support1@delivery.com',
      superPassword: hashedCSPassword,
      role: 'CUSTOMER_SERVICE',
      status: 'ACTIVE',
    },
  });

  const customerService = await prisma.customerService.create({
    data: {
      superUserId: csSuperUser.id,
      roles: [
        'READ_DRIVER_PROFILE',
        'READ_CUSTOMER_PROFILE',
        'VERIFY_ACCOUNTS',
        'MANAGE_SUPPORT_TICKETS',
      ],
    },
  });

  console.log(`✅ Created customer service: ${csSuperUser.pseudo}`);

  // 7. Create Customers
  console.log('👥 Creating customers...');
  const hashedCustomerPassword = await bcrypt.hash('Customer123', 10);
  
  const customer1User = await prisma.user.create({
    data: {
      phone: '+21698765432',
      password: hashedCustomerPassword,
      firstName: 'Ahmed',
      secondName: 'Ben Ali',
      role: 'CUSTOMER',
      myEmail: 'ahmed@example.com',
    },
  });

  const customer1 = await prisma.customer.create({
    data: {
      userId: customer1User.id,
    },
  });

  const customer2User = await prisma.user.create({
    data: {
      phone: '+21699887766',
      password: hashedCustomerPassword,
      firstName: 'Fatma',
      secondName: 'Trabelsi',
      role: 'CUSTOMER',
      myEmail: 'fatma@example.com',
    },
  });

  const customer2 = await prisma.customer.create({
    data: {
      userId: customer2User.id,
    },
  });

  console.log(`✅ Created customers: ${customer1User.firstName}, ${customer2User.firstName}`);

  // 8. Create Drivers
  console.log('🚗 Creating drivers...');
  const hashedDriverPassword = await bcrypt.hash('Driver123', 10);
  
  const driver1User = await prisma.user.create({
    data: {
      phone: '+21623456789',
      password: hashedDriverPassword,
      firstName: 'Mohamed',
      secondName: 'Trabelsi',
      role: 'DRIVER',
    },
  });

  const driver1 = await prisma.driver.create({
    data: {
      userId: driver1User.id,
      vehicleType: 'Motorcycle',
      status: 'VERIFIED',
      approvedAt: new Date(),
    },
  });

  const driver1Account = await prisma.driverAccount.create({
    data: {
      driverId: driver1.id,
      balance: 0,
      currency: 'TND',
    },
  });

  const driver2User = await prisma.user.create({
    data: {
      phone: '+21622334455',
      password: hashedDriverPassword,
      firstName: 'Karim',
      secondName: 'Mansour',
      role: 'DRIVER',
    },
  });

  const driver2 = await prisma.driver.create({
    data: {
      userId: driver2User.id,
      vehicleType: 'Car',
      status: 'VERIFIED',
      approvedAt: new Date(),
    },
  });

  const driver2Account = await prisma.driverAccount.create({
    data: {
      driverId: driver2.id,
      balance: 0,
      currency: 'TND',
    },
  });

  console.log(`✅ Created drivers: ${driver1User.firstName}, ${driver2User.firstName}`);

  // 9. Create Addresses for Customer 1
  console.log('📍 Creating addresses...');
  const customer1Address1 = await prisma.address.create({
    data: {
      latitude: 36.8065,
      longitude: 10.1815,
      street: 'Avenue Habib Bourguiba',
      delegationId: tunisCentre.id,
      userId: customer1User.id,
    },
  });

  const customer1Address2 = await prisma.address.create({
    data: {
      latitude: 36.8500,
      longitude: 10.2000,
      street: 'Avenue de la Liberté',
      delegationId: laMarsa.id,
      userId: customer1User.id,
    },
  });

  // Addresses for Customer 2
  const customer2Address1 = await prisma.address.create({
    data: {
      latitude: 36.8100,
      longitude: 10.1900,
      street: 'Rue de Marseille',
      delegationId: tunisCentre.id,
      userId: customer2User.id,
    },
  });

  // Addresses for Drivers
  const driver1Address = await prisma.address.create({
    data: {
      latitude: 36.8080,
      longitude: 10.1820,
      street: 'Avenue de France',
      delegationId: tunisCentre.id,
      userId: driver1User.id,
    },
  });

  const driver2Address = await prisma.address.create({
    data: {
      latitude: 36.8520,
      longitude: 10.2050,
      street: 'Route de la Marsa',
      delegationId: laMarsa.id,
      userId: driver2User.id,
    },
  });

  console.log('✅ Created addresses for customers and drivers');

  // 10. Create Digital Wallets
  console.log('💳 Creating digital wallets...');
  const wallet1 = await prisma.digitalWallet.create({
    data: {
      customerId: customer1.id,
      balance: 100.0,
      currency: 'TND',
      countryId: tunisia.id,
    },
  });

  const wallet2 = await prisma.digitalWallet.create({
    data: {
      customerId: customer2.id,
      balance: 50.0,
      currency: 'TND',
      countryId: tunisia.id,
    },
  });

  console.log('✅ Created digital wallets');

  // 11. Create Sample Orders
  console.log('📦 Creating sample orders...');
  const order1 = await prisma.order.create({
    data: {
      customerId: customer1.id,
      pricingPolicyId: pricingSameGovernorate.id,
      pickupAddressId: customer1Address1.id,
      dropoffAddressId: customer1Address2.id,
      status: 'SEARCHING_DRIVER',
      paymentType: 'COD',
      description: 'Fragile package - Handle with care',
      weight: 3.5,
      distanceKm: 8.5,
      price: 25.0,
      nightFee: 0,
      extraWeightFee: 0,
      isNightDelivery: false,
    },
  });

  const order2 = await prisma.order.create({
    data: {
      customerId: customer2.id,
      pricingPolicyId: pricingSameDelegation.id,
      pickupAddressId: customer2Address1.id,
      dropoffAddressId: customer1Address1.id,
      status: 'DRAFT',
      paymentType: 'WALLET',
      description: 'Documents',
      weight: 0.5,
      distanceKm: 2.0,
      price: 8.0,
      nightFee: 0,
      extraWeightFee: 0,
      isNightDelivery: false,
    },
  });

  console.log(`✅ Created ${2} sample orders`);

  // 12. Create Referral Codes
  console.log('🎁 Creating referral codes...');
  const referralCode1 = await prisma.referralCode.create({
    data: {
      code: 'WELCOME10',
      type: 'PERCENTAGE',
      value: 10.0,
      maxDiscountAmount: 20.0,
      minOrderAmount: 10.0,
      usageLimit: 100,
      usagePerUserLimit: 1,
      active: true,
      createdBy: admin.id,
    },
  });

  const referralCode2 = await prisma.referralCode.create({
    data: {
      code: 'FIRST5',
      type: 'FIXED',
      value: 5.0,
      minOrderAmount: 15.0,
      usageLimit: 50,
      usagePerUserLimit: 1,
      active: true,
      createdBy: admin.id,
    },
  });

  console.log('✅ Created referral codes');

  // Summary
  console.log('\n🎉 Seed completed successfully!');
  console.log('\n📊 Summary:');
  console.log(`   Countries: 2 (Tunisia, France)`);
  console.log(`   Governorates: 2 (Tunis, Sfax)`);
  console.log(`   Delegations: 3 (Tunis Centre, La Marsa, Sfax Ville)`);
  console.log(`   Pricing Policies: 4 (All zone types for Tunisia)`);
  console.log(`   Admin: 1 (admin1)`);
  console.log(`   Customer Service: 1 (cs_support1)`);
  console.log(`   Customers: 2 (Ahmed, Fatma)`);
  console.log(`   Drivers: 2 (Mohamed, Karim) - Both VERIFIED`);
  console.log(`   Addresses: 5`);
  console.log(`   Digital Wallets: 2`);
  console.log(`   Orders: 2`);
  console.log(`   Referral Codes: 2`);
  console.log('\n🔑 Login Credentials:');
  console.log('   Admin:');
  console.log('     Phone: +21612345678');
  console.log('     Password: Admin123456');
  console.log('   Customer Service:');
  console.log('     Phone: +21655555555');
  console.log('     Password: Support123');
  console.log('   Customer 1 (Ahmed):');
  console.log('     Phone: +21698765432');
  console.log('     Password: Customer123');
  console.log('   Customer 2 (Fatma):');
  console.log('     Phone: +21699887766');
  console.log('     Password: Customer123');
  console.log('   Driver 1 (Mohamed):');
  console.log('     Phone: +21623456789');
  console.log('     Password: Driver123');
  console.log('   Driver 2 (Karim):');
  console.log('     Phone: +21622334455');
  console.log('     Password: Driver123');
}

main()
  .catch((e) => {
    console.error('❌ Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
