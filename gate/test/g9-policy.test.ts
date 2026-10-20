import { describe, expect, it } from 'vitest';
import { checkG9 } from '../src/checks/g9-hygiene';
import { DEFAULT_POLICY_PHRASES, defaultContext } from '../src/config';
import { cloneGolden } from '../src/fixtures';
import type { GateInput } from '../src/gate';
import { mutate } from './helpers';

const run = (change: (copy: GateInput) => void) => checkG9(mutate(cloneGolden(), change), defaultContext());
const policy = (output: ReturnType<typeof run>) => output.failures.filter((failure) => failure.code === 'G9_POLICY_PHRASE');

/** Change the text of the first sentence of the opening. */
const say = (text: string) => (g: GateInput) => {
  g.draft.opening[0] = { kind: 'fact', text, claimIds: ['c-1'] };
};

describe('G9_POLICY_PHRASE', () => {
  it('passes the golden piece', () => {
    expect(policy(run(() => undefined))).toEqual([]);
  });

  it('has the phrases listed above, in lowercase with plain apostrophes', () => {
    expect(DEFAULT_POLICY_PHRASES).toContain('price target');
    expect(DEFAULT_POLICY_PHRASES).toContain('you should buy');
    for (const phrase of DEFAULT_POLICY_PHRASES) expect(phrase).toBe(phrase.toLowerCase());
  });

  it.each(['The analysts set a price target for the token.', 'You should buy before the launch.', 'The token will moon after the launch.', 'This is not financial advice.'])(
    'refuses %s in a sentence, where the sentence is',
    (text) => {
      const failures = policy(run(say(text)));
      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatchObject({ check: 'G9', code: 'G9_POLICY_PHRASE', where: 'opening, sentence 1' });
      expect(failures[0]?.message).toContain('the phrase');
    },
  );

  it('matches whole words, so a longer word is not caught', () => {
    expect(policy(run(say('Prices targeted by the attack fell and a pricetarget file was left.')))).toEqual([]);
  });

  it('matches whole words at both edges: a letter or a digit next to the phrase on either side lets it through', () => {
    expect(policy(run(say('The team will reprice target dates after the audit.')))).toEqual([]);
    expect(policy(run(say('The file price target2 was left in the folder.')))).toEqual([]);
    expect(policy(run(say('The file 2price target was left in the folder.')))).toEqual([]);
    expect(policy(run(say('The analysts set a price target 2 days before the launch.')))).toHaveLength(1);
  });

  it.each(['guaranteed return', 'guaranteed returns', 'guaranteed profit', 'guaranteed profits', 'risk-free return', 'risk-free returns', 'buy the dip', 'buying the dip', 'to the moon'])(
    'refuses the phrase "%s" in a sentence, in the singular or the plural form that the list has',
    (phrase) => {
      const failures = policy(run(say(`The post promised ${phrase} for every holder.`)));
      expect(failures).toHaveLength(1);
      expect(failures[0]?.message).toContain(`"${phrase}"`);
    },
  );

  it('lists the singular and the plural of a phrase apart, because a whole word is not its plural', () => {
    const only = (text: string) => policy(run(say(text))).map((failure) => failure.message.match(/"([^"]+)"/)?.[1]);
    expect(only('The fund promised a guaranteed return.')).toEqual(['guaranteed return']);
    expect(only('The fund promised guaranteed returns.')).toEqual(['guaranteed returns']);
    expect(only('The fund promised guaranteed profits.')).toEqual(['guaranteed profits']);
    expect(only('The fund promised a risk-free return.')).toEqual(['risk-free return']);
  });

  it('says in the message that the Desk writes no prediction, no advice, no hype and no disclaimer', () => {
    const [failure] = policy(run(say('The analysts set a price target for the token.')));
    expect(failure?.message).toBe(
      'the phrase "price target" appears at opening, sentence 1: the Desk makes no price prediction, no market call, no advice to buy, sell or hold, no hype and no disclaimer (the footer carries it)',
    );
  });

  it('ignores case, the shape of quotation marks and the spacing', () => {
    expect(policy(run(say('The note said:  PRICE   TARGET  was raised.')))).toHaveLength(1);
  });

  it('refuses a phrase in the title, in analysis and in a heading, and in a quotation', () => {
    const title = policy(run((g) => (g.draft.title = { kind: 'fact', text: 'A price target for agents', claimIds: ['c-1'] })));
    expect(title).toHaveLength(1);
    expect(title[0]?.where).toBe('title');
    const analysis = policy(run((g) => (g.draft.opening[1] = { kind: 'analysis', text: 'This is a strong buy for the long run.', claimIds: [] })));
    expect(analysis).toHaveLength(1);
    expect(analysis[0]?.where).toBe('opening, sentence 2');
    const heading = policy(run((g) => (g.draft.sections[0]!.heading = 'You should buy now')));
    expect(heading).toHaveLength(1);
    expect(heading[0]?.where).toBe('section "You should buy now"');
    expect(policy(run(say('The post said "price target" in capitals.')))).toHaveLength(1);
  });

  it('refuses the plural, which a longer word would otherwise let through', () => {
    expect(policy(run(say('Analysts raised their price targets again.')))).toHaveLength(1);
  });

  it('does not read the limitation sentences, which code writes', () => {
    const output = run((g) => {
      g.draft.limitations[0]!.text = 'You should buy this; it is not financial advice.';
    });
    expect(policy(output)).toEqual([]);
  });

  it('refuses a cashtag, and not a dollar amount or a letter before the dollar sign', () => {
    expect(policy(run(say('The $ETH token moved.')))).toHaveLength(1);
    expect(policy(run(say('The fee is $38,000 and US$5 and A$B are fine.')))).toEqual([]);
    // A failure for each cashtag a place has, as for each phrase.
    expect(policy(run(say('Holders of $TAO and $BTC.'))).map((failure) => failure.message.match(/"([^"]+)"/)?.[1])).toEqual(['$TAO', '$BTC']);
    expect(policy(run(say('The sum of $$ETH is odd.')))).toEqual([]);
  });

  it('does not take a dollar sign after a letter, a digit or another dollar sign for the start of a cashtag', () => {
    // Each of these reaches the lookbehind: the dollar sign is followed by letters, and the character in front of it is what rules the tag out.
    for (const text of ['The US$ETH rate moved.', 'The A$BC rate moved.', 'The 5$ETH rate moved.', 'The sum of $$ETH is odd.']) {
      expect(policy(run(say(text))), text).toEqual([]);
    }
  });

  it('takes a tag of two to ten letters and no other: one letter, eleven letters and a tag that goes on into a digit are not cashtags', () => {
    expect(policy(run(say('The $AB token moved.')))).toHaveLength(1);
    expect(policy(run(say('The $ABCDEFGHIJ token moved.')))).toHaveLength(1);
    expect(policy(run(say('The $USDC token moved.')))).toHaveLength(1);
    expect(policy(run(say('The $A token moved.')))).toEqual([]);
    expect(policy(run(say('The $ABCDEFGHIJK token moved.')))).toEqual([]);
    expect(policy(run(say('The $ETH2 token moved.')))).toEqual([]);
  });

  it('takes a tag in lowercase, and after a bracket, a quotation mark or a space', () => {
    for (const text of ['The $eth token moved.', 'The token ($ETH) moved.', 'The token "$ETH" moved.', 'The token moved, $ETH rose.']) {
      expect(policy(run(say(text))), text).toHaveLength(1);
    }
  });

  it('reports a cashtag once for each place, however often it is written there', () => {
    expect(policy(run(say('The $ETH token and the $ETH fee.')))).toHaveLength(1);
  });

  it('says the cashtag in the message', () => {
    expect(policy(run(say('The $ETH token moved.')))[0]?.message).toContain('$ETH');
  });

  it('reports a sentence once for each phrase it has, and a phrase once for each place', () => {
    const failures = policy(run(say('A price target, and a price target again, and you should buy.')));
    expect(failures.map((failure) => failure.message.match(/"([^"]+)"/)?.[1])).toEqual(['price target', 'you should buy']);
  });

  it('is a blocker: it is not on the list of notes', async () => {
    const { NOTE_CODES } = await import('../src/severity');
    expect(NOTE_CODES).not.toContain('G9_POLICY_PHRASE');
  });

  it('can be sent back: its place is the place of a sentence, which the Desk can point the composer at', () => {
    expect(policy(run(say('You should buy now.')))[0]?.where).toBe('opening, sentence 1');
    expect(policy(run((g) => (g.draft.sections[0]!.heading = 'You should buy now')))[0]?.where).toMatch(/^section "/);
  });
});
