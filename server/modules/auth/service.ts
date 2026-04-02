import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db/client.js';
import { users, tenants, featureFlags, onboardingState, refreshTokens } from '../../db/schema/index.js';
import { eq, or } from 'drizzle-orm';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../../lib/jwt.js';
import { createOTP, verifyOTP, sendEmailOTP, sendPhoneOTP } from './otp.js';
import { has2FA, validate2FA } from './twoFactor.js';
import { verifyGoogleToken, verifyGoogleAccessToken } from './google.js';

const SALT_ROUNDS = 12;

// Default modules enabled for each plan tier
const PLAN_MODULES: Record<string, string[]> = {
  starter: ['agent', 'finance', 'crm'],
  pro: ['agent', 'finance', 'crm', 'marketing', 'hiring', 'competitor', 'memory'],
  enterprise: ['agent', 'finance', 'crm', 'marketing', 'hiring', 'competitor', 'memory', 'voice', 'audit'],
};

// ─── Token Generation ──────────────────────────────────

async function createTokenPair(user: any, userAgent?: string, ip?: string) {
  const tokenId = uuidv4();

  const accessToken = generateAccessToken({
    userId: user.id,
    tenantId: user.tenantId,
    role: user.role,
    email: user.email || undefined,
    phone: user.phone || undefined,
  });

  const refreshToken = generateRefreshToken({
    userId: user.id,
    tokenId,
  });

  // Store refresh token in DB for revocation support
  await db.insert(refreshTokens).values({
    id: tokenId,
    userId: user.id,
    token: refreshToken,
    userAgent: userAgent || null,
    ipAddress: ip || null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
  });

  // Update last login
  await db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, user.id));

  return { accessToken, refreshToken };
}

// ─── Tenant Provisioning ───────────────────────────────

async function provisionTenant(name: string, plan: string = 'starter'): Promise<string> {
  const [tenant] = await db.insert(tenants).values({
    name,
    plan,
    status: 'active',
  }).returning();

  // Insert default feature flags based on plan
  const modules = PLAN_MODULES[plan] || PLAN_MODULES.starter;
  for (const moduleName of modules) {
    await db.insert(featureFlags).values({
      tenantId: tenant.id,
      moduleName,
      enabled: true,
    });
  }

  // Create onboarding state
  const steps = ['profile', 'team', 'integrations', 'first_conversation'];
  for (const step of steps) {
    await db.insert(onboardingState).values({
      tenantId: tenant.id,
      step,
    });
  }

  return tenant.id;
}

// ─── Register ──────────────────────────────────────────

export async function registerWithEmail(data: {
  email: string;
  password: string;
  displayName: string;
  orgName: string;
  plan?: string;
}) {
  // Check if email already exists
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, data.email))
    .limit(1);

  if (existing.length > 0) {
    throw Object.assign(new Error('Email already registered'), { statusCode: 409, code: 'EMAIL_EXISTS' });
  }

  // Hash password
  const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);

  // Create tenant
  const tenantId = await provisionTenant(data.orgName, data.plan);

  // Create user
  const [user] = await db.insert(users).values({
    tenantId,
    email: data.email,
    passwordHash,
    displayName: data.displayName,
    role: 'owner', // First user is always owner
    emailVerified: false,
  }).returning();

  // Send email verification OTP
  const otpCode = await createOTP(data.email, 'email_verify');
  await sendEmailOTP(data.email, otpCode);

  // Generate tokens
  const tokens = await createTokenPair(user);

  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      tenantId: user.tenantId,
      emailVerified: user.emailVerified,
    },
    ...tokens,
  };
}

export async function registerWithPhone(data: {
  phone: string;
  displayName: string;
  orgName: string;
  plan?: string;
}) {
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.phone, data.phone))
    .limit(1);

  if (existing.length > 0) {
    throw Object.assign(new Error('Phone number already registered'), { statusCode: 409, code: 'PHONE_EXISTS' });
  }

  const tenantId = await provisionTenant(data.orgName, data.plan);

  const [user] = await db.insert(users).values({
    tenantId,
    phone: data.phone,
    displayName: data.displayName,
    role: 'owner',
    phoneVerified: false,
  }).returning();

  // Send phone verification OTP
  const otpCode = await createOTP(data.phone, 'phone_verify');
  await sendPhoneOTP(data.phone, otpCode);

  const tokens = await createTokenPair(user);

  return {
    user: {
      id: user.id,
      phone: user.phone,
      displayName: user.displayName,
      role: user.role,
      tenantId: user.tenantId,
      phoneVerified: user.phoneVerified,
    },
    ...tokens,
    otpSent: true,
  };
}

// ─── Login ─────────────────────────────────────────────

export async function loginWithEmail(email: string, password: string, userAgent?: string, ip?: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    throw Object.assign(new Error('Invalid email or password'), { statusCode: 401, code: 'INVALID_CREDENTIALS' });
  }

  if (!user.passwordHash) {
    throw Object.assign(new Error('This account uses social login. Please sign in with Google.'), {
      statusCode: 401,
      code: 'USE_SOCIAL_LOGIN',
    });
  }

  const isValidPassword = await bcrypt.compare(password, user.passwordHash);
  if (!isValidPassword) {
    throw Object.assign(new Error('Invalid email or password'), { statusCode: 401, code: 'INVALID_CREDENTIALS' });
  }

  // Check if 2FA is enabled
  const twoFactorEnabled = await has2FA(user.id);
  if (twoFactorEnabled) {
    // Return a temporary token that requires 2FA completion
    return {
      requires2FA: true,
      tempUserId: user.id,
      message: 'Please provide your 2FA code to complete login.',
    };
  }

  const tokens = await createTokenPair(user, userAgent, ip);

  return {
    requires2FA: false,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      tenantId: user.tenantId,
    },
    ...tokens,
  };
}

export async function loginWithPhoneOTP(phone: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.phone, phone))
    .limit(1);

  if (!user) {
    throw Object.assign(new Error('Phone number not registered'), { statusCode: 404, code: 'USER_NOT_FOUND' });
  }

  const otpCode = await createOTP(phone, 'login');
  await sendPhoneOTP(phone, otpCode);

  return { otpSent: true, message: 'OTP sent to your phone number.' };
}

export async function loginWithEmailOTP(email: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    throw Object.assign(new Error('Email not registered'), { statusCode: 404, code: 'USER_NOT_FOUND' });
  }

  const otpCode = await createOTP(email, 'login');
  await sendEmailOTP(email, otpCode);

  return { otpSent: true, message: 'OTP sent to your email.' };
}

export async function verifyLoginOTP(identifier: string, code: string, userAgent?: string, ip?: string) {
  const result = await verifyOTP(identifier, code, 'login');

  if (!result.valid) {
    throw Object.assign(new Error(result.error || 'Invalid OTP'), { statusCode: 401, code: 'INVALID_OTP' });
  }

  // Find user by email or phone
  const [user] = await db
    .select()
    .from(users)
    .where(
      or(
        eq(users.email, identifier),
        eq(users.phone, identifier)
      )
    )
    .limit(1);

  if (!user) {
    throw Object.assign(new Error('User not found'), { statusCode: 404, code: 'USER_NOT_FOUND' });
  }

  // Mark as verified
  if (identifier.includes('@')) {
    await db.update(users).set({ emailVerified: true }).where(eq(users.id, user.id));
  } else {
    await db.update(users).set({ phoneVerified: true }).where(eq(users.id, user.id));
  }

  // Check 2FA
  const twoFactorEnabled = await has2FA(user.id);
  if (twoFactorEnabled) {
    return {
      requires2FA: true,
      tempUserId: user.id,
    };
  }

  const tokens = await createTokenPair(user, userAgent, ip);

  return {
    requires2FA: false,
    user: {
      id: user.id,
      email: user.email,
      phone: user.phone,
      displayName: user.displayName,
      role: user.role,
      tenantId: user.tenantId,
    },
    ...tokens,
  };
}

// ─── Complete 2FA Login ────────────────────────────────

export async function complete2FALogin(userId: string, token: string, userAgent?: string, ip?: string) {
  const isValid = await validate2FA(userId, token);

  if (!isValid) {
    throw Object.assign(new Error('Invalid 2FA code'), { statusCode: 401, code: 'INVALID_2FA' });
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw Object.assign(new Error('User not found'), { statusCode: 404, code: 'USER_NOT_FOUND' });
  }

  const tokens = await createTokenPair(user, userAgent, ip);

  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      tenantId: user.tenantId,
    },
    ...tokens,
  };
}

// ─── Google OAuth ──────────────────────────────────────

export async function loginWithGoogle(idToken: string, userAgent?: string, ip?: string) {
  let googleUser;

  try {
    googleUser = await verifyGoogleToken(idToken);
  } catch {
    // Fallback to access token verification
    googleUser = await verifyGoogleAccessToken(idToken);
  }

  // Check if user exists by Google ID or email
  let [user] = await db
    .select()
    .from(users)
    .where(
      or(
        eq(users.googleId, googleUser.googleId),
        eq(users.email, googleUser.email)
      )
    )
    .limit(1);

  if (user) {
    // Update Google ID if not set (linking existing email account)
    if (!user.googleId) {
      await db
        .update(users)
        .set({
          googleId: googleUser.googleId,
          emailVerified: true,
          avatarUrl: googleUser.picture || user.avatarUrl,
        })
        .where(eq(users.id, user.id));
    }
  } else {
    // New user — create tenant and user
    const tenantId = await provisionTenant(googleUser.name + "'s Company");

    [user] = await db.insert(users).values({
      tenantId,
      email: googleUser.email,
      googleId: googleUser.googleId,
      displayName: googleUser.name,
      avatarUrl: googleUser.picture || null,
      role: 'owner',
      emailVerified: true,
    }).returning();
  }

  const tokens = await createTokenPair(user, userAgent, ip);

  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      tenantId: user.tenantId,
      avatarUrl: user.avatarUrl,
      isNewUser: !user.lastLoginAt,
    },
    ...tokens,
  };
}

// ─── Token Refresh ─────────────────────────────────────

export async function refreshAccessToken(token: string) {
  const payload = verifyRefreshToken(token);

  // Check if token exists in DB and is not revoked
  const [stored] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.id, payload.tokenId))
    .limit(1);

  if (!stored || stored.revokedAt) {
    throw Object.assign(new Error('Refresh token revoked or invalid'), { statusCode: 401, code: 'TOKEN_REVOKED' });
  }

  if (new Date() > stored.expiresAt) {
    throw Object.assign(new Error('Refresh token expired'), { statusCode: 401, code: 'TOKEN_EXPIRED' });
  }

  // Get user
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, payload.userId))
    .limit(1);

  if (!user) {
    throw Object.assign(new Error('User not found'), { statusCode: 404, code: 'USER_NOT_FOUND' });
  }

  // Revoke old refresh token (token rotation)
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.id, payload.tokenId));

  // Issue new token pair
  const tokens = await createTokenPair(user, stored.userAgent || undefined, stored.ipAddress || undefined);

  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      tenantId: user.tenantId,
    },
    ...tokens,
  };
}

// ─── Logout ────────────────────────────────────────────

export async function logout(refreshToken: string): Promise<void> {
  try {
    const payload = verifyRefreshToken(refreshToken);
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.id, payload.tokenId));
  } catch {
    // If token is invalid, that's fine — user is already effectively logged out
  }
}

// ─── Verify Email/Phone ────────────────────────────────

export async function verifyEmail(email: string, code: string) {
  const result = await verifyOTP(email, code, 'email_verify');
  if (!result.valid) {
    throw Object.assign(new Error(result.error || 'Invalid OTP'), { statusCode: 401, code: 'INVALID_OTP' });
  }

  await db.update(users).set({ emailVerified: true }).where(eq(users.email, email));
  return { verified: true };
}

export async function verifyPhone(phone: string, code: string) {
  const result = await verifyOTP(phone, code, 'phone_verify');
  if (!result.valid) {
    throw Object.assign(new Error(result.error || 'Invalid OTP'), { statusCode: 401, code: 'INVALID_OTP' });
  }

  await db.update(users).set({ phoneVerified: true }).where(eq(users.phone, phone));
  return { verified: true };
}
