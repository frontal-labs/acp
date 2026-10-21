from __future__ import annotations


class AcpError(Exception):
    """Classified, vendor-neutral ACP failure."""

    code = "ACP_ERROR"

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


class ActionError(AcpError):
    code = "ACP_ACTION"


class DeliveryError(AcpError):
    code = "ACP_TRANSPORT"


def as_acp_error(
    error: BaseException,
    *,
    stage: str = "processing",
    retryable: bool = False,
    event_id: str | None = None,
    action_id: str | None = None,
    approval_id: str | None = None,
    provider: str | None = None,
) -> AcpError:
    """Return `error` unchanged if it is already an AcpError, otherwise wrap it with its context."""

    if isinstance(error, AcpError):
        return error
    return AcpError(
        str(error),
        stage=stage,
        retryable=retryable,
        event_id=event_id,
        action_id=action_id,
        approval_id=approval_id,
        provider=provider,
        cause=error,
    )
