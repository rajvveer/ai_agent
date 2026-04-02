import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, AccessTokenPayload } from '../lib/jwt.js';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      auth?: AccessTokenPayload;
      tenantId?: string;
      userId?: string;
      db?: any;
      features?: string[];
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing or invalid Authorization header. Expected: Bearer <token>',
      });
      return;
    }

    const token = authHeader.slice(7); // Remove 'Bearer '

    try {
      const payload = verifyAccessToken(token);
      req.auth = payload;
      req.userId = payload.userId;
      req.tenantId = payload.tenantId;
      next();
    } catch (err: any) {
      if (err.name === 'TokenExpiredError') {
        res.status(401).json({
          error: 'TokenExpired',
          message: 'Access token has expired. Please refresh your token.',
        });
        return;
      }

      res.status(401).json({
        error: 'InvalidToken',
        message: 'Access token is invalid.',
      });
      return;
    }
  } catch (err) {
    next(err);
  }
}
