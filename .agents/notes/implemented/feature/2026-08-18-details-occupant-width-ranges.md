# Agent Note: Details occupants declare their width ranges

Status: implemented

English | [中文](2026-08-18-details-occupant-width-ranges.zh.md)

## Problem

The three-column AppFrame applied one 300/360/520px details range to every occupant. That geometry suits ordinary tool details but prevents a page-oriented occupant from expanding far enough to remain useful. Raising the global maximum would change established tool-details behavior, while bypassing the layout solver would let the details column starve the Session Surface.

## Decision

`ctx.layout.openDetails(range?)` accepts a `DetailsWidthRange` containing positive `minimum`, `default`, and `maximum` pixel widths ordered from smallest to largest. Omitting the range resolves to the ordinary 300/360/520px values. A different range adopts its default width, while reopening an already-open range with the same three values preserves the dragged preference. Close writes zero; the next open restores the requested range's default.

The root layout store keeps the active range beside the transient details width. Drag writes clamp against that range, and the pure concession solver uses its minimum and maximum. The solver still reserves the 640px Session Surface minimum: it first shrinks details to the occupant minimum, then derives a zero rendered width when both columns cannot fit. This automatic close never rewrites the preferred width, so widening the window restores it.

The layout service stores no occupant identity. The range values are the complete geometry declaration: two callers that request the same range share the same open-width preference, while a caller that needs fresh geometry declares a different range or closes before reopening. A Browser Dock range can therefore use a 960px maximum without widening ordinary details.

## Verification

The layout service test pins range forwarding through the public `ctx.layout` face. Store and AppFrame tests cover a 420/640/960px occupant through open, drag clamp, repeated open, close and reopen, concession, automatic close, and wide-window recovery. Solver tests pin the Session Surface minimum at the exact dynamic-range thresholds, and ordinary no-range tests retain 300/360/520px behavior. The shipped composition currently has no custom-range occupant, so the existing keyless browser details-lifecycle scenario remains unchanged; Browser Dock supplies the first assembled custom range.

## Alternatives considered

**Raise the global details maximum to 960px.** Rejected because every existing occupant would gain new drag geometry even though only page-oriented content needs it.

**Give Browser Dock a separate grid or overlay.** Rejected because a second layout path would duplicate drag, concession, Session Surface protection, and automatic-close behavior.

**Attach width metadata to the `details` slot declaration.** Rejected because the slot declaration identifies the render position, while `openDetails` identifies the active viewing intent. Keeping range selection on the existing control face lets one declarative layout store own transitions and geometry.

**Persist one width per occupant identity.** Rejected because panel geometry remains transient and the layout service should not learn product-specific occupant ids. Range-value equality preserves an active drag without adding another identity registry.

## Consequences

Details occupants can request geometry that matches their content while the layout owner retains one drag and concession implementation. Ordinary details keep their established widths. A custom occupant must pass its range whenever it opens; omission deliberately selects ordinary geometry. Range values are trusted same-process plugin inputs under the documented ordering rule, and the solver continues to derive closure rather than mutating the stored preference.
