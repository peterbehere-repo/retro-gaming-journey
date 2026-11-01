#!/usr/bin/env python3
"""Serve the dashboard and proxy the handheld's FileBrowser, so the browser allows it.

FileBrowser answers with no CORS headers. A web page on any other origin therefore cannot
read its responses, and an https page cannot reach an http private address at all. Both
walls vanish if the page and the API share one origin, which is what this does:

    http://127.0.0.1:8790/          -> the dashboard files
    http://127.0.0.1:8790/ark/...   -> http://<device>/...

Usage:
    python3 rgj-proxy.py 192.168.1.70            # device IP
    python3 rgj-proxy.py 192.168.1.70 --port 8790

Then open http://127.0.0.1:8790/ and put "/ark" in the Host box.
"""
import argparse
import os
import sys
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

DEVICE = ""
PREFIX = "/ark"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.address_string(), fmt % args))

    # ---- proxy ----
    def _proxy(self, method):
        path = self.path[len(PREFIX):] or "/"
        # A file body can be a few MB; read exactly what was announced.
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else None

        url = "http://%s%s" % (DEVICE, path)
        req = urllib.request.Request(url, data=body, method=method)
        for h in ("X-Auth", "Content-Type", "Accept"):
            if self.headers.get(h):
                req.add_header(h, self.headers[h])
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                data = r.read()
                self.send_response(r.status)
                self.send_header("Content-Type", r.headers.get("Content-Type", "application/octet-stream"))
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                if method != "HEAD":
                    self.wfile.write(data)
        except urllib.error.HTTPError as e:
            data = e.read()
            self.send_response(e.code)
            self.send_header("Content-Type", e.headers.get("Content-Type", "text/plain"))
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:
            msg = ("proxy could not reach http://%s%s -- %s\n"
                   "Check: Remote Services enabled on the device (ArkOS clears it every reboot), "
                   "same Wi-Fi network, IP still current.\n" % (DEVICE, path, e))
            data = msg.encode()
            self.send_response(502)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

    def _is_proxy(self):
        return self.path == PREFIX or self.path.startswith(PREFIX + "/")

    def do_GET(self):
        if self._is_proxy():
            return self._proxy("GET")
        return super().do_GET()

    def do_HEAD(self):
        if self._is_proxy():
            return self._proxy("HEAD")
        return super().do_HEAD()

    def do_POST(self):
        if self._is_proxy():
            return self._proxy("POST")
        self.send_error(405)

    def do_PUT(self):
        if self._is_proxy():
            return self._proxy("PUT")
        self.send_error(405)

    def end_headers(self):
        # The page probe sends no Origin, but allow it anyway if one appears.
        if self._is_proxy():
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers", "X-Auth, Content-Type")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, HEAD, OPTIONS")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()


def main():
    global DEVICE
    ap = argparse.ArgumentParser()
    ap.add_argument("device", help="handheld IP or hostname, e.g. 192.168.1.70")
    ap.add_argument("--port", type=int, default=8790)
    a = ap.parse_args()
    DEVICE = a.device.replace("http://", "").replace("https://", "").rstrip("/")
    srv = ThreadingHTTPServer(("127.0.0.1", a.port), Handler)
    print("dashboard : http://127.0.0.1:%d/" % a.port)
    print("device    : http://%s  (proxied at %s/)" % (DEVICE, PREFIX))
    print("in the page, set Host = %s" % PREFIX)
    print("Ctrl-C to stop.")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")


if __name__ == "__main__":
    main()
