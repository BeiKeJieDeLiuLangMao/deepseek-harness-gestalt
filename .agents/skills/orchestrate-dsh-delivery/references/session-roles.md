# Delivery session roles

Use the fewest sessions that preserve ownership and independent judgment. Reuse each owner through coherent fixes; do not create a session for every ticket, error, or review comment.

| Role | Responsibility |
| --- | --- |
| Root | Keeps the demand boundary, asks the user to choose the root model, investigates whether work belongs in a new or existing module and whether UI is involved, grills the demand with the user, accepts the reviewed scheme and design, builds the dependency DAG, dispatches roles, and synthesizes retrospectives. It never routes or changes its own model and does not implement. |
| Scheme and simplification | Produces the reviewed technical scheme before implementation, then returns after human acceptance to identify evidence-backed simplifications. Reuse one session when its context remains current. |
| UI | Produces and validates the interaction design when user-visible GUI behavior is relevant. Omit this role otherwise. |
| Module implementer | Owns one stable module boundary and may deliver several related tickets. The same owner receives implementation, review, CI, E2E, and acceptance fixes for that module. Use N implementers only when the DAG has genuinely independent module boundaries. |
| Quality | Owns E2E and local-CI evidence. Before human acceptance it completes E2E; during acceptance it runs local CI from a separate clean checkout without disturbing the frozen acceptance instance. |
| Delivery | Integrates owner commits, prepares the acceptance environment and provider/experience instructions, freezes the exact candidate instance, maintains the Draft PR, and tracks remote CI. It does not replace Quality's checks or the independent review. |
| Independent code review | Reviews the integrated candidate after human acceptance and re-reviews affected deltas. It uses a non-primary-author model and remains independent from module ownership. |

## Delivery sequence

1. Root investigates scope, grills unresolved product decisions with the user, and gets the full scheme and UI design reviewed.
2. Root publishes the dependency DAG and dispatches stable owners. Module owners work in isolated worktrees; Delivery integrates their commits into the single demand branch.
3. Quality completes E2E before the user receives an acceptance environment.
4. During human acceptance, Delivery prepares the required providers, experience instructions, exact frozen instance, Draft PR, and CI monitoring while Quality runs local CI in a separate checkout.
5. After human acceptance, Scheme performs simplification and Independent code review examines the accepted candidate. The user chooses which proposed improvements enter the demand.
6. Fixes return to the original module owners. Quality reruns affected E2E, Independent code review examines the delta, and the user reaccepts affected behavior.
7. Every involved session retrospects only its own work. Root synthesizes keep/drop candidates for the user; accepted changes land on the same demand branch and pass required checks before merge.

Runtime isolation must be verified, not inferred from the role name. In-process spawn/fork children inherit the parent session cwd and do not create a worktree, process, disk, or credential boundary. The model-facing delegation call cannot select cwd, worktree, permission, or a per-call tool filter. `send_message` schedules a later FIFO turn and cannot switch the child model or cwd; `interrupt_agent` stops only the current turn and leaves queued turns parked until a later waking send. Use isolated worktrees and credential-safe environments as explicit delivery mechanisms rather than prompt promises.
