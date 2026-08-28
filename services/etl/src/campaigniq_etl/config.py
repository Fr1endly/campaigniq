import os

from dotenv import load_dotenv


class ConfigurationError(RuntimeError):
    pass


def get_database_url() -> str:
    load_dotenv()
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise ConfigurationError("DATABASE_URL is required")
    return database_url
