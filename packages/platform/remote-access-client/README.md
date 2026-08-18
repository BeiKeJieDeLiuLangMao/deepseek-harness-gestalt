# Remote Access client

English | [中文](README.zh.md)

Authenticated Desktop and Mobile HTTP transport for the public Remote Access service. It forwards one current-Installation Account proof per operation and validates every JSON response before exposing branded Personal Pairing identifiers.

The client does not implement a handshake or store pairing keys. Product controllers supply signed-in Account authorization and use the independently reviewed server-side handshake provider selected by the Platform deployment.

`RemoteRelayEndpointController` owns one outbound Mobile or Desktop WSS lifecycle through the deployment's single non-sticky Platform endpoint. Every physical connection obtains a fresh attachment id and authenticates with the current opaque route id plus rotatable high-entropy credential. Socket loss starts a new connection after the validated retry delay; Desktop emits its authoritative encrypted resynchronization after every attachment. Sends fail with `REMOTE_OFFLINE` while disconnected and are never retained or replayed.

The Desktop Settings owner starts this lifecycle only while Mobile Access is enabled. Window close quits the Desktop process, and sleep, quit, sign-out, or disabling Mobile Access stops and drains the socket. There is no daemon, background Host, or remote wake path.

## Model Experience

None, as Remote Access transport values never enter a model request.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- Native and browser WSS adapters are composition responsibilities; this package owns the lifecycle and encoded Relay frames.
- Production use still requires a reviewed handshake provider in the Platform deployment.
