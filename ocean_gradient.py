"""Bounded Gaussian visual interpolation; never presented as measured coverage."""
import base64
from functools import lru_cache
import io
import math

import numpy as np
from PIL import Image, ImageFilter
from shapely import points, prepare, covers

from ocean_grid import classify_density

RADIUS_KM = 75.0
BANDWIDTH_KM = 25.0
METHOD = 'Gaussian-weighted visual interpolation within 75 km of a source point (25 km bandwidth). Not a validated pollution model or measured coverage.'


class GradientSurface:
    def __init__(self, observations, land):
        if len({o.get('materialScope') for o in observations})>1:
            raise ValueError('Smooth estimates require a single compatible particle-size scope')
        self.observations = observations
        self.land = land
        self.coordinates = np.radians(np.array([[o['longitude'], o['latitude']] for o in observations], dtype=float).reshape(-1, 2))
        self.values = np.array([o['densityPiecesKm2'] for o in observations], dtype=float)

    def _field(self, longitude, latitude):
        lon = np.asarray(longitude, dtype=float).reshape(-1)
        lat = np.asarray(latitude, dtype=float).reshape(-1)
        density = np.full(lon.shape, np.nan)
        nearest = np.full(lon.shape, np.inf)
        if not len(self.observations): return density, nearest
        sample_lon, sample_lat = self.coordinates.T
        for start in range(0, len(lon), 1024):
            lng = np.radians(lon[start:start+1024, None]); lt = np.radians(lat[start:start+1024, None])
            angular_radius=RADIUS_KM/6371.0088
            nearby=(sample_lat>=lt.min()-angular_radius)&(sample_lat<=lt.max()+angular_radius)
            longitude_margin=angular_radius/max(.0001,np.cos(min(np.pi/2,float(np.max(np.abs(lt)))+angular_radius)))
            if float(lng.max()-lng.min())+2*longitude_margin<2*np.pi:
                low,high=lng.min()-longitude_margin,lng.max()+longitude_margin
                nearby &= ((sample_lon>=low)&(sample_lon<=high))|((sample_lon+2*np.pi>=low)&(sample_lon+2*np.pi<=high))|((sample_lon-2*np.pi>=low)&(sample_lon-2*np.pi<=high))
            if not nearby.any():continue
            slon,slat=sample_lon[nearby],sample_lat[nearby]
            angular = np.sin((lt-slat)/2)**2 + np.cos(lt)*np.cos(slat)*np.sin((lng-slon)/2)**2
            distances = 6371.0088*2*np.arcsin(np.sqrt(np.clip(angular, 0, 1)))
            weights = np.where(distances <= RADIUS_KM, np.exp(-.5*(distances/BANDWIDTH_KM)**2), 0)
            total = weights.sum(axis=1)
            valid = total > 0
            chunk = density[start:start+1024]
            chunk[valid] = np.einsum('ij,j->i',weights[valid],self.values[nearby],optimize=False) / total[valid]
            nearest[start:start+1024] = distances.min(axis=1)
        return density, nearest

    def estimate(self, longitude, latitude):
        if not math.isfinite(longitude) or not math.isfinite(latitude) or not -90 <= latitude <= 90:
            raise ValueError('Valid longitude and latitude required')
        longitude = (longitude + 180) % 360 - 180
        if self.land.is_land(longitude, latitude): return None
        density, nearest = self._field([longitude], [latitude])
        if not np.isfinite(density[0]): return None
        coordinates = self.coordinates
        lng, lat = np.radians([longitude, latitude])
        angular = np.sin((lat-coordinates[:,1])/2)**2 + np.cos(lat)*np.cos(coordinates[:,1])*np.sin((lng-coordinates[:,0])/2)**2
        distances = 6371.0088*2*np.arcsin(np.sqrt(np.clip(angular,0,1)))
        samples = [o for o, distance in zip(self.observations, distances) if distance <= RADIUS_KM]
        return {'densityPiecesKm2':float(density[0]),'classification':classify_density(float(density[0])),
                'kind':'model','method':METHOD,'radiusKm':RADIUS_KM,'nearestSampleKm':float(nearest[0]),
                'sampleCount':len(samples),'center':[longitude,latitude],
                'observationDates':sorted({o['observedAt'] for o in samples if o.get('observedAt')}),
                'sourceUrls':sorted({o['sourceUrl'] for o in samples}),
                'sourceKind':sorted({o['kind'] for o in samples}),
                'materialScope':sorted({o['materialScope'] for o in samples}), 'uncertainty':None}

    @lru_cache(maxsize=12)
    def render(self, west, south, east, north, width=256, height=160):
        if not all(math.isfinite(v) for v in (west,south,east,north)) or not -90 <= south < north <= 90:
            raise ValueError('Invalid gradient bounds')
        width, height = max(32,min(768,int(width))), max(32,min(512,int(height)))
        if abs(east-west)>=360: west,east=-180,180
        else: west,east=(west+180)%360-180,(east+180)%360-180
        if west==east: raise ValueError('Gradient longitude span must be positive')
        boxes = [(west,south,east,north)] if west<east else [(west,south,180,north),(-180,south,east,north)]
        frames=[]
        for bounds in boxes:
            w,s,e,n=bounds
            xs=np.linspace(w,e,width,endpoint=False)+(e-w)/(2*width)
            ys=np.linspace(n,s,height,endpoint=False)-(n-s)/(2*height)
            longitude,latitude=np.meshgrid(xs,ys)
            density,nearest=self._field(longitude,latitude)
            # Rasterize actual land at pixel centers, then conservatively buffer it
            # by one pixel so filtered bitmap edges do not bleed onto land.
            pts=points(longitude.reshape(-1),latitude.reshape(-1))
            prepare(self.land.parts)
            pairs=self.land.tree.query(pts)
            water=np.full(width*height,255,dtype=np.uint8)
            if pairs.size:
                inside=covers(np.asarray(self.land.parts,dtype=object)[pairs[1]],pts[pairs[0]])
                water[np.unique(pairs[0][inside])]=0
            mask=np.asarray(Image.fromarray(water.reshape(height,width)).filter(ImageFilter.MinFilter(3)))
            anchors=np.log1p([0,50,100,200,600,60000])
            colors=np.array([[48,126,216],[54,157,91],[240,209,53],[239,133,35],[210,47,47],[132,28,62]])
            values=np.log1p(np.nan_to_num(density,nan=0))
            rgb=np.stack([np.interp(values,anchors,colors[:,channel]) for channel in range(3)],axis=1)
            # Opacity fades near the model's fixed support boundary, not by changing
            # its estimated density. Unsupported and land pixels are transparent.
            alpha=185*np.clip((RADIUS_KM-nearest)/15,0,1)
            alpha[~np.isfinite(density)]=0
            alpha=np.minimum(alpha.reshape(height,width),mask).astype(np.uint8)
            rgba=np.concatenate([rgb.reshape(height,width,3).astype(np.uint8),alpha[:,:,None]],axis=2)
            data=io.BytesIO();Image.fromarray(rgba).save(data,format='PNG')
            frames.append({'bounds':list(bounds),'image':'data:image/png;base64,'+base64.b64encode(data.getvalue()).decode(),'supportedPixels':int((alpha>0).sum())})
        return {'frames':frames,'method':METHOD,'radiusKm':RADIUS_KM,'bandwidthKm':BANDWIDTH_KM,
                'kind':'model','uncertainty':None,'waterMask':'Natural Earth 1:10m with conservative raster edge buffer',
                'note':'Colors blend between SPI anchors. Click for exact density and classification. Transparent beyond support or on land.'}
