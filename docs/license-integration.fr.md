# Guide d'integration du systeme de licences

Ce document explique comment integrer le systeme de licences actuel expose par ce depot dans des clients web, mobile et desktop.

Pour Tauri en particulier, utilisez `docs/license-integration-tauri.en.md` comme document principal. Il couvre plus en detail la couche Rust, la persistance locale, la verification hors ligne et le verrouillage applicatif.

## Resume de l'integration

Le contrat public de licences est expose via des procedures oRPC :

- `licenses.activate`
- `licenses.validate`
- `licenses.deactivate`
- `licenses.publicKey`

Ces procedures sont servies par l'API Hono dans `apps/server` et implementees dans `packages/api/src/license-service.ts`.

## URL de base

- endpoint RPC : `POST {SERVER_URL}/rpc`
- reference OpenAPI : `{SERVER_URL}/api-reference`

En developpement, `SERVER_URL` vaut en general `http://localhost:3000`.

## Payload de requete

Toutes les procedures publiques de licence utilisent la meme structure :

```json
{
  "licenseKey": "LIC-ABCDE-FGHIJ-KLMNO-PQRST-UVWXY-Z",
  "productSlug": "my-product",
  "machineId": "hashed-machine-fingerprint",
  "installationId": "stable-installation-id"
}
```

Notes :

- `machineId` est obligatoire et doit rester stable pour la meme machine.
- `installationId` est optionnel au niveau API, mais en pratique il faut le traiter comme obligatoire dans le client.

## Reponse en succes

`activate` et `validate` renvoient :

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

`deactivate` renvoie le meme contrat principal, sans nouveau token.

## Reponse en echec

```json
{
  "ok": false,
  "error": {
    "code": "LICENSE_NOT_FOUND",
    "message": "License not found."
  }
}
```

Codes a gerer explicitement :

- `LICENSE_NOT_FOUND`
- `PRODUCT_MISMATCH`
- `LICENSE_REVOKED`
- `LICENSE_SUSPENDED`
- `LICENSE_EXPIRED`
- `MAX_ACTIVATIONS_REACHED`
- `MACHINE_NOT_FOUND`
- `RATE_LIMITED`

## Endpoint de cle publique

Les clients qui verifient les tokens hors ligne localement doivent appeler `licenses.publicKey`.

Structure de reponse :

```json
{
  "algorithm": "Ed25519",
  "publicKey": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
}
```

## Modele du token

En succes sur `activate` ou `validate`, le serveur emet un token signe Ed25519. Une fois verifie, son payload contient :

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

Ce token sert de base a la tolerance hors ligne.

## Flux client recommande

### 1. Provisioning

Avant activation, creez dans le dashboard admin :

1. un Product
2. un Customer
3. une License liee aux deux

Vous distribuez ensuite :

- la `licenseKey`
- le `productSlug` attendu

### 2. Activation

Au premier lancement :

1. derivez ou chargez `machineId`
2. derivez ou chargez `installationId`
3. appelez `licenses.activate`
4. stockez :
   - `licenseKey`
   - `productSlug`
   - `machineId`
   - `installationId`
   - `token`
   - `tokenExpiresAt`
   - la date de derniere validation reussie

### 3. Validation au demarrage

A chaque lancement :

1. chargez l'etat de licence local
2. si un token en cache existe, verifiez-le localement
3. si le token reste valide et que `offlineUntil` est futur, autorisez le demarrage
4. sinon appelez `licenses.validate`

### 4. Rafraichissement periodique

Rafraichissez la validation en ligne :

- au lancement de l'application
- au retour de la connectivite
- sur timer, typiquement toutes les 12 a 24 heures
- avant les actions sensibles de sync/export si l'application a ete hors ligne longtemps

### 5. Desactivation

Quand l'utilisateur veut liberer le poste courant :

1. appelez `licenses.deactivate`
2. supprimez l'etat de licence local
3. ramenez l'application sur l'ecran d'activation

## Recommandations par plateforme

### Web

- genere un identifiant d'installation stable et persiste-le dans `localStorage` ou `IndexedDB`
- utilise un machine id genere plutot qu'un fingerprint navigateur agressif
- ne traite pas la verification hors ligne comme une vraie barriere de securite

### Mobile

- stocke l'etat de licence dans un stockage securise si disponible
- garde `installationId` stable entre les redemarrages
- utilise la verification locale seulement comme mecanisme de grace period

### Desktop

- place la frontiere de licence dans la couche native quand c'est possible
- stocke l'etat local dans un stockage protege par l'OS
- verifie localement le token Ed25519

Pour Tauri, voir `docs/license-integration-tauri.en.md`.

## Rate limiting et retries

L'API applique un rate limiting par IP avec :

- `RATE_LIMIT_WINDOW_MS`
- `RATE_LIMIT_MAX`

Si vous recevez `RATE_LIMITED` :

- stoppez les rafales de retries
- appliquez un backoff exponentiel
- affichez une erreur utilisateur claire

## Identite machine

Le systeme actuel fait confiance au `machineId` envoye par le client. Le client doit donc envoyer un hash stable, et non des identifiants bruts.

Pattern recommande :

1. collecter un signal machine stable ou generer un identifiant durable
2. le normaliser
3. le hasher en SHA-256 avant envoi
4. le persister localement pour eviter les derives entre sessions

## Frontieres de securite

Le systeme actuel est solide pour des clients controles, mais le modele de confiance reste centré serveur :

- la licence est visible par l'utilisateur
- le serveur decide si une machine peut activer
- le token hors ligne est signe serveur et verifie client
- le client doit proteger son etat local contre la modification

Pour les apps desktop, appliquez la licence dans la couche native, pas uniquement dans l'UI.

## Exemple TypeScript minimal

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

Si vous n'utilisez pas oRPC directement, inspectez `/api-reference` pour le contrat genere.
