# Comment faire mieux que les concurrents

## 1. Le marché en septembre 2026

| Acteur | Cible | Forces | Faiblesses exploitables |
| --- | --- | --- | --- |
| **Waltio** (FR, 2019) | Particuliers, France/Belgique/Espagne | 700+ intégrations, méthode validée par un cabinet d'avocats, marque forte, 39 € à 999 € | Peu orienté entreprise ; pas de FEC natif ; prix qui montent (Smart à 249 €) |
| **Koinly** (UK/SE) | Particuliers, 140 pays | 1 000+ intégrations, UX, 49-279 $ | Généraliste : approximations sur les spécificités françaises (150 VH bis, 2086) ; support anglophone |
| **Blockpit** (AT) | Particuliers UE | Rapports par pays, 49-599 € | Idem, entreprise limitée |
| **ComptaCrypto** (FR) | Particuliers et entreprises, cabinets | FEC « certifié », pièces jointes, espace partagé cabinet ; gratuit / 90 € particuliers | Volume d'intégrations plus faible, produit moins connu |
| **Cryptio** (FR/US) | Grands comptes, institutions | Levée de 45 M$ (mars 2026), sous-ledger, audit | Très cher, cycle de vente long, hors de portée des TPE/PME |
| **Crypto Accounting** (FR) | Experts-comptables | Conformité ANC, dossier pilote gratuit puis 500 €+ | Vente par cabinet uniquement |
| **Finary, Divly, CoinTracking** | Patrimoine / international | Suivi, agrégation | Compta et FEC accessoires |

Deux faits structurants :

1. **Binance a quitté l'UE le 1er juillet 2026** (retrait de sa demande MiCA). Des centaines de milliers d'utilisateurs français doivent clôturer leurs comptes, migrer vers des CASP agréés et **déclarer 2026** avec un historique éclaté sur deux plateformes. Un outil qui fait cette jonction proprement (import CSV Binance + connecteurs des nouvelles plateformes + reprise du prix d'acquisition) répond à une douleur immédiate.
2. **DAC8** : dès 2027, l'administration reçoit les opérations des plateformes. Les particuliers comme les sociétés vont devoir *réconcilier* leurs déclarations avec ces remontées ; la peur du contrôle devient le premier moteur d'achat.

## 2. Positionnement recommandé

**« Le pont entre vos plateformes crypto et votre expert-comptable. »** Un produit unique qui sert les deux régimes (société et particulier) avec le même moteur, vendu à la fois aux dirigeants de TPE/PME qui ont des crypto au bilan et aux cabinets qui ont ces clients.

Pourquoi c'est un espace libre : Waltio/Koinly/Blockpit visent le particulier et s'arrêtent à la déclaration ; Cryptio vise les grands comptes ; ComptaCrypto et Crypto Accounting occupent le créneau cabinet mais avec des produits peu « produit ». Personne ne combine (a) FEC conforme prêt à importer dans le logiciel du cabinet, (b) 150 VH bis exact, (c) expérience grand public, (d) prix TPE.

## 3. Sept différenciateurs concrets (déjà dans le code ou à portée)

1. **FEC validé avant téléchargement** avec le même jeu de contrôles que l'outil DGFiP, et écritures d'inventaire/extourne incluses. Aucun concurrent grand public ne le montre.
2. **Écritures lisibles par un comptable** : libellés explicites, référence d'ordre ou hash en pièce, compte d'attente 471 pour l'inqualifié, plan de comptes exportable avec les sous-comptes 522 par jeton. Le cabinet gagne des heures — c'est lui qui recommande l'outil.
3. **Traçabilité des cours** : chaque valorisation cite sa source (bougie Binance, BCE, CoinGecko) et l'instant retenu ; exportable pour un contrôle. Argument « défendable en cas de vérification ».
4. **Un moteur, deux régimes** : la même base de transactions produit le journal de la société et la 2086 du dirigeant (compte perso). Waltio ne fait pas la société, Cryptio ne fait pas le particulier.
5. **Rôle cabinet natif** : invitation de l'expert-comptable avec droits de qualification et d'export ; à terme, tableau de bord multi-clients pour le cabinet (canal de distribution B2B2C).
6. **Post-Binance** : import CSV robuste (dédoublonnage, 40+ types d'opérations), reprise des positions d'ouverture et des provisions d'un exercice à l'autre, avoirs externes déclarés pour la valeur globale du portefeuille.
7. **Prix et transparence** : gratuit jusqu'à 100 opérations, particulier 59-149 €/an, société 39 €/mois, cabinet à la licence. Fonctions « pro » (multi-dossiers, API, exports illimités) plutôt que paliers par nombre d'opérations, qui sont la première cause d'insatisfaction chez Waltio/Koinly.

## 4. Feuille de route pour prendre l'avantage

**0-3 mois (lancement)** — connecteurs CSV/API pour Coinbase, Kraken, Bitpanda, Bitstamp, Crypto.com ; import de wallets EVM/BTC par adresse ; rapprochement de soldes ; e-mails ; Stripe ; test sur 20 dossiers réels avec deux cabinets partenaires ; validation de 3 FEC dans Test Compta Demat ; note de méthode relue par un avocat fiscaliste (comme Waltio/ORWL) — c'est l'argument de confiance n°1.

**3-9 mois (différenciation)** — espace cabinet multi-clients, pièces jointes et lettrage 401/411, connecteurs Pennylane/Sage/Cegid/ACD (export natif plutôt que CSV), 2086 pré-remplie, rapprochement DAC8, alertes fiscales (dépassement 305 €, positions non valorisées).

**9-18 mois (défense)** — DeFi/NFT, multi-pays (Belgique, Espagne, Allemagne : moteurs fiscaux par pays sur le même modèle canonique), API publique pour les éditeurs comptables, marque blanche pour les cabinets, certification ISO 27001 ou SOC 2 (Cryptio la met en avant).

## 5. Canaux

- **Cabinets d'expertise comptable** (13 000 en France, dont quelques centaines identifiés « crypto ») : webinaires CNCC/OEC, programme partenaire, listing sur les places de marché des éditeurs.
- **Communautés** : Cryptoast, Journal du Coin, Le Bon Investisseur, Coin Academy publient chaque année des comparatifs d'assistants fiscaux — être testé en janvier-avril (saison déclarative).
- **SEO/contenu** : guides « comptabiliser des cryptos en société (PCG 2025) », « clôturer Binance et déclarer 2026 », calculateur 150 VH bis gratuit.
- **Événements** : Paris Blockchain Week, Surfin' Bitcoin, congrès de l'Ordre des experts-comptables.

## 6. Risques et parades

| Risque | Parade |
| --- | --- |
| Erreur de calcul qui coûte un redressement à un client | Note de méthode validée, tests unitaires sur les exemples BOFiP, assurance RC pro éditeur, CGU limitant la responsabilité, double contrôle par le cabinet |
| Dépendance aux API des plateformes (blocages, quotas, changements) | CSV toujours accepté, connecteurs isolés, monitoring, cache de cours |
| Concurrent qui ajoute le FEC | Avancer sur la profondeur comptable (inventaire, à-nouveaux, lettrage, export natif logiciels) et le canal cabinet |
| Volume faible de sociétés crypto | Le particulier finance l'acquisition ; la société et le cabinet font la marge |
| Réglementation mouvante (MiCA, DAC8, loi de finances) | Veille trimestrielle, moteur paramétrable par année fiscale, changelog réglementaire publié |
