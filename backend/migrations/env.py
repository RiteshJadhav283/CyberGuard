from alembic import context
from aegis.db import engine

with engine.begin() as connection:
    context.configure(connection=connection)
    context.run_migrations()
