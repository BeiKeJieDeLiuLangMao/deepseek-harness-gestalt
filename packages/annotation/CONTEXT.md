# Annotation

Human-authored markup that anchors notes to conversation content for inclusion in the next user message. Annotation is an input method, not a long-lived review or collaboration system.

## Language

**Annotation**: A note anchored to a precise part of conversation content and collected for the next user message.

_Avoid_: Comment, review thread, feedback

**Annotation Draft**: The mutable annotations a person is preparing for their next user message, scoped to one Session and retained until sent or discarded.

_Avoid_: Pending comments, unsent review

**Annotation Submission**: The ordinary user message compiled from an Annotation Draft. After submission, its text and images remain conversation history but its annotations no longer exist as separate objects.

_Avoid_: Annotation snapshot, annotation record

**Text Anchor**: The exact visible passage and surrounding context that locate a Text Annotation within one completed assistant response.

_Avoid_: DOM range, text offset

**Text Annotation**: An Annotation attached through a Text Anchor to one completed assistant response.

_Avoid_: Text comment, reasoning annotation

**Image Pin Annotation**: An Annotation anchored to one normalized point in the displayed orientation of an image being prepared for the next user message or already present in conversation history.

_Avoid_: Image comment, drawing, image markup

**Annotation Order**: The order in which a person creates annotations in one Annotation Draft. Display numbers follow this order but are not annotation identities.

_Avoid_: Annotation id, source order

**Draft Mark**: The temporary highlight or image pin that projects an Annotation Draft onto its source content until the draft is sent or discarded.

_Avoid_: Saved highlight, permanent annotation
