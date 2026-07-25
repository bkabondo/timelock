"""TimeLock capsule-share email (Python). Replaces app/api/email/share/route.ts."""
import base64
import html
import json
import os
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
ANON = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
COOKIE_BASE = f"sb-{SUPABASE_URL.replace('https://', '').split('.')[0]}-auth-token"


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
        return None
    jar = SimpleCookie()
    try:
        jar.load(ch)
    except Exception:
        return None
    parts = []
    if COOKIE_BASE in jar:
        parts.append((-1, jar[COOKIE_BASE].value))
    i = 0
    while f"{COOKIE_BASE}.{i}" in jar:
        parts.append((i, jar[f"{COOKIE_BASE}.{i}"].value))
        i += 1
    if not parts:
        return None
    parts.sort(key=lambda p: p[0])
    raw = urllib.parse.unquote("".join(p[1] for p in parts))
    if raw.startswith("base64-"):
        raw = raw[len("base64-"):]
    try:
        tok = json.loads(base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4)).decode("utf-8", "ignore")).get("access_token")
    except Exception:
        return None
    if not tok:
        return None
    s, t = _http("GET", f"{SUPABASE_URL}/auth/v1/user", {"apikey": ANON, "Authorization": f"Bearer {tok}"})
    if s != 200:
        return None
    try:
        return json.loads(t)
    except Exception:
        return None


class handler(BaseHTTPRequestHandler):
    def _json(self, status, payload):
        b = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_POST(self):
        user = _user(self.headers)
        if not user:
            return self._json(401, {"error": "Unauthorized"})
        length = int(self.headers.get("content-length") or 0)
        body = json.loads(self.rfile.read(length) or b"{}")
        recipients = body.get("recipients") or []
        if not recipients:
            return self._json(400, {"error": "No recipients"})
        title = html.escape(body.get("capsuleTitle") or "")
        sender = html.escape(body.get("senderName") or "")
        try:
            dt = datetime.fromisoformat(str(body.get("unlockDate")).replace("Z", "+00:00"))
            unlock_fmt = dt.strftime("%A, %B %-d, %Y")
        except Exception:
            unlock_fmt = str(body.get("unlockDate") or "")

        key = os.environ.get("RESEND_API_KEY") or "placeholder"
        results = []
        for email in recipients:
            html_body = (
                '<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0f172a;color:#f1f5f9;border-radius:16px;">'
                '<div style="text-align:center;margin-bottom:24px;"><div style="font-size:48px;">⏳</div>'
                '<h1 style="color:#f59e0b;margin:8px 0;">TimeLock</h1></div>'
                f'<h2 style="color:#f1f5f9;margin-bottom:8px;">{sender} sealed a capsule for you</h2>'
                f'<p style="color:#94a3b8;line-height:1.6;">A time capsule titled <strong style="color:#f1f5f9;">"{title}"</strong> has been sealed and shared with you.</p>'
                '<div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:16px;margin:20px 0;text-align:center;">'
                '<p style="color:#94a3b8;margin:0 0 4px;font-size:12px;">This capsule unlocks on</p>'
                f'<p style="color:#f59e0b;font-size:18px;font-weight:bold;margin:0;">{unlock_fmt}</p></div>'
                '<p style="color:#94a3b8;font-size:14px;">You\'ll be notified when it\'s time to open it. Until then, it remains sealed.</p></div>'
            )
            payload = {"from": "TimeLock <onboarding@resend.dev>", "to": email,
                       "subject": f"{body.get('senderName') or ''} sealed a time capsule for you ⏳", "html": html_body}
            s, t = _http("POST", "https://api.resend.com/emails", {"Authorization": f"Bearer {key}"}, json.dumps(payload))
            err = None
            if s >= 400:
                try:
                    err = json.loads(t).get("message") or t
                except Exception:
                    err = t
            results.append({"email": email, "ok": s < 400, "error": err})
        return self._json(200, {"results": results})
