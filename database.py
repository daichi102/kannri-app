from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Mapping


class DatabaseConfigError(RuntimeError):
    """Raised when PostgreSQL connection settings are incomplete or invalid."""


@dataclass(frozen=True)
class DatabaseConfig:
    backend: str
    database: str = ""
    user: str = ""
    password: str = ""
    host: str = ""
    port: int = 5432
    cloud_sql_connection_name: str = ""
    sslmode: str = ""
    connect_timeout: int = 10
    application_name: str = "speed-etc"

    @property
    def enabled(self) -> bool:
        return self.backend == "postgres"

    @property
    def connection_mode(self) -> str:
        if not self.enabled:
            return "local-json"
        if self.cloud_sql_connection_name and self.host.startswith("/cloudsql/"):
            return "cloud-sql-socket"
        return "tcp"


def _env(environ: Mapping[str, str], *names: str) -> str:
    for name in names:
        value = environ.get(name, "").strip()
        if value:
            return value
    return ""


def _env_int(environ: Mapping[str, str], name: str, default: int) -> int:
    value = environ.get(name, "").strip()
    if not value:
        return default
    try:
        return int(value)
    except ValueError as exc:
        raise DatabaseConfigError(f"{name} must be an integer.") from exc


def _db_env_exists(environ: Mapping[str, str]) -> bool:
    return any(
        _env(environ, name)
        for name in (
            "ETC_DB_NAME",
            "ETC_DB_USER",
            "ETC_DB_PASSWORD",
            "ETC_DB_HOST",
            "ETC_CLOUD_SQL_CONNECTION_NAME",
            "DATABASE_URL",
        )
    )


def load_database_config(
    environ: Mapping[str, str] | None = None,
) -> DatabaseConfig:
    env = environ or os.environ
    backend = _env(env, "ETC_DATABASE_BACKEND", "ETC_DB_BACKEND").lower()
    if not backend:
        backend = "postgres" if _db_env_exists(env) else "local"

    if backend in {"local", "json", "file"}:
        return DatabaseConfig(backend="local")
    if backend not in {"postgres", "postgresql"}:
        raise DatabaseConfigError(
            "ETC_DATABASE_BACKEND must be 'local' or 'postgres'."
        )

    database_url = _env(env, "DATABASE_URL")
    database = _env(env, "ETC_DB_NAME", "PGDATABASE")
    user = _env(env, "ETC_DB_USER", "PGUSER")
    password = _env(env, "ETC_DB_PASSWORD", "PGPASSWORD")
    cloud_sql_connection_name = _env(env, "ETC_CLOUD_SQL_CONNECTION_NAME")
    explicit_host = _env(env, "ETC_DB_HOST", "PGHOST")
    port = _env_int(env, "ETC_DB_PORT", 5432)
    sslmode = _env(env, "ETC_DB_SSLMODE", "PGSSLMODE")
    connect_timeout = _env_int(env, "ETC_DB_CONNECT_TIMEOUT", 10)
    application_name = _env(env, "ETC_DB_APPLICATION_NAME") or "speed-etc"

    if database_url:
        return DatabaseConfig(
            backend="postgres",
            host=database_url,
            connect_timeout=connect_timeout,
            application_name=application_name,
        )

    missing = [
        label
        for label, value in {
            "ETC_DB_NAME": database,
            "ETC_DB_USER": user,
            "ETC_DB_PASSWORD": password,
        }.items()
        if not value
    ]
    if missing:
        raise DatabaseConfigError(
            "PostgreSQL settings are incomplete: " + ", ".join(missing)
        )

    host = explicit_host
    if not host and cloud_sql_connection_name:
        host = f"/cloudsql/{cloud_sql_connection_name}"
    if not host:
        raise DatabaseConfigError(
            "PostgreSQL settings are incomplete: ETC_DB_HOST or "
            "ETC_CLOUD_SQL_CONNECTION_NAME is required."
        )

    return DatabaseConfig(
        backend="postgres",
        database=database,
        user=user,
        password=password,
        host=host,
        port=port,
        cloud_sql_connection_name=cloud_sql_connection_name,
        sslmode=sslmode,
        connect_timeout=connect_timeout,
        application_name=application_name,
    )


def connection_kwargs(config: DatabaseConfig) -> dict[str, Any]:
    if not config.enabled:
        raise DatabaseConfigError("PostgreSQL is not enabled.")

    if config.host.startswith("postgres://") or config.host.startswith(
        "postgresql://"
    ):
        return {
            "conninfo": config.host,
            "connect_timeout": config.connect_timeout,
            "application_name": config.application_name,
        }

    kwargs: dict[str, Any] = {
        "dbname": config.database,
        "user": config.user,
        "password": config.password,
        "host": config.host,
        "connect_timeout": config.connect_timeout,
        "application_name": config.application_name,
    }
    if not config.host.startswith("/"):
        kwargs["port"] = config.port
    if config.sslmode:
        kwargs["sslmode"] = config.sslmode
    return kwargs


def redacted_database_status(config: DatabaseConfig | None = None) -> dict[str, Any]:
    config = config or load_database_config()
    return {
        "backend": config.backend,
        "enabled": config.enabled,
        "connection_mode": config.connection_mode,
        "database": config.database,
        "user": config.user,
        "host": config.host,
        "port": config.port if not config.host.startswith("/") else None,
        "cloud_sql_connection_name": config.cloud_sql_connection_name,
        "password_configured": bool(config.password),
    }


def connect(config: DatabaseConfig | None = None) -> Any:
    config = config or load_database_config()
    try:
        import psycopg
    except ImportError as exc:
        raise DatabaseConfigError(
            "psycopg is not installed. Run 'pip install -r requirements.txt'."
        ) from exc

    kwargs = connection_kwargs(config)
    if "conninfo" in kwargs:
        conninfo = kwargs.pop("conninfo")
        return psycopg.connect(conninfo, **kwargs)
    return psycopg.connect(**kwargs)


def check_database_connection(config: DatabaseConfig | None = None) -> dict[str, Any]:
    with connect(config) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "select current_database(), current_user, inet_server_addr(), inet_server_port()"
            )
            database, user, server_addr, server_port = cursor.fetchone()
    return {
        "ok": True,
        "database": database,
        "user": user,
        "server_addr": str(server_addr) if server_addr is not None else "",
        "server_port": server_port,
    }
