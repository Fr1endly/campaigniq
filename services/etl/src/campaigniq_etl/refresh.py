from typing import TypedDict

from sqlalchemy import func, select, text, update
from sqlalchemy.engine import Engine

from campaigniq_etl.database import warehouse_refresh_state

AGGREGATE_KEY = "organization_daily_performance"
REFRESH_LOCK_KEY = "campaigniq:organization_daily_performance:refresh"


class RefreshResult(TypedDict):
    status: str
    data_revision: int
    refreshed_revision: int
    error_message: str | None


class AggregateRefresher:
    def __init__(self, engine: Engine) -> None:
        self.engine = engine

    def refresh(self) -> RefreshResult:
        with self.engine.connect() as connection:
            connection.execute(
                text("select pg_advisory_lock(hashtextextended(:lock_key, 0))"),
                {"lock_key": REFRESH_LOCK_KEY},
            )
            connection.commit()
            target_revision = 0
            try:
                target_revision = int(
                    connection.scalar(
                        select(warehouse_refresh_state.c.data_revision).where(
                            warehouse_refresh_state.c.aggregate_key == AGGREGATE_KEY
                        )
                    )
                    or 0
                )
                connection.execute(
                    update(warehouse_refresh_state)
                    .where(warehouse_refresh_state.c.aggregate_key == AGGREGATE_KEY)
                    .values(status="refreshing", started_at=func.now(), error_message=None)
                )
                connection.commit()

                connection.execute(
                    text("refresh materialized view concurrently organization_daily_performance")
                )
                connection.commit()

                current_revision = int(
                    connection.scalar(
                        select(warehouse_refresh_state.c.data_revision).where(
                            warehouse_refresh_state.c.aggregate_key == AGGREGATE_KEY
                        )
                    )
                    or 0
                )
                status = "current" if current_revision == target_revision else "stale"
                connection.execute(
                    update(warehouse_refresh_state)
                    .where(warehouse_refresh_state.c.aggregate_key == AGGREGATE_KEY)
                    .values(
                        status=status,
                        refreshed_revision=target_revision,
                        completed_at=func.now(),
                        error_message=None,
                    )
                )
                connection.commit()
                return {
                    "status": status,
                    "data_revision": current_revision,
                    "refreshed_revision": target_revision,
                    "error_message": None,
                }
            except Exception as error:
                connection.rollback()
                message = _sanitize_error(error)
                connection.execute(
                    update(warehouse_refresh_state)
                    .where(warehouse_refresh_state.c.aggregate_key == AGGREGATE_KEY)
                    .values(status="failed", completed_at=func.now(), error_message=message)
                )
                connection.commit()
                current_revision = int(
                    connection.scalar(
                        select(warehouse_refresh_state.c.data_revision).where(
                            warehouse_refresh_state.c.aggregate_key == AGGREGATE_KEY
                        )
                    )
                    or target_revision
                )
                refreshed_revision = int(
                    connection.scalar(
                        select(warehouse_refresh_state.c.refreshed_revision).where(
                            warehouse_refresh_state.c.aggregate_key == AGGREGATE_KEY
                        )
                    )
                    or 0
                )
                connection.rollback()
                return {
                    "status": "failed",
                    "data_revision": current_revision,
                    "refreshed_revision": refreshed_revision,
                    "error_message": message,
                }
            finally:
                connection.execute(
                    text("select pg_advisory_unlock(hashtextextended(:lock_key, 0))"),
                    {"lock_key": REFRESH_LOCK_KEY},
                )
                connection.commit()


def _sanitize_error(error: Exception) -> str:
    message = str(error).strip().splitlines()[0] if str(error).strip() else type(error).__name__
    return message[:1000]
