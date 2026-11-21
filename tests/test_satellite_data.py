"""Catch incorrect region bounds, accidental label merging, and RGB corruption."""
import numpy as np
import pytest

from satellite_data import debris_boxes, render_rgb, validate_splits


def test_boxes_retain_singletons_and_border_components():
    mask = np.zeros((4, 8), dtype=np.uint8)
    mask[0, 0] = 1
    mask[2:4, 6:8] = 1
    mask[0, 5] = 2  # Sargassum must not become debris.
    boxes, areas = debris_boxes(mask)
    np.testing.assert_allclose(boxes, [[0.0625, 0.125, 0.125, 0.25],
                                       [0.875, 0.75, 0.25, 0.5]])
    assert areas == [1, 4]


def test_diagonal_pixels_are_one_region_and_empty_mask_has_no_boxes():
    mask = np.array([[1, 0], [0, 1]], dtype=np.uint8)
    assert debris_boxes(mask) == ([[0.5, 0.5, 1.0, 1.0]], [2])
    assert debris_boxes(np.zeros((2, 2), dtype=np.uint8)) == ([], [])


def test_rgb_selects_red_green_blue_and_clips_fixed_reflectance():
    bands = np.zeros((11, 1, 2), dtype=np.float32)
    bands[3] = [0.1, -0.01]
    bands[2] = [0.05, 0.2]
    bands[1] = [0, 0.1]
    rgb = render_rgb(bands)
    assert rgb.dtype == np.uint8
    assert rgb.tolist() == [[[255, 128, 0], [0, 255, 255]]]


def test_rgb_rejects_wrong_band_count_and_blanks_visible_nodata_pixels():
    with pytest.raises(ValueError):
        render_rgb(np.zeros((3, 4, 4)))
    bands = np.full((11, 4, 4), 0.1)
    bands[3, 0, 0] = np.nan
    rgb = render_rgb(bands)
    assert rgb[0, 0].tolist() == [0, 0, 0]
    assert rgb[0, 1].tolist() == [255, 255, 255]


def test_unused_infrared_gaps_do_not_discard_valid_visible_image():
    bands = np.full((11, 2, 2), 0.1, dtype=np.float32)
    bands[10, 0, 0] = np.nan
    assert render_rgb(bands).tolist() == [[[255, 255, 255]] * 2] * 2


def test_split_validation_rejects_leakage_missing_and_duplicate_patches():
    validate_splits({'train': ['a'], 'val': ['b'], 'test': ['c']}, {'a', 'b', 'c'})
    for invalid in [
        {'train': ['a'], 'val': ['a'], 'test': ['c']},
        {'train': ['a'], 'val': ['b'], 'test': []},
        {'train': ['a', 'a'], 'val': ['b'], 'test': ['c']},
    ]:
        with pytest.raises(ValueError):
            validate_splits(invalid, {'a', 'b', 'c'})
