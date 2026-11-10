// Word type from ARASAAC (agreed 2026-10-25), with real data from its API: it needs neither the app nor the database.
import { wordTypeFromArasaac } from '../src/pictograms/domain/entities/pictogram.entity';

const living = 'core vocabulary-living being';

describe('tipo de palabra de ARASAAC', () => {
  it('pronouns and verbs by the keyword type, even if the drawing shows a person', () => {
    expect(wordTypeFromArasaac(1, ['pronoun', 'personal pronoun', 'core vocabulary'])).toBe('PERSON'); // yo
    expect(wordTypeFromArasaac(3, ['verb', 'feeding', 'person'], ['verb', 'food'])).toBe('ACTION'); // comer
    expect(wordTypeFromArasaac(3, ['verb', 'person'], ['verb', 'person according to their age'])).toBe('ACTION'); // querer
    expect(wordTypeFromArasaac(4)).toBe('DESCRIPTOR');
    expect(wordTypeFromArasaac(5)).toBe('SOCIAL');
  });

  it('a common noun is a person if it is family, a professional or a living being that is not an animal', () => {
    expect(wordTypeFromArasaac(2, ['person', 'family'], ['family', living])).toBe('PERSON'); // mamá
    expect(wordTypeFromArasaac(2, ['person', 'family'], ['family'])).toBe('PERSON'); // hermano
    expect(wordTypeFromArasaac(2, ['education', 'professional', 'work'], ['educational staff'])).toBe('PERSON'); // maestro
    expect(wordTypeFromArasaac(2, ['person', 'group'], ['group', living])).toBe('PERSON'); // amigo
    expect(wordTypeFromArasaac(2, ['animal', 'pet'], ['mammal', living])).toBe('THING'); // perro
    expect(wordTypeFromArasaac(2, ['place', 'home', 'person'], ['residential building', 'person according to their age'])).toBe('THING'); // casa
    expect(wordTypeFromArasaac(2, ['human response', 'person'], ['human response', 'basic needs'])).toBe('THING'); // ayuda
  });

  it('with no type in ARASAAC it stays unclassified', () => {
    expect(wordTypeFromArasaac(undefined)).toBeNull();
    expect(wordTypeFromArasaac(9)).toBeNull();
  });
});
