import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { Miniflare } from "miniflare";
import { drizzle } from "drizzle-orm/d1";
import { createDaylyTrackStore, DataError } from "./dayly-track.ts";

test("local D1 model and owner isolation", async () => {
  const miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    d1Databases: { DB: "dayly-track-test" },
  });
  try {
    const d1 = await miniflare.getD1Database("DB");
    for (const filename of ["0000_marvelous_leo.sql", "0001_wise_amphibian.sql", "0002_slim_magneto.sql"]) {
      const migration = await readFile(new URL(`../drizzle/${filename}`, import.meta.url), "utf8");
      for (const statement of migration.split("--> statement-breakpoint")) {
        if (statement.trim()) await d1.prepare(statement.trim()).run();
      }
    }
    const db = drizzle(d1);
    const aliceId = crypto.randomUUID();
    const bobId = crypto.randomUUID();
    await d1.prepare("INSERT INTO accounts (id, email, created_at) VALUES (?, ?, ?)")
      .bind(aliceId, "alice@example.test", 1800000000).run();
    await d1.prepare("INSERT INTO accounts (id, email, created_at) VALUES (?, ?, ?)")
      .bind(bobId, "bob@example.test", 1800000000).run();
    const alice = createDaylyTrackStore(db, aliceId);
    const bob = createDaylyTrackStore(db, bobId);

    await assert.rejects(createDaylyTrackStore(db, "not-an-account").createNetwork("Invalid owner"));

    const work = await alice.createNetwork(" Work ");
    const home = await alice.createNetwork("Home");
    const bobNetwork = await bob.createNetwork("Private");
    assert.equal((await alice.snapshot()).defaultNetworkId, work.id);
    assert.equal((await bob.snapshot()).defaultNetworkId, bobNetwork.id);

    const person = await alice.createPerson("Alex", [work.id, home.id]);
    await alice.createPerson("Alex", [work.id]); // Same names are valid.
    const task = await alice.createTask({ networkId: work.id, title: "Send update", fromPersonId: person.id });
    assert.ok(task.id);
    assert.equal((await alice.snapshot()).memberships.filter((row) => row.personId === person.id).length, 2);
    assert.equal((await bob.snapshot()).tasks.length, 0);
    assert.equal((await bob.snapshot()).people.length, 0);

    await assert.rejects(alice.createPerson("Orphan", []), DataError);
    await assert.rejects(alice.createTask({ networkId: bobNetwork.id, title: "Wrong owner" }), DataError);
    await assert.rejects(bob.createTask({ networkId: bobNetwork.id, title: "Wrong person", fromPersonId: person.id }), DataError);
    await assert.rejects(bob.setDefaultNetwork(work.id), DataError);
    await assert.rejects(alice.createTask({ networkId: work.id, title: "Same person", fromPersonId: person.id, toPersonId: person.id }), DataError);
    await assert.rejects(alice.createTask({ networkId: work.id, title: "Minutes", dueAt: 3601 }), DataError);

    await assert.rejects(
      d1.prepare("INSERT INTO network_people (owner_id, network_id, person_id) VALUES (?, ?, ?)")
        .bind(aliceId, work.id, (await bob.createPerson("Bob", [bobNetwork.id])).id).run(),
    );
    await assert.rejects(
      d1.prepare("INSERT INTO tasks (id, owner_id, network_id, title, status) VALUES (?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), aliceId, work.id, "Invalid", "unknown").run(),
    );
    await alice.setDefaultNetwork(home.id);
    assert.equal((await alice.snapshot()).defaultNetworkId, home.id);
    assert.equal((await bob.snapshot()).defaultNetworkId, bobNetwork.id);
  } finally {
    await miniflare.dispose();
  }
});
