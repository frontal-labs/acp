import type { DirectoryProvider, DirectoryProviderOptions } from "./types.js";

/** Adds bounded in-memory caching to an injected directory transport. */
export class CachedDirectoryProvider implements DirectoryProvider {
  private readonly actorCache = new Map<
    string,
    { expiresAt: number; value: Awaited<ReturnType<DirectoryProvider["getActor"]>> }
  >();
  private readonly groupCache = new Map<string, { expiresAt: number; value: string[] }>();
  private readonly ttlMs: number;
  private readonly transport: DirectoryProviderOptions["transport"];

  constructor(options: DirectoryProviderOptions) {
    this.ttlMs = options.cacheTtlMs ?? 60_000;
    this.transport = options.transport;
  }

  async getActor(externalId: string) {
    const cached = this.actorCache.get(externalId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
    const value = await this.transport.getActor(externalId);
    this.actorCache.set(externalId, { expiresAt: Date.now() + this.ttlMs, value });
    return value;
  }

  async getGroupsForActor(actorId: string): Promise<string[]> {
    const cached = this.groupCache.get(actorId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
    const value = await this.transport.getGroupsForActor(actorId);
    this.groupCache.set(actorId, { expiresAt: Date.now() + this.ttlMs, value });
    return value;
  }

  searchActors(query: string) {
    return this.transport.searchActors(query);
  }
}

/** Creates a Google Workspace directory provider. */
export function createGoogleDirectoryProvider(
  options: DirectoryProviderOptions,
): DirectoryProvider {
  return new CachedDirectoryProvider(options);
}

/** Creates a Microsoft Entra/Graph directory provider. */
export function createMicrosoftDirectoryProvider(
  options: DirectoryProviderOptions,
): DirectoryProvider {
  return new CachedDirectoryProvider(options);
}
