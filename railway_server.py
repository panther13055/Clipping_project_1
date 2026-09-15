#!/usr/bin/env python3
"""Railway entrypoint for the existing Ranking Shorts Maker helper backend."""
import os
from http.server import ThreadingHTTPServer

import server


class RailwayHandler(server.Handler):
    """Adds CORS so the Vercel frontend can call this backend."""

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()


def main():
    port = int(os.environ.get("PORT", "8000"))
    host = "0.0.0.0"
    httpd = ThreadingHTTPServer((host, port), RailwayHandler)
    print(f"Ranking Shorts Maker backend listening on {host}:{port}", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
