"""
Minimal static file server for SPA apps.
Serves files from a directory, falling back to index.html for client-side routing.
Usage: python serve_static.py --dir /app/voice-agent-ui --port 5174
"""

import argparse
import os
from pathlib import Path
from http.server import HTTPServer, SimpleHTTPRequestHandler

class SPAHandler(SimpleHTTPRequestHandler):
    """Serves static files; falls back to index.html for non-file paths (SPA routing)."""

    def __init__(self, *args, directory=None, **kwargs):
        self._spa_dir = directory or os.getcwd()
        super().__init__(*args, directory=self._spa_dir, **kwargs)

    def do_GET(self):
        path = self.translate_path(self.path)
        if not os.path.exists(path) or os.path.isdir(path):
            if not os.path.exists(os.path.join(path, "index.html")) and self.path != "/":
                self.path = "/"
        return super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        if self.path.endswith(".js"):
            self.send_header("Content-Type", "application/javascript")
        elif self.path.endswith(".mjs"):
            self.send_header("Content-Type", "application/javascript")
        super().end_headers()

    def log_message(self, format, *args):
        pass


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", default="/app/voice-agent-ui")
    parser.add_argument("--port", type=int, default=5174)
    args = parser.parse_args()

    directory = Path(args.dir)
    if not directory.is_dir():
        print(f"Directory {directory} does not exist, skipping voice-agent server")
        import sys
        sys.exit(0)

    handler = lambda *a, **kw: SPAHandler(*a, directory=str(directory), **kw)
    server = HTTPServer(("0.0.0.0", args.port), handler)
    print(f"Voice Agent UI serving on http://0.0.0.0:{args.port} from {directory}")
    server.serve_forever()
