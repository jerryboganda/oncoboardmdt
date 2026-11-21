import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Clinician } from '../src/types';

export interface SessionRecord {
  token: string;
  clinician: Clinician;
  createdAt: number;
  expiresAt: number;
}

const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
const sessions = new Map<string, SessionRecord>();

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

export function createSession(clinician: Clinician): SessionRecord {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const record: SessionRecord = {
    token,
    clinician,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
  };
  sessions.set(token, record);
  return record;
}

export function getSession(token: string | undefined | null): SessionRecord | null {
  if (!token) return null;
  const record = sessions.get(token);
  if (!record) return null;
  if (Date.now() > record.expiresAt) {
    sessions.delete(token);
    return null;
  }
  return record;
}

export function revokeSession(token: string | undefined | null): void {
  if (token) sessions.delete(token);
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

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  const session = getSession(token);
  if (!session) {
    res.status(401).json({ error: 'Clinician authentication required. Please sign in.' });
    return;
  }
  req.clinician = session.clinician;
  req.sessionToken = session.token;
  next();
}
