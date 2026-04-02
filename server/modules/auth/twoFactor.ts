import { authenticator } from 'otplib';
import crypto from 'crypto';
import { db } from '../../db/client.js';
import { twoFactorSecrets } from '../../db/schema/index.js';
import { eq } from 'drizzle-orm';

const APP_NAME = 'BusinessCopilot';
const BACKUP_CODE_COUNT = 10;

/**
 * Generate a new TOTP secret for a user
 * Returns the secret and a provisioning URI for QR code generation
 */
export async function setup2FA(userId: string, userEmail: string): Promise<{
  secret: string;
  otpauthUrl: string;
  backupCodes: string[];
}> {
  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri(userEmail, APP_NAME, secret);

  // Generate backup codes
  const backupCodes = Array.from({ length: BACKUP_CODE_COUNT }, () =>
    crypto.randomBytes(4).toString('hex').toUpperCase()
  );

  // Hash backup codes for storage
  const hashedBackupCodes = backupCodes.map((code) =>
    crypto.createHash('sha256').update(code).digest('hex')
  );

  // Store secret (upsert — replace if exists)
  const existing = await db
    .select()
    .from(twoFactorSecrets)
    .where(eq(twoFactorSecrets.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(twoFactorSecrets)
      .set({
        secret,
        backupCodes: JSON.stringify(hashedBackupCodes),
        verified: false,
        updatedAt: new Date(),
      })
      .where(eq(twoFactorSecrets.userId, userId));
  } else {
    await db.insert(twoFactorSecrets).values({
      userId,
      secret,
      backupCodes: JSON.stringify(hashedBackupCodes),
      verified: false,
    });
  }

  return { secret, otpauthUrl, backupCodes };
}

/**
 * Verify a TOTP code and enable 2FA
 * Called after setup to confirm the user has configured their authenticator app
 */
export async function verify2FASetup(userId: string, token: string): Promise<boolean> {
  const [record] = await db
    .select()
    .from(twoFactorSecrets)
    .where(eq(twoFactorSecrets.userId, userId))
    .limit(1);

  if (!record) return false;

  const isValid = authenticator.verify({ token, secret: record.secret });

  if (isValid) {
    await db
      .update(twoFactorSecrets)
      .set({ verified: true, updatedAt: new Date() })
      .where(eq(twoFactorSecrets.userId, userId));
  }

  return isValid;
}

/**
 * Validate a TOTP code during login
 */
export async function validate2FA(userId: string, token: string): Promise<boolean> {
  const [record] = await db
    .select()
    .from(twoFactorSecrets)
    .where(eq(twoFactorSecrets.userId, userId))
    .limit(1);

  if (!record || !record.verified) return false;

  // First try TOTP validation
  const isValidTOTP = authenticator.verify({ token, secret: record.secret });
  if (isValidTOTP) return true;

  // Then try backup code
  const hashedInput = crypto.createHash('sha256').update(token.toUpperCase()).digest('hex');
  const backupCodes: string[] = JSON.parse(record.backupCodes || '[]');
  const codeIndex = backupCodes.indexOf(hashedInput);

  if (codeIndex !== -1) {
    // Remove used backup code
    backupCodes.splice(codeIndex, 1);
    await db
      .update(twoFactorSecrets)
      .set({
        backupCodes: JSON.stringify(backupCodes),
        updatedAt: new Date(),
      })
      .where(eq(twoFactorSecrets.userId, userId));
    return true;
  }

  return false;
}

/**
 * Disable 2FA for a user
 */
export async function disable2FA(userId: string): Promise<void> {
  await db.delete(twoFactorSecrets).where(eq(twoFactorSecrets.userId, userId));
}

/**
 * Check if user has 2FA enabled
 */
export async function has2FA(userId: string): Promise<boolean> {
  const [record] = await db
    .select()
    .from(twoFactorSecrets)
    .where(eq(twoFactorSecrets.userId, userId))
    .limit(1);

  return !!record?.verified;
}
