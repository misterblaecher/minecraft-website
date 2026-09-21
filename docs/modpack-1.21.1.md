# Modpack Minecraft 1.21.1 — NeoForge

Cette page est la source de vérité pour reconstruire les archives **Lite / Standard / Ultra** du serveur.

## Principe

Les trois packs clients doivent garder le **même gameplay**. Les différences entre Lite, Standard et Ultra concernent uniquement les options graphiques et les mods clients lourds.

- **Lite** : priorité FPS / faible RAM, Sodium activé, sans shaders ni Distant Horizons.
- **Standard** : même gameplay, Sodium activé, sans shaders ni Distant Horizons.
- **Ultra** : même gameplay + Sodium + Iris + Distant Horizons + shaderpack.

Le serveur ne doit pas recevoir les mods purement graphiques.

## Mods à mettre côté serveur

### Gameplay / dépendances

- `architectury-13.0.11-neoforge.jar`
- `balm-neoforge-1.21.1-21.0.65.jar`
- `create-1.21.1-6.0.10.jar`
- `CreateDragonsPlus-1.11.9.jar`
- `create-enchantment-industry-2.5.4.jar`
- `curios-neoforge-9.5.1+1.21.1.jar`
- `ftb-chunks-neoforge-2101.1.22.jar`
- `ftb-library-neoforge-2101.1.36.jar`
- `ftb-teams-neoforge-2101.1.11.jar`
- `inventorysorter-1.21.1-24.0.24.jar`
- `Jade-1.21.1-NeoForge-15.10.6.jar`
- `JadeAddons-1.21.1-NeoForge-6.1.1.jar`
- `sophisticatedbackpacks-1.21.1-3.26.3.2158.jar`
- `sophisticatedbackpackscreateintegration-1.21.1-0.2.0.168.jar`
- `sophisticatedcore-1.21.1-1.5.1.2341.jar`
- `trading_floor-3.0.16.jar`
- `voicechat-neoforge-1.21.1-2.6.24.jar`
- `waystones-neoforge-1.21.1-21.1.45.jar`

### Performance serveur

- `ferritecore-7.0.3-neoforge.jar`
- `lithium-neoforge-0.15.4+mc1.21.1.jar`
- `modernfix-neoforge-5.27.24+mc1.21.1.jar`

### Administration serveur uniquement

- `bluemap-5.7-neoforge.jar`
- `Chunky-NeoForge-1.4.23.jar`
- `spark-1.10.124-neoforge.jar`

## Mods à ne pas mettre côté serveur par défaut

- **Sodium** : rendu client uniquement.
- **Iris** : shaders client uniquement.
- **Distant Horizons** : peut fonctionner serveur + client, mais le mode serveur envoie des LOD aux joueurs et augmente charge/bande passante. Garder client-only par défaut.
- **JourneyMap** : installation serveur optionnelle. Le serveur utilise déjà FTB Chunks pour les claims et BlueMap pour la carte web.
- **JEI** : fonctionne client-only sur Minecraft 1.21.1. Installation serveur optionnelle si l'on veut toutes les fonctions de transfert/synchronisation JEI.

## Base commune des trois packs clients

- `architectury-13.0.11-neoforge.jar`
- `balm-neoforge-1.21.1-21.0.65.jar`
- `create-1.21.1-6.0.10.jar`
- `CreateDragonsPlus-1.11.9.jar`
- `create-enchantment-industry-2.5.4.jar`
- `curios-neoforge-9.5.1+1.21.1.jar`
- `ferritecore-7.0.3-neoforge.jar`
- `ftb-chunks-neoforge-2101.1.22.jar`
- `ftb-library-neoforge-2101.1.36.jar`
- `ftb-teams-neoforge-2101.1.11.jar`
- `inventorysorter-1.21.1-24.0.24.jar`
- `Jade-1.21.1-NeoForge-15.10.6.jar`
- `JadeAddons-1.21.1-NeoForge-6.1.1.jar`
- `jei-1.21.1-neoforge-19.57.0.445.jar`
- `lithium-neoforge-0.15.4+mc1.21.1.jar`
- `modernfix-neoforge-5.27.24+mc1.21.1.jar`
- `sophisticatedbackpacks-1.21.1-3.26.3.2158.jar`
- `sophisticatedbackpackscreateintegration-1.21.1-0.2.0.168.jar`
- `sophisticatedcore-1.21.1-1.5.1.2341.jar`
- `trading_floor-3.0.16.jar`
- `voicechat-neoforge-1.21.1-2.6.24.jar`
- `waystones-neoforge-1.21.1-21.1.45.jar`
- **Sodium 0.8.13 pour NeoForge 1.21.1** (à ajouter aux trois packs)

### Ne pas mettre dans les packs clients

- `bluemap-5.7-neoforge.jar`
- `Chunky-NeoForge-1.4.23.jar`
- `spark-1.10.124-neoforge.jar`

## Pack Lite

Pour PC ancien, iGPU ou machine avec peu de RAM.

**Base commune + Sodium 0.8.13**.

Ne pas inclure :

- Iris
- Distant Horizons
- shaderpack
- JourneyMap

Réglages conseillés : 3–4 Go de RAM Minecraft, distance 6–10 chunks, simulation 5–8 chunks.

## Pack Standard

Pour la majorité des PC : 8–16 Go de RAM système et GPU intégré récent ou carte graphique dédiée modeste.

**Base commune + Sodium 0.8.13**.

Ne pas inclure :

- Iris
- Distant Horizons
- shaderpack
- JourneyMap

Réglages conseillés : 4–6 Go de RAM Minecraft, distance 10–16 chunks.

## Pack Ultra

Pour PC avec au moins 16 Go de RAM système, CPU 6–8 threads ou plus et GPU dédié correct.

**Base commune + :**

- Sodium `0.8.13`
- Iris `1.8.14-beta.1`
- `DistantHorizons-3.3.1-1.21.1-fabric-neoforge.jar`
- `ComplementaryUnbound_r5.5.1.zip` dans `shaderpacks/`

Iris 1.8.14-beta.1 pour NeoForge 1.21.1 met à jour sa compatibilité vers Sodium 0.8 ; la paire actuelle Sodium 0.8.13 + Iris 1.8.14-beta.1 est donc cohérente. Iris reste toutefois une version bêta.

Attention : un bug récent a été signalé avec Iris 1.8.14-beta.1 et Distant Horizons 3.3.x lors de l'activation de certains shaders. Le profil Ultra doit donc rester présenté comme plus expérimental que Standard.

Réglages conseillés : 6–8 Go de RAM Minecraft. Éviter d'allouer plus sans raison.

## Mods optionnels / redondants

### JourneyMap — à retirer par défaut

Le pack possède déjà :

- **FTB Chunks** : claims + carte/minimap ;
- **BlueMap** : carte web publique côté serveur.

JourneyMap ajoute donc une troisième carte. Il reste utile uniquement si les joueurs préfèrent son interface ou ses fonctions de waypoints/radar.

### Curios — optionnel mais utile

Curios n'est pas une dépendance obligatoire de Sophisticated Backpacks. Il permet toutefois des intégrations comme le port du sac dans un slot dédié. Comme il est léger, on peut le conserver dans tous les packs et sur le serveur.

### Jade + Jade Addons — garder

Jade peut fonctionner client-only, mais plusieurs informations avancées nécessitent Jade côté serveur. Jade Addons apporte notamment des intégrations avec les mods du pack. Coût faible.

### JEI — garder côté client

Très utile avec Create et ses addons. Il n'est pas nécessaire sur le serveur en 1.21.1 pour l'affichage de base.

### Chunky — serveur seulement

À garder pour pré-générer la map. Il n'a aucune raison d'être distribué aux joueurs.

### spark — serveur seulement

Outil de diagnostic/profiling. À garder sur le serveur, pas dans les packs joueurs.

### BlueMap — serveur seulement

Carte web : ne jamais le distribuer dans les packs clients.

## Versions bêta actuellement utilisées

Quatre fichiers du canal le plus récent sont des **bêtas** :

- JEI `19.57.0.445`
- Simple Voice Chat `2.6.24`
- Create: Enchantment Industry `2.5.4`
- Iris `1.8.14-beta.1`

Pour un canal plus conservateur/stable, utiliser à la place :

- JEI `19.51.0.418`
- Simple Voice Chat `2.6.22`
- Create: Enchantment Industry `2.4.2`

Ne pas mélanger des versions différentes entre serveur et clients pour les mods de gameplay/réseau.


## État vérifié des dossiers fournis

### Ultra
Correct : base commune + Sodium 0.8.13 + Iris 1.8.14-beta.1 + Distant Horizons 3.3.1.

### Standard
À corriger : ajouter `sodium-neoforge-0.8.13+mc1.21.1.jar`.

### Lite
À corriger :
- supprimer `DistantHorizons-3.3.1-1.21.1-fabric-neoforge.jar`;
- ajouter `sodium-neoforge-0.8.13+mc1.21.1.jar`.

### Serveur
La liste fournie est cohérente avec la séparation recommandée. Ne pas ajouter Sodium, Iris, JEI ou Distant Horizons au serveur par défaut.
