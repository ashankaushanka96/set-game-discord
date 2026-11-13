import os
import unittest
from unittest import mock

from fastapi.testclient import TestClient


class SpectateTests(unittest.TestCase):
    def setUp(self):
        self.env = mock.patch.dict(os.environ, {"SPECTATOR_USERNAME": "bo", "SPECTATOR_PASSWORD": "pw2", "SPECTATOR_SECRET": "k"})
        self.env.start()
        import importlib
        main = importlib.import_module("set-game-discord-main")
        self.client = TestClient(main.app)

    def tearDown(self):
        self.env.stop()

    def test_login_and_rooms(self):
        bad = self.client.post("/api/v1/spectate/login", json={"username": "bo", "password": "nope"})
        self.assertEqual(bad.status_code, 401)
        ok = self.client.post("/api/v1/spectate/login", json={"username": "bo", "password": "pw2"})
        self.assertEqual(ok.status_code, 200)
        token = ok.json()["token"]
        self.assertEqual(self.client.get("/api/v1/spectate/rooms").status_code, 401)
        self.assertEqual(self.client.get("/api/v1/spectate/rooms", headers={"Authorization": "Bearer x.y"}).status_code, 401)
        r = self.client.get("/api/v1/spectate/rooms", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(r.status_code, 200)
        self.assertIn("rooms", r.json())

    def test_watch_needs_token(self):
        with self.client.websocket_connect("/api/v1/spectate/ws/nope?token=bad") as ws:
            with self.assertRaises(Exception):
                ws.receive_text()

    def test_off_without_users(self):
        with mock.patch.dict(os.environ, {"SPECTATOR_PASSWORD": ""}):
            r = self.client.post("/api/v1/spectate/login", json={"username": "ana", "password": "pw1"})
            self.assertEqual(r.status_code, 503)


if __name__ == "__main__":
    unittest.main()
