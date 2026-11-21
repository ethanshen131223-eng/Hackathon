"""Refresh accepted WoRMS taxonomy for MarineGUARDer's reviewed NOAA catalog.

NOAA habitat/range summaries are editorial, attributed paraphrases. They are
not scraped or automatically re-reviewed when taxonomy is refreshed.
"""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
CATALOG = ROOT / 'web' / 'public' / 'species.json'
RECEIPTS = ROOT / 'docs' / 'references' / 'worms-records.json'
API = 'https://www.marinespecies.org/rest'
REVIEWED = '2026-11-21'
CARIBBEAN = ['16PCC', '16PDC', '16PEC', '16QED', '18QWF', '18QYF', '18QYG', '19QDA']
WARM_INDO_PACIFIC = ['48MXU', '48MYU', '48PZC', '50LLR', '51PTS']
CURATED = [
    {
        'id': 'green-turtle', 'name': 'Green turtle', 'scientificName': 'Chelonia mydas',
        'sourceUrl': 'https://www.fisheries.noaa.gov/species/green-turtle',
        'rangeSummary': 'NOAA describes a broad distribution across the Atlantic, Pacific and Indian oceans and the Mediterranean Sea.',
        'habitat': 'Young turtles develop offshore; older juveniles and adults forage in shallow coastal waters, including seagrass and algae habitats.',
        'studyTiles': CARIBBEAN + WARM_INDO_PACIFIC + ['36JUN'],
    },
    {
        'id': 'hawksbill-turtle', 'name': 'Hawksbill turtle', 'scientificName': 'Eretmochelys imbricata',
        'sourceUrl': 'https://www.fisheries.noaa.gov/species/hawksbill-turtle',
        'rangeSummary': 'NOAA describes nearshore habitats across the world\'s major oceans.',
        'habitat': 'Older turtles commonly forage on coral reefs; some use mangrove estuaries. Hatchlings spend their early years offshore around floating algae and drift material.',
        'studyTiles': CARIBBEAN + WARM_INDO_PACIFIC,
    },
    {
        'id': 'leatherback-turtle', 'name': 'Leatherback turtle', 'scientificName': 'Dermochelys coriacea',
        'sourceUrl': 'https://www.fisheries.noaa.gov/species/leatherback-turtle',
        'rangeSummary': 'NOAA describes leatherbacks across the Atlantic, Pacific and Indian oceans, migrating between distant feeding and nesting regions.',
        'habitat': 'These ocean-going turtles feed on soft-bodied prey such as jellyfish and salps; females come ashore on warm-water nesting beaches.',
        'studyTiles': CARIBBEAN + WARM_INDO_PACIFIC + ['36JUN'],
    },
    {
        'id': 'yellowfin-tuna', 'name': 'Yellowfin tuna', 'scientificName': 'Thunnus albacares',
        'sourceUrl': 'https://www.fisheries.noaa.gov/species/atlantic-yellowfin-tuna',
        'sourceUrls': ['https://www.fisheries.noaa.gov/species/atlantic-yellowfin-tuna',
                       'https://www.fisheries.noaa.gov/species/pacific-yellowfin-tuna'],
        'rangeSummary': 'NOAA describes yellowfin in tropical and subtropical oceans worldwide, including the Caribbean and Pacific.',
        'habitat': 'Highly migratory fish of warm ocean waters. Larvae and juveniles occupy surface waters; older fish also use deeper water and may gather around floating objects.',
        'studyTiles': CARIBBEAN + WARM_INDO_PACIFIC + ['36JUN'],
    },
]


def fetch_accepted(scientific_name):
    url = f'{API}/AphiaRecordsByName/{quote(scientific_name)}?like=false&marine_only=true'
    request = Request(url, headers={'Accept': 'application/json', 'User-Agent': 'MarineGUARDer-species-sync/1.0'})
    with urlopen(request, timeout=25) as response:
        records = json.load(response)
    matches = [record for record in records if record.get('scientificname') == scientific_name
               and record.get('status') == 'accepted' and record.get('isMarine') == 1]
    if len(matches) != 1:
        raise ValueError(f'Expected one accepted marine record for {scientific_name}; got {len(matches)}')
    record = matches[0]
    if record.get('valid_AphiaID') != record['AphiaID']:
        raise ValueError(f'Accepted ID mismatch for {scientific_name}')
    return url, record


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Verify saved taxonomy against live WoRMS without changing files')
    args = parser.parse_args()
    retrieved = datetime.now(timezone.utc).isoformat()
    species, receipts = [], []
    for entry in CURATED:
        url, record = fetch_accepted(entry['scientificName'])
        item = dict(entry)
        item.update(aphiaId=record['AphiaID'], authority=record['authority'],
                    wormsUrl=record['url'], citation=record['citation'], reviewed=REVIEWED,
                    classification={rank: record.get(rank) for rank in
                                    ['kingdom', 'phylum', 'class', 'order', 'family', 'genus']},
                    associationBasis='Broad NOAA range context; not a sighting or confirmed local occurrence.')
        species.append(item)
        receipts.append({'requestUrl': url, 'record': record})
    if args.check:
        existing = {entry['id']: entry for entry in json.loads(CATALOG.read_text(encoding='utf-8'))['species']}
        for item in species:
            for field in ['scientificName', 'aphiaId', 'authority', 'classification', 'wormsUrl']:
                if existing.get(item['id'], {}).get(field) != item[field]:
                    raise ValueError(f'Saved {item["id"]}.{field} differs from live WoRMS; run sync_species.py')
        print(f'Live WoRMS matches all {len(species)} saved taxa.')
        return
    payload = {'species': species, 'taxonomyRetrievedAt': retrieved,
               'rangeSource': 'NOAA Fisheries', 'taxonomySource': 'World Register of Marine Species (WoRMS)',
               'rangeNotice': 'Broad range context only. Associations do not establish local presence or interaction with detected debris.'}
    # Collect and validate every source before replacing either saved artifact.
    for path, content in [(CATALOG, payload), (RECEIPTS, {'retrievedAt': retrieved, 'records': receipts})]:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(path.suffix + '.tmp')
        temporary.write_text(json.dumps(content, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        temporary.replace(path)
    print(f'Saved {len(species)} accepted marine taxa to {CATALOG}')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(f'Species sync failed: {error}', file=sys.stderr)
        sys.exit(1)
