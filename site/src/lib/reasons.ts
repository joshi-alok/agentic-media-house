// Plain words for the codes the gate reports. The holds page shows a label
// beside each code. site/test/reasons.test.ts fails when the gate gains a
// failure code or a hold reason that has no label here.

export const REASON_LABELS: Readonly<Record<string, string>> = {
  G1_TITLE_EMPTY: 'The title was empty',
  G1_DESCRIPTION_TOO_LONG: 'The description was too long',
  G1_BAD_DATE: 'The date was not a real date',
  G1_SLUG_FORMAT: 'The page address was malformed',
  G1_CATEGORY_COUNT: 'The piece had the wrong number of categories',
  G1_CATEGORY_UNKNOWN: 'A category is not one the site uses',
  G1_CATEGORY_NO_BEAT: 'Tagged funding without a beat',
  G1_AUTHOR_MISSING: 'The author name was missing',
  G2_OPENING_LENGTH: 'The opening paragraph was the wrong length',
  G2_TAKEAWAYS_COUNT: 'The piece had the wrong number of key takeaways',
  G2_BODY_LENGTH: 'The piece was too short or too long',
  G2_SECTIONS_MIN: 'The piece had fewer than two sections',
  G2_HEADING_QUESTION: 'A heading asked a question',
  G2_HEADING_TOO_LONG: 'A heading was too long',
  G2_HEADING_EMPTY: 'A section had no heading',
  G2_LIMITATIONS_MISSING: 'There was no section on what could not be verified',
  G3_NO_CLAIM: 'A factual sentence cited no claim',
  G3_UNKNOWN_CLAIM: 'A sentence cited a claim that does not exist',
  G4_NUMBER_UNSUPPORTED: 'A number was not in the claims it cites',
  G4_DATE_UNSUPPORTED: 'A date was not in the claims it cites',
  G4_NAME_UNSUPPORTED: 'A name was not in the claims it cites',
  G4_VALUE_NOT_IN_SPAN: 'A claim listed a value its source passage does not contain',
  G4_INITIAL_WORD_UNSUPPORTED: 'A sentence opened with a name that no claim supports',
  G4_HEADING_NUMBER: 'A heading contained a number or a date',
  G4_HEADING_QUOTE: 'A heading contained a quotation',
  G4_HEADING_NAME: 'A heading named something no claim supports',
  G4_NUMBER_WORD_UNCHECKABLE: 'An amount was written as a word that cannot be checked',
  G5_QUOTE_NOT_VERBATIM: 'A quotation was not word for word',
  G6_TIER2_UNATTRIBUTED: 'Another outlet was used without naming it',
  G6_TIER2_IN_ANALYSIS: 'Analysis rested on another outlet',
  G7_ANALYSIS_PLACEMENT: 'Analysis stood where only facts are allowed',
  G7_ANALYSIS_SHARE: 'Too much of the piece was analysis',
  G7_ANALYSIS_NEW_VALUE: 'Analysis brought in a number, date or name of its own',
  G8_LIMITATION_PLACEMENT: 'A limitation stood outside its section',
  G8_LIMITATION_CLAIMS: 'A limitation did not cite exactly one claim',
  G8_LIMITATION_MISMATCH: 'A limitation did not match its template',
  G9_SLUG_COLLISION: 'The page address was already in use',
  G9_TITLE_DUPLICATE: 'The title was too close to a recent one',
  G9_BANNED_PHRASE: 'A banned filler phrase was used',
  TIER2_ATTRIBUTION: "Rests on another outlet's reporting",
};

/** The words for a failure code or hold reason. A code with no label is returned as it is, never hidden. */
export function reasonLabel(code: string): string {
  return Object.hasOwn(REASON_LABELS, code) ? REASON_LABELS[code]! : code;
}
