import { Request, Response, NextFunction } from 'express';
import { AuthUser } from './auth.js';
import { forbidden, unauthorized } from '../lib/response.js';

type Role = AuthUser['role'];

/**
 * Middleware factory — only allow requests from users whose role is in the
 * provided allowlist.  Admin always passes.
 *
 * Usage:
 *   router.delete('/:id', requireAuth, requireRole('Product Leader', 'Admin'), handler)
 */
export function requireRole(...allowedRoles: Role[]) {
  return function rbacMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    if (!req.user) {
      unauthorized(res);
      return;
    }

    const { role } = req.user;

    // Admins bypass all role gates
    if (role === 'Admin' || allowedRoles.includes(role)) {
      next();
      return;
    }

    forbidden(
      res,
      `Role '${role}' is not permitted to perform this action. Required: ${allowedRoles.join(' | ')}`
    );
  };
}

/**
 * Middleware that verifies the requesting user belongs to the same tenant as
 * any :tenantId route param. Guards cross-tenant data leakage.
 */
export function requireSameTenant(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    unauthorized(res);
    return;
  }

  const paramTenantId = req.params['tenantId'];
  if (paramTenantId && paramTenantId !== req.user.tenantId) {
    forbidden(res, 'Access to this tenant is not permitted');
    return;
  }

  next();
}
