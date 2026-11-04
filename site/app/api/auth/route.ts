import { env } from "cloudflare:workers";
import { createAuthStore, AuthError } from "../../../db/auth";

export const dynamic = "force-dynamic";

type MailEnv = { DB?: D1Database; AUTH_PEPPER?: string; BREVO_API_KEY?: string; BREVO_SENDER_EMAIL?: string; BREVO_SENDER_NAME?: string };
const bindings = env as MailEnv;

function tokenFrom(request: Request) {
  return request.headers.get("cookie")?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith("dayly_session="))?.slice("dayly_session=".length) ?? null;
}

function cookie(token: string, maxAge: number, request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `dayly_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}

async function sendCode(email: string, code: string) {
  if (!bindings.BREVO_API_KEY || !bindings.BREVO_SENDER_EMAIL) throw new Error("Email sender unconfigured");
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": bindings.BREVO_API_KEY, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { email: bindings.BREVO_SENDER_EMAIL, name: bindings.BREVO_SENDER_NAME ?? "DaylyTrack" },
      to: [{ email }],
      subject: "DaylyTrack 驗證碼",
      textContent: `你的 DaylyTrack 驗證碼是 ${code}。有效期 10 分鐘。若非你本人操作，請忽略此電郵。`,
    }),
  });
  if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
}

function auth() {
  if (!bindings.DB) throw new AuthError("Database unavailable", 503);
  return createAuthStore(bindings.DB, sendCode, bindings.AUTH_PEPPER ?? "");
}

function errorResponse(error: unknown) {
  if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof SyntaxError) return Response.json({ error: "Invalid JSON" }, { status: 400 });
  console.error("Authentication request failed", error);
  return Response.json({ error: "Authentication unavailable" }, { status: 503 });
}

export async function GET(request: Request) {
  try {
    const active = await auth().session(tokenFrom(request));
    return Response.json(active ? { accountId: active.account_id, email: active.email, expiresAt: active.expires_at } : null,
      { status: active ? 200 : 401, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return Response.json({ error: "Invalid origin" }, { status: 403 });
  try {
    const body = await request.json() as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new AuthError("Invalid request body");
    const action = body.action;
    const email = body.email;
    const code = body.code;
    const currentToken = tokenFrom(request);
    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    const store = auth();
    if (action === "requestCode") {
      if (typeof email !== "string") throw new AuthError("Invalid email");
      const purpose = body.purpose === "change" ? "change" : "login";
      const active = purpose === "change" ? await store.session(currentToken) : null;
      if (purpose === "change" && !active) throw new AuthError("Authentication required", 401);
      await store.requestCode(email, purpose, ip, active?.account_id);
      return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    }
    if (action === "verifyCode") {
      if (typeof email !== "string" || typeof code !== "string") throw new AuthError("Invalid code");
      const purpose = body.purpose === "change" ? "change" : "login";
      const result = await store.verifyCode(email, code, purpose, ip, currentToken);
      const response = Response.json({ accountId: result.accountId, expiresAt: result.expiresAt }, { headers: { "Cache-Control": "no-store" } });
      if (purpose === "login") response.headers.set("Set-Cookie", cookie(result.token, 7 * 86400, request));
      return response;
    }
    if (!currentToken || !await store.session(currentToken)) throw new AuthError("Authentication required", 401);
    if (action === "logout" || action === "deactivate") {
      if (action === "logout") await store.logout(currentToken);
      else await store.deactivate(currentToken);
      const response = Response.json({ ok: true }, { headers: { "Cache-Control": "no-store", "Clear-Site-Data": '"storage"' } });
      response.headers.set("Set-Cookie", cookie("", 0, request));
      return response;
    }
    throw new AuthError("Unknown action");
  } catch (error) { return errorResponse(error); }
}
