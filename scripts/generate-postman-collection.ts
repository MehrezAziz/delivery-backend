import * as fs from 'fs';
import * as path from 'path';

interface PostmanRequest {
  name: string;
  request: {
    method: string;
    header: Array<{ key: string; value: string }>;
    body?: {
      mode: string;
      raw: string;
    };
    url: {
      raw: string;
      host: string[];
      path: string[];
    };
  };
  event?: Array<{
    listen: string;
    script: {
      exec: string[];
    };
  }>;
}

interface PostmanFolder {
  name: string;
  item: (PostmanRequest | PostmanFolder)[];
}

const collection = {
  info: {
    name: 'Delivery Platform - Complete API',
    description: 'Complete API collection for delivery platform with all endpoints',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  variable: [
    { key: 'baseUrl', value: 'http://localhost:3000', type: 'string' },
    { key: 'adminToken', value: '', type: 'string' },
    { key: 'customerToken', value: '', type: 'string' },
    { key: 'driverToken', value: '', type: 'string' },
    { key: 'csToken', value: '', type: 'string' },
    { key: 'countryId', value: '', type: 'string' },
    { key: 'governorateId', value: '', type: 'string' },
    { key: 'delegationId1', value: '', type: 'string' },
    { key: 'delegationId2', value: '', type: 'string' },
    { key: 'customerId', value: '', type: 'string' },
    { key: 'driverId', value: '', type: 'string' },
    { key: 'orderId', value: '', type: 'string' },
    { key: 'addressId1', value: '', type: 'string' },
    { key: 'addressId2', value: '', type: 'string' },
    { key: 'csId', value: '', type: 'string' },
    { key: 'policyId', value: '', type: 'string' },
  ],
  item: [] as PostmanFolder[],
};

// Helper function to create request
function createRequest(
  name: string,
  method: string,
  path: string,
  body?: any,
  auth?: string,
  saveVariable?: { key: string; path: string },
): PostmanRequest {
  const request: PostmanRequest = {
    name,
    request: {
      method,
      header: [{ key: 'Content-Type', value: 'application/json' }],
      url: {
        raw: `{{baseUrl}}${path}`,
        host: ['{{baseUrl}}'],
        path: path.split('/').filter(Boolean),
      },
    },
  };

  if (auth) {
    request.request.header.push({
      key: 'Authorization',
      value: `Bearer {{${auth}}}`,
    });
  }

  if (body) {
    request.request.body = {
      mode: 'raw',
      raw: JSON.stringify(body, null, 2),
    };
  }

  if (saveVariable) {
    request.event = [
      {
        listen: 'test',
        script: {
          exec: [
            'if (pm.response.code === 200 || pm.response.code === 201) {',
            '    const response = pm.response.json();',
            `    pm.collectionVariables.set('${saveVariable.key}', response.${saveVariable.path});`,
            '}',
          ],
        },
      },
    ];
  }

  return request;
}

// 1. Authentication
collection.item.push({
  name: '1. Authentication',
  item: [
    createRequest(
      'Login Admin',
      'POST',
      '/auth/superuser/login',
      {
        telephone: '+21612345678',
        password: 'Admin123456',
      },
      undefined,
      { key: 'adminToken', path: 'access_token' },
    ),
    createRequest(
      'Login Customer',
      'POST',
      '/auth/user/login',
      {
        phone: '+21698765432',
        password: 'Customer123',
      },
      undefined,
      { key: 'customerToken', path: 'access_token' },
    ),
    createRequest(
      'Login Driver',
      'POST',
      '/auth/user/login',
      {
        phone: '+21623456789',
        password: 'Driver123',
      },
      undefined,
      { key: 'driverToken', path: 'access_token' },
    ),
    createRequest(
      'Login Customer Service',
      'POST',
      '/auth/superuser/login',
      {
        telephone: '+21655555555',
        password: 'Support123',
      },
      undefined,
      { key: 'csToken', path: 'access_token' },
    ),
  ],
});

// 2. Admin - Geography Management
collection.item.push({
  name: '2. Admin - Geography',
  item: [
    createRequest(
      'Get All Countries',
      'GET',
      '/admin/geography/countries',
      undefined,
      'adminToken',
    ),
    createRequest(
      'Create Country',
      'POST',
      '/admin/geography/countries',
      {
        name: 'Algeria',
        isoCode: 'DZ',
        currencyCode: 'DZD',
        currencySymbol: 'د.ج',
        isActive: true,
      },
      'adminToken',
      { key: 'countryId', path: 'id' },
    ),
    createRequest(
      'Get All Governorates',
      'GET',
      '/admin/geography/governorates',
      undefined,
      'adminToken',
    ),
    createRequest(
      'Create Governorate',
      'POST',
      '/admin/geography/governorates',
      {
        nameGovernorate: 'Ariana',
        countryId: '{{countryId}}',
      },
      'adminToken',
      { key: 'governorateId', path: 'id' },
    ),
    createRequest(
      'Get All Delegations',
      'GET',
      '/admin/geography/delegations',
      undefined,
      'adminToken',
    ),
    createRequest(
      'Create Delegation',
      'POST',
      '/admin/geography/delegations',
      {
        nameDelegation: 'Ariana Ville',
        maxConfirmationDelayMinutes: 15,
        governorateId: '{{governorateId}}',
      },
      'adminToken',
      { key: 'delegationId1', path: 'id' },
    ),
  ],
});

// 3. Admin - Pricing Management
collection.item.push({
  name: '3. Admin - Pricing',
  item: [
    createRequest(
      'Get All Pricing Policies',
      'GET',
      '/admin/pricing-policies',
      undefined,
      'adminToken',
    ),
    createRequest(
      'Create Pricing Policy - SAME_DELEGATION',
      'POST',
      '/admin/pricing-policies',
      {
        countryId: '{{countryId}}',
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
      'adminToken',
      { key: 'policyId', path: 'id' },
    ),
    createRequest(
      'Update Pricing Policy',
      'PATCH',
      '/admin/pricing-policies/{{policyId}}',
      {
        pricePerKm: 1.8,
        baseFee: 6.0,
      },
      'adminToken',
    ),
    createRequest(
      'Deactivate Pricing Policy',
      'PATCH',
      '/admin/pricing-policies/{{policyId}}/deactivate',
      undefined,
      'adminToken',
    ),
  ],
});

// 4. Admin - Customer Service Management
collection.item.push({
  name: '4. Admin - Customer Service',
  item: [
    createRequest(
      'Create Customer Service Account',
      'POST',
      '/admin/customer-services',
      {
        telephone: '+21666666666',
        pseudo: 'cs_support2',
        email: 'support2@delivery.com',
        password: 'Support123',
        roles: ['READ_DRIVER_PROFILE', 'READ_CUSTOMER_PROFILE', 'VERIFY_ACCOUNTS'],
      },
      'adminToken',
      { key: 'csId', path: 'id' },
    ),
    createRequest(
      'Get All Customer Services',
      'GET',
      '/admin/customer-services',
      undefined,
      'adminToken',
    ),
    createRequest(
      'Get Customer Service by ID',
      'GET',
      '/admin/customer-services/{{csId}}',
      undefined,
      'adminToken',
    ),
    createRequest(
      'Add Role to CS',
      'POST',
      '/admin/customer-services/{{csId}}/roles/MANAGE_DISPUTES',
      undefined,
      'adminToken',
    ),
    createRequest(
      'Remove Role from CS',
      'DELETE',
      '/admin/customer-services/{{csId}}/roles/MANAGE_DISPUTES',
      undefined,
      'adminToken',
    ),
    createRequest(
      'Update All CS Roles',
      'PATCH',
      '/admin/customer-services/{{csId}}/roles',
      {
        roles: [
          'READ_DRIVER_PROFILE',
          'READ_CUSTOMER_PROFILE',
          'VERIFY_ACCOUNTS',
          'UPDATE_DRIVER_STATUS',
        ],
      },
      'adminToken',
    ),
    createRequest(
      'Toggle CS Status',
      'PATCH',
      '/admin/customer-services/{{csId}}/toggle-status',
      undefined,
      'adminToken',
    ),
  ],
});

// 5. User Profile Management
collection.item.push({
  name: '5. User Profile',
  item: [
    createRequest(
      'Get My Profile (Customer)',
      'GET',
      '/users/profile',
      undefined,
      'customerToken',
    ),
    createRequest(
      'Update My Profile (Customer)',
      'PATCH',
      '/users/profile',
      {
        firstName: 'Ahmed Updated',
        myEmail: 'ahmed.updated@example.com',
      },
      'customerToken',
    ),
    createRequest(
      'Get My Profile (Driver)',
      'GET',
      '/users/profile',
      undefined,
      'driverToken',
    ),
  ],
});

// 6. Address Management
collection.item.push({
  name: '6. Addresses',
  item: [
    createRequest(
      'Create Address (Customer)',
      'POST',
      '/addresses',
      {
        latitude: 36.8200,
        longitude: 10.1650,
        street: 'New Street Address',
        delegationId: '{{delegationId1}}',
      },
      'customerToken',
      { key: 'addressId1', path: 'id' },
    ),
    createRequest(
      'Get All My Addresses',
      'GET',
      '/addresses',
      undefined,
      'customerToken',
    ),
    createRequest(
      'Update Address',
      'PATCH',
      '/addresses/{{addressId1}}',
      {
        street: 'Updated Street Name',
      },
      'customerToken',
    ),
    createRequest(
      'Delete Address',
      'DELETE',
      '/addresses/{{addressId1}}',
      undefined,
      'customerToken',
    ),
  ],
});

// 7. Customer Management
collection.item.push({
  name: '7. Customers',
  item: [
    createRequest(
      'Get My Customer Profile',
      'GET',
      '/customers/me',
      undefined,
      'customerToken',
    ),
    createRequest(
      'Update My Customer Profile',
      'PATCH',
      '/customers/me',
      {
        completedOrders: 5,
      },
      'customerToken',
    ),
    createRequest(
      'Admin - Get All Customers',
      'GET',
      '/admin/customers?page=1&limit=20',
      undefined,
      'adminToken',
    ),
    createRequest(
      'Admin - Get Customer Statistics',
      'GET',
      '/admin/customers/stats',
      undefined,
      'adminToken',
    ),
    createRequest(
      'Admin - Search Customers',
      'GET',
      '/admin/customers/search?q=Ahmed',
      undefined,
      'adminToken',
    ),
  ],
});

// 8. Driver Management
collection.item.push({
  name: '8. Drivers',
  item: [
    createRequest(
      'Upload Driver Documents',
      'POST',
      '/driver/documents',
      {
        documentType: 'ID_CARD',
        documentImage: 'https://example.com/id-front.jpg',
        selfieImage: 'https://example.com/selfie.jpg',
        docImageTop: 'https://example.com/id-top.jpg',
        docImageBottom: 'https://example.com/id-bottom.jpg',
      },
      'driverToken',
    ),
    createRequest(
      'Get Driver Verification Status',
      'GET',
      '/driver/verification',
      undefined,
      'driverToken',
    ),
    createRequest(
      'Admin - Get Pending Drivers',
      'GET',
      '/admin/drivers/pending',
      undefined,
      'adminToken',
    ),
    createRequest(
      'Admin - Approve Driver',
      'POST',
      '/admin/drivers/{{driverId}}/approve',
      undefined,
      'adminToken',
    ),
    createRequest(
      'Admin - Reject Driver',
      'POST',
      '/admin/drivers/{{driverId}}/reject',
      { reason: 'Invalid documents' },
      'adminToken',
    ),
    createRequest(
      'Admin - Suspend Driver',
      'POST',
      '/admin/drivers/{{driverId}}/suspend',
      { reason: 'Multiple complaints', durationDays: 7 },
      'adminToken',
    ),
  ],
});

// 9. Orders
collection.item.push({
  name: '9. Orders',
  item: [
    createRequest(
      'Create Order',
      'POST',
      '/orders',
      {
        pickupAddressId: '{{addressId1}}',
        dropoffAddressId: '{{addressId2}}',
        paymentType: 'COD',
        weight: 3.5,
        description: 'Fragile package',
        isNightDelivery: false,
      },
      'customerToken',
      { key: 'orderId', path: 'id' },
    ),
    createRequest(
      'Get My Orders (Customer)',
      'GET',
      '/orders/my-orders',
      undefined,
      'customerToken',
    ),
    createRequest(
      'Get Order by ID',
      'GET',
      '/orders/{{orderId}}',
      undefined,
      'customerToken',
    ),
    createRequest(
      'Cancel Order',
      'DELETE',
      '/orders/{{orderId}}',
      undefined,
      'customerToken',
    ),
  ],
});

// 10. Driver Orders
collection.item.push({
  name: '10. Driver Orders',
  item: [
    createRequest(
      'Get Available Orders (Prioritized)',
      'GET',
      '/driver/orders/available',
      undefined,
      'driverToken',
    ),
    createRequest(
      'Accept Order',
      'POST',
      '/driver/orders/{{orderId}}/accept',
      undefined,
      'driverToken',
    ),
    createRequest(
      'Get My Orders (Driver)',
      'GET',
      '/driver/orders/my-orders',
      undefined,
      'driverToken',
    ),
    createRequest(
      'Cancel Assignment (Driver)',
      'POST',
      '/driver/orders/{{orderId}}/cancel-assignment',
      { reason: 'Cannot reach pickup location' },
      'driverToken',
    ),
    createRequest(
      'Cancel Assignment (Customer)',
      'POST',
      '/driver/orders/{{orderId}}/cancel-assignment',
      { reason: 'Need to change delivery details' },
      'customerToken',
    ),
  ],
});

// 11. Restrictions
collection.item.push({
  name: '11. Restrictions',
  item: [
    createRequest(
      'Admin - Block User',
      'POST',
      '/admin/restrictions/block',
      {
        userId: '{{customerId}}',
        reason: 'Fraudulent activity',
      },
      'adminToken',
    ),
    createRequest(
      'Admin - Suspend User',
      'POST',
      '/admin/restrictions/suspend',
      {
        userId: '{{customerId}}',
        reason: 'Policy violation',
        durationDays: 7,
      },
      'adminToken',
    ),
    createRequest(
      'Admin - Suspend Driver',
      'POST',
      '/admin/restrictions/suspend-driver',
      {
        driverId: '{{driverId}}',
        reason: 'Multiple customer complaints',
        durationDays: 7,
      },
      'adminToken',
    ),
    createRequest(
      'Admin - Get User Restrictions',
      'GET',
      '/admin/restrictions/user/{{customerId}}',
      undefined,
      'adminToken',
    ),
    createRequest(
      'Admin - Lift Restriction',
      'DELETE',
      '/admin/restrictions/{{restrictionId}}/lift',
      undefined,
      'adminToken',
    ),
  ],
});

// Write the collection to file
const outputPath = path.join(__dirname, '..', 'Delivery_Platform_Complete.postman_collection.json');
fs.writeFileSync(outputPath, JSON.stringify(collection, null, 2));

console.log('✅ Postman collection generated successfully!');
console.log(`📁 Location: ${outputPath}`);
console.log('\n📝 Instructions:');
console.log('1. Import the collection into Postman');
console.log('2. Run the seed script first: npm run seed:complete');
console.log('3. Start with "1. Authentication" folder to get tokens');
console.log('4. Variables will be automatically saved as you make requests');
console.log('5. Follow the folder order for best testing experience');
