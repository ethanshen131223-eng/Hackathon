# Object outlines

The identification photo, local photo workbench, and puzzle creator will let users drag a closed outline around a visible object with a mouse, touch, or pen. Freehand drawing is the default; point marking and the existing keyboard controls remain available. Releasing the pointer closes the outline. Undo and clear affect outlines, with feedback for very short strokes and interrupted gestures.

Use normalized image coordinates so outlines resize with the photo. Local findings and authored targets retain their outlines in browser storage and JSON exports. Old circular markers remain valid. Authored outline targets use their actual polygon for point selection. In dataset cases, compare the drawn area with reference boxes to provide practice feedback; this is an approximate region match, not segmentation truth or automated material identification. Unmatched outlines must be removed or corrected before completing a case. Save a matched user outline with its collected finding.

Implement with an SVG overlay and native Pointer Events, including pointer capture, cancellation, primary-pointer filtering, and disposal on navigation. Keep the established typography and gradient palette. Do not change model training, scientific data, rewards, or reasoning requirements.
