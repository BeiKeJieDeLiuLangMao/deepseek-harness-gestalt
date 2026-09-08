# Agent Note: shipped Member Question Client assembly

Status: implemented

English | [中文](2026-09-08-member-question-client-assembly.zh.md)

## Problem

`ui-member-questions` is the only Client plugin that reads the receiving-question projection and registers the additive Decision Brief dock. The Client module registry discovers packages from active Loader rows; a package's `dsh.client` declaration orders discovered dependencies but does not activate the package. A shipped roster without the `ui-member-questions` row can retain the Host receiver and receiving Session projection while exposing no answer or decline controls in the product UI.

## Decision

The Web application roster explicitly mounts `@deepseek-ai/dsh-client-ui-member-questions` as `ui-member-questions` after `ui-user-questions`, and the Web application manifest declares the package as a resolver dependency. Desktop inherits this row through the Web base before applying its Desktop patch.

Assembly guards check four different facts: the Web default config contains the row, the resolved Desktop config retains it, the shipped Host produces a Client module graph containing the package, and the real browser boot manifest contains the activated package. These checks prevent a source package, manifest dependency, or Host receiver from substituting for actual Client activation.

## Alternatives considered

**Infer Client activation from `dsh.client` dependencies.** Rejected because Loader rows are the deployment's explicit plugin set. Dependency metadata orders and validates packages already selected by that set.

**Render member questions through `ui-user-questions`.** Rejected because that plugin owns local model-to-user questions. The member-question dock consumes Host receiving authority, terminal results, and receiver-owned material paths.

## Consequences

Normal Web and Desktop compositions activate the existing Decision Brief dock and its answer and decline controls whenever the Host receiving projection contains a pending member question. This assembly decision does not add a production cross-account delivery implementation; delivery availability remains owned by the sender and receiver capability.

## Testing

`apps/desktop/tests/overlay-isolation.spec.ts` checks both the Web default config and the resolved Desktop config. `apps/web/tests/shipped-composition.e2e.ts` checks the final Host Client module graph. `apps/web/tests/smoke-real.e2e.ts` starts the real Web entry, waits for the package bundle, and checks the browser boot manifest. The existing `apps/web/tests/member-question-receiving.e2e.ts` and ui-member-questions package tests continue to own the receiving interaction itself.
