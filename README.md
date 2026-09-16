# Chainbook — comptabilité et fiscalité crypto, douze juridictions

Application web multi-dossiers, destinée aux cabinets d'expertise comptable et à leurs clients. Elle transforme l'historique de comptes d'échange et de portefeuilles en écritures comptables, en déclarations fiscales et en un rapprochement DAC8, sous les règles du pays qui gouverne le dossier.

**🇫🇷 France · 🇧🇪 Belgique · 🇩🇪 Allemagne · 🇦🇹 Autriche · 🇳🇱 Pays-Bas · 🇪🇸 Espagne · 🇮🇹 Italie · 🇵🇹 Portugal · 🇨🇭 Suisse · 🇦🇪 Émirats arabes unis · 🇶🇦 Qatar · 🇴🇲 Oman**

Ce qu'elle produit :

- un **journal comptable** selon le plan de comptes du pays (PCG français et ses comptes 522/7674/6674/4742/4752, SKR 04, EKR autrichien, PGC espagnol, SNC portugais, PCMN belge, RGS néerlandais, KMU suisse, IFRS pour le Golfe), équilibré, numéroté sans rupture ;
- le **fichier d'audit** que ce pays attend : FEC français, lot d'écritures DATEV, SAF-T (PT) 1.04_01, XAF 3.2, ou journal générique ;
- le **calcul de l'impôt personnel** sous les règles réelles de chaque juridiction, avec les cases des formulaires locaux ;
- le **rapprochement DAC8**, qui compare le relevé du prestataire aux agrégats recalculés et explique chaque écart ;
- l'**explicabilité** : chaque montant se déplie jusqu'à l'opération et à l'article dont il découle, et ce détail est conservé avec le calcul.

Ce dépôt est né de la réécriture, en application web, du notebook *« Gestion comptable et financière sur Binance : comment créer un journal comptable des opérations réalisées au format FEC ? »*. Les documents d'analyse sont dans `docs/` :

| Document | Contenu |
| --- | --- |
| [`docs/ANNEXE_MULTIPAYS.md`](docs/ANNEXE_MULTIPAYS.md) | Ce que chaque juridiction impose, article par article : tableau de divergence, pièges par pays, DAC8, fichiers d'audit |
| [`docs/CE_QUI_MANQUE.md`](docs/CE_QUI_MANQUE.md) | Ce que le notebook ne couvrait pas, ce que l'application corrige, ce qui reste à faire |
| [`docs/AUDIT_REGLEMENTAIRE.md`](docs/AUDIT_REGLEMENTAIRE.md) | Audit réglementaire français : PCG/ANC, FEC, fiscalité, MiCA/PSAN, DAC8, RGPD, monopole de l'expertise comptable |
| [`docs/STRATEGIE_CONCURRENTIELLE.md`](docs/STRATEGIE_CONCURRENTIELLE.md) | Positionnement face à Waltio, Koinly, Cryptio, ComptaCrypto, Blockpit… et feuille de route |

## Les trois moteurs

Un pays est un fichier de données, pas un moteur. Les douze jeux de règles alimentent trois calculateurs :

| Moteur | Ce qu'il calcule | Pays |
| --- | --- | --- |
| Gains lot par lot | Méthode de coût, exonérations de durée, report de coût sur échanges non imposés, franchises, report des pertes | DE, AT, ES, IT, PT, BE, AE, OM, QA |
| Assiette portefeuille | La formule de l'article 150 VH bis, qui rapporte la cession à la valeur globale du portefeuille | FR |
| Patrimoine à une date | Position détenue à la date de référence, rendement forfaitaire ou impôt cantonal sur la fortune | NL, CH |

Les douze packs portent le statut **DRAFT** : ils sont écrits à partir des textes cités, pas validés par un professionnel local, et l'interface l'affiche sur chaque calcul avec la liste des hypothèses retenues.

## Aperçu

| Portefeuille clients | Choix du pays |
| --- | --- |
| ![Portefeuille clients](docs/screenshots/11-clients.png) | ![Choix du pays](docs/screenshots/12-country-picker.png) |

| Rapprochement DAC8 | Fiscalité et explicabilité |
| --- | --- |
| ![Rapprochement DAC8](docs/screenshots/08-dac8.png) | ![Fiscalité](docs/screenshots/07-tax.png) |

| Tableau de bord | Journal comptable |
| --- | --- |
| ![Tableau de bord](docs/screenshots/03-dashboard.png) | ![Journal](docs/screenshots/06-journal.png) |

Le fichier [`docs/demo-FEC-2025.txt`](docs/demo-FEC-2025.txt) est le FEC produit sur les données de démonstration (exercice 2025 de la société fictive « Nova Digital SAS », SIREN fictif).

## Pile technique

Next.js 16 (App Router, Server Actions, Turbopack) · React 19 · TypeScript strict · Tailwind CSS 4 · Auth.js v5 (Google OAuth) · Drizzle ORM sur PostgreSQL (PGlite embarqué en développement) · decimal.js pour tous les montants · Vitest · Playwright.

```
src/lib/engine/        moteur comptable pur (aucune dépendance à la base ni au réseau)
  model.ts             modèle canonique : une opération = jambes IN / OUT / FEE
  valuation.ts         table de cours et valorisation (référence : EUR > fiat > stablecoin > BTC/ETH/BNB)
  fx.ts                rebasage de la table de cours vers CHF, AED, QAR, OMR… et parités officielles du Golfe
  trace.ts             arbre d'explication : étape, formule, entrées, sortie, référence légale
  costbasis.ts         coût moyen pondéré et PEPS
  chart.ts             structure d'un plan de comptes et attribution des sous-comptes par jeton
  journal.ts           génération des écritures (opérations, inventaire, extournes, transferts internes)
  fec.ts / fecbuild.ts écriture, validation et relecture d'un FEC
  tz.ts                calendrier comptable : une opération de 23 h 30 UTC le 31 décembre s'impute au 1er janvier
  tax/lots.ts          registre de lots : FIFO, LIFO, HIFO, prix moyen, suivi par portefeuille, grandfathering
  tax/gains.ts         moteur de gains piloté par les règles du pack
  tax/wealth.ts        moteur patrimonial (Pays-Bas, Suisse)
  tax/fr.ts            formule de l'article 150 VH bis
src/lib/countries/     douze packs : règles, plans de comptes, formulaires, références légales, hypothèses
src/lib/dac8/          agrégats CARF, lecture des relevés CSV et XML, rapprochement expliqué
src/lib/exports/       FEC, DATEV EXTF, SAF-T (PT), XAF (NL), journal générique
src/lib/connectors/    Binance (API signée et CSV) et lecteurs Coinbase, Kraken, Bitvavo, Bitpanda,
                       Crypto.com, Bitstamp, Ledger Live, plus un modèle générique, avec détection automatique
src/lib/pricing/       fournisseurs de cours (klines Binance, taux BCE, CoinGecko en secours) et cache
src/lib/db/            schéma Drizzle (cabinets, dossiers, comptes chiffrés, transactions, cours, exercices,
                       journaux, relevés DAC8, calculs fiscaux, jobs, audit)
src/lib/dal/           accès aux données avec contrôle des droits par dossier
src/lib/services/      contexte pays, synchronisation, import, journal, fiscalité, DAC8, fichiers d'audit, cockpit
src/lib/i18n.ts        chaînes d'interface FR/EN (le vocabulaire juridique reste dans les packs, en langue locale)
src/app/               pages, dont le portefeuille clients et le rapprochement DAC8
tests/                 moteurs, packs pays, lecteurs CSV, DAC8, fichiers d'audit, chiffrement
```

## Démarrer en local

```bash
cp .env.example .env.local        # AUTH_SECRET, APP_ENCRYPTION_KEY, AUTH_DEV_LOGIN=true
npm install
npm run seed                      # données de démonstration (utilisateur demo@chainbook.local)
npm run dev                       # http://localhost:3000 → « Entrer sans Google »
npm test                          # 28 tests
```

Sans `DATABASE_URL`, une base PostgreSQL embarquée (PGlite) est créée dans `.data/pglite` et migrée automatiquement.

### Connexion Google

1. Google Cloud Console → *APIs & Services* → *Credentials* → *OAuth client ID* (application web).
2. URI de redirection autorisée : `https://<votre-domaine>/api/auth/callback/google` (et `http://localhost:3000/api/auth/callback/google` en local).
3. Renseignez `AUTH_GOOGLE_ID` et `AUTH_GOOGLE_SECRET`.

## Déploiement sur Render

Le fichier [`render.yaml`](render.yaml) décrit un service web Node (région Francfort) et une base PostgreSQL managée. Dans le tableau de bord Render : *New → Blueprint*, choisir ce dépôt, puis renseigner `AUTH_URL` (URL publique du service), `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`. `AUTH_SECRET`, `APP_ENCRYPTION_KEY` et `DATABASE_URL` sont générés automatiquement ; les migrations s'appliquent au démarrage.

Pourquoi Francfort : Binance refuse les requêtes depuis certaines adresses IP (HTTP 451, observé depuis un conteneur américain pendant le développement). Les synchronisations tournent dans le processus web (Render conserve un processus persistant) ; sur une plateforme serverless il faudrait une file de tâches.

## Régimes couverts

| | Entreprise (IS/BIC) | Particulier |
| --- | --- | --- |
| Base | PCG art. 619-10 à 619-17, CMP ou PEPS | CGI art. 150 VH bis |
| Fait générateur | Toute cession, y compris crypto ↔ crypto | Cession contre monnaie ayant cours légal ou contre un bien/service |
| Sorties | Journal, balance, inventaire, FEC, plan de comptes | Lignes 2086, synthèse annuelle (PFU 30 %), comptes 3916-bis |

## Sécurité

- Clés API demandées **en lecture seule**, testées avant enregistrement, chiffrées AES-256-GCM (`APP_ENCRYPTION_KEY`), jamais renvoyées au navigateur (seuls les 4 derniers caractères le sont).
- Contrôle d'accès par dossier et par rôle (propriétaire, administrateur, comptable, lecture) dans la couche d'accès aux données, en plus de la protection des routes.
- Journal d'audit (imports, requalifications, générations, exports), en-têtes de sécurité HTTP, mode démo désactivable (`AUTH_DEV_LOGIN=false` en production).

## Limites connues

Voir [`docs/CE_QUI_MANQUE.md`](docs/CE_QUI_MANQUE.md). En résumé : le client API Binance a été écrit à partir de la documentation officielle et testé avec des réponses simulées (Binance bloque le réseau du conteneur de développement) ; les frais des dépôts *on-chain* ne sont connus que si le wallet émetteur est suivi ; l'envoi d'e-mails d'invitation n'est pas branché (le lien est fourni à copier).
