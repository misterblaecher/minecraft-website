# Modpack Minecraft 1.21.1 — NeoForge

Source de vérité des profils clients GabCon au **26 septembre 2026**.

## Profils

- **Lite** : 23 JAR, gameplay commun + Sodium/optimisations, sans Iris, sans Distant Horizons, sans GabCon DH Sync.
- **Standard** : 26 JAR, Lite + Iris + Distant Horizons 3.3.2 + GabCon DH Sync 0.6.2.
- **Ultra** : même ensemble de JAR que Standard ; shader Complementary et réglages plus élevés recommandés.

## Google Drive

- Lite : \`1k4L5At2Qfe031jwzfeYpBR4f9pHFBMzL\`
- Standard : \`1u3V_bqOZOPGRx2A1H4XEjZgpmK6b--2Q\`
- Ultra : \`1jd64_wPCREPS9S_n9t8IczmPkUXBq4hd\`
- Archive complète/admin : \`1_6eX4Qcn_Kx57Uv4ogd6I7xXsG999rgE\`

## Audit du Lite actuel

Le nouveau fichier Lite Drive a été contrôlé :

- 37 095 278 octets
- ZIP valide
- CRC OK
- 23 JAR
- aucun Iris
- aucun Distant Horizons
- aucun GabCon DH Sync
- SHA-256 : \`846a9671f076598b6430d983a244565ae1cc5bb93ae981ceccb7b0bae5afbd28\`

## Base Lite — 23 JAR

- \`architectury-13.0.11-neoforge.jar\`
- \`balm-neoforge-1.21.1-21.0.65.jar\`
- \`create-1.21.1-6.0.10.jar\`
- \`CreateDragonsPlus-1.11.9.jar\`
- \`create-enchantment-industry-2.5.4.jar\`
- \`curios-neoforge-9.5.1+1.21.1.jar\`
- \`ferritecore-7.0.3-neoforge.jar\`
- \`ftb-chunks-neoforge-2101.1.22.jar\`
- \`ftb-library-neoforge-2101.1.36.jar\`
- \`ftb-teams-neoforge-2101.1.11.jar\`
- \`inventorysorter-1.21.1-24.0.24.jar\`
- \`Jade-1.21.1-NeoForge-15.10.6.jar\`
- \`JadeAddons-1.21.1-NeoForge-6.1.1.jar\`
- \`jei-1.21.1-neoforge-19.57.0.445.jar\`
- \`lithium-neoforge-0.15.4+mc1.21.1.jar\`
- \`modernfix-neoforge-5.27.24+mc1.21.1.jar\`
- \`sodium-neoforge-0.8.13+mc1.21.1.jar\`
- \`sophisticatedbackpacks-1.21.1-3.26.3.2158.jar\`
- \`sophisticatedbackpackscreateintegration-1.21.1-0.2.0.168.jar\`
- \`sophisticatedcore-1.21.1-1.5.1.2341.jar\`
- \`trading_floor-3.0.16.jar\`
- \`voicechat-neoforge-1.21.1-2.6.24.jar\`
- \`waystones-neoforge-1.21.1-21.1.45.jar\`

## Standard / Ultra — 26 JAR

Ajouter aux 23 JAR Lite :

- \`DistantHorizons-3.3.2-1.21.1-fabric-neoforge.jar\`
- \`iris-neoforge-1.8.14-beta.1+mc1.21.1.jar\`
- \`gabcondhsync-0.6.2.jar\`

Standard et Ultra partagent les mêmes JAR. Ultra recommande en plus \`ComplementaryUnbound_r5.5.1.zip\` dans \`shaderpacks/\`.

## GabCon DH Sync

La synchronisation DH ne concerne actuellement que **Standard et Ultra**.

- JAR public : \`gabcondhsync-0.6.2.jar\`
- DH attendu : 3.3.2 / API 7.2.0
- Après la première connexion : \`/gabcondhsyncclient register\`, puis reconnexion
- Lite saute cette étape.

## Installation joueur

Le guide public suit désormais un parcours visuel :

1. Java 21
2. NeoForge 21.1.251 → **Install client**
3. instance GabCon séparée
4. choix Lite / Standard / Ultra
5. ZIP → fichiers JAR → dossier \`mods/\`
6. Standard/Ultra : enregistrement GabCon DH Sync
7. shader/resource pack
8. checklist finale

## Administration

L'archive complète reste une archive de référence/admin. Elle ne doit pas être proposée comme pack joueur.
