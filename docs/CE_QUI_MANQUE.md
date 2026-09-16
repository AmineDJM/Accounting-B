# Ce qui manquait au notebook, ce que l'application corrige, ce qui reste à faire

Le notebook Jupyter d'origine (novembre 2023) est un excellent support pédagogique : il montre, étape par étape, comment aller chercher l'historique d'un compte Binance, le valoriser en euros et en tirer un journal au format FEC. Pour en faire un produit, il fallait combler des lacunes de trois natures : **complétude des données**, **exactitude comptable** et **industrialisation**.

## 1. Sécurité et confidentialité — à traiter en premier

| Constat dans le notebook | Risque | Dans l'application |
| --- | --- | --- |
| Clés API (publique **et secrète**) de trois personnes nommées écrites en clair dans le code, ainsi qu'une adresse de wallet personnelle | Quiconque possède le fichier peut lire l'intégralité de ces comptes ; si les clés ont des droits de trading ou de retrait, vider les comptes | Clés chiffrées AES-256-GCM avant stockage, testées comme « lecture seule », jamais réaffichées. **Révoquez immédiatement les clés présentes dans le notebook.** |
| Clés à droits inconnus | Idem | Test de connexion qui avertit si la clé autorise le trading ou les retraits |
| Données comptables dans des CSV locaux non chiffrés | Perte, fuite | Base PostgreSQL, accès par dossier et par rôle, journal d'audit |
| Mention « © Thomas Paul HOSSEN — tous droits réservés, toute copie interdite » | Le notebook n'est pas librement réutilisable | L'application est une **réécriture originale** (architecture, code et textes) qui ne reprend ni le code ni la prose du notebook. Avant toute commercialisation, assurez-vous d'avoir les droits sur la méthode ou l'accord de l'auteur. |

## 2. Données manquantes ou mal traitées

| Sujet | Notebook | Application |
| --- | --- | --- |
| **Trades spot** | Boucle sur les ~2 000 paires de Binance (≈ 1 h), `startTime` seul avec `limit=1000` : au-delà de 1 000 trades sur une paire, les suivants sont perdus (la fenêtre `startTime`/`endTime` est limitée à 24 h par Binance) | Sélection des paires à partir des actifs réellement touchés (soldes, dépôts, retraits, conversions, récompenses) avec expansion itérative, pagination par `fromId`, mode « exhaustif » optionnel |
| **Dépôts et retraits fiat** | Récupérés mais **jamais comptabilisés** : la branche FEC ne connaît que les frais (compte 522 sur une devise !) | Écritures 517 / 627 / 580 complètes, dans les deux sens, devises étrangères converties au taux BCE |
| **Dépôts crypto reçus de tiers** | Cas non géré (montant négatif dans un compte 600) | Catégories *encaissement client* (411), *apport d'associé* (455), *airdrop/staking* (768), *à qualifier* (471) |
| **Staking, Earn, Launchpool, cashback, parrainage, distributions** | Absents | Endpoints Simple Earn, `assetDividend`, dust log ; import CSV reconnaît 40+ opérations |
| **Conversion de poussières (Small Assets Exchange BNB)** | Absente | Échange multi-jambes, valorisé par cours de marché de chaque poussière |
| **Achats par carte (« Buy Crypto »)** | Récupérés via `fiat_payment_history` mais contrepartie 512 sans distinguer le solde fiat de la plateforme | Contrepartie 512 (carte) ou 517 (solde plateforme) selon le mode de paiement |
| **Frais des transferts on-chain** | Scraping de BscScan par impression PDF (1 min/tx, fragile, illégal au regard des CGU) | Frais lus dans l'API de retrait ; pour les dépôts, connus dès que le wallet émetteur est importé ; sinon signalés |
| **Transferts internes** | Liste d'adresses codée en dur | Adresses déclarées par dossier, appariement automatique retrait ↔ dépôt (hash ou quantité/délai), requalification rétroactive |
| **Export CSV Binance** | Non supporté | Import complet avec dédoublonnage (réimport sans doublon) — indispensable depuis que Binance a suspendu ses services en France (1er juillet 2026) |
| **Multi-comptes / multi-entités** | Une personne = une exécution manuelle du notebook | Plusieurs dossiers par utilisateur, plusieurs comptes par dossier, rôles et invitations (expert-comptable) |

## 3. Exactitude comptable

| Sujet | Notebook | Application |
| --- | --- | --- |
| Arithmétique | `float` Python (0,1 + 0,2 ≠ 0,3) | `decimal.js`, arrondi au centime uniquement à l'écriture |
| Numérotation des écritures | Index de ligne `i` : les lignes sans écriture créent des **trous de séquence** (non-conformité FEC) | Séquence continue par journal, tri chronologique |
| Équilibre | Ligne d'« erreur d'arrondis » 658/758 à chaque écart | Arrondi absorbé sur la ligne de résultat ; contrôle strict débit = crédit |
| Comptes | 522 + codes ASCII du ticker (`522526984` pour ETH), comptes auxiliaires détournés, 766/666 (change) pour les cessions | Sous-comptes stables `522001, 522002…`, **7674/6674** (art. 619-15 PCG 2025), 4742/4752 pour l'inventaire, 471 pour l'attente |
| Écritures d'inventaire | Décrites dans un tableau d'exemple, **non implémentées** | Générées : gain latent 522/4752, perte latente 4742/522 + provision 6865/1518, reprise, contre-passation au 1er jour suivant |
| À-nouveaux | Chaque exercice repart de zéro | Positions d'ouverture reprises du journal précédent (ou saisies), provisions antérieures suivies |
| Soldes négatifs | CUMP mis à 0 silencieusement | Cession au-delà du stock signalée (`NEGATIVE_BALANCE`) et bornée |
| Frais payés en BNB | Valorisés au prix de l'actif A quand BNB n'est pas connu | Chaque frais est une cession du jeton concerné (charge 627 + sortie 522 au CUMP + résultat) |
| Pièce justificative | `PieceRef = "Scraping Binance"` | Identifiant d'ordre / hash de transaction / n° d'ordre fiat, export des transactions comme pièce |
| FEC | CSV virgule avec colonne d'index, nombres au point, dates ISO | Séparateur `|`, dates AAAAMMJJ, décimale virgule, nom `SIRENFECAAAAMMJJ.txt`, validateur intégré |
| Fuseau horaire | `fromtimestamp` en heure locale de la machine | Instants stockés en UTC ; dates d'écriture, bornes d'exercice et clôture calculées sur le calendrier de Paris (une opération à 23 h 30 UTC le 31 décembre est comptabilisée au 1er janvier) |
| Régime des particuliers | Non traité (le CUMP par actif est celui des entreprises) | Moteur 150 VH bis distinct (valeur globale, fractions de capital initial, 305 €, sursis crypto ↔ crypto) |

## 4. Industrialisation

Authentification Google, base de données, jobs de synchronisation avec progression, cache de cours par jour et par actif, validation des entrées (`zod`), tests (28), build de production, blueprint Render, en-têtes de sécurité, mode démo pour les captures d'écran.

## 5. Ce qui reste à faire (par ordre de valeur)

1. **Autres plateformes** : Coinbase, Kraken, Bitpanda, Crypto.com, Bitstamp, Ledger Live, Metamask (via l'API d'un explorateur). Le modèle canonique et l'import CSV « au format Binance » sont prêts ; chaque connecteur = un normaliseur (~200 lignes) + un parseur CSV.
2. **Wallets on-chain** : import par adresse (Etherscan/Blockscout, mempool.space, Tronscan, Solana RPC) pour les frais de dépôt et les transferts internes.
3. **Vérification en production du client API Binance** (écrit d'après la documentation, testé avec des réponses simulées : Binance renvoyait HTTP 451 depuis l'environnement de développement).
4. **Rapprochement de soldes** : comparer les positions calculées aux soldes réels de la plateforme et proposer les écritures d'ajustement (le moteur les gère, l'écran n'existe pas).
5. **Justificatifs** : pièce jointe par opération (facture fournisseur, facture client) et lettrage 401/411.
6. **Envoi d'e-mails** (invitations, fin de synchronisation, alertes) ; **facturation** (Stripe) et plans.
7. **Clôture d'exercice verrouillée** : figer un journal, interdire la modification des opérations d'un exercice clos, historiser les versions.
8. **Fiscalité des sociétés** : liasse 2065/2033 (retraitements : la provision pour perte latente sur jetons n'est pas déductible ? à confirmer avec l'expert-comptable), TVA sur prestations payées en crypto.
9. **Particuliers avancés** : option barème, revenus de staking en BNC (micro-BNC), NFT, prêts/emprunts, DeFi (LP, wrapped tokens), déclaration 2086 pré-remplie au format DGFiP.
10. **Observabilité** : Sentry, métriques, sauvegardes chiffrées, tests de bout en bout Playwright, tests de charge sur des comptes à 100 000 opérations (la génération est en O(n) mais la valorisation télécharge 96 bougies par jour d'activité et par actif).
