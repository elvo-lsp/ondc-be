import nacl from 'tweetnacl';
import { AppConfigService } from '../../config/app-config.service';
import { RegistryService } from './registry.service';
import { SigningService } from './signing.service';

describe('SigningService', () => {
  const keyPair = nacl.sign.keyPair();
  const publicKeyBase64 = Buffer.from(keyPair.publicKey).toString('base64');

  const config = {
    signingPrivateKey: Buffer.from(keyPair.secretKey).toString('base64'),
    subscriberId: 'test-buyer.example.com',
    ukId: 'UKID1',
  } as unknown as AppConfigService;

  const registry = {
    getSigningPublicKey: jest.fn().mockResolvedValue(publicKeyBase64),
  } as unknown as RegistryService;

  const signing = new SigningService(config, registry);

  it('verifies a signature it produced itself, over the same raw bytes', async () => {
    const payload = { hello: 'world' };
    const header = signing.buildAuthorizationHeader(payload);
    const rawBody = Buffer.from(JSON.stringify(payload), 'utf-8');

    await expect(signing.verify(rawBody, header)).resolves.toBe(true);
  });

  it('rejects when the raw body does not match what was signed', async () => {
    const header = signing.buildAuthorizationHeader({ hello: 'world' });
    const tamperedBody = Buffer.from(
      JSON.stringify({ hello: 'tampered' }),
      'utf-8',
    );

    await expect(signing.verify(tamperedBody, header)).resolves.toBe(false);
  });

  it('rejects when the Authorization header is missing', async () => {
    await expect(signing.verify(Buffer.from('{}'), undefined)).resolves.toBe(
      false,
    );
  });

  it('rejects an expired signature (replay protection)', async () => {
    const payload = { hello: 'world' };
    const rawBody = Buffer.from(JSON.stringify(payload), 'utf-8');
    const digest = (
      signing as unknown as { digestBase64(p: unknown): string }
    ).digestBase64(payload);

    const created = Math.floor(Date.now() / 1000) - 120;
    const expires = created + 30; // expired 90s ago
    const signingString = `(created): ${created}\n(expires): ${expires}\ndigest: BLAKE-512=${digest}`;
    const signature = Buffer.from(
      nacl.sign.detached(
        Buffer.from(signingString, 'utf-8'),
        keyPair.secretKey,
      ),
    ).toString('base64');

    const header =
      `Signature keyId="test-buyer.example.com|UKID1|ed25519",algorithm="ed25519",` +
      `created="${created}",expires="${expires}",headers="(created) (expires) digest",signature="${signature}"`;

    await expect(signing.verify(rawBody, header)).resolves.toBe(false);
  });
});
