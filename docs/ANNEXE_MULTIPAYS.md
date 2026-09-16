# Annexe multipays — ce que chaque juridiction impose, et d'où ça vient

*16 septembre 2026. Chaque règle encodée dans l'application renvoie ici à son article. Les douze jeux de règles portent le statut **DRAFT** : ils ont été écrits à partir des textes cités, pas validés par un professionnel local. L'interface l'affiche sur chaque calcul et la liste des hypothèses est produite avec le résultat.*

## Pourquoi un « country pack » plutôt que douze moteurs

Trois moteurs suffisent, parce que les douze pays ne divergent que sur des paramètres :

| Moteur | Ce qu'il calcule | Pays |
| --- | --- | --- |
| `gainsEngine` | Gain lot par lot, avec méthode de coût, exonérations de durée, report de coût sur échanges non imposés, franchises et report des pertes | DE, AT, ES, IT, PT, BE, AE, OM, QA |
| `frEngine` | Formule de l'article 150 VH bis : la cession est rapportée à la valeur globale du portefeuille, pas à un lot | FR |
| `wealthEngine` | Position détenue à une date de référence, avec rendement forfaitaire ou impôt cantonal sur la fortune | NL, CH |

Un pays est donc un fichier de données : ses règles, son plan de comptes, ses formulaires, ses références légales et ses hypothèses. Ajouter un pays ne touche pas aux moteurs.

## Le tableau de divergence

C'est là que se joue l'exactitude. La même opération produit six résultats différents.

| Pays | Échange crypto ↔ crypto | Méthode de coût | Exonération de durée | Frais | Report des pertes | Taux |
| --- | --- | --- | --- | --- | --- | --- |
| 🇫🇷 France | **Sursis** (art. 150 VH bis) | Assiette portefeuille, pas de lots | Aucune | Déductibles du prix de cession | Imputables sur les plus-values de l'année seulement | 30 % (12,8 + 17,2) ou barème sur option |
| 🇩🇪 Allemagne | **Imposable** | FIFO **par portefeuille** | **Plus d'un an** (§ 23 EStG) | Déductibles | Report illimité **et report en arrière** | Barème marginal + Soli, franchise-couperet de 1 000 € |
| 🇦🇹 Autriche | **Non imposable** (§ 27b al. 3) | Prix moyen glissant par portefeuille | Non, mais **Altvermögen** avant le 01/03/2021 exonéré | **Non déductibles** (§ 27a al. 4 Z 2) | **Aucun report** | 27,5 % |
| 🇪🇸 Espagne | **Imposable** | FIFO global | Aucune | Déductibles | 4 ans | 19 % à 30 % (barème de l'épargne) |
| 🇮🇹 Italie | **Non imposable** si même fonction | Coût moyen pondéré | Aucune | Déductibles | 4 ans | 26 % puis **33 % en 2026** ; 26 % pour les jetons de monnaie électronique en euros |
| 🇵🇹 Portugal | **Non imposable**, report du coût (art. 10.º n.º 23) | FIFO **par prestataire** (art. 43.º n.º 9) | **365 jours** (art. 10.º n.º 22) | Déductibles | 5 ans, **seulement sur option d'englobamento** | 28 % |
| 🇧🇪 Belgique | **Imposable** | FIFO | Aucune | **Non déductibles** | **Aucun report** | 10 % après 10 000 € exonérés, depuis le 01/01/2026 |
| 🇳🇱 Pays-Bas | Sans objet | Sans objet | Sans objet | Non déductibles du rendement réel | Le rendement négatif est ramené à zéro | 36 % d'un rendement forfaitaire de 6,00 % |
| 🇨🇭 Suisse | Sans objet | Sans objet | Sans objet | Frais de transaction non déductibles (art. 32 al. 1 LIFD) | Sans objet | Impôt cantonal sur la fortune |
| 🇦🇪 🇶🇦 🇴🇲 Golfe | Sans objet | Sans objet | Sans objet | Sans objet | Sans objet | Aucun impôt sur le revenu |

## Les pièges, pays par pays

### 🇫🇷 France — la cession n'est pas rapportée à un lot

L'article 150 VH bis calcule `PV = prix de cession − (prix total d'acquisition × prix de cession / valeur globale du portefeuille)`. Il faut donc connaître la valeur de **tout** le portefeuille au moment de chaque cession, y compris les avoirs hors plateforme. Un actif détenu en autoconservation et non déclaré fausse toutes les cessions de l'année, pas seulement la sienne.

### 🇩🇪 Allemagne — la franchise est un couperet, et l'année n'est pas 365 jours

Les 1 000 € du § 23 EStG sont une *Freigrenze* : à 1 001 € de gain, **la totalité** devient imposable, pas l'excédent. Et l'exonération porte sur une détention « de plus d'un an » au calendrier : un test à 365 jours se trompe en franchissant une année bissextile. Le barème du § 32a est implémenté avec ses quatre zones et le Soli avec sa zone d'atténuation, parce qu'un taux marginal approximé ne permet pas de remplir une déclaration.

### 🇦🇹 Autriche — le staking entre à coût nul

Le § 27a al. 4 Z 5 ne taxe pas les jetons de staking à la réception : ils entrent pour **zéro** et la totalité du produit est imposée à la cession. Un moteur qui les valorise au marché à la réception sous-impose d'autant. La frontière entre staking (non imposé à la réception) et création de blocs (imposée) dépend de la prédominance du capital sur le travail : l'application la signale, elle ne la tranche pas.

### 🇵🇹 Portugal — la numérotation a changé en mai 2026

Le décret-loi n.º 97/2026 du 20 mai 2026 a renuméroté l'article 10.º du CIRS : l'exonération de 365 jours est passée du n.º 19 au **n.º 22**, le report de coût sur échange du n.º 20 au **n.º 23**. Tout commentaire antérieur, y compris la brochure de l'administration, cite l'ancienne numérotation. Pire : le n.º 24, qui exclut du bénéfice les opérations avec une contrepartie hors UE/EEE ou hors convention, **renvoie toujours aux « n.os 19 e 20 »**. L'application retient le renvoi corrigé et l'indique en hypothèse.

Second piège : le texte reporte la *valeur* d'acquisition sur les jetons reçus lors d'un échange, sans dire qu'il reporte la *date*. Le compteur de 365 jours est donc remis à zéro à chaque échange — lecture prudente et défavorable, signalée comme telle.

### 🇧🇪 Belgique — deux régimes coexistent depuis 2026

La loi instaurant l'impôt sur les plus-values sur actifs financiers s'applique aux plus-values **réalisées à partir du 1er janvier 2026**, à 10 % après une tranche annuelle de 10 000 € (reportable de 1 000 € par an, plafonnée à 15 000 €). Elle vit **à côté** de l'article 90, alinéa 1er, 1°, CIR 92 : gestion normale du patrimoine privé → 10 % ; gestion anormale ou spéculation → 33 %. Les travaux préparatoires citent quatre critères pour les crypto-actifs : part du patrimoine mobilier investie, recours au financement, recours à un processus automatisé, nombre de transactions. L'application les rappelle sans les évaluer, parce que deux d'entre eux supposent des données qu'elle ne détient pas.

Les actifs détenus au 31 décembre 2025 prennent la valeur de ce jour comme prix d'acquisition ; si la valeur d'acquisition réelle est supérieure et prouvée, elle est retenue jusqu'au 31 décembre 2030. Les frais ne sont **jamais** déductibles et les moins-values ne se reportent pas.

### 🇳🇱 Pays-Bas — le 1er janvier n'est pas le 31 décembre

La *peildatum* est la position à l'**ouverture** du 1er janvier : une opération faite ce jour-là est hors assiette. Mais le **cours** retenu est celui de cette date. L'application sépare donc la date d'arrêté des quantités de l'instant de valorisation, ce qui n'est pas la même chose et change le montant déclaré.

| Année | Rendement forfaitaire « overige bezittingen » | Capital exonéré par personne | Taux |
| --- | --- | --- | --- |
| 2023 | 6,17 % | 57 000 € | 32 % |
| 2024 | 6,04 % | 57 000 € | 36 % |
| 2025 | 5,88 % | 57 684 € | 36 % |
| 2026 | 6,00 % | 59 357 € | 36 % |

*Source : pages de calcul de la Belastingdienst pour chaque année. Les chiffres des projets de loi de finances qui n'ont pas été adoptés tels quels ne sont pas retenus.*

Depuis les arrêts du Hoge Raad du 6 juin 2024 et la *Wet tegenbewijsregeling box 3*, le contribuable peut être imposé sur son rendement réel s'il est inférieur. Ce rendement réel **inclut les variations de valeur non réalisées** — une baisse de cours compte donc sans cession — se calcule sur l'ensemble de la case 3, n'admet pas la déduction des frais, et un rendement négatif est ramené à zéro sans report.

### 🇨🇭 Suisse — cinq critères, et il suffit d'en rater un

La circulaire n° 36 du 27 juillet 2012 exclut le commerce professionnel de titres quand cinq critères sont **cumulativement** remplis : détention d'au moins six mois ; volume annuel de transactions n'excédant pas cinq fois l'état des titres au début de la période ; gains en capital représentant moins de 50 % du revenu net ; placements non financés par des fonds étrangers ; dérivés limités à la couverture. Le document de travail de l'AFC du 14 décembre 2021 les applique par analogie aux jetons de paiement. Rater un critère fait passer un gain exonéré en revenu d'activité indépendante, soumis à l'impôt et aux cotisations AVS.

L'impôt sur la fortune est **cantonal et communal** : l'application produit la valeur à déclarer au 31 décembre, jamais le montant de l'impôt.

### 🇦🇪 Émirats arabes unis — l'absence d'impôt a une définition

La décision du Cabinet n° 49 de 2023 dit que les activités d'une personne physique ne relèvent de l'impôt sur les sociétés que si leur chiffre d'affaires dépasse **1 000 000 AED** sur une année civile, et que le **« Personal Investment »** en est exclu quel que soit le montant. Le texte le définit ainsi : *« Investment activity that a natural person conducts for their personal account that is neither conducted through a Licence or requiring a Licence from a Licensing Authority in the State, nor considered as a commercial business in accordance with the Federal Decree-Law No. 50 of 2022. »* Un négoce mené comme une entreprise sort donc de l'exonération. C'est cette question que l'application pose, plutôt que de conclure.

Côté TVA : le règlement d'exécution du décret-loi fédéral n° 8 de 2017, modifié par la décision du Cabinet n° 100 de 2024, classe le transfert de propriété d'actifs virtuels, leur conversion et leur conservation parmi les services financiers exonérés (art. 42(2)(k)(l)(m)), avec effet rétroactif au 1er janvier 2018.

### 🇴🇲 Oman — une absence avec une date d'expiration

Le décret royal n° 56/2025, publié le 29 juin 2025, institue un impôt sur le revenu des personnes physiques applicable au **1er janvier 2028**, au taux de 5 % au-delà de 42 000 OMR de revenu net imposable. Le règlement d'exécution était attendu dans les douze mois de la publication. Le traitement des gains sur crypto-actifs en dépendra. L'application conserve dès maintenant l'historique complet des prix d'acquisition, parce que c'est lui qui déterminera la base au démarrage du régime.

## DAC8 : la directive et le schéma ne disent pas la même chose

Huit agrégats, par actif et par client, sont transmis par chaque prestataire :

| Élément | Ce qu'il contient |
| --- | --- |
| `CryptoFiatIn` | Acquisitions contre monnaie ayant cours légal |
| `CryptoFiatOut` | Cessions contre monnaie ayant cours légal |
| `CryptotoCryptoIn` | Acquisitions contre d'autres crypto-actifs |
| `CryptotoCryptoOut` | Cessions contre d'autres crypto-actifs |
| `CryptoTransferIn` | Transferts reçus, avec leur type (airdrop, staking, minage, prêt…) |
| `CryptoTransferOut` | Transferts envoyés, hors paiements déclarés en RRPT |
| `TransferWallet` | Sous-ensemble des transferts sortants vers une adresse non rattachée à un prestataire. **Aucun nombre de transactions** |
| `RRPT` | Paiements en contrepartie de biens ou services **supérieurs à 50 000 USD** |

Trois points que les implémentations naïves ratent :

1. **Il n'existe aucun élément de stock.** Le CARF ne demande pas la position de fin d'année. Un relevé qui en comporte répond à une obligation nationale distincte. L'application le rapproche quand même — c'est le contrôle d'exhaustivité le plus simple — mais l'affiche comme étant hors DAC8.
2. **Les frais.** La directive (annexe VI, section II, B.3, b et c) demande le *« montant brut payé »* et le *« montant brut reçu »*. Le schéma XML CARF v1.5 ajoute *« net of transaction fees »* sur les huit éléments. Les prestataires suivent le schéma. L'application calcule les deux, retient le net par défaut, et **reconnaît un relevé établi en brut** : elle chiffre l'écart comme étant exactement les frais et le classe en écart mineur au lieu d'envoyer le cabinet chercher une erreur.
3. **Un paiement au-dessus du seuil quitte les transferts.** Le code CARF603 est expressément réservé aux paiements *autres* que ceux déclarés en RRPT. Un règlement fournisseur de 60 000 USD se déclare en RRPT, pas en `CryptoTransferOut`.

Statut de transposition : Autriche (Krypto-Meldepflichtgesetz, 23 décembre 2025, applicable au 1er janvier 2026), France, Belgique, Allemagne, Espagne, Italie, Portugal, Pays-Bas — premières transmissions en 2027 sur les données 2026. La Suisse n'est pas soumise à DAC8 mais reprend le cadre CARF par une loi fédérale propre. Les États du Golfe ne sont pas dans le champ de la directive.

## Fichiers d'audit

| Pays | Fichier | Texte | Points d'attention |
| --- | --- | --- | --- |
| 🇫🇷 France | FEC | LPF art. A47 A-1 | Séquence continue par journal, dates AAAAMMJJ, virgule décimale, nom `SIRENFECAAAAMMJJ.txt` |
| 🇩🇪 🇦🇹 Allemagne, Autriche | DATEV EXTF Buchungsstapel v13 | Format d'échange, pas une obligation légale | Date de pièce en **TTMM** : un lot ne couvre qu'un exercice. Montants non signés avec indicateur S/H. Une écriture à lignes multiples des deux côtés n'existe pas : elle passe par le compte d'attente, avec un avertissement |
| 🇵🇹 Portugal | SAF-T (PT) 1.04_01 | Portaria n.º 302/2016 | Le XSD publié déclare `Lines` comme un `xs:all` d'un seul `DebitLine` et d'un seul `CreditLine` : les écritures composées, écrites avec des lignes répétées comme dans tout fichier réel, sortiront en écart d'une validation stricte |
| 🇳🇱 Pays-Bas | XAF 3.2 | Produit sur demande lors d'un contrôle | Sert aussi de format de reprise de dossier entre cabinets |
| 🇧🇪 🇪🇸 🇮🇹 🇨🇭 Golfe | Journal générique CSV | Pas de format normalisé | Conserver le journal, les justificatifs de cours et le rapprochement DAC8 pendant la durée légale |

## Ce qu'un professionnel doit valider avant la mise en production

1. **Chaque pack, par un confrère du pays.** Le statut passe de DRAFT à REVIEWED dans `registry.ts`, pas dans l'interface : une relecture est un événement extérieur au logiciel.
2. **Le rattachement Portugal / valeurs mobilières.** Le CIRS ne définit pas quand un crypto-actif est une valeur mobilière, ce qui décide pourtant de l'exonération de 365 jours.
3. **La qualification belge.** Gestion normale ou spéculation : c'est la question qui change le taux de 10 % à 33 %.
4. **La frontière autrichienne staking / création de blocs**, et la frontière néerlandaise case 3 / case 1.
5. **Le règlement d'exécution omanais**, dès sa parution.
6. **Un import à blanc du DATEV** dans la version du cabinet destinataire, et une validation SAF-T contre le XSD de l'Autoridade Tributária.

## Sources primaires consultées

Le détail article par article figure dans chaque pack (`src/lib/countries/*.ts`), avec l'URL et la date de la version consultée. Les textes eux-mêmes : PCG 2025 (recueil ANC) ; CGI art. 150 VH bis ; LPF art. A47 A-1 ; EStG §§ 22, 23, 32a et SolzG ; EStG autrichien §§ 27, 27a, 27b, 31 et KryptowährungsVO ; LIRPF espagnole ; TUIR art. 67 et 68 et d.lgs. 194/2025 ; CIRS art. 5.º, 10.º, 31.º, 43.º, 52.º, 55.º, 72.º ; loi belge instaurant l'impôt sur les plus-values sur actifs financiers et CIR 92 art. 90 et 102 ; Wet IB 2001 art. 5.2 et 5.3 et pages de calcul de la Belastingdienst ; LIFD art. 16, 17, 18, 20, 32, LHID art. 13 et 14, circulaire AFC n° 36 et document de travail AFC du 14 décembre 2021 ; décret-loi fédéral n° 47 de 2022 et décisions du Cabinet n° 49 de 2023 et n° 100 de 2024 ; décret royal omanais n° 56/2025 ; loi qatarie n° 24 de 2018 ; directive (UE) 2023/2226 et schéma XML CARF v1.5 de l'OCDE.
