const { createImportToken, verifyImportToken } = require('./importTokens');

const payload = {
  provider: 'pexels',
  providerAssetId: '42',
  sourcePageUrl: 'https://www.pexels.com/photo/42/',
  imageUrl: 'https://images.pexels.com/photos/42/photo.jpeg',
  title: 'Moonlit lake',
  rightsState: 'known',
};

describe('reference import tokens', () => {
  it('round-trips a signed provider result until expiry', () => {
    const token = createImportToken(payload, 'secret', 300, 1_800_000_000);
    expect(verifyImportToken(token, 'secret', 1_800_000_299)).toMatchObject(payload);
  });

  it('rejects tampering and expired tokens', () => {
    const token = createImportToken(payload, 'secret', 60, 1_800_000_000);
    const [body, signature] = token.split('.');
    const tamperedBody = `${body.slice(0, -1)}${body.endsWith('A') ? 'B' : 'A'}`;

    expect(() =>
      verifyImportToken(`${tamperedBody}.${signature}`, 'secret', 1_800_000_010),
    ).toThrow('Invalid import token');
    expect(() => verifyImportToken(token, 'secret', 1_800_000_061)).toThrow('Import token expired');
  });
});
