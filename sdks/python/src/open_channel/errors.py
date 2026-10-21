from __future__ import annotations


class OcpError(Exception):
    """Classified, vendor-neutral OCP failure."""

    code = "OCP_ERROR"

    def __init__(
        self,
        message: str,
        *,
        stage: str = "processing",
        retryable: bool = False,
        event_id: str | None = None,
        action_id: str | None = None,
        approval_id: str | None = None,
        provider: str | None = None,
        cause: BaseException | None = None,
    ) -> None:
        super().__init__(message)
        self.stage = stage
        self.retryable = retryable
        self.event_id = event_id
        self.action_id = action_id
        self.approval_id = approval_id
        self.provider = provider
        self.cause = cause


class ActionError(OcpError):
    code = "OCP_ACTION"


class DeliveryError(OcpError):
    code = "OCP_TRANSPORT"


class AuthorizationError(OcpError):
    code = "OCP_AUTHORIZATION"


def as_ocp_error(
    error: BaseException,
    *,
    stage: str = "processing",
    retryable: bool = False,
    event_id: str | None = None,
    action_id: str | None = None,
    approval_id: str | None = None,
    provider: str | None = None,
) -> OcpError:
    """Return `error` unchanged if it is already an OcpError, otherwise wrap it with its context."""

    if isinstance(error, OcpError):
        return error
    return OcpError(
        str(error),
        stage=stage,
        retryable=retryable,
        event_id=event_id,
        action_id=action_id,
        approval_id=approval_id,
        provider=provider,
        cause=error,
    )
