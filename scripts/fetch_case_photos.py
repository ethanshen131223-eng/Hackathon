"""Retrieve a few CC BY 4.0 FML photos and annotations using bounded ZIP ranges."""
import io
import json
from pathlib import Path
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
URL = 'https://www.seanoe.org/data/00950/106148/data/119295.zip'
SIZE = 2343759854


class RemoteZip(io.RawIOBase):
    def __init__(self, url=URL, size=SIZE):
        self.url, self.size, self.pos = url, size, 0

    def seekable(self): return True
    def readable(self): return True
    def tell(self): return self.pos
    def seek(self, offset, whence=0):
        self.pos = offset if whence == 0 else self.pos + offset if whence == 1 else self.size + offset
        return self.pos

    def read(self, count=-1):
        count = min(self.size - self.pos, self.size - self.pos if count < 0 else count)
        if count <= 0: return b''
        if count > 8 * 1024 * 1024: raise ValueError('Refusing an oversized archive range')
        request = urllib.request.Request(self.url, headers={'Range': f'bytes={self.pos}-{self.pos + count - 1}'})
        with urllib.request.urlopen(request, timeout=40) as response:
            if response.status != 206: raise RuntimeError('Server did not honor the bounded range request')
            data = response.read()
        self.pos += len(data)
        return data


if __name__ == '__main__':
    with zipfile.ZipFile(RemoteZip()) as archive:
        data = json.loads(archive.read('fml/labels/coco_format/test.json'))
        output = ROOT / 'docs/references/fml-test-annotations.json'
        output.write_text(json.dumps(data), encoding='utf-8')
        print('Categories:', data.get('categories'))
        print('First image:', data['images'][0])
        by_image = {}
        for annotation in data['annotations']:
            by_image.setdefault(annotation['image_id'], []).append(annotation)
        candidates = []
        for img in data['images']:
            boxes = by_image.get(img['id'], [])
            if 2 <= len(boxes) <= 5:
                score = min(a['bbox'][2] * a['bbox'][3] / (img['width'] * img['height']) for a in boxes)
                candidates.append((score, img, boxes))
        candidates.sort(key=lambda row: row[0], reverse=True)
        for score, img, boxes in candidates[:5]:
            print('Candidate', score, img, 'boxes', [a['bbox'] for a in boxes])
        selected = []
        names = archive.namelist()
        for image_id in (19, 64, 274):
            img = next(item for item in data['images'] if item['id'] == image_id)
            matches = [name for name in names if '/test/' in name and Path(name).stem == Path(img['file_name']).stem and '/images/' in name]
            if len(matches) != 1: raise RuntimeError(f'Unexpected image matches: {matches}')
            ext = Path(matches[0]).suffix
            destination = ROOT / f'web/public/scenes/fml-{image_id}{ext}'
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(archive.read(matches[0]))
            selected.append({'image': img, 'annotations': by_image[image_id], 'archiveMember': matches[0], 'sceneUrl': f'/scenes/{destination.name}'})
            print('Saved', destination.name)
        (ROOT / 'docs/references/fml-case-manifest.json').write_text(json.dumps(selected, indent=2), encoding='utf-8')
