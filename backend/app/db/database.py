import os

import sqlite3
import json
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.orm import sessionmaker, declarative_base

Base = declarative_base()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5433/cadastre"
)
DB_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "data"))
os.makedirs(DB_DIR, exist_ok=True)
SQLITE_DB_PATH = os.path.join(DB_DIR, "cadastre.db")

engine = create_engine(DATABASE_URL)
DATABASE_URL = os.getenv("DATABASE_URL")

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)
# Check if PostgreSQL is accessible, otherwise use SQLite
def get_engine():
    if DATABASE_URL and DATABASE_URL.startswith("postgres"):
        try:
            eng = create_engine(DATABASE_URL, pool_pre_ping=True)
            with eng.connect() as conn:
                pass
            return eng, "postgresql"
        except Exception:
            pass
    
    eng = create_engine(f"sqlite:///{SQLITE_DB_PATH}", connect_args={"check_same_thread": False})
    return eng, "sqlite"

engine, DB_TYPE = get_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()