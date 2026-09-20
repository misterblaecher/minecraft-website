# Minecraft Texture Studio — Spécification fonctionnelle

Cette page correspond à `skin-viewer.html`. Elle doit réunir dans une seule interface cohérente trois fonctions : visualiser une texture Minecraft en 3D, préparer un prompt de génération HD direct, et préparer un workflow guidé pour les atlas UV difficiles à interpréter.

## 1. Objectif général

La page doit permettre à un utilisateur de partir d'un skin ou d'une texture d'entité Minecraft existante, de choisir le bon modèle UV, de vérifier immédiatement le rendu 3D, puis de créer une nouvelle texture HD sans modifier la topologie UV d'origine.

Le principe fondamental est :

- le modèle 3D définit la géométrie ;
- le template Minecraft original définit les coordonnées UV ;
- la description utilisateur définit le style visuel ;
- dans la méthode guidée, une seconde image annotée explique explicitement quelle région UV correspond à quelle partie du modèle.

Aucune étape de génération ne doit essayer de réinventer ou de repacker l'atlas UV.

## 2. Structure de la page

La page comporte une navigation interne permanente avec trois entrées :

- Viewer 3D
- Générateur HD
- Méthode guidée

Les sections doivent rester visuellement séparées. Aucun panneau, textarea, menu sticky ou canvas ne doit recouvrir une autre section lors du scroll ou à une largeur intermédiaire.

## 3. Viewer 3D

### Sélection du modèle

L'utilisateur peut :

- rechercher une entité ;
- choisir Player / Steve / Alex ;
- choisir une entité Java Edition issue du catalogue CEM ;
- voir la résolution UV native du modèle sélectionné.

Le catalogue CEM doit être disponible localement dans le site avec des URLs externes uniquement en fallback.

### Chargement d'une texture

Le viewer accepte un PNG local.

Pour Player :

- 64×64 moderne ;
- 64×32 legacy ;
- résolutions HD proportionnelles, par exemple 128×128, 512×512, 1024×1024 ;
- modèle Steve, Alex ou auto-détection.

Pour les entités :

- la résolution peut être différente selon le modèle ;
- les UV sont normalisés à partir de la taille native du modèle ;
- si le ratio de la texture ne correspond pas au ratio du modèle, une alerte explicite doit être affichée.

### Contrôles 3D

Le viewer doit proposer :

- rotation à la souris ;
- zoom à la molette et avec slider ;
- rotation automatique ;
- vue de face ;
- vue de dos ;
- reset.

Pour Player, il doit aussi proposer :

- repos ;
- marche ;
- course ;
- salut ;
- accroupi ;
- vitesse ;
- pause.

### Rendu

Le moteur Three.js est chargé localement.

Le Player et les entités sont rendus avec le même moteur afin d'éviter une dépendance fragile à un viewer externe.

Le rendu doit utiliser le filtrage nearest-neighbor pour respecter les textures Minecraft.

## 4. Générateur HD — paramètres communs

Avant les deux méthodes, l'utilisateur charge le template UV Minecraft original.

Le site doit afficher :

- le nom du fichier ;
- sa résolution ;
- une preview 2D ;
- l'échelle HD choisie ;
- la résolution finale calculée.

Le mode Auto choisit la plus grande échelle entière qui reste dans une taille cible raisonnable, typiquement 1024 px sur le plus grand axe.

L'utilisateur dispose d'un champ « Design souhaité ». Son contenu est injecté dans les prompts finaux au niveau de DESIGN REQUEST.

Un bouton doit permettre de projeter immédiatement le template original dans le Viewer 3D pour vérifier que le modèle sélectionné correspond bien au pattern UV avant de lancer une génération.

## 5. MÉTHODE A — DIRECTE

Cette méthode est destinée aux atlas UV simples.

Entrées :

- template original ;
- design souhaité ;
- échelle HD.

Sortie :

- prompt complet prêt à copier ;
- bouton Copier ;
- bouton Copier + ouvrir ChatGPT Images.

Le prompt impose :

- conservation absolue de la topologie UV ;
- même ratio d'atlas ;
- positions et orientations inchangées ;
- zones transparentes conservées ;
- aucune conversion vers un skin Player ;
- texture finale plate uniquement ;
- détails HD créés à l'intérieur des régions UV ;
- aucune simple interpolation des pixels d'origine.

Après génération dans ChatGPT Images, l'utilisateur peut charger le PNG final directement dans la section Méthode A. Le fichier est immédiatement envoyé au Viewer 3D avec le modèle actuellement sélectionné.

## 6. MÉTHODE B — GUIDÉE

Cette méthode est destinée aux atlas ambigus ou répétitifs : plusieurs pattes identiques, tentacules, ailes, petits cuboïdes similaires, pièces répétées, etc.

### B1 — Générer une planche guidée

Le site génère un prompt spécialisé à partir du template Minecraft original, du modèle 3D sélectionné et du design demandé.

Le résultat attendu est une planche de surfaces séparées. Chaque artwork panel représente une face UV et possède un nom machine-readable placé directement au-dessus.

La règle géométrique est absolue : **LABEL ABOVE = PANEL DIRECTLY BELOW**.

Deux modes sont disponibles :

- **Avec background** : fond uni noir #000000 ;
- **Sans background** : PNG transparent autour des labels et des panneaux.

Exemples :

- HEAD_FRONT
- HEAD_BACK
- BODY_LEFT
- LEG_1_FRONT
- LEG_2_FRONT
- TENTACLE_1_LEFT
- TENTACLE_2_LEFT
- WING_RIGHT_PLANE_2

Les régions répétées doivent recevoir des noms uniques.

Si l'identité exacte d'une région est incertaine, elle doit tout de même recevoir un identifiant stable plutôt que rester anonyme.

### B2 — Détecter les noms et les panneaux

L'utilisateur charge la planche guidée.

Le site :

- crée un masque en fonction du mode choisi (fond uni ou transparence) ;
- lance OCR avec Tesseract.js et récupère les bounding boxes des labels ;
- pour chaque label, définit une colonne de recherche sous le texte ;
- considère le premier panneau graphique valide directement en dessous comme la partie nommée ;
- sépare ainsi des composants graphiques qui seraient autrement fusionnés dans une détection globale ;
- dessine le cadre du label, le cadre du panneau et un trait reliant les deux ;
- mappe le nom vers une face UV réelle du modèle sélectionné ;
- permet de corriger chaque association via un menu déroulant.

### B3 — Assemblage automatique

Le site récupère le layout UV du modèle 3D sélectionné.

Chaque panneau détecté est associé à une cible UV via son label. Le site copie ensuite le panneau dans la face UV correspondante et construit un nouveau PNG à la résolution HD choisie.

Les zones non détectées conservent le contenu du template original. Les UV partagés entre plusieurs parties ne sont peints qu'une fois et un avertissement l'indique.

Un prompt final guidé avec IMAGE 1 + IMAGE 2 reste disponible comme solution de secours si certaines faces ne peuvent pas être mappées automatiquement.

Le prompt interdit de recopier dans le skin final :

- les labels ;
- les lignes de repérage ;
- les couleurs de guide ;
- les annotations.

### B4 — Preview 3D et export

Le PNG assemblé par le site peut être envoyé immédiatement au Viewer 3D et téléchargé.

L'utilisateur peut également charger un résultat final généré par ChatGPT Images et l'envoyer au même viewer.

La méthode B doit donc produire un atlas UV réel, pas seulement une liste de labels ou un prompt.

## 7. États et messages d'erreur

La page doit toujours afficher un message clair lorsque :

- aucun modèle n'est sélectionné ;
- aucun template n'est chargé ;
- le ratio PNG / modèle est incompatible ;
- l'OCR n'est pas disponible ;
- aucun label n'est reconnu ;
- un fichier n'est pas un PNG au moment d'une preview 3D finale ;
- le catalogue CEM n'est pas disponible ;
- la preview d'un modèle multi-textures est potentiellement partielle.

Les opérations locales ne doivent pas envoyer automatiquement les fichiers utilisateur à un serveur.

## 8. Règles de layout

Les cartes principales ne doivent jamais se superposer.

En particulier :

- aucun panneau sticky ne doit passer au-dessus du générateur ;
- tous les enfants de grid doivent avoir `min-width: 0` ;
- textarea, canvas, dropzone et select doivent respecter `max-width: 100%` ;
- les textareas utilisent `box-sizing: border-box` ;
- la grille de la méthode guidée passe sur une colonne lorsque la largeur disponible n'est pas suffisante ;
- les prompts longs scrollent à l'intérieur de leur zone au lieu de pousser ou recouvrir la colonne voisine.

## 9. Navigation et version

La page publique doit afficher clairement sa version fonctionnelle en haut.

Les liens depuis l'accueil utilisent une query de version pour éviter d'afficher un ancien bundle mis en cache après une mise à jour importante.

## 10. Résultat attendu

Un utilisateur doit pouvoir faire le parcours complet suivant sans quitter cette page, sauf pour l'étape de génération dans ChatGPT Images :

1. choisir un modèle ;
2. charger et vérifier le template en 3D ;
3. décrire le design ;
4. choisir Méthode A ou B ;
5. copier le prompt ;
6. générer dans ChatGPT Images ;
7. revenir avec le PNG produit ;
8. tester immédiatement le résultat en 3D ;
9. changer de modèle ou corriger le guide si nécessaire.
