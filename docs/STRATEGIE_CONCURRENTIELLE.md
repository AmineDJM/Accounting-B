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

---

## 7. Mise à jour du 16 septembre 2026 — la position que la version multipays permet de tenir

La feuille de route plaçait le multipays et le rapprochement DAC8 en défense, à 9-18 mois. Ils sont faits. Cela change la nature de l'avantage : il ne s'agit plus d'avoir une fonction de plus, mais d'occuper une position que les concurrents ne peuvent pas copier vite, parce qu'elle coûte un an de travail réglementaire avant la première ligne de code utile.

### Ce qui est réellement défendable

**1. Le rapprochement DAC8 comme tête de pont.** À partir de 2027, chaque contribuable européen recevra, en même temps que l'administration, un relevé de son prestataire. La question que tout le monde se posera n'est pas « combien dois-je déclarer » mais « pourquoi mon chiffre diffère de celui que l'administration a déjà ». Aucun concurrent ne répond à cette question aujourd'hui. Y répondre suppose trois choses que nous avons : les huit agrégats du schéma CARF recalculés depuis les livres, la lecture des relevés dans les formats réels, et l'explication de chaque écart en français comptable.

Le détail qui fait la différence : la directive demande des montants **bruts**, le schéma XML de l'OCDE des montants **nets de frais**. Les prestataires suivront le schéma. Un outil qui ne connaît qu'une lecture affichera un écart sur chaque ligne et enverra le cabinet chercher une erreur qui n'existe pas. Nous chiffrons l'écart comme étant exactement les frais et le classons en écart mineur. C'est le genre de détail qui se voit en démonstration.

**2. L'explicabilité comme réponse à la responsabilité.** Un expert-comptable engage sa responsabilité sur un chiffre qu'il signe. La question qu'il pose à un outil n'est pas « quel est le montant » mais « d'où vient-il ». Chaque montant se déplie ici jusqu'à l'opération et à l'article, et ce détail est stocké avec le calcul : il reste disponible trois ans plus tard, sans recalculer, sans que les cours aient bougé. C'est la différence entre un assistant fiscal et un outil de cabinet.

**3. Douze juridictions sur un seul modèle.** Waltio couvre la France et quelques pays voisins, Blockpit l'Allemagne et l'Autriche, Koinly large mais superficiel sur la comptabilité, Cryptio la comptabilité d'entreprise sans la fiscalité personnelle. Personne ne tient à la fois le journal comptable au plan de comptes local, le fichier d'audit attendu, et l'impôt personnel sous les règles réelles, dans douze pays. Le coût d'entrée n'est pas technique, il est réglementaire : il faut lire les textes, et la plupart des pièges ne se voient qu'en les lisant (la renumérotation portugaise de mai 2026, la franchise-couperet allemande, le coût nul du staking autrichien, la date de référence néerlandaise qui est l'ouverture du 1er janvier).

**4. Le cabinet comme canal, et non comme utilisateur final.** Un cabinet ne veut pas douze abonnements : il veut une liste de clients, un état d'avancement et une échéance. C'est ce que produit le portefeuille clients. Le modèle de distribution suit : le cabinet paie au dossier, revend la prestation, et l'outil ne fait jamais de « tenue de comptabilité », ce qui le maintient hors du monopole de l'article 2 de l'ordonnance de 1945.

### Ce qui reste à faire pour tenir la position

| Priorité | Action | Pourquoi maintenant |
| --- | --- | --- |
| 1 | **Faire relire les douze packs** par un confrère de chaque pays, et publier le statut | C'est le seul point qui bloque une vente. Tant qu'un pack est en DRAFT, un cabinet sérieux ne signera pas |
| 2 | **Assurance RC professionnelle éditeur** couvrant l'erreur de calcul | La contrepartie commerciale de l'explicabilité : nous montrons le raisonnement, donc nous l'assumons |
| 3 | **Exports natifs** vers Pennylane, Cegid, ACD, DATEV, BMD, Exact, Sage | Le CSV ouvre la porte, l'export natif garde le client |
| 4 | **Certification portugaise** du logiciel auprès de l'Autoridade Tributária | Sans elle, le SAF-T produit porte un numéro de remplacement et ne sert qu'en interne |
| 5 | **Veille réglementaire publiée**, avec un changelog daté par pays | Un cabinet achète autant la veille que le calcul. C'est aussi ce qui rend le produit difficile à quitter |
| 6 | **DeFi et NFT** | Le seul trou fonctionnel qui reste face à Koinly et Blockpit |

### Le prix que cette position permet

Un assistant fiscal grand public se vend 50 à 300 € par an et par personne. Un outil de cabinet se vend au dossier, entre 150 et 600 € par dossier et par exercice selon le volume, avec un abonnement de cabinet au-dessus. La différence tient à une seule chose : qui porte la responsabilité. Un outil qui produit un chiffre sans raisonnement se vend au particulier ; un outil qui produit un raisonnement opposable se vend au professionnel qui le signe.
