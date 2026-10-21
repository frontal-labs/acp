/** A stable error code emitted by an OCP package. */
export type OpenChannelErrorCode =
  | "OCP_ACTION"
  | "OCP_AUTHORIZATION"
  | "OCP_CONFLICT"
  | "OCP_NOT_FOUND"
  | "OCP_PROTOCOL"
  | "OCP_TRANSPORT"
  | "OCP_VALIDATION";

/** Structured metadata attached to an OCP error. */
export type OpenChannelErrorDetails = Record<string, unknown>;

/** Lifecycle stage at which an OCP operation failed. */
export type OpenChannelErrorStage =
  | "accept"
  | "action"
  | "approval"
  | "delivery"
  | "normalize"
  | "policy"
  | "processing"
  | "shutdown"
  | "validation"
  | (string & {});

/** Options shared by all OCP error constructors. */
export interface OpenChannelErrorOptions {
  actionId?: string;
  approvalId?: string;
  cause?: unknown;
  details?: OpenChannelErrorDetails;
  eventId?: string;
  provider?: string;
  retryable?: boolean;
  stage?: OpenChannelErrorStage;
}

/** Base class for errors that are safe to classify at an application boundary. */
export class OpenChannelError extends Error {
  readonly code: OpenChannelErrorCode;
  readonly details: OpenChannelErrorDetails;
  readonly actionId?: string;
  readonly approvalId?: string;
  readonly eventId?: string;
  readonly provider?: string;
  readonly retryable: boolean;
  readonly stage?: OpenChannelErrorStage;

  constructor(code: OpenChannelErrorCode, message: string, options: OpenChannelErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = "OpenChannelError";
    this.code = code;
    this.actionId = options.actionId;
    this.approvalId = options.approvalId;
    this.eventId = options.eventId;
    this.provider = options.provider;
    this.retryable = options.retryable ?? false;
    this.stage = options.stage;
    this.details = {
      ...options.details,
      ...(this.actionId ? { actionId: this.actionId } : {}),
      ...(this.approvalId ? { approvalId: this.approvalId } : {}),
      ...(this.eventId ? { eventId: this.eventId } : {}),
      ...(this.provider ? { provider: this.provider } : {}),
      ...(this.stage ? { stage: this.stage } : {}),
      ...(this.retryable ? { retryable: true } : {}),
    };
  }
}

/** Indicates that a registered action could not be executed. */
export class ActionError extends OpenChannelError {
  constructor(message: string, options: OpenChannelErrorOptions = {}) {
    super("OCP_ACTION", message, { ...options, stage: options.stage ?? "action" });
    this.name = "ActionError";
  }
}

/** Indicates that an input does not satisfy the OCP contract. */
export class ValidationError extends OpenChannelError {
  constructor(message: string, options: OpenChannelErrorOptions = {}) {
    super("OCP_VALIDATION", message, options);
    this.name = "ValidationError";
  }
}

/** Indicates that an OCP event or protocol operation is invalid. */
export class ProtocolError extends OpenChannelError {
  constructor(message: string, options: OpenChannelErrorOptions = {}) {
    super("OCP_PROTOCOL", message, options);
    this.name = "ProtocolError";
  }
}

/** Indicates that an operation conflicts with the current resource state. */
export class ConflictError extends OpenChannelError {
  constructor(resource: string, identifier: string, options: OpenChannelErrorOptions = {}) {
    super(
      "OCP_CONFLICT",
      `${resource} already exists or is in a conflicting state: ${identifier}`,
      {
        ...options,
        details: { ...options.details, identifier, resource },
      },
    );
    this.name = "ConflictError";
  }
}

/** Indicates that the actor is not allowed to perform the requested OCP operation. */
export class AuthorizationError extends OpenChannelError {
  constructor(message: string, options: OpenChannelErrorOptions = {}) {
    super("OCP_AUTHORIZATION", message, options);
    this.name = "AuthorizationError";
  }
}

/** Indicates that a requested OCP resource does not exist. */
export class NotFoundError extends OpenChannelError {
  constructor(resource: string, identifier: string, options: OpenChannelErrorOptions = {}) {
    super("OCP_NOT_FOUND", `${resource} was not found: ${identifier}`, {
      ...options,
      details: { ...options.details, identifier, resource },
    });
    this.name = "NotFoundError";
  }
}

/** Indicates that a provider channel could not accept an OCP operation. */
export class TransportError extends OpenChannelError {
  constructor(message: string, options: OpenChannelErrorOptions = {}) {
    super("OCP_TRANSPORT", message, options);
    this.name = "TransportError";
  }
}
