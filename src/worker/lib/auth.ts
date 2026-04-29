import type { Context, Next } from 'hono';
import type { Env } from './types';

export async function requireApiKey(c: Context<{ Bindings: Env }>, next: Next) {
  const provided = c.req.header('X-API-Key');
  const expected = c.env.ADMIN_API_KEY;
  if (!expected) return c.json({ error: 'ADMIN_API_KEY not set' }, 500);
  if (!provided || provided !== expected) return c.json({ error: 'Invalid API Key' }, 401);
  await next();
}

const PBKDF2_ITERATIONS = 100_000;
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;

const hex = (b: Uint8Array) => Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
const unhex = (s: string) => {
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
  return out;
};

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    km,
    KEY_LENGTH * 8
  );
  return `pbkdf2$${PBKDF2_ITERATIONS}$${hex(salt)}$${hex(new Uint8Array(bits))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = parseInt(parts[1], 10);
  const salt = unhex(parts[2]);
  const expected = unhex(parts[3]);
  const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const derived = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, km, expected.length * 8)
  );
  if (derived.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < derived.length; i++) diff |= derived[i] ^ expected[i];
  return diff === 0;
}

const b64u = (b: Uint8Array | string) => {
  const data = typeof b === 'string' ? new TextEncoder().encode(b) : b;
  let bin = '';
  for (let i = 0; i < data.length; i++) bin += String.fromCharCode(data[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64u = (s: string) => {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const importHmac = (secret: string) =>
  crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

export async function signJwt(payload: Record<string, unknown>, secret: string, expiresInSeconds = 60 * 60 * 24 * 7): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const full = { ...payload, iat: now, exp: now + expiresInSeconds };
  const data = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(full))}`;
  const key = await importHmac(secret);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)));
  return `${data}.${b64u(sig)}`;
}

export async function verifyJwt(token: string, secret: string): Promise<Record<string, any> | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const key = await importHmac(secret);
  const ok = await crypto.subtle.verify('HMAC', key, unb64u(s), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) return null;
  const payload = JSON.parse(new TextDecoder().decode(unb64u(p)));
  if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}
