"""Run with python -m unittest discover -s tests from backend/."""
import asyncio
import os
from pathlib import Path
import tempfile
import unittest

import httpx
from alembic import command
from alembic.config import Config

temp = tempfile.TemporaryDirectory()
os.environ["DATABASE_URL"] = os.getenv("AEGIS_EMPTY_TEST_DATABASE", "sqlite:///" + str(Path(temp.name) / "test.db"))

from sqlalchemy import text
from sqlalchemy.orm import Session

from aegis.db import engine
from aegis.demo import ORIGINAL, add_account, add_case
from aegis.main import app
from aegis.security import uid


class RecoveryAPI(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        command.upgrade(Config("alembic.ini"), "head")

    async def asyncSetUp(self):
        self.customer = uid()
        other = uid()
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test/api/v1/")
        self.tokens = {}
        with Session(engine) as db, db.begin():
            self.case = add_case(db, self.customer)
            for role in ("viewer", "analyst", "admin", "outsider"):
                add_account(db, other if role == "outsider" else self.customer,
                            "admin" if role == "outsider" else role,
                            f"{role}@{self.customer}", "test password")
        for role in ("viewer", "analyst", "admin", "outsider"):
            r = await self.client.post("auth/login", json={"email":f"{role}@{self.customer}", "password":"test password"})
            self.assertEqual(r.status_code, 200)
            self.tokens[role] = {"Authorization":"Bearer " + r.json()["access_token"]}

    async def asyncTearDown(self):
        await self.client.aclose()

    async def plan(self):
        r = await self.client.post(f"incidents/{self.case}/plans", headers=self.tokens["analyst"])
        self.assertEqual(r.status_code, 201, r.text)
        return r.json()["id"]

    async def approve(self, plan, role="admin"):
        return await self.client.post(f"plans/{plan}/approve", headers=self.tokens[role])

    async def test_customer_and_role_boundaries(self):
        self.assertEqual((await self.client.get("incidents")).status_code, 401)
        self.assertEqual((await self.client.get("incidents", headers=self.tokens["outsider"])).json(), [])
        r = await self.client.get(f"incidents/{self.case}", headers=self.tokens["outsider"])
        self.assertEqual(r.status_code, 404)
        plan = await self.plan()
        for role, status in (("viewer",403),("analyst",403),("outsider",404)):
            self.assertEqual((await self.approve(plan, role)).status_code, status)
        self.assertEqual((await self.client.get(f"plans/{plan}/file", headers=self.tokens["admin"])).status_code,409)

    async def test_verified_once_and_history_preserved(self):
        plan = await self.plan()
        for _ in range(2):
            r = await self.approve(plan)
            self.assertEqual(r.json()["status"], "verified")
        file = await self.client.get(f"plans/{plan}/file",headers=self.tokens["viewer"])
        self.assertEqual(file.content, ORIGINAL)
        info = await self.client.get(f"incidents/{self.case}",headers=self.tokens["admin"])
        self.assertEqual([a["action"] for a in info.json()["timeline"]],
                         ["sample_revision_recorded","preview_created","approved","verified"])
        with Session(engine) as db:
            count = db.execute(text("SELECT count(*) FROM fixture_versions WHERE incident=:id"),
                               {"id":self.case}).scalar_one()
            self.assertEqual(count, 2)

    async def test_expired_or_changed_preview(self):
        expired = await self.plan()
        active = await self.plan()
        with Session(engine) as db, db.begin():
            db.execute(text("UPDATE plans SET expires=0 WHERE id=:id"), {"id":expired})
            db.execute(text("UPDATE incidents SET observed='new-revision' WHERE id=:id"), {"id":self.case})
        for plan in (expired, active):
            self.assertEqual((await self.approve(plan)).status_code, 409)
        with Session(engine) as db:
            self.assertIsNone(db.execute(text("SELECT approved_by FROM plans WHERE id=:id"),
                                         {"id":active}).scalar_one())

    async def test_concurrent_approval(self):
        plan = await self.plan()
        results = await asyncio.gather(self.approve(plan), self.approve(plan))
        self.assertEqual([r.status_code for r in results], [200, 200])
        with Session(engine) as db:
            self.assertEqual(db.execute(text("SELECT count(*) FROM recovered WHERE plan=:id"),
                                        {"id":plan}).scalar_one(), 1)
            self.assertEqual(db.execute(text("SELECT count(*) FROM audit WHERE plan=:id AND action='approved'"),
                                        {"id":plan}).scalar_one(), 1)

    async def test_logout_revokes_the_session(self):
        headers = self.tokens["admin"]
        self.assertEqual((await self.client.post("auth/logout", headers=headers)).status_code, 204)
        self.assertEqual((await self.client.get("auth/me", headers=headers)).status_code, 401)

    async def test_untrusted_source(self):
        plan = await self.plan()
        with Session(engine) as db, db.begin():
            db.execute(text("""UPDATE fixture_versions SET content=:data
                WHERE id=(SELECT source FROM plans WHERE id=:id)"""), {"data":b"mismatch","id":plan})
        self.assertEqual((await self.approve(plan)).json()["status"], "failed")
        new = await self.client.post(f"incidents/{self.case}/plans",headers=self.tokens["analyst"])
        self.assertEqual(new.status_code,409)
        self.assertEqual((await self.client.get(f"plans/{plan}/file",headers=self.tokens["admin"])).status_code,409)

    @classmethod
    def tearDownClass(cls):
        engine.dispose()
        temp.cleanup()
