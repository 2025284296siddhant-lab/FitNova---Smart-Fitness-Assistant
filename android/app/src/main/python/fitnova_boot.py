"""Starts the unmodified FitNova server (server/app.py) inside the Android app on localhost."""
import sys
import threading

_server = None


def start(app_dir, db_path, port):
    """app_dir holds the extracted server/ and web/ folders. Returns the bound port."""
    global _server
    if _server is not None:
        return _server.server_address[1]
    if app_dir not in sys.path:
        sys.path.insert(0, app_dir)
    from server.app import make_server

    _server = make_server(db_path, port=port, host="127.0.0.1", quiet=True)
    threading.Thread(target=_server.serve_forever, name="fitnova-server", daemon=True).start()
    return _server.server_address[1]
