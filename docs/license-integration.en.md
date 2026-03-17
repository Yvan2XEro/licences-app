# License Integration Guide

This guide explains how to integrate the current license system exposed by this repository into web, mobile, and desktop clients.

For Tauri specifically, use `docs/license-integration-tauri.en.md` as the primary implementation guide. It goes deeper into the Rust boundary, local persistence, offline verification, and app gating.

## Integration summary

The public license contract is exposed through oRPC procedures:

- `licenses.activate`
- `licenses.validate`
- `licenses.deactivate`
- `licenses.publicKey`

These procedures are served by the Hono API in `apps/server` and implemented in `packages/api/src/license-service.ts`.

## Base URL

- RPC endpoint: `POST {SERVER_URL}/rpc`
- OpenAPI reference: `{SERVER_URL}/api-reference`

In development, `SERVER_URL` is usually `http://localhost:3000`.

## Request payload

All public license procedures use the same input shape:

```json
{
  "licenseKey": "LIC-ABCDE-FGHIJ-KLMNO-PQRST-UVWXY-Z",
  "productSlug": "my-product",
  "machineId": "hashed-machine-fingerprint",
  "installationId": "stable-installation-id"
}
```

Notes:

- `machineId` is required and must remain stable for the same machine.
- `installationId` is optional at the API level, but you should treat it as required in real clients. It improves token traceability and offline state management.

## Success response

`activate` and `validate` return:

```json
{
  "ok": true,
  "license": {
    "status": "active",
    "type": "monthly",
    "expiresAt": "2026-01-01T00:00:00.000Z",
    "maxActivations": 3,
    "productSlug": "my-product"
  },
  "machine": {
    "fingerprint": "hashed-machine-fingerprint",
    "revokedAt": null
  },
  "token": "<signed-token>",
  "tokenExpiresAt": "2026-02-10T12:00:00.000Z"
}
```

`deactivate` returns the same top-level contract but without a new token.

## Failure response

```json
{
  "ok": false,
  "error": {
    "code": "LICENSE_NOT_FOUND",
    "message": "License not found."
  }
}
```

Handle these error codes explicitly:

- `LICENSE_NOT_FOUND`
- `PRODUCT_MISMATCH`
- `LICENSE_REVOKED`
- `LICENSE_SUSPENDED`
- `LICENSE_EXPIRED`
- `MAX_ACTIVATIONS_REACHED`
- `MACHINE_NOT_FOUND`
- `RATE_LIMITED`

## Public key endpoint

Clients that verify offline tokens locally should call `licenses.publicKey`.

Response shape:

```json
{
  "algorithm": "Ed25519",
  "publicKey": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
}
```

## Token model

On successful `activate` or `validate`, the server issues an Ed25519-signed token. The verified payload contains:

- `version`
- `iss`
- `aud`
- `sub`
- `jti`
- `licenseId`
- `productSlug`
- `machineFingerprint`
- `installationId`
- `licenseExpiresAt`
- `offlineUntil`
- `issuedAt`

This token is the basis for limited offline access.

## Recommended client-side flow

### 1. Provisioning

Before activation, create in the admin dashboard:

1. a Product
2. a Customer
3. a License linked to both

You will distribute:

- the `licenseKey`
- the expected `productSlug`

### 2. Activation

On first run:

1. derive or load `machineId`
2. derive or load `installationId`
3. call `licenses.activate`
4. store:
   - `licenseKey`
   - `productSlug`
   - `machineId`
   - `installationId`
   - `token`
   - `tokenExpiresAt`
   - last successful validation timestamp

### 3. Startup validation

On every app launch:

1. load local license state
2. if a cached token exists, verify it locally
3. if the token is still valid and `offlineUntil` is in the future, allow startup
4. if the token is missing or stale, call `licenses.validate`

### 4. Periodic refresh

Refresh the online validation:

- at app startup
- when connectivity returns
- on a timer, typically every 12 to 24 hours
- before sensitive sync/export actions if the app has been offline for a while

### 5. Deactivation

When the user wants to free the seat on the current device:

1. call `licenses.deactivate`
2. remove locally cached license state
3. return the app to the activation screen

## Platform recommendations

### Web

- generate a stable app installation id and persist it in `localStorage` or `IndexedDB`
- use a generated machine id rather than trying to fingerprint the browser aggressively
- do not rely on offline verification as a hard security boundary

### Mobile

- store the local license state in secure storage if available
- keep `installationId` stable across app restarts
- use local token verification only as an offline grace mechanism

### Desktop

- perform the license boundary in native code when possible
- store secrets and cached state in OS-protected storage
- verify the Ed25519 token locally

For Tauri, see `docs/license-integration-tauri.en.md`.

## Rate limiting and retry behavior

The public API applies IP-based rate limiting using:

- `RATE_LIMIT_WINDOW_MS`
- `RATE_LIMIT_MAX`

If you receive `RATE_LIMITED`:

- stop retry storms
- apply exponential backoff
- show a user-facing error rather than spinning forever

## Machine identity guidance

The current API trusts the client-supplied `machineId`. That means the client should send a stable hash, not raw host identifiers.

Recommended pattern:

1. collect a stable machine signal or generate a durable device id
2. normalize it
3. hash it with SHA-256 before sending
4. persist it locally so it does not drift across sessions

## Security boundaries

The current system is solid for controlled clients, but the trust model is still server-centered:

- the license key is user-facing
- the server decides whether a machine may activate
- the offline token is signed server-side and verified client-side
- the client must still protect local state from tampering

For desktop apps, enforce licensing in the native layer, not only in the UI.

## Minimal TypeScript example

```ts
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";

const link = new RPCLink({
  url: `${SERVER_URL}/rpc`,
  fetch(url, options) {
    return fetch(url, {
      ...options,
      credentials: "include",
    });
  },
});

const client = createORPCClient(link);

const result = await client.licenses.activate({
  licenseKey: "LIC-ABCDE-FGHIJ-KLMNO-PQRST-UVWXY-Z",
  productSlug: "my-product",
  machineId: "hashed-machine-fingerprint",
  installationId: "stable-installation-id",
});
```

If you are not using oRPC directly, inspect `/api-reference` for the generated contract.
