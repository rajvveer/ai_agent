import jwt, { type SignOptions } from 'jsonwebtoken';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'dev-access-secret-change-in-production';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-in-production';
const ACCESS_EXPIRES_SECONDS = parseDuration(process.env.JWT_ACCESS_EXPIRES_IN || '15m');
const REFRESH_EXPIRES_SECONDS = parseDuration(process.env.JWT_REFRESH_EXPIRES_IN || '7d');

/** Parse duration strings like '15m', '7d', '1h' into seconds */
function parseDuration(dur: string): number {
  const match = dur.match(/^(\d+)([smhd])$/);
  if (!match) return 900; // default 15min
  const val = parseInt(match[1]);
  switch (match[2]) {
    case 's': return val;
    case 'm': return val * 60;
    case 'h': return val * 3600;
    case 'd': return val * 86400;
    default: return 900;
  }
}

export interface AccessTokenPayload {
  userId: string;
  tenantId: string;
  role: string;
  email?: string;
  phone?: string;
}

export interface RefreshTokenPayload {
  userId: string;
  tokenId: string; // maps to refresh_tokens.id in DB
}

// ─── Generate Tokens ───────────────────────────────────

export function generateAccessToken(payload: AccessTokenPayload): string {
  const options: SignOptions = {
    expiresIn: ACCESS_EXPIRES_SECONDS,
    issuer: 'business-copilot',
    audience: 'business-copilot-api',
  };
  return jwt.sign(payload as object, ACCESS_SECRET, options);
}

export function generateRefreshToken(payload: RefreshTokenPayload): string {
  const options: SignOptions = {
    expiresIn: REFRESH_EXPIRES_SECONDS,
    issuer: 'business-copilot',
    audience: 'business-copilot-api',
  };
  return jwt.sign(payload as object, REFRESH_SECRET, options);
}

// ─── Verify Tokens ─────────────────────────────────────

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, ACCESS_SECRET, {
    issuer: 'business-copilot',
    audience: 'business-copilot-api',
  }) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, REFRESH_SECRET, {
    issuer: 'business-copilot',
    audience: 'business-copilot-api',
  }) as RefreshTokenPayload;
}

// ─── Decode (no verification) ──────────────────────────

export function decodeToken(token: string): jwt.JwtPayload | null {
  return jwt.decode(token) as jwt.JwtPayload | null;
}
