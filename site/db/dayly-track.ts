import { and, eq } from "drizzle-orm";
import type { getDb } from "./index.ts";
import { networkPeople, networks, people, tasks, userSettings } from "./schema.ts";

type Database = ReturnType<typeof getDb>;

export class DataError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function requiredName(value: string, field: string) {
  const name = value.trim();
  if (!name) throw new DataError(`${field} is required`);
  return name;
}

export function createDaylyTrackStore(db: Database, ownerId: string) {
  if (!ownerId) throw new DataError("Authentication required", 401);

  async function hasNetwork(networkId: string) {
    const [network] = await db.select({ id: networks.id }).from(networks)
      .where(and(eq(networks.ownerId, ownerId), eq(networks.id, networkId))).limit(1);
    return Boolean(network);
  }

  async function hasPerson(personId: string) {
    const [person] = await db.select({ id: people.id }).from(people)
      .where(and(eq(people.ownerId, ownerId), eq(people.id, personId))).limit(1);
    return Boolean(person);
  }

  async function hasMembership(networkId: string, personId: string) {
    const [membership] = await db.select({ personId: networkPeople.personId }).from(networkPeople)
      .where(and(
        eq(networkPeople.ownerId, ownerId),
        eq(networkPeople.networkId, networkId),
        eq(networkPeople.personId, personId),
      )).limit(1);
    return Boolean(membership);
  }

  return {
    async snapshot() {
      const [ownedNetworks, ownedPeople, memberships, ownedTasks, settings] = await Promise.all([
        db.select().from(networks).where(eq(networks.ownerId, ownerId)),
        db.select().from(people).where(eq(people.ownerId, ownerId)),
        db.select().from(networkPeople).where(eq(networkPeople.ownerId, ownerId)),
        db.select().from(tasks).where(eq(tasks.ownerId, ownerId)),
        db.select().from(userSettings).where(eq(userSettings.ownerId, ownerId)).limit(1),
      ]);
      return {
        networks: ownedNetworks,
        people: ownedPeople,
        memberships,
        tasks: ownedTasks,
        defaultNetworkId: settings[0]?.defaultNetworkId ?? null,
      };
    },

    async createNetwork(nameInput: string) {
      const name = requiredName(nameInput, "Network name");
      const id = crypto.randomUUID();
      // One D1 batch makes the first network and its default setting atomic.
      await db.batch([
        db.insert(networks).values({ id, ownerId, name }),
        db.insert(userSettings).values({ ownerId, defaultNetworkId: id }).onConflictDoNothing(),
      ]);
      return { id, name };
    },

    async setDefaultNetwork(networkId: string) {
      if (!await hasNetwork(networkId)) throw new DataError("Network not found", 404);
      await db.insert(userSettings).values({ ownerId, defaultNetworkId: networkId })
        .onConflictDoUpdate({ target: userSettings.ownerId, set: { defaultNetworkId: networkId } });
    },

    async createPerson(nameInput: string, networkIdsInput: string[]) {
      const name = requiredName(nameInput, "Person name");
      const networkIds = [...new Set(networkIdsInput)];
      if (networkIds.length === 0) throw new DataError("A person needs at least one network");
      for (const networkId of networkIds) {
        if (!await hasNetwork(networkId)) throw new DataError("Network not found", 404);
      }
      const id = crypto.randomUUID();
      await db.batch([
        db.insert(people).values({ id, ownerId, name }),
        db.insert(networkPeople).values(networkIds.map((networkId) => ({ ownerId, networkId, personId: id }))),
      ]);
      return { id, name };
    },

    async addPersonToNetwork(personId: string, networkId: string) {
      if (!await hasPerson(personId)) throw new DataError("Person not found", 404);
      if (!await hasNetwork(networkId)) throw new DataError("Network not found", 404);
      await db.insert(networkPeople).values({ ownerId, networkId, personId }).onConflictDoNothing();
    },

    async createTask(input: {
      networkId: string;
      title: string;
      dueAt?: number | null;
      fromPersonId?: string | null;
      toPersonId?: string | null;
    }) {
      const title = requiredName(input.title, "Task title");
      if (!await hasNetwork(input.networkId)) throw new DataError("Network not found", 404);
      const dueAt = input.dueAt ?? null;
      if (dueAt !== null && (!Number.isSafeInteger(dueAt) || dueAt % 3600 !== 0)) {
        throw new DataError("Due time must be a Hong Kong whole hour in Unix seconds");
      }
      const fromPersonId = input.fromPersonId ?? null;
      const toPersonId = input.toPersonId ?? null;
      if (fromPersonId && fromPersonId === toPersonId) {
        throw new DataError("From and To must be different people");
      }
      for (const personId of [fromPersonId, toPersonId]) {
        if (personId && !await hasMembership(input.networkId, personId)) {
          throw new DataError("Person is not a current network member");
        }
      }
      const id = crypto.randomUUID();
      await db.insert(tasks).values({
        id, ownerId, networkId: input.networkId, title, dueAt, fromPersonId, toPersonId,
      });
      return { id, title };
    },
  };
}
