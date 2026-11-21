# Species sources and lookup

Reviewed 2026-11-21. `web/public/species.json` combines short NOAA Fisheries
habitat/range paraphrases with live-verified accepted WoRMS taxonomy. The raw
WoRMS records and their supplied citations are retained in `worms-records.json`.

## NOAA Fisheries

The requested discovery entry point is [Find a Species](https://www.fisheries.noaa.gov/find-species),
which links to [Highly Migratory Species](https://www.fisheries.noaa.gov/highly-migratory-species).
NOAA's highly migratory species category includes tunas; the three turtles come
from its separate sea turtle profiles. The app does not claim turtles belong to
NOAA's fisheries management category for highly migratory species.

| Species | Exact NOAA source | Sections used |
| --- | --- | --- |
| Green turtle | https://www.fisheries.noaa.gov/species/green-turtle | Behavior and Diet; Where They Live |
| Hawksbill turtle | https://www.fisheries.noaa.gov/species/hawksbill-turtle | Where They Live |
| Leatherback turtle | https://www.fisheries.noaa.gov/species/leatherback-turtle | Behavior and Diet; Where They Live |
| Yellowfin tuna | https://www.fisheries.noaa.gov/species/atlantic-yellowfin-tuna | Where They Live; Biology |
| Yellowfin tuna, Pacific context | https://www.fisheries.noaa.gov/species/pacific-yellowfin-tuna | Where They Live |

The `studyTiles` lists are editorial associations with coarse study regions
inside broad NOAA ocean-basin range descriptions. They are not survey records,
modeled occurrence probabilities, critical habitat boundaries, or proof that an
animal is present in a satellite patch. No species was detected by the debris
model. The northern Chinese and Korean estuary tiles and Scotland are omitted
because this review did not establish a suitable local association. There is no
claim that omitted species or areas lack marine life.

## WoRMS

[Official REST documentation](https://www.marinespecies.org/rest/)
and [OpenAPI description](https://www.marinespecies.org/rest/api-docs/openapi.yaml).
Verified accepted IDs: Chelonia mydas **137206**, Eretmochelys imbricata **137207**,
Dermochelys coriacea **137209**, and Thunnus albacares **127027**. Per-record
citations supplied by WoRMS are saved verbatim with the catalog.

Requests tested on 2026-11-21:

- `https://www.marinespecies.org/rest/AphiaRecordsByName/Chelonia%20mydas?like=false&marine_only=true`
- `https://www.marinespecies.org/rest/AphiaRecordsByName/Testudo%20mydas?like=false&marine_only=true`
- `https://www.marinespecies.org/rest/AphiaRecordByAphiaID/137206`
- `https://www.marinespecies.org/rest/AphiaRecordsByVernacular/green%20turtle?like=false`

Scientific-name and vernacular responses allowed CORS (`Access-Control-Allow-Origin: *`).
Exact scientific matches are tried first, then exact common names through the
official vernacular endpoint, then scientific prefix matching. Results are
deduplicated by accepted AphiaID and limited to eight. This lookup searches the
first API result page; it is not an exhaustive download of WoRMS.

`searchTaxa(query, {signal} = {})` returns an array of normalized records:

```js
{
  acceptedScientificName, aphiaId, status, acceptedStatus, authority,
  classification: {kingdom, phylum, class, order, family, genus},
  url, originalName, originalAphiaId, citation
}
```

`status` is the matched name's status. A synonym is resolved through
`AphiaRecordByAphiaID` before showing the accepted classification. This matters:
the historic **Testudo mydas** record reports Testudinidae, while its accepted
**Chelonia mydas** record reports Cheloniidae. Unknown ranks remain `null`;
the app never fills them from another source. If WoRMS provides no accepted
record, `acceptedScientificName` is `null` and the original identity/status is
retained. Search supplies taxonomy, not habitat or species distribution.

No matches returns `[]`. Fetch/timeout failure rejects `SpeciesSearchError`
with `code: 'NETWORK'`; HTTP and malformed payload failures use `HTTP` and
`INVALID_RESPONSE`. Queries over 200 characters use `INVALID_QUERY`. Caller
cancellation remains `AbortError`. A search has a 12-second total timeout.

Refresh taxonomy and receipts with `python sync_species.py`; verify saved
accepted taxonomy without writes using `python sync_species.py --check`.
NOAA summaries and their review date remain editorial and require manual source
review when changed. No key or account is required for these WoRMS requests.
