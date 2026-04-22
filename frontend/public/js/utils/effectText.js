/**
 * Generates a human-readable Italian sentence from a structured card effect.
 * Used in the admin card editor (live preview) and card description generation.
 *
 * effectToText({ trigger, action, target, params })  →  string | null
 */

const TRIGGER_PREFIX = {
  QUANDO_GIOCATA:      'Quando entra in campo',
  ALL_INIZIO_TURNO:    "All'inizio del tuo turno",
  ALL_FINE_TURNO:      'Alla fine del tuo turno',
  ON_MORTE:            'Quando viene distrutta',
  PASSIVO_SE_IN_CAMPO: 'Finché è in campo',
  QUANDO_DICHIARA:     'Quando attacca',
};

// Used for DANNO_A_CARTA / DANNO_A_ARTEFATTO (accusative "to X")
const TARGET_ACC = {
  SE_STESSO:          'a sé stessa',
  UN_TUO_PERSONAGGIO: 'a uno dei tuoi personaggi',
  UN_NEMICO:          'a un personaggio nemico casuale',
  TUTTI_I_TUOI:       'a tutti i tuoi personaggi',
  TUTTI_I_NEMICI:     'a tutti i personaggi nemici',
  ARTEFATTO_TUO:      'a un tuo artefatto',
  ARTEFATTO_NEMICO:   'a un artefatto nemico',
};

// Used for MODIFICA_* (dative "to X")
const TARGET_DAT = {
  SE_STESSO:          'a sé stessa',
  UN_TUO_PERSONAGGIO: 'a uno dei tuoi personaggi',
  UN_NEMICO:          'a un personaggio nemico',
  TUTTI_I_TUOI:       'a tutti i tuoi personaggi',
  TUTTI_I_NEMICI:     'a tutti i personaggi nemici',
  ARTEFATTO_TUO:      'a un tuo artefatto',
  ARTEFATTO_NEMICO:   'a un artefatto nemico',
};

const DEST_PHRASE = {
  mano:     'torna in mano con HP al massimo',
  scarti:   'viene mandata agli Scarti',
  vuoto:    'viene inviata nel Vuoto',
  assoluto: "viene rimossa nell'Assoluto",
};

function pl(n, singular, plurale) {
  return n === 1 ? singular : plurale;
}

function actionBody(action, target, params) {
  const amount = params.amount ?? 0;
  const dest   = params.destinazione ?? 'mano';
  const sign   = amount >= 0 ? '+' : '';

  switch (action) {
    case 'PESCA_CARTE':
      return `pesca ${amount} ${pl(amount, 'carta', 'carte')}`;

    case 'DANNO_A_CARTA':
      return `infligge ${amount} ${pl(amount, 'danno', 'danni')} ${TARGET_ACC[target] ?? target}`;

    case 'DANNO_A_ARTEFATTO':
      return `infligge ${amount} ${pl(amount, 'danno', 'danni')} ${TARGET_ACC[target] ?? target}`;

    case 'MODIFICA_ATTACCO':
      return `dà ${sign}${amount} attacco ${TARGET_DAT[target] ?? target}`;

    case 'MODIFICA_VITA':
      return amount >= 0
        ? `cura ${sign}${amount} HP ${TARGET_DAT[target] ?? target}`
        : `infligge ${Math.abs(amount)} danni ${TARGET_DAT[target] ?? target}`;

    case 'SPOSTA_CARTA_DI_ZONA':
      return DEST_PHRASE[dest] ?? `viene spostata in ${dest}`;

    case 'SCAMBIA_POSIZIONI_CAMPO':
      return 'scambia le posizioni delle carte sul campo';

    case 'ABILITA_TRIGGER_GLOBALI':
      return 'abilita o disabilita certi trigger globali';

    default:
      return null;
  }
}

/**
 * @param {{ trigger:string, action:string, target:string, params?:object }} effect
 * @returns {string|null}
 */
export function effectToText({ trigger, action, target, params = {} }) {
  const prefix = TRIGGER_PREFIX[trigger];
  const body   = actionBody(action, target, params);
  if (!prefix || !body) return null;
  return `${prefix}, ${body}.`;
}
