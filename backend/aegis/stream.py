"""Tenant-scoped change notifications. REST remains the source of visible records."""
import asyncio

from fastapi import WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from .db import engine
from .guardian import run
from .security import digest, now


def revision(token_hash):
    with Session(engine) as db:
        customer=run(db,"""SELECT u.customer FROM users u JOIN sessions s ON s.user_id=u.id
            WHERE s.digest=:hash AND s.expires>:at AND u.role IN ('viewer','analyst','admin')""",hash=token_hash,at=now()).scalar()
        if customer is None:
            return None
        args={"c":customer}
        return tuple(run(db,"""SELECT
            (SELECT count(*) FROM activity a JOIN connections n ON n.id=a.connection WHERE n.customer=:c),
            (SELECT max(l.id) FROM case_log l JOIN cases c ON c.id=l.case_id JOIN connections n ON n.id=c.connection
                WHERE n.customer=:c),
            (SELECT count(*) FROM connections n WHERE n.customer=:c)""",**args).one())


async def stream(socket:WebSocket):
    await socket.accept()
    try:
        token=await asyncio.wait_for(socket.receive_text(),timeout=5)
        if len(token)>128:
            await socket.close(code=1008)
            return
        token_hash=digest(token.encode())
        del token
        previous=None
        while True:
            state=await asyncio.to_thread(revision,token_hash)
            if state is None:
                await socket.close(code=1008)
                return
            await socket.send_json({"changed":state!=previous})
            previous=state
            await asyncio.sleep(3)
    except (WebSocketDisconnect,TimeoutError,OSError):
        return
