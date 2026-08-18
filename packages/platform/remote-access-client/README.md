# Remote Access client

English | [中文](README.zh.md)

Authenticated Desktop and Mobile HTTP transport for the public Remote Access service. It forwards one current-Installation Account proof per operation and validates every JSON response before exposing branded Personal Pairing identifiers.

The client does not implement a handshake or store pairing keys. Product controllers supply signed-in Account authorization and use the independently reviewed server-side handshake provider selected by the Platform deployment.

## Model Experience

None, as Remote Access transport values never enter a model request.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- This transport covers Personal Pairing lifecycle operations only. Encrypted Companion traffic uses the independently versioned Remote Protocol after pairing.
- Production use still requires a reviewed handshake provider in the Platform deployment.
