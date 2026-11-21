"""Shared MARIDA preprocessing. TIFF bands are ordered as in official assets.py."""
from collections import Counter

import cv2
import numpy as np

RGB_BANDS = (4, 3, 2)  # One-based TIFF band numbers: red, green, blue.
REFLECTANCE_MAX = 0.1  # Official MARIDA QGIS fixed RGB stretch.


def render_rgb(bands: np.ndarray) -> np.ndarray:
    """Render an 11-band MARIDA reflectance patch into RGB uint8 HWC."""
    if bands.ndim != 3 or bands.shape[0] != 11:
        raise ValueError('Expected an 11-band MARIDA reflectance array (C,H,W)')
    rgb = bands[np.array(RGB_BANDS) - 1].transpose(1, 2, 0)
    rgb[~np.isfinite(rgb).all(axis=2)] = 0  # Blank the whole no-data pixel consistently.
    return np.rint(np.clip(rgb / REFLECTANCE_MAX, 0, 1) * 255).astype(np.uint8)


def debris_boxes(mask: np.ndarray) -> tuple[list[list[float]], list[int]]:
    """Box every 8-connected class-1 region, including one-pixel regions."""
    if mask.ndim != 2 or not mask.size:
        raise ValueError('Expected a nonempty 2-D class mask')
    height, width = mask.shape
    count, _, stats, _ = cv2.connectedComponentsWithStats(
        (mask == 1).astype(np.uint8), connectivity=8
    )
    boxes, areas = [], []
    for x, y, w, h, area in stats[1:count]:
        boxes.append([float((x + w / 2) / width), float((y + h / 2) / height),
                      float(w / width), float(h / height)])
        areas.append(int(area))
    return boxes, areas


def validate_splits(splits: dict[str, list[str]], available: set[str]) -> None:
    """Reject duplicates, leakage, and missing or unassigned archive patches."""
    if set(splits) != {'train', 'val', 'test'} or any(not s for s in splits.values()):
        raise ValueError('Expected nonempty official train, val, and test splits')
    combined = [patch for ids in splits.values() for patch in ids]
    duplicates = [key for key, count in Counter(combined).items() if count > 1]
    if duplicates:
        raise ValueError(f'Duplicate patches or split leakage: {duplicates[:5]}')
    if set(combined) != available:
        raise ValueError(f'Split mismatch: missing={sorted(set(combined)-available)[:5]}, '
                         f'unassigned={sorted(available-set(combined))[:5]}')
