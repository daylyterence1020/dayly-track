import { env } from "cloudflare:workers";
import { createAuthStore } from "../../../db/auth";
import { createDaylyTrackStore, DataError } from "../../../db/dayly-track";
import { getDb } from "../../../db";
import { localDemoAccount } from "../../../db/local-demo";

export const dynamic = "force-dynamic";

async function account(request: Request) {
  const demo = await localDemoAccount(request);
  if (demo) return demo;
  const token = request.headers.get("cookie")?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith("dayly_session="))?.slice("dayly_session=".length) ?? null;
  if (!env.DB) return null;
  return createAuthStore(env.DB, async () => { throw new Error("No email in data route"); },
    (env as { AUTH_PEPPER?: string }).AUTH_PEPPER ?? "").session(token);
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new DataError("Invalid request body");
  return value as Record<string, unknown>;
}

function string(value: unknown, field: string): string {
  if (typeof value !== "string") throw new DataError(`${field} must be a string`);
  return value;
}

function optionalString(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  const id = string(value, field);
  if (!id) throw new DataError(`${field} cannot be empty`);
  return id;
}

function responseError(error: unknown) {
  if (error instanceof DataError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof SyntaxError) return Response.json({ error: "Invalid JSON" }, { status: 400 });
  console.error("DaylyTrack data request failed", error);
  return Response.json({ error: "Data request failed" }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const user = await account(request);
    if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
    return Response.json(await createDaylyTrackStore(getDb(), user.account_id).snapshot(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return responseError(error);
  }
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "Invalid origin" }, { status: 403 });
  try {
    const user = await account(request);
    if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
    const body = object(await request.json());
    const store = createDaylyTrackStore(getDb(), user.account_id);
    switch (body.action) {
      case "createNetwork":
        return Response.json(await store.createNetwork(string(body.name, "name")), { status: 201 });
      case "setDefaultNetwork":
        await store.setDefaultNetwork(string(body.networkId, "networkId"));
        return Response.json({ ok: true });
      case "createPerson":
        if (!Array.isArray(body.networkIds) || !body.networkIds.every((id) => typeof id === "string")) {
          throw new DataError("networkIds must be a string array");
        }
        return Response.json(await store.createPerson(string(body.name, "name"), body.networkIds), { status: 201 });
      case "addPersonToNetwork":
        await store.addPersonToNetwork(string(body.personId, "personId"), string(body.networkId, "networkId"));
        return Response.json({ ok: true });
      case "createTask":
        if (body.dueAt !== undefined && body.dueAt !== null && typeof body.dueAt !== "number") {
          throw new DataError("dueAt must be Unix seconds");
        }
        return Response.json(await store.createTask({
          networkId: string(body.networkId, "networkId"),
          title: string(body.title, "title"),
          dueAt: body.dueAt as number | null | undefined,
          fromPersonId: optionalString(body.fromPersonId, "fromPersonId"),
          toPersonId: optionalString(body.toPersonId, "toPersonId"),
        }), { status: 201 });
      default:
        throw new DataError("Unknown action");
    }
  } catch (error) {
    return responseError(error);
  }
}
