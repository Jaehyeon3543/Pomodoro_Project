import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
export const hashToken = token => createHash('sha256').update(token).digest('hex');
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await derive(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(password, stored) {
  const [salt, expected] = stored.split(':');
  const hash = await derive(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return timingSafeEqual(hash, Buffer.from(expected, 'hex'));
}
export function issueSession(db, userId, now) {
  const token = randomBytes(32).toString('hex');
  db.prepare('DELETE FROM auth_sessions WHERE expires_at < ?').run(now);
  db.prepare('INSERT INTO auth_sessions VALUES (?, ?, ?)').run(hashToken(token), userId, now + 7 * 86400000);
  return token;
}
export function cookie(token, secure, clear = false) {
  return `focus_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${clear ? 0 : 604800}${secure ? '; Secure' : ''}`;
}
export function readIdentity(db, req, now) {
  const token = /(?:^|;\s*)focus_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
  if (!token) return null;
  return db.prepare('SELECT u.id, u.email, u.name, a.token_hash FROM users u JOIN auth_sessions a ON a.user_id=u.id WHERE a.token_hash=? AND a.expires_at>?').get(hashToken(token), now) || null;
}
