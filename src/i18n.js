// -----------------------------------------------------------------------------
// Texts shown in Gladys, in English and French.
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
    'Choose the button in the list, or type its name if it is not created yet.',
    "Choisissez le bouton dans la liste, ou tapez son nom s'il n'est pas encore créé.",
  ),
  targetUnknown: both('No button has this name.', 'Aucun bouton ne porte ce nom.'),
  nothingToChange: both(
    'Nothing to change: fill in at least one field.',
    'Rien à modifier : remplissez au moins un champ.',
  ),
  unknownButton: both(
    'This button was removed from the integration: delete its device in Gladys.',
    "Ce bouton a été supprimé de l'intégration : supprimez son appareil dans Gladys.",
  ),
  badValue: both('A button only takes 0 or 1.', 'Un bouton ne prend que 0 ou 1.'),
  tooFast: both(
    `More than ${LIMITS.pressesPerButton} commands in a minute for this button (a scene that triggers itself?): wait a minute.`,
    `Plus de ${LIMITS.pressesPerButton} commandes en une minute pour ce bouton (une scène qui se relance elle-même ?) : attendez une minute.`,
  ),
  budget: both(
    'Too many commands in a minute for all the buttons: wait a minute.',
    'Trop de commandes en une minute pour tous les boutons : attendez une minute.',
  ),
  saveFailed: both(
    'The button could not be saved in /data: nothing was changed.',
    "Le bouton n'a pas pu être enregistré dans /data : rien n'a été changé.",
  ),
  notReady: both(
    'The integration is starting: try again in a moment.',
    "L'intégration démarre : réessayez dans un instant.",
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

export const T = Object.freeze({
  added: (name) =>
    both(
      `Button ${quote(name).en} added. Now open the Discovery tab of this integration and click "Create" next to it.`,
      `Bouton ${quote(name).fr} ajouté. Ouvrez maintenant l'onglet Découverte de cette intégration et cliquez sur « Créer » à côté.`,
    ),
  edited: (name) =>
    both(
      `Button ${quote(name).en} changed. The dashboard widget shows it at its next refresh; a name changed here does not rename the Gladys device.`,
      `Bouton ${quote(name).fr} modifié. Le widget du tableau de bord l'affiche à son prochain rafraîchissement ; un nom changé ici ne renomme pas l'appareil Gladys.`,
    ),
  removed: (name) =>
    both(
      `Button ${quote(name).en} removed. If you had created it, also delete its device in the Devices tab.`,
      `Bouton ${quote(name).fr} supprimé. Si vous l'aviez créé, supprimez aussi son appareil dans l'onglet Appareils.`,
    ),
  status: (count, created) =>
    both(
      `${count} button(s), ${created} created in Gladys.`,
      `${count} bouton(s), dont ${created} créé(s) dans Gladys.`,
    ),
  statusCorrupted: both(
    'The saved list in /data was unreadable (set aside as .bad): the buttons were rebuilt from the Gladys devices.',
    'La liste enregistrée dans /data était illisible (mise de côté en .bad) : les boutons ont été reconstruits depuis les appareils Gladys.',
  ),
  pressed: (name) => both(`${quote(name).en}: pressed.`, `${quote(name).fr} : appui envoyé.`),
  switchedOn: (name) => both(`${quote(name).en}: on.`, `${quote(name).fr} : marche.`),
  switchedOnFor: (name, minutes) =>
    both(
      `${quote(name).en}: on, back to off in ${minutes} min.`,
      `${quote(name).fr} : marche, retour à l'arrêt dans ${minutes} min.`,
    ),
  switchedOff: (name) => both(`${quote(name).en}: off.`, `${quote(name).fr} : arrêt.`),
  widget: {
    title: both('Buttons', 'Boutons'),
    empty: both(
      'No button chosen. Edit this card and pick up to 4 buttons (they must be created in Gladys first).',
      "Aucun bouton choisi. Modifiez cette carte et choisissez jusqu'à 4 boutons (ils doivent d'abord être créés dans Gladys).",
    ),
    gone: both(
      'The buttons of this card were removed from the integration: edit the card.',
      "Les boutons de cette carte ont été supprimés de l'intégration : modifiez la carte.",
    ),
    remaining: (items) =>
      both(
        items.map(([name, minutes]) => `${name}: ${minutes} min left`).join(' · '),
        items.map(([name, minutes]) => `${name} : encore ${minutes} min`).join(' · '),
      ),
  },
});
