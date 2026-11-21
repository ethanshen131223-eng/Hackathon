"""Random practice photos backed by FML's published COCO annotations."""
from collections import defaultdict
from datetime import date
import hashlib
import io
import json
from pathlib import Path
import random
import threading
from urllib.parse import quote
import zipfile

from PIL import Image
from scripts.fetch_case_photos import RemoteZip

ROOT=Path(__file__).resolve().parent
CATALOG=ROOT/'data_sources/fml-catalog.json'
SOURCE='https://doi.org/10.17882/106148'
ATTRIBUTION='Guido Lazzerini, Fausto Ferreira and Alessandro Ridolfi — Floating Marine Litter (FML), SEANOE, DOI 10.17882/106148. Photo unchanged; published boxes adapted into game targets.'


class FmlCases:
    def __init__(self,catalog=None):
        self.lock=threading.RLock(); self.archive=None; self.members=None; self.memory_photos={}
        if catalog is None:
            path=CATALOG if CATALOG.exists() else ROOT/'docs/references/fml-test-annotations.json'
            catalog=json.loads(path.read_text(encoding='utf-8'))
        self._set_catalog(catalog)

    def _set_catalog(self,catalog):
        self.images={image['file_name']:image for image in catalog['images']}
        by_id={image['id']:image['file_name'] for image in catalog['images']}
        self.annotations=defaultdict(list)
        for item in catalog['annotations']:
            if item.get('category_id')==1 and item['image_id'] in by_id:
                self.annotations[by_id[item['image_id']]].append(item)
        self.pool=sorted(name for name in self.images if 1<=len(self.annotations[name])<=12)
        if not self.pool: raise ValueError('No playable annotated FML photos')

    def _open(self):
        if self.archive is None:
            self.archive=zipfile.ZipFile(RemoteZip())
            self.members=self.archive.namelist()
        return self.archive

    def refresh_catalog(self):
        """Fetch metadata only, not the multi-gigabyte photo archive."""
        with self.lock:
            documents=[json.loads(self._open().read(f'fml/labels/coco_format/{split}.json')) for split in ('train','val','test')]
            images=[]; annotations=[]; image_counter=0
            for split,document in zip(('train','val','test'),documents):
                mapping={}
                for image in document['images']:
                    image_counter+=1;mapping[image['id']]=image_counter
                    images.append({**image,'id':image_counter,'originalImageId':image['id'],'annotationFile':f'fml/labels/coco_format/{split}.json'})
                for item in document['annotations']:
                    annotations.append({**item,'originalAnnotationId':item['id'],'image_id':mapping[item['image_id']]})
            catalog={'images':images,'annotations':annotations,'sourceUrl':SOURCE,'license':'CC BY 4.0'}
            CATALOG.parent.mkdir(exist_ok=True)
            CATALOG.write_text(json.dumps(catalog),encoding='utf-8')
            self._set_catalog(catalog)
            return len(self.pool)

    def choose(self,difficulty='beginner',exclude=(),day=None,rng=None):
        with self.lock:
            low,high={'beginner':(1,3),'explorer':(4,6),'challenge':(7,12)}.get(difficulty,(1,12))
            pool=[name for name in self.pool if low<=len(self.annotations[name])<=high] or self.pool
            minimum={'beginner':.0008,'explorer':.0002,'challenge':.00005}.get(difficulty,0)
            visible=[name for name in pool if all(a['bbox'][2]*a['bbox'][3]/(self.images[name]['width']*self.images[name]['height'])>=minimum for a in self.annotations[name])]
            pool=visible or pool
            if day:
                if date.fromisoformat(day).isoformat()!=day: raise ValueError('Invalid daily date')
                name=pool[int.from_bytes(hashlib.sha256(day.encode()).digest()[:8],'big')%len(pool)]
            else:
                fresh=[name for name in pool if self.case_id(name) not in exclude]
                name=(rng or random.SystemRandom()).choice(fresh or pool)
            image=self.images[name];targets=[]
            for index,item in enumerate(self.annotations[name]):
                x,y,w,h=item['bbox']; nx,ny,nw,nh=x/image['width'],y/image['height'],w/image['width'],h/image['height']
                targets.append({'id':f'{self.case_id(name)}-region-{index}', 'x':nx+nw/2,'y':ny+nh/2,
                                'radius':max(nw,nh)/2,'bbox':[nx,ny,nw,nh],
                                'clue':f'Object region {round((nx+nw/2)*100)}% across and {round((ny+nh/2)*100)}% down',
                                'label':f'Dataset-labeled litter region {index+1}','category':'unknown',
                                'material':'Not specified by dataset','measuredMm':None,'sizeBasis':'No physical scale supplied',
                                'annotationId':item.get('originalAnnotationId',item['id']),
                                'explanation':'The FML annotation labels this region as garbage. It may group multiple objects; material, physical scale and concentration are not established.'})
            return {'id':self.case_id(name),'title':f'Field photo: {len(targets)} litter regions',
                    'intro':'Inspect a randomly selected real FML water-surface photo. Match the published annotation regions; they are not a complete item count or a current pollution survey.',
                    'location':'FML camera photo; precise capture location not supplied','mode':'surface',
                    'difficulty':difficulty.title(),'duration':'3 min','label':'Random open-dataset case','sourceType':'dataset',
                    'sceneUrl':'/api/case-photo?name='+quote(name),'targets':targets,'distractors':[],
                    'source':{'name':'Floating Marine Litter (FML)','url':SOURCE,'license':'CC BY 4.0',
                              'licenseUrl':'https://creativecommons.org/licenses/by/4.0/','attribution':ATTRIBUTION,
                              'imageFile':name,'imageId':image.get('originalImageId',image['id']),
                              'annotationFile':image.get('annotationFile','fml/labels/coco_format/test.json'),
                              'poolSize':len(self.pool),'drawPoolSize':len(pool),'capturedAt':None},
                    'species':[],'impact':'NOAA identifies ingestion and entanglement as marine-debris hazards. This photo does not establish animal presence or actual harm.',
                    'sourceUrls':['https://oceanservice.noaa.gov/hazards/marinedebris/plastics-in-the-ocean.html']}

    @staticmethod
    def case_id(name): return 'fml-'+Path(name).stem

    def photo(self,name):
        with self.lock:
            if name not in self.images: raise ValueError('Unknown source image')
            if name in self.memory_photos:return self.memory_photos[name]
            directory=ROOT/'data_sources/fml-photos'; path=directory/(Path(name).stem+'.jpg')
            if path.exists(): content=path.read_bytes()
            else:
                matches=[member for member in self._open().namelist() if '/images/' in member and Path(member).stem==Path(name).stem]
                if len(matches)!=1: raise ValueError('Source photo cannot be resolved unambiguously')
                content=self._open().read(matches[0])
                expected=self.images[name]
                with Image.open(io.BytesIO(content)) as img:
                    if img.size!=(expected['width'],expected['height']):raise ValueError('Source image dimensions disagree with annotation metadata')
                directory.mkdir(exist_ok=True)
                if len(list(directory.glob('*.jpg')))<50:path.write_bytes(content)
            if len(self.memory_photos)>=8:self.memory_photos.pop(next(iter(self.memory_photos)))
            self.memory_photos[name]=content
            return content
