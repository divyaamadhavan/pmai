import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../../db/index.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  requireAuth,
  JwtPayload,
} from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { ok, fail, badRequest, unauthorized, notFound } from '../../lib/response.js';

const router = Router();

// ─── Validation schemas ───────────────────────────────────────────────────────

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1),
  role: z.enum(['PM', 'Product Leader', 'Scrum Master']),
  productAreaId: z.string().uuid().optional(),
});

const RefreshSchema = z.object({
  refreshToken: z.string(),
});

// ─── POST /login ─────────────────────────────────────────────────────────────

router.post('/login', async (req: Request, res: Response) => {
  console.log('[login] start');
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, parsed.error.issues.map((i) => i.message).join('; '));
    return;
  }

  const { email, password } = parsed.data;
  console.log('[login] querying user:', email);

  const result = await query(
    `SELECT id, tenant_id, product_area_id, email, password_hash, full_name, role, is_active
     FROM users WHERE email = $1 LIMIT 1`,
    [email.toLowerCase()]
  );
  console.log('[login] query done, found:', result.rows.length);

  const user = result.rows[0];

  if (!user) {
    console.log('[login] user not found');
    unauthorized(res, 'Invalid email or password');
    return;
  }

  console.log('[login] comparing password, hash prefix:', (user.password_hash as string).substring(0, 7));
  const t0 = Date.now();
  const match = await bcrypt.compare(password, user.password_hash as string);
  console.log('[login] bcrypt done in', Date.now() - t0, 'ms, match:', match);

  if (!match) {
    unauthorized(res, 'Invalid email or password');
    return;
  }

  if (!user.is_active) {
    unauthorized(res, 'Account is disabled');
    return;
  }

  // Update last login timestamp
  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

  const jwtPayload: Omit<JwtPayload, 'iat' | 'exp'> = {
    sub: user.id as string,
    email: user.email as string,
    role: user.role as JwtPayload['role'],
    tenantId: user.tenant_id as string,
    productAreaId: user.product_area_id as string | null,
  };

  const accessToken = signAccessToken(jwtPayload);
  const refreshToken = signRefreshToken(user.id as string);

  // Persist refresh token hash (SHA-256 is sufficient — token is already a random JWT)
  const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await query(
    'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)',
    [uuidv4(), user.id, tokenHash, expiresAt]
  );
  console.log('[login] success for', email);

  ok(res, {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      tenantId: user.tenant_id,
      productAreaId: user.product_area_id,
    },
  });
});

// ─── POST /refresh ────────────────────────────────────────────────────────────

router.post('/refresh', async (req: Request, res: Response) => {
  const parsed = RefreshSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, 'refreshToken is required');
    return;
  }

  let userId: string;
  try {
    userId = verifyRefreshToken(parsed.data.refreshToken);
  } catch {
    unauthorized(res, 'Invalid or expired refresh token');
    return;
  }

  const userResult = await query(
    `SELECT id, tenant_id, product_area_id, email, role, is_active
     FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );

  const user = userResult.rows[0];
  if (!user || !user.is_active) {
    unauthorized(res, 'User not found or inactive');
    return;
  }

  const newAccessToken = signAccessToken({
    sub: user.id as string,
    email: user.email as string,
    role: user.role as JwtPayload['role'],
    tenantId: user.tenant_id as string,
    productAreaId: user.product_area_id as string | null,
  });

  ok(res, { accessToken: newAccessToken });
});

// ─── POST /logout ─────────────────────────────────────────────────────────────

router.post('/logout', requireAuth, async (req: Request, res: Response) => {
  const { refreshToken } = req.body as { refreshToken?: string };

  if (refreshToken) {
    // Revoke the specific token row by marking all non-expired rows for this user
    // (simple approach: revoke all tokens for this user on logout)
    await query(
      'UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1 AND revoked = FALSE',
      [req.user!.id]
    );
  }

  ok(res, { message: 'Logged out successfully' });
});

// ─── GET /me ──────────────────────────────────────────────────────────────────

router.get('/me', requireAuth, async (req: Request, res: Response) => {
  const result = await query(
    `SELECT id, tenant_id, product_area_id, email, full_name, role, last_login_at, created_at
     FROM users WHERE id = $1 LIMIT 1`,
    [req.user!.id]
  );

  const user = result.rows[0];
  if (!user) {
    notFound(res, 'User not found');
    return;
  }

  ok(res, {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    role: user.role,
    tenantId: user.tenant_id,
    productAreaId: user.product_area_id,
    lastLoginAt: user.last_login_at,
    createdAt: user.created_at,
  });
});

// ─── POST /register (Admin only) ─────────────────────────────────────────────

router.post(
  '/register',
  requireAuth,
  requireRole('Admin'),
  async (req: Request, res: Response) => {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      badRequest(res, parsed.error.issues.map((i) => i.message).join('; '));
      return;
    }

    const { email, password, fullName, role, productAreaId } = parsed.data;
    const tenantId = req.user!.tenantId;

    const existing = await query(
      'SELECT id FROM users WHERE tenant_id = $1 AND email = $2 LIMIT 1',
      [tenantId, email.toLowerCase()]
    );

    if (existing.rowCount && existing.rowCount > 0) {
      fail(res, 'A user with this email already exists', 'CONFLICT', 409);
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const userId = uuidv4();

    await query(
      `INSERT INTO users (id, tenant_id, product_area_id, email, password_hash, full_name, role)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, tenantId, productAreaId ?? null, email.toLowerCase(), passwordHash, fullName, role]
    );

    ok(
      res,
      { id: userId, email: email.toLowerCase(), fullName, role, tenantId, productAreaId: productAreaId ?? null },
      201
    );
  }
);

export default router;
