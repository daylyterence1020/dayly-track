import { env } from "cloudflare:workers";
import { getDb } from "./index";
import { accounts } from "./schema";

const demoAccountId = "dayly-local-demo-account";

// The binding exists only in Vite's local serve config. A loopback host is also
// required so a deployed Worker cannot accept a demo identity by accident.
export async function localDemoAccount(request: Request) {
  const host = new URL(request.url).hostname;
  if ((env as { DAYLY_LOCAL_DEMO?: string }).DAYLY_LOCAL_DEMO !== "1" ||
    !["localhost", "127.0.0.1", "::1"].includes(host)) return null;

  await getDb().insert(accounts).values({
    id: demoAccountId,
    email: "demo@daylytrack.invalid",
    createdAt: Math.floor(Date.now() / 1000),
  }).onConflictDoNothing();
  return { account_id: demoAccountId };
}
