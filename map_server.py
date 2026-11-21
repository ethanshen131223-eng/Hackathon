"""Loopback-only JSON API for sparse ocean-clipped surface pollution estimates.

Run: .venv/Scripts/python.exe map_server.py
No training/inference modules are imported, and the GPU is not used.
"""
from __future__ import annotations

import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import threading
import zipfile
from urllib.parse import parse_qs, urlparse

from ocean_grid import DEFAULT_OBSERVATIONS, LandMask, OceanGrid
from ocean_gradient import GradientSurface
from practice_cases import FmlCases

ALLOWED_ORIGINS = {f"http://{host}:{port}" for host in ("127.0.0.1", "localhost") for port in (5173, 4173)}


class ObservationStore:
    def __init__(self, path, land, max_features):
        self.path = Path(path)
        self.land = land
        self.max_features = max_features
        self.signature = None
        self.grid = None
        self.lock = threading.RLock()

    def current(self):
        with self.lock:
            signature = (self.path.stat().st_mtime_ns, self.path.stat().st_size) if self.path.exists() else (None, None)
            if self.grid is None or signature != self.signature:
                document = json.loads(self.path.read_text(encoding="utf-8")) if signature[0] is not None else {
                    "source": {"name": "No observations loaded", "limitations": "Dataset is absent. No estimates are rendered."}, "observations": []}
                if not isinstance(document.get("observations"), list) or not isinstance(document.get("source"), dict):
                    raise ValueError("Dataset must contain source object and observations array")
                self.grid = OceanGrid(document["observations"], self.land, source=document["source"], max_features=self.max_features)
                self.signature = signature
            return self.grid


def create_server(host="127.0.0.1", port=8765, observation_path=DEFAULT_OBSERVATIONS,
                  land=None, max_features=1200):
    if host not in ("127.0.0.1", "localhost"):
        raise ValueError("The map API must bind a loopback host")
    land = land if land is not None else LandMask.from_file()
    store = ObservationStore(observation_path, land, max_features)
    practice = FmlCases()

    class Handler(BaseHTTPRequestHandler):
        def _send(self, status, body):
            payload = json.dumps(body, allow_nan=False, separators=(",", ":")).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-store")
            origin = self.headers.get("Origin")
            if origin in ALLOWED_ORIGINS:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")
            self.end_headers()
            self.wfile.write(payload)

        def do_OPTIONS(self):
            self.send_response(204)
            origin = self.headers.get("Origin")
            if origin in ALLOWED_ORIGINS:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
                self.send_header("Vary", "Origin")
            self.send_header("Content-Length", "0")
            self.end_headers()

        def do_GET(self):
            parsed = urlparse(self.path)
            if parsed.path=='/api/gradient':
                try:
                    query=parse_qs(parsed.query)
                    values={key:float(query[key][0]) for key in ('west','south','east','north')}
                    with store.lock:
                        grid=store.current()
                        if not hasattr(grid,'gradient_surface'):grid.gradient_surface=GradientSurface(grid.selected,grid.land)
                        surface=grid.gradient_surface
                    # Do not hold the shared observation lock during image rendering.
                    # Health, source tiles and click details remain independently usable.
                    self._send(200,surface.render(**values))
                except (ValueError,KeyError,OSError) as error:self._send(400,{'error':str(error)})
                return
            if parsed.path in ('/api/practice-case','/api/case-photo'):
                try:
                    query=parse_qs(parsed.query)
                    if parsed.path=='/api/practice-case':
                        self._send(200,practice.choose(difficulty=query.get('difficulty',['beginner'])[0],exclude=query.get('exclude',[''])[0].split(','),day=query.get('day',[None])[0]))
                    else:
                        photo=practice.photo(query['name'][0])
                        self.send_response(200);self.send_header('Content-Type','image/jpeg');self.send_header('Content-Length',str(len(photo)));self.send_header('Cache-Control','public,max-age=3600');self.end_headers();self.wfile.write(photo)
                except (ValueError,KeyError,OSError,RuntimeError,zipfile.BadZipFile) as error:
                    self._send(503,{'error':f'Practice source unavailable: {error}'})
                return
            if parsed.path not in ("/api/health", "/api/areas", "/api/tiles", "/api/gradient", "/api/estimate"):
                self._send(404, {"error": "Unknown endpoint"})
                return
            try:
                with store.lock:
                    grid = store.current()
                    if parsed.path == "/api/health":
                        result = {"status": "ok", "observationCount": len(grid.accepted),
                                  "rejectedObservationCount": grid.rejected_count,
                                  "datasetAvailable": store.signature[0] is not None,
                                  "coastline": land.provenance,
                                  "source": grid.source}
                    elif parsed.path == "/api/areas":
                        result = grid.areas()
                    elif parsed.path == "/api/estimate":
                        query = parse_qs(parsed.query)
                        if not hasattr(grid, 'gradient_surface'):
                            grid.gradient_surface = GradientSurface(grid.selected, grid.land)
                        result = {'estimate':grid.gradient_surface.estimate(float(query['longitude'][0]),float(query['latitude'][0]))}
                    else:
                        query = parse_qs(parsed.query)
                        try:
                            values = {key: float(query[key][0]) for key in ("west", "south", "east", "north", "zoom")}
                        except (KeyError, ValueError, IndexError):
                            self._send(400, {"error": "Required numeric query parameters: west, south, east, north, zoom"})
                            return
                        if parsed.path == '/api/gradient':
                            if not hasattr(grid, 'gradient_surface'):
                                grid.gradient_surface = GradientSurface(grid.selected, grid.land)
                            result = grid.gradient_surface.render(**{key:values[key] for key in ('west','south','east','north')})
                        else:
                            result = grid.tiles(**values)
                self._send(200, result)
            except (ValueError, TypeError) as error:
                self._send(400, {"error": str(error)})
            except (OSError, KeyError) as error:
                self._send(503, {"error": f"Observation dataset unavailable: {error}"})

        def log_message(self, format, *args):
            # Keep health/viewport polling from overwhelming local training logs.
            if args and str(args[1] if len(args) > 1 else "").startswith(("4", "5")):
                super().log_message(format, *args)

    server = ThreadingHTTPServer((host, port), Handler)
    server.observation_store = store
    return server


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1", choices=("127.0.0.1", "localhost"))
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--observations", type=Path, default=DEFAULT_OBSERVATIONS)
    parser.add_argument("--max-features", type=int, default=1200)
    args = parser.parse_args()
    server = create_server(args.host, args.port, args.observations, max_features=args.max_features)
    print(f"Ocean tile API listening at http://{args.host}:{server.server_port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
