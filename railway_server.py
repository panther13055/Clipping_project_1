#!/usr/bin/env python3
"""Railway entrypoint for the existing Ranking Shorts Maker helper backend."""
import os
from http.server import ThreadingHTTPServer

import server


def main():
    port = int(os.environ.get("PORT", "8000"))
    host = "0.0.0.0"
    httpd = ThreadingHTTPServer((host, port), server.Handler)
    print(f"Ranking Shorts Maker backend listening on {host}:{port}", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
