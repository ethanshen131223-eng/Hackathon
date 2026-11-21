export const EVIDENCE_CHOICES=[
  {id:'bounded-observation',label:'Visible features match a source-labeled litter region; material and physical size remain unconfirmed.'},
  {id:'confirmed-polymer',label:'The photo alone confirms the plastic polymer and its chemical composition.'},
  {id:'complete-census',label:'The labeled boxes establish the total number of trash pieces in the surrounding water.'},
];
export const EVIDENCE_LIMITS=[
  {id:'physical-size',label:'Exact physical dimensions in millimeters'},
  {id:'polymer',label:'Confirmed polymer or material identity'},
  {id:'concentration',label:'Environmental concentration in pieces/km²'},
  {id:'image-locations',label:'Where the published annotation regions are in the photo'},
];
export function checkReasoning({evidenceChoice,limitChoices=[],note=''}){
  const selected=new Set(limitChoices), expected=['physical-size','polymer','concentration'];
  const evidenceCorrect=evidenceChoice==='bounded-observation';
  const limitsCorrect=selected.size===expected.length&&expected.every(id=>selected.has(id));
  const notePresent=typeof note==='string'&&note.trim().length>=12&&note.length<=2000;
  const issues=[];
  if(!evidenceCorrect)issues.push('Separate a visible, source-labeled observation from a confirmed material identity or a complete environmental count.');
  if(!limitsCorrect)issues.push('The annotation locations are supplied. Physical size, polymer identity, and environmental concentration need additional evidence.');
  if(!notePresent)issues.push('Add a short observation note (12–2,000 characters). Describe a visual clue and something that remains uncertain.');
  return {ready:evidenceCorrect&&limitsCorrect&&notePresent,evidenceCorrect,limitsCorrect,issues,noteAssessment:'stored-not-graded'};
}
