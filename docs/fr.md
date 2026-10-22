# Boutons virtuels

Créez vos propres boutons dans Gladys, avec un nom, une icône et une couleur,
puis lancez une scène quand vous appuyez dessus. Pas besoin de bricoler un faux
appareil MQTT.

> Intégration non officielle. **Testé seulement avec un faux Gladys** (les
> tests automatiques du projet), jamais encore sur une vraie installation.

## Les trois types de bouton

| Type                       | Ce qu'il fait                                                                                                                   | Exemple                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| **Bouton poussoir**        | Un appui = une impulsion : il passe à 1, puis revient seul à 0 une seconde plus tard.                                           | « Lancer la scène Ciné » |
| **Interrupteur**           | Marche / arrêt, mémorisé (même après un redémarrage).                                                                           | « Mode nuit »            |
| **Interrupteur temporisé** | Marche, puis revient seul à l'arrêt après la durée choisie (1 à 1440 minutes). Un nouvel appui sur « marche » relance la durée. | « Chauffage 30 min »     |

Un bouton **ne commande rien tout seul** : c'est une scène qui agit quand il
change. Le bouton est la télécommande, la scène fait le travail.

## Étape 1 : créer le bouton

1. Dans Gladys, ouvrez **Intégrations**, puis **Boutons virtuels**, onglet
   **Configuration**.
2. Cliquez sur **Ajouter un bouton**. Un petit formulaire s'ouvre :
   - **Nom** : par exemple `Chauffage` (40 caractères au plus ; le widget en
     affiche 24) ;
   - **Type de bouton** : cochez l'une des trois lignes, chacune expliquée en
     une phrase. Le type ne peut plus être changé ensuite ;
   - **Durée en minutes** : seulement pour l'interrupteur temporisé ;
   - **Icône** : flamme / chauffage, ampoule, volet, prise, ventilateur,
     musique, film, porte, maison, lune, soleil, alarme, étoile… ;
   - **Couleur dans le widget** : principal (bleu), secondaire (gris) ou
     danger (rouge) ;
   - **Demander une confirmation avant l'appui** : oui ou non.
3. Validez. Le message sous le bouton dit « Bouton « Chauffage » ajouté ».

## Étape 2 : l'ajouter dans Gladys (onglet Découverte)

Gladys ne laisse pas une intégration créer un appareil toute seule : c'est vous
qui le validez.

1. Ouvrez l'onglet **Découverte** de l'intégration. Votre bouton y apparaît,
   avec son nom.
2. Cliquez sur **Créer** à côté de lui. Vous pouvez choisir sa pièce.
3. Il apparaît maintenant dans l'onglet **Appareils**. Un bouton poussoir est un
   appareil « bouton », un interrupteur un appareil « interrupteur ».

## Étape 3 : la scène qui agit

Exemple : « quand j'appuie sur Chauffage, allumer la prise du radiateur ».

1. Ouvrez **Scènes**, cliquez sur **Nouvelle scène**, donnez-lui un nom et
   une icône (par exemple la flamme).
2. **Déclencheur** : choisissez **Changement d'état d'un appareil**. Dans la
   liste des appareils, prenez votre bouton (« Chauffage »). Réglez la
   condition sur **égal à** et la valeur sur **1**. Laissez « Seulement au
   franchissement du seuil » décoché : la scène part ainsi à chaque appui.
3. **Action** : par exemple **Contrôler un appareil**, choisissez la prise du
   radiateur et « Allumer ».
4. Pour un interrupteur, faites une deuxième scène « quand Chauffage passe à
   **0** » qui éteint la prise. Pour un interrupteur temporisé, cette scène
   « passe à 0 » part aussi quand la durée se termine.
5. Enregistrez et activez la scène.

Ne faites jamais une scène qui renvoie une valeur **au bouton qui l'a
déclenchée** : elle se relancerait sans fin. L'intégration refuse un bouton
actionné plus de 20 fois en une minute, mais mieux vaut ne pas tenter.

## Étape 4 : le widget « Boutons » sur le tableau de bord

1. Ouvrez votre **tableau de bord**, passez en mode édition, ajoutez une boîte
   et choisissez le widget **Boutons** (de l'intégration Boutons virtuels).
2. Dans ses réglages, choisissez de **1 à 4 boutons** (Bouton 1 à Bouton 4).
   Seuls les boutons déjà créés à l'étape 2 sont proposés.
3. Le widget affiche une pastille par bouton, avec l'icône, le nom et la
   couleur choisis :
   - un appui sur un **bouton poussoir** envoie une impulsion ;
   - un appui sur un **interrupteur** le fait basculer. Allumé, il prend sa
     couleur (bleu si vous aviez choisi gris) ; éteint, il est gris ;
   - pour un **interrupteur temporisé** allumé, une ligne indique le temps
     restant (« Chauffage : encore 25 min ») ;
   - si vous avez demandé une **confirmation**, Gladys demande de confirmer
     avant d'envoyer.
4. Pour plus de 4 boutons, ajoutez plusieurs widgets.

Les boutons fonctionnent aussi dans les boîtes habituelles de Gladys : la boîte
« Appareils » d'une pièce, et pour les interrupteurs la boîte « Actions
rapides ». Là, l'icône est celle de Gladys (un rond pour un bouton, un
interrupteur pour un interrupteur) : l'icône choisie ne s'affiche que dans le
widget « Boutons ».

## Modifier ou supprimer un bouton

- **Modifier un bouton** : choisissez le bouton dans la liste (ou tapez son nom
  s'il n'est pas encore créé), puis remplissez seulement ce qui change :
  nouveau nom dans le widget, icône, couleur, confirmation, durée. Le type ne
  change pas. Une nouvelle durée vaut au prochain « marche ». Un nouveau nom ne
  renomme pas l'appareil Gladys : renommez-le aussi dans l'onglet Appareils si
  vous le souhaitez.
- **Supprimer un bouton** : choisissez-le de la même façon. Supprimez ensuite
  son appareil dans l'onglet **Appareils** si vous l'aviez créé. Si vous
  supprimez seulement l'appareil dans Gladys, le bouton reste proposé dans
  Découverte.

## Sécurité : à lire avant de commander quelque chose d'important

- **Un interrupteur virtuel peut être coupé (ou allumé) par d'autres que
  vous** : une commande « tout éteindre », la voix ou le chat (« éteins
  Chauffage »), un assistant connecté, n'importe quelle scène, n'importe quel
  tableau de bord (même un écran mural). Pour une **commande sensible**
  (portail, alarme, chaudière, porte de garage), n'utilisez **jamais un
  interrupteur** : prenez un **bouton poussoir avec confirmation**, et mettez
  les conditions dans la scène (personne à la maison, heure, état de
  l'alarme…).
- **L'état du bouton n'est pas l'état réel de l'appareil commandé.**
  « Chauffage : marche » veut dire que vous avez appuyé, pas que la chaudière
  chauffe. Si la scène échoue ou si l'appareil ne répond pas, le bouton ne le
  sait pas. Pour voir l'état réel, ajoutez un vrai capteur (prise avec mesure
  de puissance, thermomètre) sur votre tableau de bord.
- Les boutons ne sont **jamais** déclarés comme des lumières, pour qu'un
  « éteins les lumières » ne les atteigne pas.
- Si le conteneur de l'intégration est arrêté, un appui échoue (Gladys
  l'affiche). Un interrupteur temporisé dont la durée est passée pendant
  l'arrêt revient à l'arrêt dès le redémarrage.

## L'alternative sans intégration : une scène dans « Actions rapides »

Si vous voulez seulement **un bouton qui lance une scène**, Gladys sait déjà le
faire, sans cette intégration et sans conteneur :

1. Créez la scène (par exemple « Chauffage 30 min ») et choisissez son icône
   dans le sélecteur d'icônes de la scène (la flamme, par exemple).
2. Sur le tableau de bord, ajoutez la boîte **Actions rapides** (ou la boîte
   **Scène**), puis ajoutez-y la scène avec le libellé de votre choix.
3. Un appui lance la scène, avec son icône.

Cette intégration sert surtout quand il vous faut un **état** : un
interrupteur marche/arrêt mémorisé, ou un interrupteur qui revient seul à
l'arrêt après une durée.

## Limites

- 100 boutons au plus, 4 par widget (ajoutez plusieurs widgets).
- Pas d'appui long ni de double appui, pas de couleur libre ni de taille de
  bouton : seulement les trois couleurs du widget.
- L'intégration ne lance pas les scènes elle-même : c'est le changement d'état
  du bouton qui les déclenche (étape 3).
- Le widget se met à jour à chaque appui, et sinon toutes les 15 à 30
  secondes.
- Testé seulement avec un faux Gladys : merci de signaler ce qui ne marche pas
  sur le dépôt GitHub.

## Données

La liste des boutons, leur état et la fin d'un interrupteur temporisé sont
gardés dans `/data/virtual-buttons.json`, le volume de l'intégration. Rien n'est
envoyé hors de votre Gladys.
