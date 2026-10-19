from __future__ import annotations

from typing import Any


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


def as_acp_error(error: BaseException | Any, **kwargs: Any) -> AcpError:
    if isinstance(error, AcpError):
        return error
    return AcpError(str(error), cause=error if isinstance(error, BaseException) else None, **kwargs)
