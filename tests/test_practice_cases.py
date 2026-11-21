import random
from practice_cases import FmlCases


def catalog():
    return {'images':[{'id':1,'file_name':'one.jpg','width':100,'height':50},
                      {'id':2,'file_name':'two.jpg','width':100,'height':50}],
            'annotations':[{'id':11,'image_id':1,'bbox':[10,10,20,10],'category_id':1},
                           {'id':12,'image_id':2,'bbox':[20,10,30,20],'category_id':1}]}


def test_random_draw_excludes_previous_photo_and_keeps_published_boxes():
    provider=FmlCases(catalog=catalog())
    first=provider.choose(rng=random.Random(3))
    second=provider.choose(exclude=[first['id']],rng=random.Random(3))
    assert first['id']!=second['id']
    assert first['targets'][0]['measuredMm'] is None
    assert first['source']['license']=='CC BY 4.0'
    assert first['targets'][0]['bbox'] in ([.1,.2,.2,.2],[.2,.2,.3,.4])


def test_daily_draw_is_deterministic_and_a_different_new_random_draw_can_be_played():
    provider=FmlCases(catalog=catalog())
    assert provider.choose(day='2026-11-21')['id']==provider.choose(day='2026-11-21')['id']
    assert provider.choose()['sourceType']=='dataset'
    assert provider.choose()['source']['poolSize']==2
