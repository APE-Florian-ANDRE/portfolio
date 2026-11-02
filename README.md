# Portfolio en course

La visite avance par étapes : un geste de défilement franc (ou les flèches, ou un balayage) envoie le coureur au panneau suivant, de l'aube à la crête. Chaque panneau apparaît après un virage, derrière la végétation. Un léger défilement ne change rien.

## Lancer le site

Les modules JavaScript exigent un serveur : en ouvrant `index.html` directement, seule la version sans sentier s'affiche.

```
python3 -m http.server 8080
```

Puis ouvre http://localhost:8080. Aucun build ni `npm install` : tout est statique, à déployer tel quel.

## Modifier le contenu

Tout le texte est dans `index.html`, dans `<main id="sentier">` : chaque `<section class="panneau">` devient un panneau. Ajouter ou retirer une section demande d'ajuster la liste `positions` en haut de `js/main.js`, qui donne la position de chaque panneau sur le sentier, en mètres.

## Régler le rythme

En haut de `lancer()` dans `js/main.js` : `SEUIL_GESTE` fixe l'ampleur du geste nécessaire pour changer d'étape, `TRAVERSEE` la durée d'une course entre deux panneaux.

## Relief et pont

Les altitudes du sentier sont dans la liste `TRACE`, en haut de `js/world.js` (deuxième valeur de chaque point). La constante `PONT` place le pont sur le sentier (`d`, en mètres) et règle sa longueur, sa bosse et la hauteur au-dessus de l'eau.

## Météo

Le ciel, la brume, la lumière, le vent, la pluie, la neige et les orages suivent le temps réel, fourni par [Open-Meteo](https://open-meteo.com/). À l'ouverture, le site prend la grande ville liée au fuseau horaire du visiteur, sans rien lui demander. Un clic sur l'étiquette météo utilise sa position exacte, avec l'accord du navigateur. Si le service ne répond pas, le sentier garde son grand ciel.

Les boutons du bas de l'écran choisissent le temps (temps réel, soleil, pluie, neige) et le moment (heure réelle, jour, nuit). Le jour et la nuit suivent la vraie position du soleil pour ce lieu et cette heure : aube, couchant, étoiles, lune, et frontale du coureur la nuit. `?heure=22.5` force une heure.

Pour voir un temps précis : `?meteo=clair`, `nuageux`, `couvert`, `brouillard`, `bruine`, `pluie`, `neige` ou `orage`.

À prévoir avant la mise en ligne : Open-Meteo reçoit l'adresse IP du visiteur (à mentionner dans la politique de confidentialité), et son offre gratuite ne couvre que l'usage non commercial, sous licence CC-BY (la mention affichée en bas de page est obligatoire).

## Fichiers

- `js/main.js` : défilement, caméra, panneaux, tableau de bord, son
- `js/world.js` : tracé, relief, forêt, ciel, lumière de la journée
- `js/meteo.js` : lecture du temps réel, pluie, neige et éclairs
- `js/runner.js` : le coureur, sa tenue et le lien entre le défilement et sa foulée
- `assets/coureur.glb` : le coureur et ses mouvements de course, de marche et de repos (Sports_Male_04 de [Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox), licence MIT, dans `assets/LICENCE-rocketbox.md`)
- `vendor/` : Three.js 0.170 et son chargeur de modèles, hébergés ici

## Changer de personnage

Rocketbox propose d'autres sportifs, dont `Sports_Female_02`. Il faut convertir le personnage et ses mouvements en `.glb` avec Blender, en recopiant la pose de chaque os : les fichiers d'animation n'ont pas la même pose de repos que les personnages. Le fichier doit contenir les mouvements `run`, `walk` et `idle`.

## Sans animation

`?plat` affiche une page simple avec tout le contenu. Elle remplace le sentier si WebGL est absent, ou si le visiteur a demandé de réduire les animations.
