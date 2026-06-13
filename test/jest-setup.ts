/** Mock ESM-only `jose` so Jest can load modules that import notifications.gateway. */
jest.mock('jose', () => ({
  jwtVerify: jest.fn(() =>
    Promise.resolve({
      payload: { sub: 'test-user' },
      protectedHeader: { alg: 'HS256' },
    }),
  ),
  SignJWT: jest.fn(),
  compactDecrypt: jest.fn(),
  importPKCS8: jest.fn(),
  importSPKI: jest.fn(),
}));
