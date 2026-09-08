# Agent Note: phone cancellation and listener ownership

Status: implemented

English | [中文](2026-09-08-phone-cancellation-listener-ownership.zh.md)

## Problem

Phone runtime startup pauses retained caller, lifetime, readiness-window, and child-exit listeners after each probe round. Pool acquisitions also retained the caller abort listener after their waiter resolved or rejected. These retained listeners accumulated across ordinary readiness retries and repeated acquisition.

The phone-stream HTTP owner had a cancellation signal for every admitted transaction, but session and device listing reads plus managed-agent reads and installs did not all receive it. Host shutdown therefore waited for those backend operations to finish independently. Three ui-phone observable sources also allowed one throwing renderer subscriber to stop later subscribers and escape into refresh or connection work.

## Decision

One startup-scoped `AbortController` projects child exit into every readiness pause. A pause installs one shared settlement callback on the readiness window, generation lifetime, caller, and child-exit signals; every settlement clears the timer and removes all four listeners. A pool occupancy removes its caller abort listener immediately before its waiter resolves or rejects.

Every phone-stream session, agent, and device-list backend call receives the owning `PhoneHttpTransactions` signal. Managed-agent install carries the same signal inside its options. The listing, listing-backed environment, and connection observables contain each subscriber exception, report it through an injectable reporter with a console diagnostic default, and continue the current fan-out.

## Alternatives considered

**Rely on one-shot abort listeners.** Rejected: `{ once: true }` removes a listener only when that signal aborts. Successful pauses and acquisitions leave long-lived caller and generation signals un-aborted.

**Check the closing flag only after backend completion.** Rejected: the check prevents a late response commit but cannot interrupt the operation that shutdown is waiting to join.

**Let subscriber exceptions reject refresh.** Rejected: renderer invalidation is an observation callback. One broken observer cannot roll back an already committed snapshot or prevent other mounted views from seeing it.

## Consequences

Readiness retries and settled acquisitions leave no owned abort listeners behind. Phone-stream shutdown actively cancels all admitted backend calls before joining them. A failing ui-phone subscriber produces one diagnostic while the remaining subscribers still receive the committed state.

The runtime pool still owns only the external Host generation. Native process enrollment after Host termination remains outside this decision.
