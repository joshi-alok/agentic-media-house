import { describe, expect, it } from 'vitest';
import { checkG4 } from '../src/checks/g4-values';
import { defaultContext } from '../src/config';
import { cloneGolden } from '../src/fixtures';
import type { Claim } from '../src/schemas';
import { extractTokens } from '../src/tokens';

/** The codes G4 reports for the first sentence of the opening, when it says `text` and cites c-1, whose passage is `quote` and whose values are `values`. */
const g4 = (text: string, quote: string, values: Claim['values'] = []): string[] => {
  const input = cloneGolden();
  const claim = input.claims.find((item) => item.id === 'c-1')!;
  claim.span = { start: 0, end: quote.length, quote };
  claim.values = values;
  input.draft.opening[0] = { kind: 'fact', text, claimIds: ['c-1'] };
  return checkG4(input, defaultContext()).failures.filter((failure) => failure.where === 'opening, sentence 1').map((failure) => failure.code);
};

describe('how the forms of crypto read', () => {
  it('reads an amount of a token as a number with no unit, and the token as a name', () => {
    expect(extractTokens('The agent paid 0.5 ETH and 25 USDC in fees.')).toMatchObject({ numbers: [{ raw: '0.5', value: '0.5' }, { raw: '25', value: '25' }], names: ['eth', 'usdc'] });
    expect(extractTokens('Gas cost fell to 12 gwei, a 3.5% drop, with 2,000 TPS at peak.')).toMatchObject({
      numbers: [{ raw: '12', value: '12' }, { raw: '3.5%', value: '3.5', unit: '%' }, { raw: '2,000', value: '2000' }],
      names: ['tps'],
    });
    expect(extractTokens('Fees are 25 bps.').numbers).toEqual([{ raw: '25', value: '25' }]);
  });

  it('keeps the unit of a dollar amount, and reads a magnitude', () => {
    expect(extractTokens('It settles for $0.001 per call.').numbers).toEqual([{ raw: '$0.001', value: '0.001', unit: 'USD' }]);
    expect(extractTokens('The foundation raised $12.5 million.').numbers).toEqual([{ raw: '$12.5 million', value: '12500000', unit: 'USD' }]);
  });

  it('reads a word that mixes letters and digits as a name, whatever it is', () => {
    expect(extractTokens('The x402 protocol and ERC-8004 and 10x.').names).toEqual(expect.arrayContaining(['x402', '10x']));
    expect(extractTokens('The agent holds 0x1234abcd5678ef90.').names).toContain('0x1234abcd5678ef90');
  });
});

describe('G4 on the forms of crypto', () => {
  it.each([
    ['x402', 'The x402 protocol settles payments.'],
    ['ERC-8004', 'ERC-8004 registers an agent.'],
    ['a hex address', 'The agent holds 0x1234abcd5678ef90 on mainnet.'],
    ['10x', 'Fees are 10x lower than before.'],
  ])('blocks %s when no claim that the sentence cites has it', (_name, text) => {
    expect(g4(text, 'A passage that has none of those words.')).toContain('G4_FIGURE_UNSUPPORTED');
  });

  it.each([
    ['x402', 'The x402 protocol settles payments.', 'The x402 protocol settles payments in stablecoins.'],
    ['ERC-8004', 'ERC-8004 registers an agent.', 'ERC-8004 registers an agent on chain.'],
    ['a hex address', 'The agent holds 0x1234abcd5678ef90.', 'The agent holds 0x1234abcd5678ef90 on mainnet.'],
  ])('passes %s when the passage of a claim that the sentence cites has it', (_name, text, quote) => {
    expect(g4(text, quote)).toEqual([]);
  });

  it('passes an amount of a token when a claim lists the number, and blocks one that no claim lists', () => {
    const values: Claim['values'] = [
      { kind: 'number', raw: '0.5 ETH', normalised: '0.5', unit: 'ETH' },
      { kind: 'name', raw: 'ETH', normalised: 'eth' },
    ];
    expect(g4('The wallet paid 0.5 ETH in fees.', 'The wallet paid 0.5 ETH in fees.', values)).toEqual([]);
    expect(g4('The wallet paid 0.7 ETH in fees.', 'The wallet paid 0.5 ETH in fees.', values)).toContain('G4_NUMBER_UNSUPPORTED');
  });
});
