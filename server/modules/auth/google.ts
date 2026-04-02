import { OAuth2Client } from 'google-auth-library';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

const oauthClient = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);

export interface GoogleUserInfo {
  googleId: string;
  email: string;
  name: string;
  picture?: string;
  emailVerified: boolean;
}

/**
 * Verify a Google ID token (from frontend Google Sign-In)
 * Returns the user's Google profile info
 */
export async function verifyGoogleToken(idToken: string): Promise<GoogleUserInfo> {
  const ticket = await oauthClient.verifyIdToken({
    idToken,
    audience: GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();

  if (!payload) {
    throw new Error('Invalid Google token: no payload');
  }

  if (!payload.sub || !payload.email) {
    throw new Error('Invalid Google token: missing user info');
  }

  return {
    googleId: payload.sub,
    email: payload.email,
    name: payload.name || payload.email.split('@')[0],
    picture: payload.picture,
    emailVerified: payload.email_verified || false,
  };
}

/**
 * Verify a Google access token via userinfo endpoint
 * Fallback method if ID token verification fails
 */
export async function verifyGoogleAccessToken(accessToken: string): Promise<GoogleUserInfo> {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Google userinfo request failed: ${response.status}`);
  }

  const data = await response.json() as any;

  return {
    googleId: data.sub,
    email: data.email,
    name: data.name || data.email?.split('@')[0] || 'User',
    picture: data.picture,
    emailVerified: data.email_verified || false,
  };
}
