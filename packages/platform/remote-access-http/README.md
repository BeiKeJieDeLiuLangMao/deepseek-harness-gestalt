# Remote Access HTTP

English | [中文](README.zh.md)

HTTP Consumer for the public Remote Access service. One fixed Platform route accepts current-Installation Account proof headers, validates operation input, and delegates only through `ctx.remoteAccess`.

The Consumer reads no Account database fields and grants no authority itself. The Remote Access provider authenticates the Account and Installation role through the Platform Account public service before any pairing lifecycle mutation.

## Model Experience

None, as the HTTP Consumer handles pairing state outside model requests.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- The route owns Personal Pairing operations only; it does not forward Relay ciphertext or Host requests.
- Deployment TLS, rate limits, and audit policy remain Platform composition responsibilities.
