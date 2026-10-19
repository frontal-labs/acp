/** A stable error code emitted by an ACP package. */
export type AcpErrorCode =
  | "ACP_ACTION"
  | "ACP_CONFLICT"
  | "ACP_NOT_FOUND"
  | "ACP_PROTOCOL"
  | "ACP_TRANSPORT"
  | "ACP_VALIDATION";

/** Structured metadata attached to an ACP error. */
export type AcpErrorDetails = Record<string, unknown>;

/** Lifecycle stage at which an ACP operation failed. */
export type AcpErrorStage =
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

/** Options shared by all ACP error constructors. */
export interface AcpErrorOptions {
  actionId?: string;
  approvalId?: string;
  cause?: unknown;
  details?: AcpErrorDetails;
  eventId?: string;
  provider?: string;
  retryable?: boolean;
  stage?: AcpErrorStage;
}

/** Base class for errors that are safe to classify at an application boundary. */
export class AcpError extends Error {
  readonly code: AcpErrorCode;
  readonly details: AcpErrorDetails;
  readonly actionId?: string;
  readonly approvalId?: string;
  readonly eventId?: string;
  readonly provider?: string;
  readonly retryable: boolean;
  readonly stage?: AcpErrorStage;

  constructor(code: AcpErrorCode, message: string, options: AcpErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = "AcpError";
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
      retryable: this.retryable,
    };
  }
}

/** Indicates that a registered action could not be executed. */
export class ActionError extends AcpError {
  constructor(message: string, options: AcpErrorOptions = {}) {
    super("ACP_ACTION", message, { ...options, stage: options.stage ?? "action" });
    this.name = "ActionError";
  }
}

/** Indicates that an input does not satisfy the ACP contract. */
export class ValidationError extends AcpError {
  constructor(message: string, options: AcpErrorOptions = {}) {
    super("ACP_VALIDATION", message, options);
    this.name = "ValidationError";
  }
}

/** Indicates that an ACP event or protocol operation is invalid. */
export class ProtocolError extends AcpError {
  constructor(message: string, options: AcpErrorOptions = {}) {
    super("ACP_PROTOCOL", message, options);
    this.name = "ProtocolError";
  }
}

/** Indicates that an operation conflicts with the current resource state. */
export class ConflictError extends AcpError {
  constructor(resource: string, identifier: string, options: AcpErrorOptions = {}) {
    super(
      "ACP_CONFLICT",
      `${resource} already exists or is in a conflicting state: ${identifier}`,
      {
        ...options,
        details: { ...options.details, identifier, resource },
      },
    );
    this.name = "ConflictError";
  }
}

/** Indicates that a requested ACP resource does not exist. */
export class NotFoundError extends AcpError {
  constructor(resource: string, identifier: string, options: AcpErrorOptions = {}) {
    super("ACP_NOT_FOUND", `${resource} was not found: ${identifier}`, {
      ...options,
      details: { ...options.details, identifier, resource },
    });
    this.name = "NotFoundError";
  }
}

/** Indicates that a provider channel could not accept an ACP operation. */
export class TransportError extends AcpError {
  constructor(message: string, options: AcpErrorOptions = {}) {
    super("ACP_TRANSPORT", message, options);
    this.name = "TransportError";
  }
}
