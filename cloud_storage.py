from __future__ import annotations

import mimetypes
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping


class CloudStorageConfigError(RuntimeError):
    """Raised when Google Cloud Storage settings are incomplete or invalid."""


@dataclass(frozen=True)
class CloudStorageConfig:
    backend: str
    bucket: str = ""
    prefix: str = ""
    credentials_file: str = ""
    project_id: str = ""

    @property
    def enabled(self) -> bool:
        return self.backend == "gcs"

    @property
    def missing_keys(self) -> list[str]:
        if not self.enabled:
            return []
        missing: list[str] = []
        if not self.bucket:
            missing.append("ETC_GCS_BUCKET")
        return missing

    @property
    def configured(self) -> bool:
        return self.enabled and not self.missing_keys


def _env(environ: Mapping[str, str], *names: str, default: str = "") -> str:
    for name in names:
        value = environ.get(name, "").strip()
        if value:
            return value
    return default


def _setting_or_env(
    settings: Mapping[str, Any],
    key: str,
    environ: Mapping[str, str],
    *env_names: str,
    default: str = "",
) -> str:
    value = settings.get(key)
    if value is not None and str(value).strip():
        return str(value).strip()
    return _env(environ, *env_names, default=default)


def normalize_storage_backend(value: str) -> str:
    normalized = value.strip().lower()
    if normalized in {"", "local", "nas", "file", "files"}:
        return "local"
    if normalized in {"gcs", "google", "google-cloud-storage", "cloud"}:
        return "gcs"
    raise CloudStorageConfigError(
        "ETC_STORAGE_BACKEND must be 'local' or 'gcs'."
    )


def normalize_storage_prefix(value: str) -> str:
    cleaned = value.strip().replace("\\", "/")
    cleaned = re.sub(r"/+", "/", cleaned).strip("/")
    if cleaned in {".", ".."}:
        return ""
    parts = [part for part in cleaned.split("/") if part not in {"", ".", ".."}]
    return "/".join(parts)


def load_storage_config(
    environ: Mapping[str, str] | None = None,
    settings: Mapping[str, Any] | None = None,
) -> CloudStorageConfig:
    env = environ or os.environ
    saved = settings or {}
    bucket = _setting_or_env(
        saved,
        "bucket",
        env,
        "ETC_GCS_BUCKET",
        "GCS_BUCKET",
        "GOOGLE_CLOUD_STORAGE_BUCKET",
    )
    backend_value = _setting_or_env(
        saved,
        "backend",
        env,
        "ETC_STORAGE_BACKEND",
        "ETC_FILE_STORAGE_BACKEND",
    )
    backend = normalize_storage_backend(backend_value or ("gcs" if bucket else "local"))
    prefix = normalize_storage_prefix(
        _setting_or_env(
            saved,
            "prefix",
            env,
            "ETC_GCS_PREFIX",
            "GCS_PREFIX",
            default="speed-etc",
        )
    )
    credentials_file = _env(
        env,
        "GOOGLE_APPLICATION_CREDENTIALS",
        "ETC_GCS_CREDENTIALS_FILE",
        "GOOGLE_CLOUD_CREDENTIALS",
    )
    project_id = _env(env, "GOOGLE_CLOUD_PROJECT", "GCLOUD_PROJECT", "GCP_PROJECT")
    return CloudStorageConfig(
        backend=backend,
        bucket=bucket,
        prefix=prefix,
        credentials_file=credentials_file,
        project_id=project_id,
    )


def redacted_storage_status(
    config: CloudStorageConfig | None = None,
) -> dict[str, Any]:
    config = config or load_storage_config()
    return {
        "backend": config.backend,
        "enabled": config.enabled,
        "configured": config.configured,
        "missing": config.missing_keys,
        "bucket": config.bucket,
        "prefix": config.prefix,
        "project_id": config.project_id,
        "credentials_file": config.credentials_file,
        "credentials_configured": bool(config.credentials_file),
    }


def object_key_for_path(
    path: Path,
    base_dir: Path,
    config: CloudStorageConfig | None = None,
) -> str:
    config = config or load_storage_config()
    resolved_path = path.resolve()
    resolved_base = base_dir.resolve()
    try:
        relative_path = resolved_path.relative_to(resolved_base)
    except ValueError as exc:
        raise CloudStorageConfigError(
            f"{resolved_path} is outside the configured data folder."
        ) from exc
    relative_key = relative_path.as_posix().lstrip("/")
    return f"{config.prefix}/{relative_key}" if config.prefix else relative_key


def _storage_client(config: CloudStorageConfig) -> Any:
    if not config.enabled:
        raise CloudStorageConfigError("Google Cloud Storage is not enabled.")
    if config.missing_keys:
        raise CloudStorageConfigError(
            "Google Cloud Storage settings are incomplete: "
            + ", ".join(config.missing_keys)
        )
    try:
        from google.cloud import storage
    except ImportError as exc:
        raise CloudStorageConfigError(
            "google-cloud-storage is not installed. Run setup.bat or rebuild the NAS container."
        ) from exc
    if config.project_id:
        return storage.Client(project=config.project_id)
    return storage.Client()


def upload_file(
    path: Path,
    base_dir: Path,
    config: CloudStorageConfig | None = None,
) -> dict[str, Any]:
    config = config or load_storage_config()
    if not config.enabled:
        return {"enabled": False, "uploaded": False}
    object_key = object_key_for_path(path, base_dir, config)
    client = _storage_client(config)
    blob = client.bucket(config.bucket).blob(object_key)
    content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    blob.upload_from_filename(str(path), content_type=content_type)
    return {
        "enabled": True,
        "uploaded": True,
        "bucket": config.bucket,
        "object_key": object_key,
        "content_type": content_type,
    }


def delete_file(
    path: Path,
    base_dir: Path,
    config: CloudStorageConfig | None = None,
) -> dict[str, Any]:
    config = config or load_storage_config()
    if not config.enabled:
        return {"enabled": False, "deleted": False}
    object_key = object_key_for_path(path, base_dir, config)
    client = _storage_client(config)
    blob = client.bucket(config.bucket).blob(object_key)
    blob.delete()
    return {
        "enabled": True,
        "deleted": True,
        "bucket": config.bucket,
        "object_key": object_key,
    }


def check_storage_connection(
    config: CloudStorageConfig | None = None,
) -> dict[str, Any]:
    config = config or load_storage_config()
    client = _storage_client(config)
    bucket = client.bucket(config.bucket)
    bucket.reload()
    return {
        "ok": True,
        "bucket": config.bucket,
        "prefix": config.prefix,
    }
