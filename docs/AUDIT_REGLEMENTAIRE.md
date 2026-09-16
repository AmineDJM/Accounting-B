# Audit réglementaire — la solution fonctionne-t-elle ?

*Septembre 2026. Cet audit est un travail d'analyse, pas un avis juridique : faites-le relire par un expert-comptable et un avocat fiscaliste avant tout lancement commercial. Les sources sont listées en fin de document.*

## Verdict en une page

| Domaine | Notebook d'origine | Application | Reste à sécuriser |
| --- | --- | --- | --- |
| Comptabilisation des jetons (PCG art. 619-10 à 619-17) | Partiellement conforme : comptes 522 corrects, mais cessions en 766/666, inventaire décrit sans être généré, numérotation avec ruptures | **Conforme** sur les points vérifiables : 522, 7674/6674, 4742/4752, provision pour perte latente, CMP/PEPS, contre-passation | Jetons détenus « en vue d'utiliser les services » (immobilisations incorporelles, art. 619-11) : hors périmètre, à signaler |
| FEC (LPF art. A47 A-1) | Non conforme (séparateur, format des nombres et des dates, séquence, colonne d'index, pièce « Scraping Binance ») | **Conforme** structurellement, validé automatiquement | Faire passer un FEC réel dans « Test Compta Demat » (outil DGFiP) avant le premier client |
| Fiscalité des particuliers (CGI art. 150 VH bis) | Non traitée | **Implémentée** (formule légale, 305 €, sursis crypto ↔ crypto, PFU/barème) | Cas particuliers : NFT, revenus de staking en BNC, cessions à l'étranger, portefeuille hors périmètre |
| Fiscalité des sociétés | Non traitée | Résultat de cession déterminé par écriture ; provision sur perte latente générée | Traitement fiscal de la provision et des gains latents (retraitements 2058-A) : à valider |
| Obligations déclaratives annexes | Non traitées | Liste des comptes pour le 3916-bis | Contenu exact du 3916-bis (adresse de la plateforme), 2086 pré-remplie |
| MiCA / statut de la plateforme | Binance était PSAN | **Binance n'est plus autorisée en France depuis le 1er juillet 2026** ; l'app traite l'historique et fonctionne par CSV | Diversifier les connecteurs vers des CASP agréés ; documenter le statut de chaque plateforme |
| Exercice illégal de l'expertise comptable | s.o. | Positionnement « logiciel » ; rôle « comptable » pour inviter un cabinet | Ne jamais proposer de « tenue de comptabilité » en service ; CGU explicites |
| RGPD / sécurité | Clés API en clair, données locales | Chiffrement, contrôle d'accès, audit, hébergement UE | DPA, registre des traitements, durées de conservation, DPO si volume, pentest |
| DAC8 / CARF | s.o. | Sans objet directement (l'app n'est pas un prestataire de services sur crypto-actifs) | Prévoir l'import des relevés DAC8 que les plateformes fourniront (première transmission en 2027) |

**Conclusion : oui, la solution fonctionne sur le plan comptable et fiscal pour les cas courants d'une PME ou d'un particulier, à condition de valider trois points avec un professionnel (traitement fiscal des provisions sur jetons, contenu du 3916-bis, positionnement contractuel) et de ne pas dépendre de Binance seule.**

---

## 1. Comptabilité des entreprises (PCG 2025, règlement ANC 2018-07 modifié)

Texte de référence : Recueil des normes comptables françaises, version au 1er janvier 2025, titre VI chapitre IX section 9 « Jetons émis et détenus ».

### 1.1 Ce que dit le texte

- **Art. 619-12** : les jetons détenus sans intention d'utiliser les services associés sont comptabilisés au compte **522 « jetons détenus »**. Les variations de valeur vénale à la clôture sont inscrites au bilan en contrepartie de comptes transitoires : **4742 « Différences d'évaluation de jetons détenus – Actif »** (perte latente) et **4752 « … – Passif »** (gain latent). *« En cas de perte latente, une provision pour risque est constituée. »*
- **Art. 619-15** : les plus et moins-values de cession sont calculées selon **PEPS (FIFO)** ou **coût moyen pondéré (CMP)** ; profit au **7674 « Produits nets sur cessions de jetons »**, perte au **6674 « Charges nettes sur cessions de jetons »**.
- **Art. 619-11** : jetons acquis pour utiliser les services ou biens associés, avec utilisation attendue au-delà de l'exercice → immobilisations incorporelles (hors périmètre de l'application).
- **Art. 619-13** : jetons annulés sortis du bilan par le compte de résultat.

### 1.2 Ce que fait l'application

| Opération | Écriture générée | Base |
| --- | --- | --- |
| Dépôt fiat sur la plateforme | 5171xx (solde plateforme) D / 62781 frais D / 580 virements internes C | Pratique courante : la plateforme est un « autre organisme financier » (517) |
| Achat de jetons contre euros | 522xxx D (coût d'acquisition) / 62782 frais D / 5171xx C | Art. 619-12 (coût d'entrée) ; frais en charges, option d'incorporation au coût |
| Échange jeton ↔ jeton | 522(B) D à la valeur du jour / 522(A) C au CMP / 7674 ou 6674 pour l'écart | Art. 619-15 : chaque échange est une cession pour la société |
| Vente contre euros | 5171xx D / 522 C au CMP / 7674 ou 6674 | Art. 619-15 |
| Frais payés en jetons (BNB) | 6278x D à la valeur du jour / 522(BNB) C au CMP / 7674-6674 | Cession du jeton utilisé pour payer |
| Paiement d'un fournisseur en jetons | 401 D / 522 C au CMP / 7674-6674 | Cession + règlement d'une dette |
| Encaissement d'un client en jetons | 522 D à la valeur du jour / 411 C | Entrée au coût = valeur de la contrepartie |
| Récompense de staking, airdrop | 522 D / 7681 C | Produit à la valeur du jour ; à rapprocher de l'art. 619-17 (attributions gratuites) — traitement à confirmer selon la nature du programme |
| Transfert vers son propre wallet | frais seulement | Aucune cession |
| Clôture : gain latent | 522 D / 4752 C, contre-passé au 1er jour de l'exercice suivant | Art. 619-12 |
| Clôture : perte latente | 4742 D / 522 C **et** 6865 D / 1518x C (provision), contre-passation et reprise | Art. 619-12 |
| Opération non qualifiée | 471 compte d'attente + alerte | Principe de prudence : rien n'est perdu, tout est visible |

### 1.3 Points d'attention

1. **Compte de provision** : le PCG impose une provision pour risque sans préciser le sous-compte ; l'application utilise 1518 (sous-compte « pertes latentes sur jetons »), modifiable.
2. **Fiscalité de la provision et du gain latent** : en principe, la provision pour perte latente est déductible si elle répond aux conditions de l'art. 39-1-5° CGI et le gain latent (4752) n'est pas imposé ; certaines administrations fiscales étrangères diffèrent. À valider avec l'expert-comptable pour la liasse.
3. **Stablecoins et devises étrangères** : traités comme des jetons (522) pour les stablecoins, comme des devises (5172xx, 766/666, 476/477) pour les monnaies fiat. Défendable, mais le classement des stablecoins libellés en euros (EURC, EURI) est discutable : option à offrir.
4. **Frais d'acquisition** : passés en charges par défaut (option d'incorporation) ; les deux traitements sont admis pour les titres, le PCG ne tranche pas pour les jetons.
5. **Petites différences de cours** : la valorisation utilise le cours de clôture de la bougie de 15 minutes contenant l'opération (source tracée). Pour un contrôle, conservez l'export des cours (table `prices`).
6. **Valeur vénale à la clôture** : « dernières informations fiables disponibles » — le cours Binance/BCE au dernier instant de l'exercice est retenu. Documentez la source dans l'annexe.

## 2. Fichier des écritures comptables (LPF art. L47 A et A47 A-1)

Obligations : présentation sur demande de l'administration dès le premier jour du contrôle, fichier à plat, 18 champs dans l'ordre imposé, séparateur `|` ou tabulation, encodage ASCII/ISO 8859-15 ou UTF-8, dates `AAAAMMJJ`, montants avec virgule décimale sans séparateur de milliers, numérotation continue par journal, écritures équilibrées, nom `SIRENFECAAAAMMJJ`. Sanction : 5 000 € par exercice ou 10 % des droits rappelés (art. 1729 D CGI).

L'application produit ce format et le **valide** (champs obligatoires, formats, dates dans l'exercice, équilibre par écriture et global, continuité de séquence, ordre chronologique). Deux réserves : (a) le FEC d'une société ne contient pas que les opérations crypto — il faut **fusionner** ce journal avec la comptabilité générale du cabinet (c'est l'usage : le journal `CR1` s'importe dans Sage, Cegid, Pennylane, ACD…) ; (b) les champs `Montantdevise/Idevise` portent la quantité de jetons et le ticker (utile à l'audit, non prévu par la norme ISO 4217 mais accepté par l'outil DGFiP qui ne contrôle pas la liste des devises).

## 3. Fiscalité des particuliers (CGI art. 150 VH bis)

- **Fait générateur** : cession à titre onéreux d'actifs numériques contre une monnaie ayant cours légal, ou contre un bien ou service (art. 150 VH bis, I et II). Les échanges d'actifs numériques entre eux, **stablecoins compris**, bénéficient du sursis (II-A). ✅ implémenté (`isLegalTender`).
- **Prix de cession** réduit des frais supportés par le cédant. ✅
- **Formule** : PV = prix de cession − prix total d'acquisition × prix de cession / valeur globale du portefeuille ; le prix total d'acquisition est diminué des fractions de capital initial déjà déduites. ✅ (test unitaire reproduisant l'exemple type).
- **Exonération** si la somme des prix de cession de l'année ≤ 305 € (I). ✅
- **Taux** : PFU 12,8 % + prélèvements sociaux 17,2 %, option globale pour le barème depuis les revenus 2023. ✅ (estimation).
- **Moins-values** : imputables sur les plus-values de même nature de la même année seulement. ✅
- **Formulaire 2086** annexe à la 2042 C : une ligne par cession. ✅ export CSV (numérotation des cases à vérifier sur le millésime).
- **3916-bis** : déclaration annuelle de chaque compte d'actifs numériques ouvert, détenu, utilisé ou clos à l'étranger (art. 1649 bis C), amende de 750 € par compte non déclaré (1 500 € si valeur > 50 000 €). ✅ liste fournie ; ⚠️ la désignation exacte de la plateforme (Binance France SAS jusqu'au 30 juin 2026, entité étrangère ensuite) doit être vérifiée.
- **Limites** : la valeur globale du portefeuille doit couvrir **tous** les actifs numériques du foyer (autres plateformes, wallets) — l'application le permet par import ou par déclaration d'avoirs externes, avec avertissement ; revenus de staking/airdrops relevant des BNC (imposition à la réception) non déclarés par l'outil ; NFT et DeFi complexes hors périmètre ; activité habituelle (BIC/BNC professionnels) hors périmètre.

## 4. Statut des plateformes : MiCA, PSAN, Binance

- Le règlement MiCA s'applique aux prestataires de services sur crypto-actifs depuis le 30 décembre 2024 ; la France a fixé la fin de la période transitoire des PSAN au **1er juillet 2026** (rappel AMF). Sur 117 PSAN, 83 ont obtenu l'agrément.
- **Binance** a retiré sa demande d'agrément en Grèce le 24 juin 2026 et a cessé ses services aux résidents de l'UE/France le 1er juillet 2026 (retraits toujours possibles ; réouverture annoncée « dans les prochains mois » via une nouvelle demande, en France). Conséquences pour l'application : (1) l'historique Binance reste indispensable pour les exercices 2025-2026 et pour le prix d'acquisition futur ; (2) l'API reste accessible mais son maintien n'est pas garanti : l'import CSV est la voie sûre ; (3) le produit ne peut pas être « l'appli Binance » — il doit être multi-plateformes (connecteurs CASP agréés : Coinbase, Kraken, Bitpanda, Bitstamp, Crypto.com…).
- L'application elle-même **n'est pas un prestataire de services sur crypto-actifs** : elle ne conserve, n'échange, ne transfère aucun actif et n'utilise que des clés en lecture seule. Aucun agrément MiCA/PSAN n'est requis. Elle n'est pas non plus assujettie LCB-FT à ce titre.

## 5. DAC8 / CARF

La directive DAC8 (transposée pour le 31 décembre 2025, application au 1er janvier 2026) impose aux prestataires de services sur crypto-actifs de collecter et transmettre les opérations de leurs clients résidents de l'UE, première transmission au 30 septembre 2027. L'application n'est pas concernée comme déclarante, mais **les données remontées à la DGFiP rendront les contrôles de cohérence automatiques** : c'est un argument produit (« vos déclarations doivent réconcilier avec ce que la plateforme transmet ») et une fonction à prévoir (import du relevé annuel DAC8 et rapprochement).

## 6. Exercice de la profession d'expert-comptable

L'ordonnance n° 45-2138 réserve aux experts-comptables inscrits la tenue, la révision et l'appréciation des comptes des tiers (art. 2 et 20). La jurisprudence considère que la saisie informatique avec qualification des opérations est de la tenue de comptabilité, quel que soit le logiciel. En conséquence :

- ✅ **Fournir un logiciel** que le client ou son cabinet utilise pour ses propres comptes est licite (c'est le modèle de tous les éditeurs).
- ❌ **Qualifier les opérations et produire le journal pour le compte du client, en tant que service humain** (« on s'occupe de votre compta ») serait un exercice illégal : sanctions pénales (art. 433-17 code pénal).
- Recommandations : CGU précisant que le client reste responsable de sa comptabilité ; rôle « Comptable » pour inviter le cabinet ; mentions « ne constitue pas un conseil fiscal personnalisé » ; partenariats avec des cabinets inscrits (programme apporteur d'affaires).

## 7. Données personnelles et sécurité

- **RGPD** : données financières nominatives → registre des traitements, base légale contractuelle, information des personnes, DPA avec l'hébergeur (Render : régions UE disponibles, DPA standard), durée de conservation alignée sur les obligations comptables (10 ans pour les pièces, art. L123-22 code de commerce), procédure d'exercice des droits, notification des violations sous 72 h, DPO si traitement à grande échelle.
- **Secrets** : clés API chiffrées AES-256-GCM, clé maîtresse hors base ; recommander aux utilisateurs des clés lecture seule restreintes par IP (Render fournit des IP sortantes fixes sur les plans payants).
- **Authentification** : OAuth Google, sessions JWT signées, protection CSRF native des Server Actions, en-têtes de sécurité. À ajouter : MFA (via Google déjà), journal de connexion, verrouillage d'exercice.
- **Hébergement** : choisir Francfort ; documenter la localisation dans la politique de confidentialité.
- **Sauvegardes** : sauvegardes quotidiennes Render + export chiffré hors plateforme.

## 8. Propriété intellectuelle

Le notebook porte une mention de réserve de droits stricte. L'application est une réécriture originale : autre langage, autre architecture, autres textes, comptes et méthodes tirés directement du PCG. Les idées et méthodes comptables ne sont pas protégeables ; le texte et le code du notebook le sont. Ne réutilisez pas ses cellules, et sécurisez juridiquement la relation avec son auteur si la méthode est présentée comme provenant de lui.

## Sources

- ANC, *Recueil des normes comptables françaises*, version au 1er janvier 2025, art. 619-10 à 619-17 (texte vérifié pour cet audit).
- ANC, règlement n° 2018-07 du 10 décembre 2018 (jetons), règlement n° 2020-05, règlement n° 2022-06 (modernisation des états financiers).
- LPF art. L47 A et A47 A-1 ; CGI art. 1729 D ; BOI-CF-IOR-60-40.
- CGI art. 150 VH bis, 200 C, 1649 bis C ; BOI-RPPM-PVBMC-30.
- Règlement (UE) 2023/1114 (MiCA) ; AMF, communiqué sur la fin de la période transitoire PSAN au 1er juillet 2026 ; CoinDesk (26 juin 2026) et presse spécialisée sur le retrait de Binance de l'UE.
- Directive (UE) 2023/2226 (DAC8) ; OCDE, CARF.
- Ordonnance n° 45-2138 du 19 septembre 1945, art. 2 et 20 ; Cass. crim. sur la saisie informatique.
- RGPD (règlement (UE) 2016/679) ; code de commerce art. L123-22.
