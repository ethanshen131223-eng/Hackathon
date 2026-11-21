"""Use rasterio's bundled PROJ database instead of an unrelated system install."""
import importlib.util
import os
from pathlib import Path

_spec = importlib.util.find_spec('rasterio')
if _spec is not None:
    _proj_data = Path(_spec.origin).parent / 'proj_data'
    if (_proj_data / 'proj.db').is_file():
        # Process-local only; leave machine and PostGIS settings unchanged.
        os.environ['PROJ_DATA'] = str(_proj_data)
        os.environ['PROJ_LIB'] = str(_proj_data)
