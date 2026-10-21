import type { ActorRef } from "@frontal-labs/open-channel-protocol";

/** Provider-neutral directory lookup port. */
export interface DirectoryProvider {
  getActor: (externalId: string) => Promise<ActorRef | undefined>;
  getGroupsForActor: (actorId: string) => Promise<string[]>;
  searchActors: (query: string) => Promise<ActorRef[]>;
}

/** External directory transport used by provider-specific factories. */
export interface DirectoryTransport {
  getActor: (externalId: string) => Promise<ActorRef | undefined>;
  getGroupsForActor: (actorId: string) => Promise<string[]>;
  searchActors: (query: string) => Promise<ActorRef[]>;
}

/** Options for a directory provider; `cacheTtlMs` sets how long lookups are cached. */
export interface DirectoryProviderOptions {
  cacheTtlMs?: number;
  transport: DirectoryTransport;
}
