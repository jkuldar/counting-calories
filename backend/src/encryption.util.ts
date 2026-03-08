import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const ENCRYPT_PREFIX = 'enc:';

function getKey(): Buffer | null {
  const keyString = process.env.ENCRYPTION_KEY;
  if (!keyString) return null;
  // Normalise any-length key to 32 bytes via SHA-256
  return createHash('sha256').update(keyString).digest();
}

export function encryptValue(value: string): string {
  const key = getKey();
  if (!key) return value; // No key configured – store plain (dev mode)

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${ENCRYPT_PREFIX}${iv.toString('hex')}:${encrypted.toString('hex')}:${authTag.toString('hex')}`;
}

export function decryptValue(value: string): string {
  if (!value.startsWith(ENCRYPT_PREFIX)) return value; // Plain-text (legacy or no key)

  const key = getKey();
  if (!key) return value;

  const parts = value.slice(ENCRYPT_PREFIX.length).split(':');
  if (parts.length !== 3) return value;

  try {
    const [ivHex, encryptedHex, authTagHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    return value; // Return as-is if decryption fails (tampered / wrong key)
  }
}

export function encryptArray(values: string[]): string[] {
  return values.map(encryptValue);
}

export function decryptArray(values: string[]): string[] {
  return values.map(decryptValue);
}
