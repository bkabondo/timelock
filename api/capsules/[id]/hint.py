"""TimeLock capsule hint (Python). Replaces app/api/capsules/[id]/hint/route.ts.
  POST /api/capsules/<id>/hint  { title, tags }  ->  { hint }
Auth + ownership check + unlock-date check + AI oracle hint."""
import base64
import json
import os
import re
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime, timezone
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler

import anthropic

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
ANON = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
COOKIE_BASE = f"sb-{SUPABASE_URL.replace('https://', '').split('.')[0]}-auth-token"
MODEL = "claude-haiku-4-5"


def _http(method, url, headers=None, body=None, timeout=25):
    req = urllib.request.Request(url, data=(body.encode() if isinstance(body, str) else body), method=method)
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", "ignore")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "ignore")


def _user(headers):
    ch = headers.get("cookie")
    if not ch:
        return None, None
    jar = SimpleCookie()
    try:
        jar.load(ch)
    except Exception:
        return None, None
    parts = []
    if COOKIE_BASE in jar:
        parts.append((-1, jar[COOKIE_BASE].value))
    i = 0
    while f"{COOKIE_BASE}.{i}" in jar:
        parts.append((i, jar[f"{COOKIE_BASE}.{i}"].value))
        i += 1
    if not parts:
        return None, None
    parts.sort(key=lambda p: p[0])
    raw = urllib.parse.unquote("".join(p[1] for p in parts))
    if raw.startswith("base64-"):
        raw = raw[len("base64-"):]
    try:
        tok = json.loads(base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4)).decode("utf-8", "ignore")).get("access_token")
    except Exception:
        return None, None
    if not tok:
        return None, None
    s, t = _http("GET", f"{SUPABASE_URL}/auth/v1/user", {"apikey": ANON, "Authorization": f"Bearer {tok}"})
    if s != 200:
        return None, None
    try:
        return json.loads(t), tok
    except Exception:
        return None, None


class handler(BaseHTTPRequestHandler):
    def _json(self, status, payload):
        b = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_POST(self):
        try:
            user, tok = _user(self.headers)
            if not user:
                return self._json(401, {"error": "Unauthorized"})
            # /api/capsules/<id>/hint  -> extract <id>
            segs = [s for s in urllib.parse.urlparse(self.path).path.split("/") if s]
            cid = segs[segs.index("capsules") + 1] if "capsules" in segs else None
            if not cid:
                return self._json(400, {"error": "Missing capsule id"})

            h = {"apikey": ANON, "Authorization": f"Bearer {tok}"}
            s, t = _http("GET", f"{SUPABASE_URL}/rest/v1/timelock_capsules?id=eq.{urllib.parse.quote(cid)}&select=id,title,tags,user_id,unlock_date", h)
            rows = json.loads(t or "[]") if s < 400 else []
            if not rows:
                return self._json(404, {"error": "Capsule not found"})
            capsule = rows[0]
            if capsule.get("user_id") != user["id"]:
                return self._json(403, {"error": "Forbidden"})
            try:
                unlock = datetime.fromisoformat(str(capsule["unlock_date"]).replace("Z", "+00:00"))
                if unlock.tzinfo is None:
                    unlock = unlock.replace(tzinfo=timezone.utc)
                if unlock <= datetime.now(timezone.utc):
                    return self._json(400, {"error": "Capsule is already unlocked"})
            except Exception:
                pass

            length = int(self.headers.get("content-length") or 0)
            body = json.loads(self.rfile.read(length) or b"{}")
            title = body.get("title")
            tags = body.get("tags")
            tag_list = ", ".join(tags) if isinstance(tags, list) else (tags or "general")

            client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
            msg = client.messages.create(model=MODEL, max_tokens=100, messages=[{
                "role": "user",
                "content": (f'Write ONE mysterious 25-word sentence hinting at this time capsule without revealing '
                            f'its content. Tags: {tag_list}. Title: "{title}". Sound like an oracle prophecy.'),
            }])
            hint = "".join(b.text for b in (msg.content or []) if getattr(b, "type", None) == "text").strip()
            return self._json(200, {"hint": hint})
        except Exception as err:  # noqa: BLE001
            return self._json(500, {"error": "Failed to generate hint"})
