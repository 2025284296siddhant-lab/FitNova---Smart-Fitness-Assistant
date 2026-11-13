"""FitNova HTTP server: JSON API + static PWA, Python standard library only."""
from __future__ import annotations

import json
import mimetypes
import re
import sqlite3
import sys
import threading
import traceback
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from . import db
from .validation import ValidationError

WEB_ROOT = Path(__file__).resolve().parent.parent / "web"
MAX_BODY = 64 * 1024

mimetypes.add_type("application/manifest+json", ".webmanifest")
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("image/svg+xml", ".svg")


class ApiError(Exception):
    def __init__(self, status: int, message: str, code: str = "error", **extra):
        super().__init__(message)
        self.status, self.message, self.code, self.extra = status, message, code, extra


def not_found(what="Resource"):
    return ApiError(404, f"{what} not found.", "not_found")


class Request:
    def __init__(self, method, path, query, body, headers, conn):
        self.method, self.path, self.query, self.body, self.headers, self.conn = method, path, query, body, headers, conn
        self.params: dict[str, str] = {}
        self.user: sqlite3.Row | None = None

    def q(self, key, default=None):
        vals = self.query.get(key)
        return vals[0] if vals else default


# ---------------------------------------------------------------- routing

_ROUTES: list[tuple[str, re.Pattern, callable, bool]] = []


def route(method: str, pattern: str, auth: bool = True):
    regex = re.compile("^" + re.sub(r"<(\w+)>", r"(?P<\1>[0-9]+)", pattern) + "$")

    def deco(fn):
        _ROUTES.append((method, regex, fn, auth))
        return fn
    return deco


def _resolve_user(req: Request):
    token = req.headers.get("X-User-Token", "").strip()
    if not token or len(token) > 128:
        raise ApiError(401, "Profile required. Create a profile to continue.", "auth_required")
    row = req.conn.execute("SELECT * FROM users WHERE access_token = ?", (token,)).fetchone()
    if not row:
        raise ApiError(401, "Your profile session is not recognised. Please create or restore a profile.", "auth_invalid")
    req.user = row


def dispatch(req: Request):
    path_matched = False
    for method, regex, fn, auth in _ROUTES:
        m = regex.match(req.path)
        if not m:
            continue
        path_matched = True
        if method != req.method:
            continue
        req.params = {k: int(v) for k, v in m.groupdict().items()}
        if auth:
            _resolve_user(req)
        result = fn(req)
        if isinstance(result, tuple):
            return result
        return 200, result
    if path_matched:
        raise ApiError(405, "Method not allowed.", "method_not_allowed")
    raise not_found("Endpoint")


# Register handlers (import side effects).
from .api import users, exercises, plans, completions, progress, vitals  # noqa: E402,F401


@route("GET", "/api/health", auth=False)
def health(req):
    v = req.conn.execute("SELECT COALESCE(MAX(version),0) FROM schema_migrations").fetchone()[0]
    n = req.conn.execute("SELECT COUNT(*) FROM exercises").fetchone()[0]
    return {"status": "ok", "schema_version": v, "exercises": n}


# ---------------------------------------------------------------- HTTP handler

CSP = ("default-src 'self'; img-src 'self' data: https://images.unsplash.com; "
       "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; "
       "script-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; "
       "base-uri 'self'; form-action 'self'; frame-ancestors 'self'")  # 'self' allows /showcase.html device frames


class Handler(BaseHTTPRequestHandler):
    server_version = "FitNova/1.0"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        if not getattr(self.server, "quiet", False):
            sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _send(self, status: int, body: bytes, ctype: str, extra_headers: dict | None = None):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        for k, v in (extra_headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, status: int, payload):
        body = json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8")
        self._send(status, body, "application/json; charset=utf-8", {"Cache-Control": "no-store"})

    def _api(self, method: str):
        parsed = urlparse(self.path)
        body = None
        if method in ("POST", "PUT", "PATCH"):
            length = int(self.headers.get("Content-Length") or 0)
            if length > MAX_BODY:
                return self._json(413, {"error": {"code": "too_large", "message": "Request body too large."}})
            raw = self.rfile.read(length) if length else b""
            try:
                body = json.loads(raw.decode("utf-8")) if raw else {}
            except (ValueError, UnicodeDecodeError):
                return self._json(400, {"error": {"code": "bad_json", "message": "Request body must be valid JSON."}})
        conn = db.connect(self.server.db_path)
        try:
            req = Request(method, parsed.path.rstrip("/") or "/", parse_qs(parsed.query), body, self.headers, conn)
            status, payload = dispatch(req)
            self._json(status, payload)
        except ValidationError as e:
            self._json(400, {"error": {"code": "validation", "message": "Please correct the highlighted fields.", "fields": e.errors}})
        except ApiError as e:
            self._json(e.status, {"error": {"code": e.code, "message": e.message, **e.extra}})
        except sqlite3.IntegrityError as e:
            traceback.print_exc()
            self._json(409, {"error": {"code": "conflict", "message": "That change conflicts with existing data.", "detail": str(e).split(":")[0]}})
        except Exception:
            traceback.print_exc()
            self._json(500, {"error": {"code": "server_error", "message": "Something went wrong on our side. Please try again."}})
        finally:
            conn.close()

    def _static(self):
        parsed = urlparse(self.path)
        rel = parsed.path.lstrip("/") or "index.html"
        target = (WEB_ROOT / rel).resolve()
        if WEB_ROOT not in target.parents and target != WEB_ROOT or not target.is_file():
            if "." in Path(rel).name:  # missing asset → 404, otherwise SPA fallback
                return self._send(404, b"Not found", "text/plain; charset=utf-8")
            target = WEB_ROOT / "index.html"
        ctype = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/manifest+json", "image/svg+xml"):
            ctype += "; charset=utf-8"
        headers = {"Cache-Control": "no-cache"}
        if target.name == "index.html":
            headers["Content-Security-Policy"] = CSP
        if target.name == "sw.js":
            headers["Service-Worker-Allowed"] = "/"
        self._send(200, target.read_bytes(), ctype, headers)

    def do_GET(self):
        self._api("GET") if self.path.startswith("/api/") else self._static()

    def do_HEAD(self):
        self.do_GET()

    def do_POST(self):
        self._api("POST")

    def do_PUT(self):
        self._api("PUT")

    def do_PATCH(self):
        self._api("PATCH")

    def do_DELETE(self):
        self._api("DELETE")


def make_server(db_path: str | Path, port: int = 8000, host: str = "127.0.0.1", quiet: bool = False):
    info = db.init_database(db_path)
    srv = ThreadingHTTPServer((host, port), Handler)
    srv.daemon_threads = True
    srv.db_path = str(db_path)
    srv.quiet = quiet
    srv.init_info = info
    return srv


def serve_in_thread(db_path, port=0):
    srv = make_server(db_path, port=port, quiet=True)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    return srv
