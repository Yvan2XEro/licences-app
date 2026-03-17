# License Manager Integration Guide (EN)

This document explains how to integrate the licence manager from this repo into mobile, desktop, and web apps. It is based on the current project implementation and should be kept alongside the codebase.

## 1) What you integrate

The public license API is exposed via oRPC procedures:
- `licenses.activate`
- `licenses.validate`
- `licenses.deactivate`
- `licenses.publicKey`

These are served by the Hono API in `apps/server` and share a common JSON schema.

## 2) Base URL and endpoints

- RPC endpoint: `POST {SERVER_URL}/rpc`
- OpenAPI reference (schema browser): `{SERVER_URL}/api-reference`

Where `SERVER_URL` is the API host (e.g. `http://localhost:3000` in dev).

### Request shape (all three actions)

```json
{
  "licenseKey": "LIC-AB12-CD34-EF56",
  "productSlug": "my-product",
  "machineId": "HASHED_DEVICE_FINGERPRINT",
  "installationId": "stable-installation-id"
}
```

### Success response shape (activate / validate)

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
    "fingerprint": "HASHED_DEVICE_FINGERPRINT",
    "revokedAt": null
  },
  "token": "<signed-token>",
  "tokenExpiresAt": "2026-02-10T12:00:00.000Z"
}
```

### Failure response shape

```json
{
  "ok": false,
  "error": {
    "code": "LICENSE_NOT_FOUND",
    "message": "License not found.",
    "details": {
      "any": "optional"
    }
  }
}
```

Error codes you should handle:
- `LICENSE_NOT_FOUND`
- `PRODUCT_MISMATCH`
- `LICENSE_REVOKED`
- `LICENSE_SUSPENDED`
- `LICENSE_EXPIRED`
- `MAX_ACTIVATIONS_REACHED`
- `MACHINE_NOT_FOUND`
- `RATE_LIMITED`

## 3) Machine fingerprint (machineId)

The API expects a stable, per-device identifier (preferably hashed) so it can enforce activation limits.

Recommended strategy (cross-platform):
1) Derive or generate a device ID.
2) Hash it (SHA-256 or similar) before sending.
3) Persist it locally so it stays stable across sessions.

Platform hints:
- Web: generate a random UUID once and store it in `localStorage` or `IndexedDB`, then hash it.
- Mobile: use the platform’s stable device identifier if available, otherwise generate and persist one.
- Desktop: use a stable machine identifier (OS or app install ID) and hash it.

## 4) Activation flow (first run)

1) Collect `licenseKey`, `productSlug`, and `machineId`.
2) Call `licenses.activate`.
3) On success, store:
   - `licenseKey`
   - `machineId`
   - `token` + `tokenExpiresAt`
4) Use the returned `token` to allow offline grace (see below).

## 5) Validation flow (app start / heartbeat)

Call `licenses.validate`:
- on app start
- periodically (e.g. daily) while the app is running

If successful, update the stored `token` + `tokenExpiresAt` with the new values.

## 6) Deactivation flow (user action)

Call `licenses.deactivate` when a user explicitly wants to free a seat on the current device. This will revoke the machine slot and allow activation on another device.

## 7) Offline grace tokens

The API returns a signed token on `activate` and `validate`.
- The token payload includes `offlineUntil`, `jti`, and `installationId`.
- The server signs it with an Ed25519 private key.

Suggested client behavior:
- Fetch the public key using `licenses.publicKey` and verify the token locally in desktop/mobile clients.
- If you cannot safely persist the verification context, treat the token as an opaque cached record and refresh it when `offlineUntil` expires.

## 8) Rate limiting & retries

The API enforces IP-based rate limits using:
- `RATE_LIMIT_WINDOW_MS`
- `RATE_LIMIT_MAX`

If you receive `RATE_LIMITED`, back off and retry later (exponential backoff recommended).

## 9) Admin setup (one-time)

To issue licenses you must create a Product, Customer, and License in the admin dashboard:
1) Set `ADMIN_ALLOWLIST` with your admin email(s).
2) Sign in to the web app at `http://localhost:3001` (dev).
3) Create a Product (note the `slug`).
4) Create a Customer.
5) Create a License for that product + customer.
6) Distribute the license key to your user.

## 10) Minimal client example (TypeScript)

This repo already wires an oRPC client for the web app. A similar client can be used in any JS-capable runtime (web, desktop, mobile).

```ts
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";

const link = new RPCLink({ url: `${SERVER_URL}/rpc` });
const client = createORPCClient(link);

const result = await client.licenses.activate({
  licenseKey: "LIC-AB12-CD34-EF56",
  productSlug: "my-product",
  machineId: "HASHED_DEVICE_FINGERPRINT",
});
```

If you are not using the oRPC client, consult the OpenAPI reference at `/api-reference` for the exact HTTP payload shape.
