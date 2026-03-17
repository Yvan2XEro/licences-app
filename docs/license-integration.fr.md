# Guide d'intégration du gestionnaire de licences (FR)

Ce document explique comment intégrer le gestionnaire de licences de ce dépôt dans des applications mobiles, desktop et web. Il est basé sur l'implémentation actuelle du projet.

## 1) Ce que vous intégrez

L'API publique de licences est exposée via des procédures oRPC :
- `licenses.activate`
- `licenses.validate`
- `licenses.deactivate`
- `licenses.publicKey`

Ces procédures sont servies par l'API Hono dans `apps/server` et partagent un schéma JSON commun.

## 2) URL de base et endpoints

- Endpoint RPC : `POST {SERVER_URL}/rpc`
- Référence OpenAPI (consultation du schéma) : `{SERVER_URL}/api-reference`

Où `SERVER_URL` est l'hôte de l'API (ex. `http://localhost:3000` en dev).

### Format des requêtes (les trois actions)

```json
{
  "licenseKey": "LIC-AB12-CD34-EF56",
  "productSlug": "my-product",
  "machineId": "HASHED_DEVICE_FINGERPRINT",
  "installationId": "stable-installation-id"
}
```

### Format de réponse en succès (activate / validate)

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

### Format de réponse en échec

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

Codes d'erreur à gérer :
- `LICENSE_NOT_FOUND`
- `PRODUCT_MISMATCH`
- `LICENSE_REVOKED`
- `LICENSE_SUSPENDED`
- `LICENSE_EXPIRED`
- `MAX_ACTIVATIONS_REACHED`
- `MACHINE_NOT_FOUND`
- `RATE_LIMITED`

## 3) Empreinte machine (machineId)

L'API attend un identifiant stable par appareil (de préférence hashé) afin d'appliquer les limites d'activation.

Stratégie recommandée (multi-plateforme) :
1) Dériver ou générer un identifiant d'appareil.
2) Le hasher (SHA-256 ou similaire) avant l'envoi.
3) Le persister localement pour qu'il reste stable entre les sessions.

Indications par plateforme :
- Web : générer un UUID au premier lancement et le stocker dans `localStorage` ou `IndexedDB`, puis le hasher.
- Mobile : utiliser l'identifiant stable de la plateforme si disponible, sinon en générer un et le persister.
- Desktop : utiliser un identifiant machine stable (OS ou ID d'installation) et le hasher.

## 4) Flux d'activation (premier lancement)

1) Récupérer `licenseKey`, `productSlug` et `machineId`.
2) Appeler `licenses.activate`.
3) En succès, stocker :
   - `licenseKey`
   - `machineId`
   - `token` + `tokenExpiresAt`
4) Utiliser le `token` pour la tolérance hors-ligne (voir ci-dessous).

## 5) Flux de validation (démarrage / heartbeat)

Appeler `licenses.validate` :
- au démarrage de l'application
- périodiquement (ex. quotidien) pendant l'exécution

En succès, mettre à jour le `token` et `tokenExpiresAt` stockés.

## 6) Flux de désactivation (action utilisateur)

Appeler `licenses.deactivate` lorsqu'un utilisateur souhaite libérer un poste sur l'appareil courant. Cela révoque la machine et permet une activation sur un autre appareil.

## 7) Tokens et tolérance hors-ligne

L'API renvoie un token signé lors de `activate` et `validate`.
- Le payload inclut `offlineUntil`, `jti` et `installationId`.
- Le serveur signe avec une cle privee Ed25519.

Comportement client recommandé :
- Recuperez la cle publique via `licenses.publicKey` et verifiez le token localement dans les clients desktop/mobile.
- Si vous ne pouvez pas conserver ce contexte de verification de facon fiable, traitez le token comme une valeur opaque et rafraichissez-le quand `offlineUntil` expire.

## 8) Rate limiting et retries

L'API applique un rate limiting par IP via :
- `RATE_LIMIT_WINDOW_MS`
- `RATE_LIMIT_MAX`

Si vous recevez `RATE_LIMITED`, appliquez un backoff et réessayez plus tard (backoff exponentiel recommandé).

## 9) Mise en place admin (one-time)

Pour émettre des licences vous devez créer un Product, un Customer et une License dans le dashboard admin :
1) Définir `ADMIN_ALLOWLIST` avec vos emails admin.
2) Se connecter à l'app web sur `http://localhost:3001` (dev).
3) Créer un Product (notez le `slug`).
4) Créer un Customer.
5) Créer une License pour ce product + customer.
6) Distribuer la clé de licence à l'utilisateur.

## 10) Exemple client minimal (TypeScript)

Le repo fournit déjà un client oRPC pour l'app web. Un client similaire peut être utilisé dans tout runtime JS (web, desktop, mobile).

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

Si vous n'utilisez pas le client oRPC, consultez la référence OpenAPI sur `/api-reference` pour le format HTTP exact.
