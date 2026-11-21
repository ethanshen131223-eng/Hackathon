import base64
import io

import pytest
from PIL import Image
from shapely.geometry import box
from ocean_grid import LandMask
from ocean_gradient import GradientSurface


def observation(lon=0, lat=0, density=120):
    return {'longitude':lon,'latitude':lat,'densityPiecesKm2':density,'id':'sample',
            'observedAt':'2025-06-01','sourceUrl':'https://example.org/study',
            'materialScope':'surface particles','kind':'measured'}


def test_surface_estimate_preserves_units_and_does_not_fill_distant_unknown_water():
    model=GradientSurface([observation()],LandMask([]))
    assert model.estimate(0,0)['densityPiecesKm2'] == pytest.approx(120)
    assert model.estimate(20,20) is None
    assert model.estimate(0,0)['kind'] == 'model'
    assert model.estimate(0,0)['uncertainty'] is None


def test_land_has_no_gradient_estimate_and_raster_alpha_is_zero_over_land():
    land=LandMask([box(-.2,-.2,.2,.2)])
    model=GradientSurface([observation(.3,0)],land)
    assert model.estimate(0,0) is None
    frame=model.render(-.5,-.5,.5,.5,width=64,height=64)['frames'][0]
    image=Image.open(io.BytesIO(base64.b64decode(frame['image'].split(',')[1]))).convert('RGBA')
    assert image.getpixel((32,32))[3] == 0
    assert image.getpixel((52,32))[3] > 0


def test_date_line_neighbors_remain_close_instead_of_becoming_unknown():
    model=GradientSurface([observation(179.9,0)],LandMask([]))
    assert model.estimate(-179.9,0)['densityPiecesKm2'] == pytest.approx(120)
    frames=model.render(179,-1,-179,1,width=64,height=64)['frames']
    assert len(frames)==2
    assert all(frame['bounds'][0] < frame['bounds'][2] for frame in frames)


def test_incompatible_particle_scopes_cannot_be_silently_blended():
    second={**observation(1,1),'materialScope':'different particle-size range'}
    with pytest.raises(ValueError,match='compatible'):
        GradientSurface([observation(),second],LandMask([]))
