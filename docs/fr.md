# Boutons virtuels

Créez vos propres boutons dans Gladys, avec un nom, une icône et une couleur,
puis lancez une scène quand vous appuyez dessus. Pas besoin de bricoler un faux
appareil MQTT.

> Intégration non officielle. **Testé seulement avec un faux Gladys** (les
> tests automatiques du projet), jamais encore sur une vraie installation.

## Les trois types de bouton

| Type                       | Ce qu'il fait                                                                                                                   | Exemple              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| **Bouton poussoir**        | Un appui = une impulsion : il passe à 1, puis revient seul à 0 une seconde plus tard.                                           | « Lancer Ciné »      |
| **Interrupteur**           | Marche / arrêt, mémorisé (même après un redémarrage).                                                                           | « Mode nuit »        |
| **Interrupteur temporisé** | Marche, puis revient seul à l'arrêt après la durée choisie (1 à 1440 minutes). Un nouvel appui sur « marche » relance la durée. | « Chauffage 30 min » |

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
   - **Demander une confirmation avant l'appui (widget)** : oui ou non.
3. Validez. Sous le bouton, le message dit : « Bouton « Chauffage » ajouté.
   Ouvrez maintenant l'onglet Découverte… ».

## Étape 2 : l'ajouter à Gladys (onglet Découverte)

Gladys ne laisse pas une intégration créer un appareil toute seule : c'est vous
qui le validez.

1. Ouvrez l'onglet **Découverte** de l'intégration.
   Ce que vous voyez : une ligne par bouton, avec son nom, et à droite un
   bouton bleu **« Ajouter à Gladys »**.
2. Cliquez sur **« Ajouter à Gladys »**. La ligne affiche ensuite le badge
   « Déjà ajouté ».
3. Le bouton apparaît dans l'onglet **Appareils**. Gladys affiche la catégorie
   de sa fonction :
   - « Bouton » pour un bouton poussoir ;
   - « Prise » pour un interrupteur ou un interrupteur temporisé. Ce n'est pas
     une vraie prise : c'est le nom que Gladys donne à tous les interrupteurs
     marche/arrêt.

## Étape 3 : la scène qui agit

Ouvrez **Scènes**, cliquez sur **Nouvelle scène**, donnez-lui un nom et une
icône (la flamme, par exemple), puis ajoutez un déclencheur
**« Changement d'état de l'appareil »** et choisissez votre bouton dans la
liste des appareils. La suite dépend du type.

### Pour un bouton poussoir

Ce que vous voyez sous l'appareil choisi : une liste d'événements de bouton.

1. Choisissez **« Clic simple »**. Il n'y a ni valeur à taper ni case à
   cocher : la scène part à chaque appui.
2. **Action** : par exemple **Contrôler un appareil**, choisissez la prise du
   radiateur et « Allumer ».
3. Enregistrez et activez la scène.

### Pour un interrupteur ou un interrupteur temporisé

Ce que vous voyez sous l'appareil choisi : deux boutons **« On »** et
**« Off »**, et une case à cocher.

1. Cliquez sur **« On »**.
2. **Cochez** la case :
   **« Exécuter seulement lorsque le seuil est passé ( et non pas à chaque valeur envoyée ) »**.
   Ainsi la scène part seulement quand l'interrupteur passe d'arrêt à marche,
   jamais deux fois de suite (ni à un redémarrage).
3. **Action** : par exemple allumer la prise du radiateur.
4. Faites une deuxième scène identique avec **« Off »** (case cochée aussi) qui
   éteint la prise. Pour un interrupteur temporisé, cette scène « Off » part
   aussi quand la durée se termine.

### Les boucles

Ne faites pas une scène qui renvoie une commande **au bouton qui l'a
déclenchée**. L'intégration s'en protège :

- un appui ou un « marche » répété plus de **20 fois en une minute** sur le
  même bouton est refusé jusqu'à la fin de la minute ;
- un « arrêt » n'est **jamais** refusé ; un « arrêt » d'un interrupteur déjà à
  l'arrêt (et un « marche » d'un interrupteur déjà en marche) est accepté sans
  rien renvoyer à Gladys, donc sans relancer de scène.

## Étape 4 : le widget « Boutons » sur le tableau de bord

1. Ouvrez votre **tableau de bord**, passez en mode édition, ajoutez une boîte
   et choisissez le widget **Boutons** (de l'intégration Boutons virtuels).
2. Dans ses réglages, choisissez de **1 à 4 boutons** (Bouton 1 à Bouton 4).
   Seuls les boutons ajoutés à Gladys à l'étape 2 sont proposés.
3. Le widget affiche une pastille par bouton, avec l'icône, le nom et la
   couleur choisis :
   - un appui sur un **bouton poussoir** envoie une impulsion ; le message
     dit « appui pris par Gladys », ou l'erreur si Gladys ne l'a pas pris ;
   - un **interrupteur** allumé prend sa couleur (bleu si vous aviez choisi
     gris), éteint il est gris. Un appui fait ce que la pastille montre :
     éteindre une pastille allumée, allumer une pastille éteinte (si l'état a
     changé entre-temps, le message dit « déjà à l'arrêt » ou « déjà en
     marche ») ;
   - pour un **interrupteur temporisé** allumé, une ligne indique le temps
     restant (« Chauffage : encore 25 min ») ;
   - si vous avez demandé une **confirmation**, Gladys demande de confirmer
     avant d'envoyer.
4. Pour plus de 4 boutons, ajoutez plusieurs widgets. Gladys accepte au plus
   30 appuis par minute sur les widgets de l'intégration, tous widgets
   confondus.

Les boutons fonctionnent aussi dans les boîtes habituelles de Gladys : la boîte
« Appareils » d'une pièce (bouton **« Appuyer »** pour un poussoir, interrupteur
pour les autres), et pour les interrupteurs la boîte **« Actions rapides »**.
Là, l'icône est celle de Gladys : l'icône choisie ne s'affiche que dans le
widget « Boutons ». **La confirmation n'existe que dans le widget** : la boîte
« Appareils », une scène, la voix ou un assistant appuient sans demander.

## Modifier ou supprimer un bouton

- **Modifier un bouton** : choisissez le bouton dans la liste (ou tapez son nom
  s'il n'est pas encore ajouté à Gladys). Les autres champs sont sur
  « Inchangé » (durée : 0) ; changez seulement ce que vous voulez. Le message
  du résultat liste ce qui a changé (« icône : Flamme / chauffage ; couleur :
  inchangé… »). Le type ne change pas. Une nouvelle durée vaut au prochain
  « marche ». Un nouveau nom ne renomme pas l'appareil Gladys : renommez-le
  aussi dans l'onglet Appareils si vous le souhaitez.
  Le formulaire garde ses valeurs après un essai : **rechargez la page** avant
  de modifier un autre bouton. Si vous appliquez exactement les mêmes
  changements à un autre bouton juste après, l'intégration demande de
  recommencer l'action pour confirmer.
- **Supprimer un bouton** : c'est **définitif** (les scènes qui l'utilisaient
  ne le retrouveront pas). Tapez son nom pour confirmer (et choisissez-le dans
  la liste si vous voulez). Un interrupteur en marche est d'abord mis à
  l'arrêt : ses scènes « Off » partent. Ensuite, supprimez son appareil dans
  l'onglet **Appareils** si vous l'aviez ajouté à Gladys, et **modifiez les
  cartes du tableau de bord** qui l'affichaient (sinon Gladys y affiche une
  erreur de réglage). Si vous supprimez seulement l'appareil dans Gladys, le
  bouton reste proposé dans Découverte.

## Sécurité : à lire avant de commander quelque chose d'important

- **Un interrupteur virtuel peut être coupé (ou allumé) par d'autres que
  vous** : une commande « tout éteindre », la voix ou le chat (« éteins
  Chauffage »), un assistant connecté, n'importe quelle scène, n'importe quel
  tableau de bord (même un écran mural). Pour une **commande sensible**
  (portail, alarme, chaudière, porte de garage), n'utilisez **jamais un
  interrupteur** : prenez un **bouton poussoir avec confirmation** dans le
  widget, mettez les conditions dans la scène (personne à la maison, heure,
  état de l'alarme…), et n'affichez pas ce bouton dans la boîte « Appareils »
  d'un tableau de bord public (elle appuie sans confirmation).
- **L'état du bouton n'est pas l'état réel de l'appareil commandé.**
  « Chauffage : marche » veut dire que vous avez appuyé, pas que la chaudière
  chauffe. Si la scène échoue ou si l'appareil ne répond pas, le bouton ne le
  sait pas. Pour voir l'état réel, ajoutez un vrai capteur (prise avec mesure
  de puissance, thermomètre) sur votre tableau de bord.
- Les boutons ne sont **jamais** déclarés comme des lumières, pour qu'un
  « éteins les lumières » ne les atteigne pas.
- Une commande « marche » ou un appui qui arrive trop tard (Gladys a déjà
  affiché un échec, au bout de 5 secondes) est refusé : rien n'est envoyé. Un
  « arrêt » est toujours appliqué.
- Si le conteneur de l'intégration est arrêté, un appui échoue (Gladys
  l'affiche). Un interrupteur temporisé dont la durée est passée pendant
  l'arrêt revient à l'arrêt dès le redémarrage. Un redémarrage ou une
  reconnexion ne renvoie jamais à Gladys une valeur qu'il a déjà : vos scènes
  ne repartent pas.

## L'alternative sans intégration : une scène dans « Actions rapides »

Si vous voulez seulement **un bouton qui lance une scène**, Gladys sait déjà le
faire, sans cette intégration et sans conteneur :

1. Créez la scène (par exemple « Chauffage 30 min ») et choisissez son icône
   dans le sélecteur d'icônes de la scène (la flamme, par exemple).
2. Sur le tableau de bord, ajoutez la boîte **« Actions rapides »** (ou la
   boîte **Scène**), puis ajoutez-y la scène avec le libellé de votre choix.
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
- Si la liste enregistrée est perdue (nouveau volume), les boutons sont
  reconstruits depuis les appareils de Gladys : un interrupteur reprend la
  valeur connue de Gladys, un interrupteur temporisé revient à l'arrêt (sa
  scène « Off » part).
- Testé seulement avec un faux Gladys : merci de signaler ce qui ne marche pas
  sur le dépôt GitHub.

## Données

La liste des boutons, leur état et la fin d'un interrupteur temporisé sont
gardés dans `/data/virtual-buttons.json`, le volume de l'intégration. Rien n'est
envoyé hors de votre Gladys. Si ce fichier ne peut pas être lu, l'intégration
ne l'écrase jamais et le dit dans son statut.
