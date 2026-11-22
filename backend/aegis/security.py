import hashlib
import hmac
import secrets
import time
import uuid

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import text
from sqlalchemy.orm import Session

from .db import database

bearer = HTTPBearer(auto_error=False)


def uid():
    return str(uuid.uuid4())


def now():
    return int(time.time())


def digest(data):
    return hashlib.sha256(data).hexdigest()


def password_hash(password, salt=None):
    salt = salt or secrets.token_hex(16)
    derived = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=2**15,
                             r=8, p=1, maxmem=64 * 1024 * 1024)
    return salt + "." + derived.hex()


# Keep the unknown-email path comparable in cost to checking an existing password.
DUMMY_HASH = password_hash(secrets.token_urlsafe(32))


def matches(password, stored):
    return hmac.compare_digest(password_hash(password, stored.split(".")[0]), stored)


def current_user(token: HTTPAuthorizationCredentials = Depends(bearer), db: Session = Depends(database)):
    session_hash = digest(token.credentials.encode()) if token else ""
    user = db.execute(text("""SELECT u.id, u.customer, u.email, u.role FROM users u
        JOIN sessions s ON s.user_id=u.id WHERE s.digest=:digest AND s.expires>:now"""),
        {"digest": session_hash, "now": now()}).mappings().first()
    if not user:
        raise HTTPException(401, "Sign in to continue")
    if user["role"] not in ("viewer","analyst","admin"):
        raise HTTPException(403,"Customer membership is inactive")
    return dict(user)


def roles(*allowed):
    def authorize(user=Depends(current_user)):
        if user["role"] not in allowed:
            raise HTTPException(403, "Your role cannot perform this action")
        return user
    return authorize
