import os

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import Session

engine = create_engine(os.getenv("DATABASE_URL", "sqlite:///./aegis.db"), pool_pre_ping=True)
if engine.dialect.name == "sqlite":
    @event.listens_for(engine, "connect")
    def enforce_foreign_keys(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")


def database():
    with Session(engine) as session:
        yield session


def run(db, sql, **params):
    return db.execute(text(sql), params)


def rows(result):
    return [dict(row) for row in result.mappings()]
