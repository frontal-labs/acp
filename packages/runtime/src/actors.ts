import { create } from "@bufbuild/protobuf";
import { type ActorRef, ActorRefSchema, ActorType } from "@frontal-labs/open-channel-protocol";

/** Creates a typed actor reference for a human, agent, or system actor. */
export function createActor(
  id: string,
  type: ActorType,
  displayName: string,
  capabilities: string[] = [],
): ActorRef {
  return create(ActorRefSchema, {
    authority: "",
    capabilities,
    displayName,
    id,
    type,
  });
}

/** Actor identity used by the reference runtime for internally emitted events. */
export const SYSTEM_ACTOR: ActorRef = createActor("acp.runtime", ActorType.SYSTEM, "OCP Runtime");
