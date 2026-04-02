import crypto from 'crypto';
import { db } from '../../db/client.js';
import { otpCodes } from '../../db/schema/index.js';
import { eq, and, gt, isNull } from 'drizzle-orm';

const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 10;
const MAX_ATTEMPTS = 5;

/**
 * Generate a cryptographically secure OTP code
 */
function generateOTP(): string {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Create and store an OTP code for a given identifier (email or phone)
 */
export async function createOTP(
  identifier: string,
  type: 'email_verify' | 'phone_verify' | 'login'
): Promise<string> {
  const code = generateOTP();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  // Invalidate any existing unused OTPs for this identifier + type
  // (We don't delete, we just let them expire — query only valid ones)

  await db.insert(otpCodes).values({
    identifier,
    code,
    type,
    attempts: 0,
    maxAttempts: MAX_ATTEMPTS,
    expiresAt,
  });

  return code;
}

/**
 * Verify an OTP code
 * Returns true if valid, false if invalid/expired/too many attempts
 */
export async function verifyOTP(
  identifier: string,
  code: string,
  type: 'email_verify' | 'phone_verify' | 'login'
): Promise<{ valid: boolean; error?: string }> {
  // Find the most recent unused OTP for this identifier + type
  const [otp] = await db
    .select()
    .from(otpCodes)
    .where(
      and(
        eq(otpCodes.identifier, identifier),
        eq(otpCodes.type, type),
        isNull(otpCodes.usedAt),
        gt(otpCodes.expiresAt, new Date())
      )
    )
    .orderBy(otpCodes.createdAt)
    .limit(1);

  if (!otp) {
    return { valid: false, error: 'No valid OTP found. Please request a new one.' };
  }

  // Check attempt limit
  if (otp.attempts >= otp.maxAttempts) {
    return { valid: false, error: 'Too many attempts. Please request a new OTP.' };
  }

  // Increment attempts
  await db
    .update(otpCodes)
    .set({ attempts: otp.attempts + 1 })
    .where(eq(otpCodes.id, otp.id));

  // Verify code
  if (otp.code !== code) {
    return {
      valid: false,
      error: `Invalid OTP. ${otp.maxAttempts - otp.attempts - 1} attempts remaining.`,
    };
  }

  // Mark as used
  await db
    .update(otpCodes)
    .set({ usedAt: new Date() })
    .where(eq(otpCodes.id, otp.id));

  return { valid: true };
}

/**
 * Send OTP via email (uses Resend API)
 * TODO: Implement actual Resend integration
 */
export async function sendEmailOTP(email: string, code: string): Promise<void> {
  // In development, just log the OTP
  if (process.env.NODE_ENV === 'development') {
    console.log(`[OTP] Email OTP for ${email}: ${code}`);
    return;
  }

  // TODO: Integrate with Resend API
  // const resend = new Resend(process.env.RESEND_API_KEY);
  // await resend.emails.send({
  //   from: process.env.OTP_FROM_EMAIL,
  //   to: email,
  //   subject: 'Your Business Copilot verification code',
  //   html: `<p>Your verification code is: <strong>${code}</strong></p><p>This code expires in ${OTP_EXPIRY_MINUTES} minutes.</p>`,
  // });

  console.log(`[OTP] Email OTP sent to ${email}`);
}

/**
 * Send OTP via SMS (uses Twilio API)
 * TODO: Implement actual Twilio integration
 */
export async function sendPhoneOTP(phone: string, code: string): Promise<void> {
  // In development, just log the OTP
  if (process.env.NODE_ENV === 'development') {
    console.log(`[OTP] Phone OTP for ${phone}: ${code}`);
    return;
  }

  // TODO: Integrate with Twilio
  // const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  // await twilio.messages.create({
  //   body: `Your Business Copilot code is: ${code}. Expires in ${OTP_EXPIRY_MINUTES} min.`,
  //   from: process.env.TWILIO_PHONE_NUMBER,
  //   to: phone,
  // });

  console.log(`[OTP] Phone OTP sent to ${phone}`);
}
