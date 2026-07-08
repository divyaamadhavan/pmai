import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { unauthorized } from '../lib/response.js';

export interface AuthUser {
  id: string;
  email: string;
  role: 'PM' | 'Product Leader' | 'Scrum Master' | 'Admin';
  tenantId: string;
  productAreaId: string | null;
}

// Extend Express Request to carry the authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export interface JwtPayload {
  sub: string;       // user id
  email: string;
  role: AuthUser['role'];
  tenantId: string;
  productAreaId: string | null;
  iat?: number;
  exp?: number;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is required');
  return secret;
}

/** Verify the Bearer token and attach req.user. Rejects with 401 on failure. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    unauthorized(res, 'Missing or malformed Authorization header');
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, getJwtSecret()) as JwtPayload;

    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      tenantId: payload.tenantId,
      productAreaId: payload.productAreaId,
    };

    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      unauthorized(res, 'Token expired');
    } else {
      unauthorized(res, 'Invalid token');
    }
  }
}

/** Sign a short-lived access token (15 min). */
export function signAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '15m' });
}

/** Sign a long-lived refresh token (7 days). */
export function signRefreshToken(userId: string): string {
  const secret = process.env.JWT_REFRESH_SECRET ?? getJwtSecret() + '_refresh';
  return jwt.sign({ sub: userId }, secret, { expiresIn: '7d' });
}

/** Verify a refresh token. Returns the user id (sub) or throws. */
export function verifyRefreshToken(token: string): string {
  const secret = process.env.JWT_REFRESH_SECRET ?? getJwtSecret() + '_refresh';
  const payload = jwt.verify(token, secret) as { sub: string };
  return payload.sub;
}
