"""Start FitNova:  python run.py [--port 8000] [--host 127.0.0.1] [--db data/fitnova.db]"""
import argparse
from pathlib import Path

from server.app import make_server


def main():
    ap = argparse.ArgumentParser(description="FitNova — Smart Fitness Assistant")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--host", default="127.0.0.1", help="use 0.0.0.0 to open it from a phone on your Wi-Fi")
    ap.add_argument("--db", default=str(Path(__file__).parent / "data" / "fitnova.db"))
    args = ap.parse_args()
    srv = make_server(args.db, port=args.port, host=args.host)
    info = srv.init_info
    print(f"FitNova database: {args.db}  (schema v{info['to']}, {info['exercises']} exercises)")
    if info["applied"]:
        print(f"Applied migrations: {', '.join(info['applied'])}" + (f"  backup: {info['backup']}" if info["backup"] else ""))
    print(f"FitNova running at http://{'localhost' if args.host in ('127.0.0.1', '0.0.0.0') else args.host}:{args.port}")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        srv.server_close()


if __name__ == "__main__":
    main()
