import {classifyCleanupSite, cleanupAction} from './cleanup-site.js';

const shoreGuide = ['NOAA shoreline survey guide', 'https://marinedebris.noaa.gov/protocol/noaa-marine-debris-monitoring-and-assessment-project-shoreline-survey-guide'];
const droneStudy = ['NOAA drone field tests in Oregon and Texas', 'https://coastalscience.noaa.gov/news/drones-with-specialized-cameras-could-enhance-detection-removal-of-beach-debris-video/'];
const wetlandsGuide = ['NOAA intertidal removal practices', 'https://marinedebris.noaa.gov/other-reports/best-management-practices-removal-debris-wetlands-and-other-intertidal-areas'];
const riverPilot = ['LA County’s Ballona Creek Interceptor pilot', 'https://ballonainterceptor.lacounty.gov/'];
const reefRemoval = ['NOAA’s Papahānaumokuākea removal results', 'https://sanctuaries.noaa.gov/papahanaumokuakea/protect/marine-debris.html'];

export const cleanupSettings = [
  ['shore', 'Accessible beach or shoreline'], ['protected', 'Protected or sensitive habitat'],
  ['river', 'River mouth or drainage channel'], ['offshore', 'Offshore water or reef'],
  ['bay', 'Bay, gulf or other coastal waterway'],
];

const methods = {
  shore: {
    title: 'Walking survey and manual litter pickup',
    drones: 'Optional for mapping larger visible debris on long beaches. Ground checks are still needed.',
    validation: 'NOAA uses walking shoreline surveys. Its Oregon and Texas field tests found that drone imaging improved detection of beach-stranded debris at least one inch long.',
    sources: [shoreGuide, droneStudy],
    steps: [
      'Confirm public access and permission with the shoreline manager. Agree on a defined stretch, an appropriate tide and weather window, and a disposal or recycling partner. Keep teams on established access routes.',
      'Walk and record the same measured stretch before removal. Log the date, length, litter types and counts. If the shoreline is extensive, an authorized operator can use a drone to flag larger visible objects for ground checks.',
      'Have the crew hand-pick ordinary visible litter on accessible ground and sort it for the agreed disposal site. Leave unknown or hazardous objects in place and notify the cleanup lead or relevant authority.',
      'Recount the same stretch immediately after cleanup, record material removed, and revisit later to check for reaccumulation. Compare item counts per 100 metres using the same survey method.',
    ],
  },
  protected: {
    title: 'Manager-led, low-disturbance removal',
    drones: 'Omit by default. Consider survey flights only if the manager approves them and disturbance can be avoided.',
    validation: 'NOAA’s intertidal best practices draw on debris recovery in wetlands and other sensitive shorelines. They help managers choose removal approaches that limit habitat damage.',
    sources: [wetlandsGuide, shoreGuide],
    steps: [
      'Send the location and photos to the protected-area manager. Ask whether removal is appropriate and identify access routes, wildlife buffers, sensitive vegetation, nesting periods, and any restrictions. Let the manager set the work boundary.',
      'Use a walking or shore-based visual survey from approved access points to record visible litter and distinguish ordinary loose items from debris embedded in sediment or entangled in habitat. Start with photos and field notes.',
      'Where the manager approves it, use a small supervised crew to hand-remove loose debris from accessible areas. Leave embedded, hazardous, heavy, or entangled material to specialist teams. Avoid equipment traffic in sensitive habitat.',
      'Record items removed and any areas left untouched. Revisit the same approved observation points to check for recurring debris and signs of disturbance, and share the results with the manager.',
    ],
  },
  river: {
    title: 'Waterway-authority interception assessment',
    drones: 'Optional for documenting surface debris patterns from an authorized flight. Bank observations are the starting point.',
    validation: 'LA County tested a floating trash interceptor at Ballona Creek. That pilot establishes a practical precedent, while its performance applies to the conditions and infrastructure at Ballona Creek.',
    sources: [riverPilot, ['LA County pilot updates', 'https://ballonainterceptor.lacounty.gov/updates/']],
    steps: [
      'Share the mapped outfall with the local drainage or waterway authority. Check whether visible floating debris consistently reaches the outlet and whether upstream litter prevention, drain maintenance, or accessible bank cleanup could reduce the source.',
      'Arrange repeated observations from safe bank locations in different flow conditions. Record debris type, timing, travel paths, and accumulation points. Where permitted, an authorized drone survey may help document long or inaccessible reaches.',
      'If monitoring confirms recurring high loads, ask the authority to evaluate a managed interception pilot. The design review should cover flood conveyance, navigation, wildlife passage, storm performance, maintenance access, and waste removal.',
      'For an approved pilot, record collected weight and material types alongside river conditions and bypass events. Compare repeat observations upstream and downstream before judging whether the system is helping.',
    ],
  },
  offshore: {
    title: 'Verify debris and refer targeted retrieval',
    drones: 'No routine deployment. A qualified vessel operator may consider aerial reconnaissance for large visible objects.',
    validation: 'NOAA reports that trained crews removed 57,240 pounds of ghost nets during nine days of diving operations at Maro Reef in 2023. The result applies to identified gear handled by specialists.',
    sources: [reefRemoval, ['NOAA technician training', 'https://www.fisheries.noaa.gov/science-blog/marine-debris-bootcamp']],
    steps: [
      'Use the map coordinate as a search reference. Share verified sightings, photographs, date, location and debris type with the relevant marine authority or gear removal program. A concentration model alone cannot locate recoverable objects.',
      'The responsible team should establish whether repeated sightings or a professional survey confirm discrete large debris, such as derelict fishing gear. Document habitat, wildlife interactions and access constraints before deciding on retrieval.',
      'Refer identified targets to the trained operators equipped for the location. The responsible organization should choose vessel support, retrieval equipment, and protective procedures, and arrange receiving and disposal facilities.',
      'Report material type and measured weight removed, and log debris that remains for follow-up. If the available evidence describes only dispersed microplastics, prioritize source prevention and additional monitoring of the area.',
    ],
  },
  bay: {
    title: 'Survey shoreline accumulation and coordinate targeted pickup',
    drones: 'Optional for mapping visible accumulations on long or inaccessible banks, with approval and ground checks.',
    validation: 'NOAA’s guidance for intertidal removal is based on debris recovery operations. Its shoreline survey protocol establishes a repeatable way to measure accumulation before and after an intervention.',
    sources: [wetlandsGuide, shoreGuide, droneStudy],
    steps: [
      'Give the harbor or coastal manager the selected location and source. Ask where public access is available and which wetlands, habitats, vessel lanes and harbor structures need protection.',
      'Compare repeat observations at accessible shoreline accumulation points, such as the ends of public beaches or sheltered banks. Record visible item types, counts, survey length, date and conditions. Check whether litter returns after winds or tides change.',
      'Arrange authorized hand pickup on confirmed accessible shores. Ask the manager to handle debris in navigation lanes, sensitive habitat or water through the appropriate removal team. Agree on a receiving facility and record what was removed.',
      'Recount the same shoreline section after work and again later. If the same litter repeatedly arrives, share the record with the local stormwater or harbor operator to investigate upstream prevention.',
    ],
  },
  unknown: {
    title: 'Verify the location before choosing a cleanup method',
    drones: 'Skip drones for the initial check. Consider an authorized survey only when ground or bank access is limited.',
    validation: 'NOAA’s shoreline survey guide provides repeatable site selection, counting, and reporting methods for establishing visible litter conditions.',
    sources: [shoreGuide, droneStudy],
    steps: [
      'Start with the selected map location and confirm whether it represents an accessible shoreline, a river mouth, a sensitive habitat, or offshore water. Record the actual work area separately if the map point is offshore.',
      'Check available photos and reports with the relevant site manager or local cleanup group. If a shoreline survey is appropriate, record visible item types, counts, length surveyed, and the date along a repeatable route.',
      'Use the confirmed setting and debris type to choose the method. An accessible beach may suit hand pickup, while debris in a river channel, protected habitat, or offshore water needs review by the responsible authority.',
      'Confirm permission, conditions, and disposal before scheduling. Keep a dated baseline so the team can compare the same area after any authorized work and document items that need specialist attention.',
    ],
  },
};

export function selectCleanupMethod(site = {}, severity = {level:'unknown',kind:'unknown'}) {
  const evidence = typeof site.context === 'string' ? site.context : '';
  const configured = cleanupSettings.some(([key]) => key === site.setting) ? site.setting : '';
  let setting = classifyCleanupSite({...site, setting:configured});
  if (site.habitat === 'near' || evidence.includes('Protected Planet:')) setting = 'protected';
  else if (!setting && evidence.includes('Modeled river outfall')) setting = 'river';
  else if (!setting && /NOAA field sample · Beach\b/.test(evidence)) setting = 'shore';
  const method = methods[setting || 'unknown'];
  const hold = site.access === 'closed' || site.wind === 'unsafe' || site.water === 'unsafe';
  return {...method, setting: setting || 'unknown', hold, action:cleanupAction(setting, severity, hold),
    basis: setting ? cleanupSettings.find(([key]) => key === setting)?.[1] : 'Site setting still needs confirmation'};
}
