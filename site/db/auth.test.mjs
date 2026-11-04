import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { Miniflare } from "miniflare";
import { drizzle } from "drizzle-orm/d1";
import { createAuthStore, AuthError } from "./auth.ts";
import { createDaylyTrackStore } from "./dayly-track.ts";

test("email OTP account lifecycle, sessions, limits and data isolation", async () => {
  const miniflare = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok') } }", d1Databases: { DB: "auth-test" } });
  try {
    const d1 = await miniflare.getD1Database("DB");
    for (const filename of ["0000_marvelous_leo.sql", "0001_wise_amphibian.sql", "0002_slim_magneto.sql"]) {
      const migration = await readFile(new URL(`../drizzle/${filename}`, import.meta.url), "utf8");
      for (const statement of migration.split("--> statement-breakpoint")) if (statement.trim()) await d1.prepare(statement.trim()).run();
    }
    let time = 1_800_000_000;
    const sent = [];
    const auth = createAuthStore(d1, async (email, code) => sent.push({ email, code }), "test-secret-of-at-least-thirty-two-characters", () => time);
    await auth.requestCode(" Alice@Example.com ", "login", "1.1.1.1");
    assert.equal(sent.at(-1).email, "alice@example.com");
    await assert.rejects(auth.requestCode("alice@example.com", "login", "1.1.1.1"), { status: 429 });
    await assert.rejects(auth.verifyCode("alice@example.com", "000000", "login", "1.1.1.1"), AuthError);
    const first = await auth.verifyCode("alice@example.com", sent.at(-1).code, "login", "1.1.1.1");
    assert.equal((await auth.session(first.token)).account_id, first.accountId);
    assert.equal((await auth.session("wrong")), null);
    const db = drizzle(d1);
    const network = await createDaylyTrackStore(db, first.accountId).createNetwork("Work");
    time += 61;
    await auth.requestCode("alice@example.com", "login", "1.1.1.1");
    const second = await auth.verifyCode("alice@example.com", sent.at(-1).code, "login", "1.1.1.1");
    assert.equal(second.accountId, first.accountId);
    assert.equal((await createDaylyTrackStore(db, second.accountId).snapshot()).networks[0].id, network.id);
    await auth.requestCode("bob@example.com", "login", "2.2.2.2");
    const bob = await auth.verifyCode("bob@example.com", sent.at(-1).code, "login", "2.2.2.2");
    assert.equal((await createDaylyTrackStore(db, bob.accountId).snapshot()).networks.length, 0);
    await assert.rejects(createDaylyTrackStore(db, bob.accountId).createTask({ networkId: network.id, title: "No" }));
    await auth.requestCode("new@example.com", "change", "1.1.1.1", first.accountId);
    await auth.verifyCode("new@example.com", sent.at(-1).code, "change", "1.1.1.1", first.token);
    assert.equal((await auth.session(first.token)).email, "new@example.com");
    assert.equal(await auth.session(second.token), null);
    await auth.logout(first.token);
    assert.equal(await auth.session(first.token), null);
    time += 61;
    await auth.requestCode("new@example.com", "login", "1.1.1.1");
    const third = await auth.verifyCode("new@example.com", sent.at(-1).code, "login", "1.1.1.1");
    await auth.deactivate(third.token);
    assert.equal(await auth.session(third.token), null);
    time += 61;
    await auth.requestCode("new@example.com", "login", "1.1.1.1");
    const fresh = await auth.verifyCode("new@example.com", sent.at(-1).code, "login", "1.1.1.1");
    assert.notEqual(fresh.accountId, first.accountId);
    assert.equal((await createDaylyTrackStore(db, fresh.accountId).snapshot()).networks.length, 0);
    time += 7 * 86400;
    assert.equal(await auth.session(fresh.token), null);
  } finally { await miniflare.dispose(); }
});
