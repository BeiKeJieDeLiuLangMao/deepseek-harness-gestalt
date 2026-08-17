# Platform identity

## Language

**Platform Account**: The durable identity created from an immutable numeric GitHub id inside exactly one environment identity namespace. Public login and avatar may change without changing the account.

_Avoid_: GitHub account (when referring to the Platform record), user profile

**Installation**: One Desktop or Mobile app copy identified independently from a Workspace, Session, device pairing, or Platform Instance. An installation has at most one current Account Session.

_Avoid_: device (when several installations can exist on one device), client session

**Account Session**: A proof-of-possession authorization bound to one Account and one Installation. Its access token lasts 15 minutes; its rotating refresh token lasts at most 30 days.

_Avoid_: GitHub token, browser session, Personal Pairing

The Account provider, not an operation caller, is authoritative for the authenticated Installation id and kind. A capability that needs this identity calls `currentInstallation()` with a fresh proof; it never accepts a caller's role claim.

**Login Attempt**: A five-minute, single-use, signed polling authorization started by an Installation. GitHub returns only to Platform's fixed HTTPS callback; no provider token or credential returns through an application URL.

_Avoid_: pairing code, login session

**Platform Instance**: One running Platform service process. Instances share Account persistence and invalidation transport; an Account Session is not owned by one process.

_Avoid_: Installation, Desktop Host

**Personal Pairing**: A durable relationship between installations owned outside Account. Current-installation sign-out invalidates the Account Session and connections but preserves Personal Pairings.

_Avoid_: Account Session, OAuth connection

The checked-in Remote Access provider owns the single-process challenge and confirmation lifecycle. Cross-instance Relay routing and durable multi-instance pairing state are separate deployment work.

**Pairing Challenge**: A two-minute single-use invitation capability created only by an enabled Desktop Installation. QR and full-link presentation carry the same 256-bit secret and protocol binding.

_Avoid_: pairing code, Login Attempt

**Device Principal**: The independently keyed, revocable identity created only after same-account handshake completion and explicit Desktop confirmation. Its grant is limited to Companion Surface authority.

_Avoid_: Platform Account, Account Session, mobile user
