import pytest

from export_map_data import box_center_wgs84


def test_pixel_box_center_uses_affine_instead_of_top_left():
    metadata = {'crs': 'EPSG:4326', 'transform': [0.01, 0, 10, 0, -0.01, 20, 0, 0, 1]}
    assert box_center_wgs84(metadata, [0, 0, 100, 100]) == pytest.approx([10.5, 19.5])


def test_projected_meters_are_converted_to_longitude_latitude():
    metadata = {'crs': 'EPSG:3857',
                'transform': [1, 0, 111269.49079327357, 0, -1, 50, 0, 0, 1]}
    assert box_center_wgs84(metadata, [0, 0, 100, 100]) == pytest.approx([1, 0])
