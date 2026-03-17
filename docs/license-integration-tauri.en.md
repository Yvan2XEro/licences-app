# Tauri License Integration Guide

This document explains how to integrate the current license system of this repository into a Tauri application in a way that is both practical and difficult to bypass.

It is written against the current implementation in:

- `packages/api/src/license-service.ts`
- `packages/api/src/routers/index.ts`
- `apps/server/src/index.ts`

It also matches the architectural split typically found in a Tauri app:

- Rust in `src-tauri` for native enforcement
- React or another frontend layer for UI

## 1. Core principle

Do not implement the license boundary only in the React UI.

For Tauri, the correct model is:

- Rust owns the machine identity
- Rust stores and validates the local license state
- Rust decides whether protected commands may run
- React only renders the activation flow and license status

If the license check exists only in the frontend, it is a UI restriction, not a security boundary.

## 2. What the server already gives you

The current backend exposes four public procedures:

- `licenses.activate`
- `licenses.validate`
- `licenses.deactivate`
- `licenses.publicKey`

### Request shape

```json
{
  "licenseKey": "LIC-ABCDE-FGHIJ-KLMNO-PQRST-UVWXY-Z",
  "productSlug": "ultradepot",
  "machineId": "hashed-machine-fingerprint",
  "installationId": "stable-installation-id"
}
```

### Success result for `activate` and `validate`

```json
{
  "ok": true,
  "license": {
    "status": "active",
    "type": "yearly",
    "expiresAt": "2026-01-01T00:00:00.000Z",
    "maxActivations": 3,
    "productSlug": "ultradepot"
  },
  "machine": {
    "fingerprint": "hashed-machine-fingerprint",
    "revokedAt": null
  },
  "token": "<ed25519-signed-token>",
  "tokenExpiresAt": "2026-02-10T12:00:00.000Z"
}
```

### Public key result

```json
{
  "algorithm": "Ed25519",
  "publicKey": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
}
```

### Token payload

The verified token payload contains:

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

This matters because your Tauri client can verify the token offline with the public key. The private signing key never has to leave the server.

## 3. Recommended Tauri architecture

Implement four layers.

### Layer A: Native license service in Rust

Create a dedicated Rust module, for example:

- `src-tauri/src/license/mod.rs`

This module should own:

- machine fingerprint generation
- installation id creation
- local license state loading and saving
- token verification
- online calls to activate, validate, and deactivate
- enforcement checks before protected native commands run

### Layer B: Tauri commands

Expose a narrow command surface to the frontend, for example:

- `license_status`
- `license_activate`
- `license_validate`
- `license_deactivate`
- `license_clear`

Do not expose low-level storage or token mutation commands to the frontend.

### Layer C: Frontend gate

In the web UI, render:

- an activation screen when the app is not licensed
- a loading state while Rust is checking local or remote state
- a normal app shell only when Rust confirms the app may run

### Layer D: Protected native commands

Any command that gives real value should check the license first, for example:

- sync
- export
- print
- local server startup
- advanced business workflows

If you protect only the initial route and not the native commands, a modified frontend can still call the backend bridge.

## 4. State you should persist locally

Persist a single local license record, for example:

```json
{
  "licenseKey": "LIC-...",
  "productSlug": "ultradepot",
  "machineId": "sha256(...)",
  "installationId": "uuid",
  "token": "<signed-token>",
  "tokenExpiresAt": "2026-02-10T12:00:00.000Z",
  "lastValidatedAt": "2026-02-03T09:30:00.000Z",
  "lastKnownStatus": "active"
}
```

Store this in an OS-protected location if possible.

Good options:

- Rust-side file in the app config directory with restricted permissions
- Tauri plugin store plus local encryption if you need convenience
- keychain or credential storage if you later want stronger local secrecy

Avoid storing the authoritative state only in browser local storage. In Tauri, that leaves the trust boundary in the wrong layer.

## 5. Machine identity strategy

The current server trusts the client-supplied `machineId`, so your Tauri app should make that value stable and hard to change accidentally.

Recommended approach:

1. collect a stable native machine signal
2. normalize it
3. hash it with SHA-256
4. persist the result

Do not send raw hardware identifiers to the license server.

Keep `machineId` and `installationId` separate:

- `machineId`: stable per machine
- `installationId`: stable per app installation

This combination works well with the existing token payload and future audit trails.

## 6. Where to generate `machineId`

Generate it in Rust, not in React.

Typical sources on desktop are:

- OS machine id
- hostname plus another stable machine signal
- a generated install seed persisted at first launch

Then hash the normalized source before sending it to the server.

Pseudo-code:

```rust
fn derive_machine_id() -> String {
    let raw = load_or_collect_machine_signal();
    sha256_hex(raw)
}
```

Do not tie the fingerprint to volatile values such as:

- current IP
- user account name
- temporary hardware state

## 7. Where to generate `installationId`

Generate it once on first run and persist it.

Pseudo-code:

```rust
fn load_or_create_installation_id() -> String {
    if let Some(existing) = load_installation_id_from_disk() {
        return existing;
    }

    let id = uuid_v4();
    save_installation_id_to_disk(&id);
    id
}
```

## 8. Activation flow

Use this flow on first activation:

1. user enters `licenseKey`
2. Rust loads:
   - `productSlug`
   - `machineId`
   - `installationId`
3. Rust calls `licenses.activate`
4. if successful, Rust stores:
   - `licenseKey`
   - `productSlug`
   - `machineId`
   - `installationId`
   - `token`
   - `tokenExpiresAt`
   - `lastValidatedAt`
5. frontend moves from activation UI to the main app shell

If the server returns:

- `MAX_ACTIVATIONS_REACHED`: show that the seat limit is already consumed
- `PRODUCT_MISMATCH`: the user entered a key for another product
- `LICENSE_EXPIRED`, `LICENSE_SUSPENDED`, `LICENSE_REVOKED`: block access and show a clear support path

## 9. Startup flow

At app startup:

1. load local license state in Rust
2. if none exists, return `unlicensed`
3. if a token exists, verify it locally
4. if the token is valid and `offlineUntil` is still in the future, allow startup
5. if the token is missing, invalid, or expired, call `licenses.validate`
6. if validate succeeds, refresh stored state and allow startup
7. if validate fails, return a blocked status to the frontend

This flow gives you:

- fast startup
- offline grace
- server revalidation when needed

## 10. Offline verification

This is one of the main advantages of the current license design: the token is signed with Ed25519, so the Tauri app can verify it locally using the public key.

Recommended sequence:

1. fetch `licenses.publicKey` at first activation
2. cache the public key locally
3. verify each stored token locally before trusting it
4. reject the token if:
   - signature is invalid
   - `version` is not the expected one
   - `iss` or `aud` is wrong
   - `productSlug` does not match the app
   - `machineFingerprint` does not match the local machine id
   - `installationId` does not match the local installation id
   - `offlineUntil` is in the past

This is stricter than merely trusting `tokenExpiresAt` from local storage.

## 11. Verification rules you should enforce locally

After decoding and verifying the token signature, check:

- `version === 2`
- `iss === "licences-app"`
- `aud === "licences-app-client"`
- `productSlug === expected product slug`
- `machineFingerprint === local machine id`
- `installationId === local installation id`
- `offlineUntil > now`

If `licenseExpiresAt` is present, also reject locally if it is already in the past.

## 12. Why local verification should live in Rust

You can verify the token in JavaScript using `jose`, and that is useful for diagnostics or secondary UI state.

But the primary decision should still happen in Rust because:

- Rust commands are harder to tamper with than browser state
- the frontend should not own the authoritative license decision
- native commands can enforce the result directly

## 13. Suggested Tauri command API

The frontend only needs a small API, for example:

```ts
type LicenseStatus =
  | { kind: "unlicensed" }
  | { kind: "loading" }
  | {
      kind: "licensed";
      status: "active";
      expiresAt: string | null;
      offlineUntil: string | null;
      lastValidatedAt: string | null;
    }
  | {
      kind: "blocked";
      code:
        | "LICENSE_NOT_FOUND"
        | "PRODUCT_MISMATCH"
        | "LICENSE_REVOKED"
        | "LICENSE_SUSPENDED"
        | "LICENSE_EXPIRED"
        | "MAX_ACTIVATIONS_REACHED"
        | "MACHINE_NOT_FOUND"
        | "RATE_LIMITED"
        | "TOKEN_INVALID"
        | "NETWORK_REQUIRED";
      message: string;
    };
```

Frontend commands:

- `license_status()`
- `license_activate(licenseKey: string)`
- `license_validate()`
- `license_deactivate()`

## 14. Suggested Rust responsibilities

Create functions like:

```rust
pub fn load_license_state() -> Result<Option<LicenseState>, LicenseError>;
pub fn save_license_state(state: &LicenseState) -> Result<(), LicenseError>;
pub fn clear_license_state() -> Result<(), LicenseError>;

pub fn derive_machine_id() -> Result<String, LicenseError>;
pub fn load_or_create_installation_id() -> Result<String, LicenseError>;

pub async fn activate_license(license_key: String) -> Result<LicenseStatus, LicenseError>;
pub async fn validate_license() -> Result<LicenseStatus, LicenseError>;
pub async fn deactivate_license() -> Result<LicenseStatus, LicenseError>;

pub fn verify_cached_token(state: &LicenseState) -> Result<VerifiedToken, LicenseError>;
pub fn ensure_license_allows(feature: LicensedFeature) -> Result<(), LicenseError>;
```

## 15. Protecting native commands

Before running sensitive commands, do:

```rust
pub async fn export_data(...) -> Result<(), String> {
    ensure_license_allows(LicensedFeature::Export)?;
    // actual export logic
    Ok(())
}
```

You should apply this to:

- export
- print
- sync
- local API bootstrap
- any workflow that represents paid value

## 16. Frontend UI flow

The frontend should remain simple:

### States to render

- startup checking
- activation required
- blocked with actionable error
- fully licensed

### Activation screen should include

- license key field
- current machine status
- clear error messaging
- support contact or recovery instructions

### Settings screen should include

- current license status
- product slug
- machine id summary
- last validated time
- offline valid until
- deactivate button

## 17. Error handling strategy

Map server errors to clear user actions.

Examples:

- `LICENSE_NOT_FOUND`: ask the user to re-check the key
- `PRODUCT_MISMATCH`: explain that the key belongs to another product
- `MAX_ACTIVATIONS_REACHED`: instruct the user to deactivate an old machine
- `RATE_LIMITED`: tell the user to wait and retry
- `MACHINE_NOT_FOUND` during validate: local state is stale, require reactivation

Do not expose raw backend payloads directly in the UI.

## 18. Network strategy

Do not call `validate` on every screen render.

Reasonable times to validate:

- startup
- resume from long sleep
- connectivity restored
- once every 12 to 24 hours

Keep the last good token until it expires locally.

## 19. Recommended file layout for an existing Tauri app

If your app already has:

- React routes in `src/app.tsx`
- Rust bootstrap in `src-tauri/src/lib.rs`

then a clean integration usually looks like this:

- `src-tauri/src/license/mod.rs`
- `src-tauri/src/license/storage.rs`
- `src-tauri/src/license/verify.rs`
- `src-tauri/src/license/http.rs`
- `src-tauri/src/lib.rs`
- `src/services/license.service.ts`
- `src/stores/license-store.ts`
- `src/components/license-gate.tsx`
- `src/pages/license/license-activation-page.tsx`

This keeps the licensing logic separated from the rest of the domain code.

## 20. Why this matches the current repository well

The current backend already supports the pieces a Tauri client needs:

- activation tied to a stable machine fingerprint
- validate flow for refreshing trust
- deactivation to free a seat
- Ed25519 public key export for local verification
- bounded offline grace through `offlineUntil`

So you do not need to redesign the server contract before integrating Tauri. You mainly need to place the client logic in the correct layer.

## 21. Minimal implementation checklist

- generate `machineId` in Rust
- generate and persist `installationId`
- call `licenses.activate`
- store local license state in Rust
- fetch and cache `licenses.publicKey`
- verify cached token locally
- call `licenses.validate` when the offline window is over
- gate the frontend on Rust license status
- gate sensitive Tauri commands on Rust license status
- implement `licenses.deactivate`

## 22. Common mistakes

- checking the license only in React
- using a volatile machine fingerprint
- skipping `installationId`
- trusting a cached token without verifying its signature
- allowing sensitive Rust commands even when the app is blocked
- validating too often and triggering rate limiting

## 23. Final recommendation

If you want an efficient first implementation:

1. put the full license state and verification logic in Rust
2. keep the frontend limited to activation UX and status display
3. treat offline verification as a local fast-path, not as a reason to skip server validation forever
4. protect paid native features individually, not only the top-level route

That architecture matches both the current server contract and the realities of shipping a Tauri desktop app.
