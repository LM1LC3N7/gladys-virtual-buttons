// -----------------------------------------------------------------------------
// Texts shown in Gladys, in English and French. The words of the Gladys
// screens are quoted exactly ("Add to Gladys" / « Ajouter à Gladys »).
// -----------------------------------------------------------------------------

import { LIMITS } from './constants.js';

const both = (en, fr) => ({ en, fr });

/** Refusals: thrown as an Error whose message holds both languages. */
export const ERRORS = Object.freeze({
  nameMissing: both('Type a name for the button.', 'Saisissez un nom pour le bouton.'),
  nameTaken: both(
    'A button already has this name: choose another one.',
    'Un bouton porte déjà ce nom : choisissez-en un autre.',
  ),
  kindUnknown: both('Choose the type of the button.', 'Choisissez le type du bouton.'),
  positionsCount: both(
    `A selector has ${LIMITS.positionsMin} to ${LIMITS.positionsMax} positions: type their names separated by commas (for example: Comfort, Eco, Frost protection, Off).`,
    `Un sélecteur a de ${LIMITS.positionsMin} à ${LIMITS.positionsMax} positions : tapez leurs noms séparés par des virgules (par exemple : Confort, Éco, Hors-gel, Arrêt).`,
  ),
  positionsTaken: both(
    'Two positions have the same name: give each one its own.',
    'Deux positions portent le même nom : donnez à chacune le sien.',
  ),
  positionGone: both(
    'The selector is on a position this new list removes: put it on another position first, then change the list.',
    "Le sélecteur est sur une position que cette nouvelle liste supprime : mettez-le d'abord sur une autre position, puis changez la liste.",
  ),
  positionsMoved: both(
    'A position cannot be moved nor inserted in the middle: the scenes use its number. Rename a position in place, or add new ones at the end.',
    'Une position ne peut être ni déplacée ni insérée au milieu : les scènes utilisent son numéro. Renommez une position à sa place, ou ajoutez-en à la fin.',
  ),
  iconUnknown: both('This icon is not in the list.', "Cette icône n'est pas dans la liste."),
  styleUnknown: both('This style is not in the list.', "Ce style n'est pas dans la liste."),
  confirmUnknown: both(
    'Answer yes or no for the confirmation.',
    'Répondez oui ou non pour la confirmation.',
  ),
  minutesOut: both(
    `The duration is a whole number of minutes, from ${LIMITS.minutesMin} to ${LIMITS.minutesMax}.`,
    `La durée est un nombre entier de minutes, de ${LIMITS.minutesMin} à ${LIMITS.minutesMax}.`,
  ),
  tooMany: both(
    `${LIMITS.buttons} buttons at most: remove one first.`,
    `${LIMITS.buttons} boutons au plus : supprimez-en un d'abord.`,
  ),
  targetMissing: both(
    'Choose the button in the list, or type its name if it is not added to Gladys yet.',
    "Choisissez le bouton dans la liste, ou tapez son nom s'il n'est pas encore ajouté à Gladys.",
  ),
  targetUnknown: both('No button has this name.', 'Aucun bouton ne porte ce nom.'),
  removeNameMissing: both(
    'Type the name of the button to confirm: the removal is final.',
    'Tapez le nom du bouton pour confirmer : la suppression est définitive.',
  ),
  removeNameMismatch: both(
    'The name typed is not the name of the button chosen in the list: nothing removed.',
    "Le nom tapé n'est pas celui du bouton choisi dans la liste : rien n'est supprimé.",
  ),
  nothingToChange: both(
    'Nothing to change: every field says "Unchanged".',
    'Rien à modifier : tous les champs sont sur « Inchangé ».',
  ),
  sameAsPrevious: both(
    'These are exactly the changes just applied to another button: the form kept them. Reload the page to start again, or run the same action again within 2 minutes to apply them to this button too.',
    'Ce sont exactement les changements appliqués juste avant à un autre bouton : le formulaire les a gardés. Rechargez la page pour repartir de zéro, ou relancez la même action dans les 2 minutes pour les appliquer aussi à ce bouton.',
  ),
  unknownButton: both(
    'This button was removed from the integration: delete its device in Gladys.',
    "Ce bouton a été supprimé de l'intégration : supprimez son appareil dans Gladys.",
  ),
  badValue: both('A button only takes 0 or 1.', 'Un bouton ne prend que 0 ou 1.'),
  badPosition: both(
    'This position is not one of the selector.',
    "Cette position n'est pas une de celles du sélecteur.",
  ),
  positionNotChosen: both(
    'Choose a position in the list. If the card shows no list, update Gladys.',
    "Choisissez une position dans la liste. Si la carte n'affiche pas de liste, mettez Gladys à jour.",
  ),
  tooFast: both(
    `More than ${LIMITS.pressesPerButton} presses, "on" or changes of position in a minute for this button (a scene that triggers itself?): refused for the rest of the minute. The "off" of a switch is never refused.`,
    `Plus de ${LIMITS.pressesPerButton} appuis, « marche » ou changements de position en une minute pour ce bouton (une scène qui se relance elle-même ?) : refusé jusqu'à la fin de la minute. L'« arrêt » d'un interrupteur n'est jamais refusé.`,
  ),
  budget: both(
    'Too many commands in a minute for all the buttons: wait a minute.',
    'Trop de commandes en une minute pour tous les boutons : attendez une minute.',
  ),
  late: both(
    'The command arrived too late (Gladys had already given up): refused, nothing sent.',
    'La commande est arrivée trop tard (Gladys avait déjà abandonné) : refusée, rien envoyé.',
  ),
  notSent: both(
    'Gladys did not take the press: nothing sent, no scene started.',
    "Gladys n'a pas pris l'appui : rien envoyé, aucune scène lancée.",
  ),
  offNotConfirmed: both(
    'The switch was turned off, but Gladys did not confirm it yet: nothing removed. Try again in a moment.',
    "L'interrupteur a été mis à l'arrêt, mais Gladys ne l'a pas encore confirmé : rien n'est supprimé. Réessayez dans un instant.",
  ),
  saveFailed: both(
    'The button could not be saved in /data: nothing was changed.',
    "Le bouton n'a pas pu être enregistré dans /data : rien n'a été changé.",
  ),
});

export class ButtonError extends Error {
  constructor(key) {
    const text = ERRORS[key] ?? ERRORS.badValue;
    super(`${text.fr} / ${text.en}`);
    this.key = key;
  }
}

const quote = (name) => ({ en: `"${name}"`, fr: `« ${name} »` });

/**
 * Labels of the icons, the same as the manifest options (tested): what the
 * icon shows, then what it is good for.
 */
export const ICON_LABELS = Object.freeze({
  power: both('On / off', 'Marche / arrêt'),
  'toggle-right': both('Switch', 'Interrupteur'),
  check: both('Tick / confirm', 'Coche / valider'),
  x: both('Cross / cancel', 'Croix / annuler'),
  play: both('Play', 'Lecture'),
  pause: both('Pause', 'Pause'),
  square: both('Stop', 'Stop'),
  'arrow-up': both('Up', 'Monter'),
  'arrow-down': both('Down', 'Descendre'),
  flame: both('Flame / heating', 'Flamme / chauffage'),
  heater: both('Radiator', 'Radiateur'),
  thermometer: both('Thermometer', 'Thermomètre'),
  snowflake: both('Cold / frost protection', 'Froid / hors-gel'),
  fan: both('Fan', 'Ventilateur'),
  wind: both('Wind / airing', 'Vent / aération'),
  leaf: both('Leaf / eco', 'Feuille / éco'),
  lightbulb: both('Light bulb', 'Ampoule'),
  sun: both('Sun / day', 'Soleil / jour'),
  moon: both('Moon / night', 'Lune / nuit'),
  sunrise: both('Sunrise / morning', 'Lever du soleil / matin'),
  sunset: both('Sunset / evening', 'Coucher du soleil / soir'),
  blinds: both('Shutter', 'Volet'),
  plug: both('Plug', 'Prise'),
  zap: both('Lightning', 'Éclair'),
  droplet: both('Water', 'Eau'),
  bath: both('Bath', 'Bain'),
  'shower-head': both('Shower', 'Douche'),
  sprout: both('Garden / watering', 'Jardin / arrosage'),
  music: both('Music', 'Musique'),
  'volume-2': both('Sound / volume', 'Son / volume'),
  film: both('Movie', 'Film'),
  tv: both('Television', 'Télévision'),
  book: both('Book', 'Livre'),
  home: both('House', 'Maison'),
  'door-open': both('Door', 'Porte'),
  'log-in': both('Arrival / coming home', 'Arrivée / retour'),
  'log-out': both('Leaving', 'Départ'),
  lock: both('Padlock', 'Cadenas'),
  shield: both('Shield / security', 'Bouclier / sécurité'),
  bell: both('Alarm / bell', 'Alarme / sonnette'),
  car: both('Car', 'Voiture'),
  bed: both('Bed / bedtime', 'Lit / coucher'),
  sofa: both('Sofa / living room', 'Canapé / salon'),
  utensils: both('Meal / kitchen', 'Repas / cuisine'),
  coffee: both('Coffee', 'Café'),
  users: both('Family / guests', 'Famille / invités'),
  'party-popper': both('Party', 'Fête'),
  star: both('Star', 'Étoile'),
  'alarm-clock': both('Alarm clock', 'Réveil'),
  timer: both('Timer', 'Minuteur'),
});

export const STYLE_LABELS = Object.freeze({
  primary: both('Main (blue)', 'Principal (bleu)'),
  secondary: both('Secondary (grey)', 'Secondaire (gris)'),
  danger: both('Danger (red)', 'Danger (rouge)'),
});

/** "name: X; icon: Flame / heating; colour: unchanged…" for "Change a button". */
function changes(values) {
  const items = [
    ['name', both('name', 'nom'), (v) => both(v, v)],
    ['icon', both('icon', 'icône'), (v) => ICON_LABELS[v]],
    ['style', both('colour', 'couleur'), (v) => STYLE_LABELS[v]],
    [
      'confirm',
      both('confirmation', 'confirmation'),
      (v) => (v ? both('yes', 'oui') : both('no', 'non')),
    ],
    ['minutes', both('duration', 'durée'), (v) => both(`${v} min`, `${v} min`)],
  ];
  if (Object.hasOwn(values, 'positions')) {
    items.push([
      'positions',
      both('positions', 'positions'),
      (v) => both(v.join(', '), v.join(', ')),
    ]);
  }
  const line = (lang) =>
    items
      .map(([key, label, show]) =>
        Object.hasOwn(values, key)
          ? `${label[lang]}${lang === 'fr' ? ' : ' : ': '}${show(values[key])[lang]}`
          : `${label[lang]}${lang === 'fr' ? ' : inchangé(e)' : ': unchanged'}`,
      )
      .join(lang === 'fr' ? ' ; ' : '; ');
  return both(line('en'), line('fr'));
}

export const T = Object.freeze({
  added: (name) =>
    both(
      `Button ${quote(name).en} added. Now open the Discovery tab of this integration and click "Add to Gladys" next to it.`,
      `Bouton ${quote(name).fr} ajouté. Ouvrez maintenant l'onglet Découverte de cette intégration et cliquez sur « Ajouter à Gladys » à côté.`,
    ),
  edited: (name, values) => {
    const list = changes(values);
    return both(
      `Button ${quote(name).en} changed (${list.en}). The widget shows it at its next refresh; a new name does not rename the Gladys device.`,
      `Bouton ${quote(name).fr} modifié (${list.fr}). Le widget l'affiche à son prochain rafraîchissement ; un nouveau nom ne renomme pas l'appareil Gladys.`,
    );
  },
  removed: (name, wasOn) =>
    both(
      `Button ${quote(name).en} removed for good${wasOn ? ' (turned off first)' : ''}. If you had added it to Gladys, also delete its device in the Devices tab, and edit the dashboard cards that showed it.`,
      `Bouton ${quote(name).fr} supprimé définitivement${wasOn ? " (mis à l'arrêt d'abord)" : ''}. Si vous l'aviez ajouté à Gladys, supprimez aussi son appareil dans l'onglet Appareils, et modifiez les cartes du tableau de bord qui l'affichaient.`,
    ),
  status: (count, created) =>
    both(
      `${count} button(s), ${created} added to Gladys.`,
      `${count} bouton(s), dont ${created} ajouté(s) à Gladys.`,
    ),
  statusCorrupted: both(
    'The saved list in /data was unreadable (set aside as .bad): the buttons were rebuilt from the Gladys devices.',
    'La liste enregistrée dans /data était illisible (mise de côté en .bad) : les boutons ont été reconstruits depuis les appareils Gladys.',
  ),
  statusDefaultPositions: both(
    'A selector lost the names of its positions: it was rebuilt with "Position 1", "Position 2"; change them with "Change a button".',
    'Un sélecteur a perdu les noms de ses positions : il a été reconstruit avec « Position 1 », « Position 2 » ; changez-les avec « Modifier un bouton ».',
  ),
  statusUnreadable: both(
    'The saved list in /data cannot be read (permissions?): nothing is saved until the integration restarts, so the file is never overwritten.',
    "La liste enregistrée dans /data ne peut pas être lue (droits ?) : rien n'est enregistré avant le redémarrage de l'intégration, le fichier n'est jamais écrasé.",
  ),
  pressed: (name) =>
    both(`${quote(name).en}: pressed.`, `${quote(name).fr} : appui pris par Gladys.`),
  pressedUnconfirmed: (name) =>
    both(
      `${quote(name).en}: sent, without confirmation from Gladys.`,
      `${quote(name).fr} : envoyé, sans confirmation de Gladys.`,
    ),
  switchedOn: (name) => both(`${quote(name).en}: on.`, `${quote(name).fr} : marche.`),
  switchedOnFor: (name, minutes) =>
    both(
      `${quote(name).en}: on, back to off in ${minutes} min.`,
      `${quote(name).fr} : marche, retour à l'arrêt dans ${minutes} min.`,
    ),
  alreadyOn: (name) =>
    both(`${quote(name).en}: already on.`, `${quote(name).fr} : déjà en marche.`),
  alreadyOnRestarted: (name, minutes) =>
    both(
      `${quote(name).en}: already on, duration started again (${minutes} min).`,
      `${quote(name).fr} : déjà en marche, durée relancée (${minutes} min).`,
    ),
  positionSet: (name, position) =>
    both(`${quote(name).en}: ${position}.`, `${quote(name).fr} : ${position}.`),
  alreadyPosition: (name, position) =>
    both(`${quote(name).en}: already on ${position}.`, `${quote(name).fr} : déjà sur ${position}.`),
  switchedOff: (name) => both(`${quote(name).en}: off.`, `${quote(name).fr} : arrêt.`),
  alreadyOff: (name) =>
    both(`${quote(name).en}: already off.`, `${quote(name).fr} : déjà à l'arrêt.`),
  widget: {
    title: both('Buttons', 'Boutons'),
    empty: both(
      'No button chosen: pick at least one button in the settings of this widget (they must be added to Gladys first).',
      "Choisis au moins un bouton dans les réglages du widget (ils doivent d'abord être ajoutés à Gladys).",
    ),
    gone: both(
      'The buttons of this card were removed from the integration: edit the card.',
      "Les boutons de cette carte ont été supprimés de l'intégration : modifiez la carte.",
    ),
    crowded: (names) =>
      both(
        `No room left on this card for: ${names.join(', ')}. A card shows 4 pills, and a selector of up to 4 positions one per position: show it on a card of its own.`,
        `Plus de place sur cette carte pour : ${names.join(', ')}. Une carte affiche 4 pastilles, et un sélecteur de 4 positions au plus une par position : affichez-le sur une carte à lui.`,
      ),
    positionField: both('Position', 'Position'),
    iconsPage: (page, pages, from, to, total) =>
      both(
        `Page ${page} of ${pages}: icons ${from} to ${to} of ${total}, in the order of the "Icon" list of the forms.`,
        `Page ${page} sur ${pages} : icônes ${from} à ${to} sur ${total}, dans l'ordre de la liste « Icône » des formulaires.`,
      ),
    remaining: (items) =>
      both(
        items.map(([name, minutes]) => `${name}: ${minutes} min left`).join(' · '),
        items.map(([name, minutes]) => `${name} : encore ${minutes} min`).join(' · '),
      ),
  },
});
