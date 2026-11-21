# Protected Planet marine and coastal boundaries

Verified 2026-11-21 against the official UNEP-WCMC service. The discovery source
is [Protected Planet](https://www.protectedplanet.net/en). Its
[API page](https://api.protectedplanet.net/) links to keyed API v4; the app instead
uses the publicly queryable, official ArcGIS polygon service below, which needs
no token. No account was created and no terms checkbox was accepted.

- [Marine/coastal service metadata](https://data-gis.unep-wcmc.org/server/rest/services/ProtectedSites/WDPA_Marine_and_Coastal/FeatureServer?f=pjson)
- [Polygon-layer metadata](https://data-gis.unep-wcmc.org/server/rest/services/ProtectedSites/WDPA_Marine_and_Coastal/FeatureServer/1?f=pjson)
- [Polygon query endpoint](https://data-gis.unep-wcmc.org/server/rest/services/ProtectedSites/WDPA_Marine_and_Coastal/FeatureServer/1/query)
- [Protected Planet terms](https://www.protectedplanet.net/en/legal)

The WDPCA is a joint UNEP/IUCN product managed by UNEP-WCMC. It combines the
former protected-area and OECM databases. This service describes its own view
as protected areas (`site_type = 'PA'`) in the Marine or Coastal realms. The
query repeats those restrictions and the client filters them again. OECMs and
terrestrial features are excluded; the interface preserves the reported status
and does not label a proposed site as designated.

Protected Planet publishes monthly updates. On the review date the service root
copyright cited **November 2026**, while the polygon-layer copyright cited
**October 2026** (and the service subject also mentioned October). This metadata
conflict is retained here rather than guessing a release. Each app query reads
the live polygon-layer copyright and returns its version/attribution alongside
the polygons. Thus the displayed version is specifically the layer's citation,
not an independent certification of the underlying geometry's update date.

## Integration contract

`queryProtectedAreas([west, south, east, north], {signal} = {})` returns a GeoJSON
FeatureCollection. WGS84 bounds are finite longitude/latitude numbers. A viewport
with west greater than east is split at the date line and duplicate parcels are
removed. Queries use envelope intersection, `returnGeometry=true`, `outSR=4326`,
and a 200-record page cap. The returned collection contains at most 200 features.
`truncated` preserves ArcGIS's `exceededTransferLimit` flag, also becoming true
if combining date-line results exceeds the cap. If the server omits its flag
at the cap, the client conservatively reports truncation. Zoom in to refine.

The layer supports GeoJSON. Geometry is generalized by 0.0005 degrees and rounded
to five decimal places to keep this visual overlay responsive. It is not suitable
for surveying, legal-boundary decisions or precise spatial overlap calculations.
The local debris detections are historical and are not updated by these queries.

Each feature retains polygon or multipolygon geometry and has normalized
properties `name`, `id`, `sourceUrl`, `designation`, `status`, `kind` and `realm`.
`kind` is `Protected area`; `status` remains the service's status string.
The collection also includes `sourceUrl`, the live full `attribution`, `version`,
`versionBasis`, `truncated`, `maxFeatures` and `geometryGeneralizationDegrees`.
Missing designation/status is null. No source boundary means no feature; no fake
boundary or species presence is inferred.

| Source field | Use |
| --- | --- |
| `objectid` | Stable ordering; final identifier fallback |
| `site_id` | Protected Planet profile link, e.g. https://www.protectedplanet.net/12564 |
| `site_pid` | Parcel identifier used for feature identity and deduplication |
| `name_eng`, `name` | English name, then original-name fallback |
| `desig_eng`, `desig` | English designation, then original designation |
| `status` | Reported status, preserved in display |
| `site_type` | Must be `PA`; OECMs do not pass |
| `realm` | Must be `Marine` or `Coastal` |

The verified local-origin request returned `Access-Control-Allow-Origin:
http://127.0.0.1:5173`; a Vite proxy is not required. A real query for
`[-88.3,15.4,-87.7,16.1]` returned Punta de Manabique (site 12564) and
Blanca Jeannette Kawas (Punta Sal) (site 30627). A two-feature test query
returned `exceededTransferLimit: true`, confirming the truncation signal.

Service/network/HTTP/malformed-response errors reject `ProtectedAreasError`
with code `SERVICE`, `NETWORK`, `HTTP` or `INVALID_RESPONSE`; malformed bounds
use `INVALID_BOUNDS`. No matches is a successful empty FeatureCollection.
Caller cancellation remains `AbortError`; the query has a 20-second timeout.

## Attribution and use

Keep the returned full citation, its release month/year and a clear Protected
Planet source link visible with the overlay. The terms distinguish viewing
attributed online maps from redistribution and restrict commercial use. The
app adds no protected-boundary download/export or persistent geometry cache.
For publication or a different use, consult the linked current terms, including
their publication requirements. This integration does not grant additional
rights or represent approval by UNEP-WCMC.
