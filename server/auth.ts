import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { db, mapClinicianRow } from './db';
import type { Clinician } from '../src/types';

const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

// Only the SHA-256 of a token is stored, so a database leak does not hand out live sessions.
const hashToken = (token: string): string => crypto.createHash('sha256').update(token).digest('hex');

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

// Sessions live in the database so a restart or redeploy does not sign every clinician out.
export async function createSession(clinician: Clinician): Promise<{ token: string }> {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  await db.execute(
    'INSERT INTO sessions (token_hash, clinician_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    [
      hashToken(token),
      clinician.id,
      new Date(now).toISOString(),
      new Date(now + SESSION_TTL_MS).toISOString(),
    ],
  );
  return { token };
}

// The clinician is re-read on every call, so profile changes and removals apply at once.
export async function getSession(
  token: string | undefined | null,
): Promise<{ token: string; clinician: Clinician } | null> {
  if (!token) return null;
  const row = await db.queryOne<Record<string, unknown>>(
    `SELECT c.* FROM sessions s JOIN clinicians c ON c.id = s.clinician_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
    [hashToken(token), new Date().toISOString()],
  );
  return row ? { token, clinician: mapClinicianRow(row) } : null;
}

export async function revokeSession(token: string | undefined | null): Promise<void> {
  if (token) await db.execute('DELETE FROM sessions WHERE token_hash = ?', [hashToken(token)]);
}

export async function revokeOtherSessions(clinicianId: string, keepToken: string): Promise<void> {
  await db.execute('DELETE FROM sessions WHERE clinician_id = ? AND token_hash <> ?', [
    clinicianId,
    hashToken(keepToken),
  ]);
}

export async function purgeExpiredSessions(): Promise<void> {
  await db.execute('DELETE FROM sessions WHERE expires_at < ?', [new Date().toISOString()]);
}

// Failed-attempt lockout, kept in memory (per process). Keys are account emails, not IPs, because
// the app sits behind Cloudflare and Hostinger proxies where a client IP is easy to spoof.
const LOCKOUT_MAX = 8;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const failures = new Map<string, { count: number; resetAt: number }>();

export function isLocked(key: string): boolean {
  const entry = failures.get(key);
  if (!entry) return false;
  if (Date.now() > entry.resetAt) {
    failures.delete(key);
    return false;
  }
  return entry.count >= LOCKOUT_MAX;
}

export function recordFailure(key: string): void {
  const now = Date.now();
  if (failures.size > 5000) {
    for (const [k, v] of failures) if (now > v.resetAt) failures.delete(k);
  }
  const entry = failures.get(key);
  if (!entry || now > entry.resetAt) {
    failures.set(key, { count: 1, resetAt: now + LOCKOUT_WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

export function clearFailures(key: string): void {
  failures.delete(key);
}

export function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
}

export interface AuthenticatedRequest extends Request {
  clinician?: Clinician;
  sessionToken?: string;
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const session = await getSession(extractBearerToken(req));
    if (!session) {
      res.status(401).json({ error: 'Clinician authentication required. Please sign in.' });
      return;
    }
    req.clinician = session.clinician;
    req.sessionToken = session.token;
    next();
  } catch (err) {
    console.error('[auth] Session lookup failed:', err);
    res.status(500).json({ error: 'Authentication check failed. Please try again.' });
  }
}
