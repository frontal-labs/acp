import type { DirectoryProvider, DirectoryProviderOptions } from "./types.js";

/** Adds bounded in-memory caching to an injected directory transport. */
export class CachedDirectoryProvider implements DirectoryProvider {
  private readonly actorCache: Partial<
    Record<string, { expiresAt: number; value: Awaited<ReturnType<DirectoryProvider["getActor"]>> }>
  > = Object.create(null);
  private readonly groupCache: Partial<Record<string, { expiresAt: number; value: string[] }>> =
    Object.create(null);
  private readonly ttlMs: number;
  private readonly transport: DirectoryProviderOptions["transport"];

  constructor(options: DirectoryProviderOptions) {
    this.ttlMs = options.cacheTtlMs ?? 60_000;
    this.transport = options.transport;
  }

  async getActor(externalId: string) {
    const cached = this.actorCache[externalId];
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
    const value = await this.transport.getActor(externalId);
    this.actorCache[externalId] = { expiresAt: Date.now() + this.ttlMs, value };
    return value;
  }

  async getGroupsForActor(actorId: string): Promise<string[]> {
    const cached = this.groupCache[actorId];
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
    const value = await this.transport.getGroupsForActor(actorId);
    this.groupCache[actorId] = { expiresAt: Date.now() + this.ttlMs, value };
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
