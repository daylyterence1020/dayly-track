export class AuthError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

const WEEK = 7 * 24 * 60 * 60;
const TEN_MINUTES = 10 * 60;
const encoder = new TextEncoder();

function hex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomHex(length: number) { return hex(crypto.getRandomValues(new Uint8Array(length))); }

async function sha256(value: string) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

async function codeDigest(secret: string, salt: string, code: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`${salt}:${code}`))));
}

function equalHash(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AuthError("Invalid email");
  return email;
}

type Challenge = { email: string; purpose: string; account_id: string | null; code_hash: string; salt: string; expires_at: number; attempts: number };
type Session = { account_id: string; email: string; expires_at: number };
type Sender = (email: string, code: string) => Promise<void>;

export function createAuthStore(db: D1Database, sendCode: Sender, secret: string, clock = () => Math.floor(Date.now() / 1000)) {
  const now = () => clock();

  async function limit(key: string, maximum: number, windowSeconds: number) {
    const result = await db.prepare(`INSERT INTO auth_limits (key, count, reset_at) VALUES (?, 1, ?)
      ON CONFLICT(key) DO UPDATE SET count = CASE WHEN reset_at <= ? THEN 1 ELSE count + 1 END,
        reset_at = CASE WHEN reset_at <= ? THEN excluded.reset_at ELSE reset_at END
      WHERE reset_at <= ? OR count < ? RETURNING count`)
      .bind(key, now() + windowSeconds, now(), now(), now(), maximum).first();
    if (!result) throw new AuthError("Too many requests. Try again later.", 429);
  }

  async function session(token: string | null) {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    return await db.prepare(`SELECT s.account_id, a.email, s.expires_at FROM sessions s
      JOIN accounts a ON a.id = s.account_id WHERE s.token_hash = ? AND s.revoked_at IS NULL
      AND s.expires_at > ? AND a.deactivated_at IS NULL`)
      .bind(await sha256(token), now()).first<Session>();
  }

  async function requestCode(emailInput: string, purpose: "login" | "change", ip: string, accountId?: string) {
    if (secret.length < 32) throw new AuthError("Authentication unavailable", 503);
    const email = normalizeEmail(emailInput);
    if (purpose === "change") {
      if (!accountId) throw new AuthError("Authentication required", 401);
      const existing = await db.prepare("SELECT id FROM accounts WHERE email = ? AND deactivated_at IS NULL").bind(email).first();
      if (existing) throw new AuthError("Email unavailable", 409);
    }
    const existingChallenge = await db.prepare("SELECT next_send_at FROM email_challenges WHERE email = ? AND purpose = ?")
      .bind(email, purpose).first<{ next_send_at: number }>();
    if (existingChallenge && existingChallenge.next_send_at > now()) throw new AuthError("Please wait before requesting another code", 429);
    await limit(`email:${email}`, 5, 3600);
    if (ip !== "unknown") await limit(`ip:${ip}`, 20, 3600);
    await limit("daily-email-total", 300, 86400);
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
    const salt = randomHex(16);
    await db.prepare(`INSERT INTO email_challenges (email, purpose, account_id, code_hash, salt, expires_at, next_send_at, attempts)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0) ON CONFLICT(email, purpose) DO UPDATE SET account_id = excluded.account_id,
      code_hash = excluded.code_hash, salt = excluded.salt, expires_at = excluded.expires_at,
      next_send_at = excluded.next_send_at, attempts = 0`)
      .bind(email, purpose, accountId ?? null, await codeDigest(secret, salt, code), salt, now() + TEN_MINUTES, now() + 60).run();
    try {
      await sendCode(email, code);
    } catch {
      await db.prepare("DELETE FROM email_challenges WHERE email = ? AND purpose = ? AND salt = ?")
        .bind(email, purpose, salt).run();
      throw new AuthError("Email delivery unavailable", 503);
    }
  }

  async function verifyCode(emailInput: string, code: string, purpose: "login" | "change", ip: string, currentToken?: string | null) {
    if (secret.length < 32) throw new AuthError("Authentication unavailable", 503);
    const email = normalizeEmail(emailInput);
    if (!/^\d{6}$/.test(code)) throw new AuthError("Invalid code");
    if (ip !== "unknown") await limit(`verify:${ip}`, 30, 3600);
    const challenge = await db.prepare("SELECT * FROM email_challenges WHERE email = ? AND purpose = ?")
      .bind(email, purpose).first<Challenge>();
    if (!challenge || challenge.expires_at <= now() || challenge.attempts >= 5) throw new AuthError("Code expired or invalid", 400);
    if (!equalHash(await codeDigest(secret, challenge.salt, code), challenge.code_hash)) {
      await db.prepare("UPDATE email_challenges SET attempts = attempts + 1 WHERE email = ? AND purpose = ?")
        .bind(email, purpose).run();
      throw new AuthError("Code expired or invalid", 400);
    }
    const deleted = await db.prepare("DELETE FROM email_challenges WHERE email = ? AND purpose = ? AND salt = ? RETURNING email")
      .bind(email, purpose, challenge.salt).first();
    if (!deleted) throw new AuthError("Code expired or invalid", 400);
    if (purpose === "change") {
      const active = await session(currentToken ?? null);
      if (!active || active.account_id !== challenge.account_id) throw new AuthError("Authentication required", 401);
      const changed = await db.prepare(`UPDATE accounts SET email = ? WHERE id = ? AND deactivated_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM accounts WHERE email = ? AND deactivated_at IS NULL) RETURNING id`)
        .bind(email, active.account_id, email).first();
      if (!changed) throw new AuthError("Email unavailable", 409);
      await db.prepare("UPDATE sessions SET revoked_at = ? WHERE account_id = ? AND token_hash <> ? AND revoked_at IS NULL")
        .bind(now(), active.account_id, await sha256(currentToken!)).run();
      return { accountId: active.account_id, token: currentToken!, expiresAt: active.expires_at };
    }
    const accountId = crypto.randomUUID();
    await db.prepare("INSERT OR IGNORE INTO accounts (id, email, created_at) VALUES (?, ?, ?)")
      .bind(accountId, email, now()).run();
    const account = await db.prepare("SELECT id FROM accounts WHERE email = ? AND deactivated_at IS NULL")
      .bind(email).first<{ id: string }>();
    if (!account) throw new AuthError("Account unavailable", 503);
    const token = randomHex(32);
    const expiresAt = now() + WEEK;
    await db.prepare("INSERT INTO sessions (token_hash, account_id, expires_at) VALUES (?, ?, ?)")
      .bind(await sha256(token), account.id, expiresAt).run();
    return { accountId: account.id, token, expiresAt };
  }

  async function logout(token: string) {
    await db.prepare("UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL")
      .bind(now(), await sha256(token)).run();
  }

  async function deactivate(token: string) {
    const active = await session(token);
    if (!active) throw new AuthError("Authentication required", 401);
    await db.batch([
      db.prepare("UPDATE accounts SET deactivated_at = ? WHERE id = ? AND deactivated_at IS NULL").bind(now(), active.account_id),
      db.prepare("UPDATE sessions SET revoked_at = ? WHERE account_id = ? AND revoked_at IS NULL").bind(now(), active.account_id),
    ]);
  }

  return { requestCode, verifyCode, session, logout, deactivate };
}
