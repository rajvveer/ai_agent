import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as authService from './service.js';
import { setup2FA, verify2FASetup, disable2FA } from './twoFactor.js';
import { authMiddleware } from '../../middleware/auth.js';

export const authRouter = Router();

// ─── Validation Schemas ────────────────────────────────

const emailRegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(255),
  orgName: z.string().min(1).max(255),
  plan: z.enum(['starter', 'pro', 'enterprise']).optional(),
});

const phoneRegisterSchema = z.object({
  phone: z.string().min(10).max(20),
  displayName: z.string().min(1).max(255),
  orgName: z.string().min(1).max(255),
  plan: z.enum(['starter', 'pro', 'enterprise']).optional(),
});

const emailLoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const otpRequestSchema = z.object({
  identifier: z.string().min(1), // email or phone
});

const otpVerifySchema = z.object({
  identifier: z.string().min(1),
  code: z.string().length(6),
});

const googleLoginSchema = z.object({
  idToken: z.string().min(1),
});

const twoFASchema = z.object({
  code: z.string().min(6).max(8),
});

const twoFACompleteSchema = z.object({
  userId: z.string().uuid(),
  code: z.string().min(6).max(8),
});

// ─── Helper ────────────────────────────────────────────

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// ─── Registration ──────────────────────────────────────

authRouter.post(
  '/register/email',
  asyncHandler(async (req, res) => {
    const data = emailRegisterSchema.parse(req.body);
    const result = await authService.registerWithEmail(data);
    res.status(201).json(result);
  })
);

authRouter.post(
  '/register/phone',
  asyncHandler(async (req, res) => {
    const data = phoneRegisterSchema.parse(req.body);
    const result = await authService.registerWithPhone(data);
    res.status(201).json(result);
  })
);

// ─── Login ─────────────────────────────────────────────

authRouter.post(
  '/login/email',
  asyncHandler(async (req, res) => {
    const data = emailLoginSchema.parse(req.body);
    const result = await authService.loginWithEmail(
      data.email,
      data.password,
      req.get('user-agent'),
      req.ip
    );
    res.json(result);
  })
);

authRouter.post(
  '/login/phone-otp',
  asyncHandler(async (req, res) => {
    const data = otpRequestSchema.parse(req.body);
    const result = await authService.loginWithPhoneOTP(data.identifier);
    res.json(result);
  })
);

authRouter.post(
  '/login/email-otp',
  asyncHandler(async (req, res) => {
    const data = otpRequestSchema.parse(req.body);
    const result = await authService.loginWithEmailOTP(data.identifier);
    res.json(result);
  })
);

// ─── OTP Verification ─────────────────────────────────

authRouter.post(
  '/verify-otp',
  asyncHandler(async (req, res) => {
    const data = otpVerifySchema.parse(req.body);
    const result = await authService.verifyLoginOTP(
      data.identifier,
      data.code,
      req.get('user-agent'),
      req.ip
    );
    res.json(result);
  })
);

authRouter.post(
  '/verify-email',
  asyncHandler(async (req, res) => {
    const data = otpVerifySchema.parse(req.body);
    const result = await authService.verifyEmail(data.identifier, data.code);
    res.json(result);
  })
);

authRouter.post(
  '/verify-phone',
  asyncHandler(async (req, res) => {
    const data = otpVerifySchema.parse(req.body);
    const result = await authService.verifyPhone(data.identifier, data.code);
    res.json(result);
  })
);

// ─── Google OAuth ──────────────────────────────────────

authRouter.post(
  '/google',
  asyncHandler(async (req, res) => {
    const data = googleLoginSchema.parse(req.body);
    const result = await authService.loginWithGoogle(
      data.idToken,
      req.get('user-agent'),
      req.ip
    );
    res.json(result);
  })
);

// ─── 2FA Complete Login ────────────────────────────────

authRouter.post(
  '/2fa/complete',
  asyncHandler(async (req, res) => {
    const data = twoFACompleteSchema.parse(req.body);
    const result = await authService.complete2FALogin(
      data.userId,
      data.code,
      req.get('user-agent'),
      req.ip
    );
    res.json(result);
  })
);

// ─── Token Management ──────────────────────────────────

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ error: 'Missing refreshToken in body' });
      return;
    }
    const result = await authService.refreshAccessToken(refreshToken);
    res.json(result);
  })
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    await authService.logout(refreshToken || '');
    res.json({ message: 'Logged out successfully' });
  })
);

// ─── 2FA Setup (requires auth) ────────────────────────

authRouter.post(
  '/2fa/setup',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const email = req.auth?.email || '';
    const result = await setup2FA(userId, email);
    res.json(result);
  })
);

authRouter.post(
  '/2fa/verify',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const data = twoFASchema.parse(req.body);
    const userId = req.userId!;
    const success = await verify2FASetup(userId, data.code);
    if (!success) {
      res.status(400).json({ error: 'Invalid 2FA code. Make sure your authenticator app is synced.' });
      return;
    }
    res.json({ enabled: true, message: '2FA enabled successfully.' });
  })
);

authRouter.delete(
  '/2fa',
  authMiddleware,
  asyncHandler(async (req, res) => {
    await disable2FA(req.userId!);
    res.json({ disabled: true, message: '2FA disabled.' });
  })
);
