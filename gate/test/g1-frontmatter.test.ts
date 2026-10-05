import { describe, expect, it } from 'vitest';
import { ALL_CHECKS } from '../src/checks';
import { checkG1 } from '../src/checks/g1-frontmatter';
import { defaultContext } from '../src/config';
import { DESK_AUTHOR_NAME } from '../src/constants';
import { cloneGolden } from '../src/fixtures';
import type { GateInput } from '../src/gate';
import { mutate } from './helpers';

/** The failure codes G1 reports for the golden input after `change`. */
function codesAfter(change: (copy: GateInput) => void, ctx = defaultContext()): string[] {
  return checkG1(mutate(cloneGolden(), change), ctx).failures.map((failure) => failure.code);
}

describe('G1: the golden piece', () => {
  it('passes with no failures and no hold reasons', () => {
    expect(checkG1(cloneGolden(), defaultContext())).toEqual({ failures: [], holdReasons: [] });
  });

  it('is the first check registered in ALL_CHECKS', () => {
    expect(ALL_CHECKS[0]).toBe(checkG1);
  });

  it('does not change its input', () => {
    const input = cloneGolden();
    checkG1(input, defaultContext());
    expect(input).toEqual(cloneGolden());
  });

  it('stamps every failure as G1 and says where the problem is', () => {
    const out = checkG1(
      mutate(cloneGolden(), (g) => {
        g.draft.title.text = '';
        g.draft.slug = 'Bad Slug';
      }),
      defaultContext(),
    );
    expect(out.failures.map((failure) => [failure.check, failure.code, failure.where])).toEqual([
      ['G1', 'G1_TITLE_EMPTY', 'title'],
      ['G1', 'G1_SLUG_FORMAT', 'slug'],
    ]);
    for (const failure of out.failures) {
      expect(failure.message.length).toBeGreaterThan(0);
    }
  });
});

describe('G1_TITLE_EMPTY', () => {
  it.each(['', ' ', '\n\t '])('fails for the title %j', (title) => {
    expect(codesAfter((g) => (g.draft.title.text = title))).toEqual(['G1_TITLE_EMPTY']);
  });

  it('passes for a one-word title', () => {
    expect(codesAfter((g) => (g.draft.title.text = 'Funding'))).toEqual([]);
  });
});

describe('G1_DESCRIPTION_EMPTY', () => {
  it.each(['', ' ', '\n\t '])('fails for the description %j, and says where', (description) => {
    const out = checkG1(mutate(cloneGolden(), (g) => (g.draft.description.text = description)), defaultContext());
    expect(out.failures).toEqual([
      {
        check: 'G1',
        code: 'G1_DESCRIPTION_EMPTY',
        message: 'the description is empty: the page and search results need a one-sentence description',
        where: 'description',
      },
    ]);
  });

  it('passes for a one-word description', () => {
    expect(codesAfter((g) => (g.draft.description.text = 'Funding'))).toEqual([]);
  });

  it('is not also reported as too long', () => {
    expect(codesAfter((g) => (g.draft.description.text = ''), defaultContext({ config: { descriptionMax: 0 } }))).toEqual([
      'G1_DESCRIPTION_EMPTY',
    ]);
  });
});

describe('G1_DESCRIPTION_TOO_LONG', () => {
  it('passes at exactly 155 characters and fails at 156', () => {
    expect(codesAfter((g) => (g.draft.description.text = 'x'.repeat(155)))).toEqual([]);
    expect(codesAfter((g) => (g.draft.description.text = 'x'.repeat(156)))).toEqual(['G1_DESCRIPTION_TOO_LONG']);
  });

  it('counts characters, not bytes', () => {
    expect(codesAfter((g) => (g.draft.description.text = '\u00E9'.repeat(155)))).toEqual([]);
    expect(codesAfter((g) => (g.draft.description.text = '\u00E9'.repeat(156)))).toEqual(['G1_DESCRIPTION_TOO_LONG']);
  });

  it('reads the limit from the config', () => {
    const ctx = defaultContext({ config: { descriptionMax: 100 } });
    expect(codesAfter(() => {}, ctx)).toEqual(['G1_DESCRIPTION_TOO_LONG']);
  });

  it('puts the length and the limit in the message', () => {
    const out = checkG1(mutate(cloneGolden(), (g) => (g.draft.description.text = 'x'.repeat(200))), defaultContext());
    expect(out.failures[0]?.message).toContain('200');
    expect(out.failures[0]?.message).toContain('155');
    expect(out.failures[0]?.where).toBe('description');
  });
});

describe('G1_BAD_DATE', () => {
  it.each(['2026-02-30', '2026-13-01', '2026-00-10', '2026-10-00', '2026-8-4', '24 August 2026', '2026', '', '2026-10-04T00:00:00Z', ' 2026-10-04'])(
    'fails for %j',
    (publishedAt) => {
      expect(codesAfter((g) => (g.draft.publishedAt = publishedAt))).toEqual(['G1_BAD_DATE']);
    },
  );

  it.each(['2026-10-04', '2026-02-28', '2028-02-29', '2026-12-31'])('passes for %j', (publishedAt) => {
    expect(codesAfter((g) => (g.draft.publishedAt = publishedAt))).toEqual([]);
  });
});

describe('G1_SLUG_FORMAT', () => {
  it.each(['Has-Capital', 'has space', 'under_score', '-leading', 'trailing-', 'double--hyphen', '', 'caf\u00E9', 'dot.dot'])(
    'fails for %j',
    (slug) => {
      expect(codesAfter((g) => (g.draft.slug = slug))).toEqual(['G1_SLUG_FORMAT']);
    },
  );

  it.each(['a', 'fx-1', '2026-plan', 'fixture-robotics-ships-fx-1-to-second-plant'])('passes for %j', (slug) => {
    expect(codesAfter((g) => (g.draft.slug = slug))).toEqual([]);
  });
});

describe('G1_CATEGORY_COUNT', () => {
  it('fails for no categories', () => {
    expect(codesAfter((g) => (g.draft.categories = []))).toEqual(['G1_CATEGORY_COUNT']);
  });

  it('fails for four categories', () => {
    expect(codesAfter((g) => (g.draft.categories = ['humanoids', 'home-consumer', 'field-mobility', 'funding']))).toEqual([
      'G1_CATEGORY_COUNT',
    ]);
  });

  it('fails for a duplicated category', () => {
    expect(codesAfter((g) => (g.draft.categories = ['humanoids', 'humanoids']))).toEqual(['G1_CATEGORY_COUNT']);
  });

  it.each([
    [['humanoids']],
    [['humanoids', 'funding']],
    [['humanoids', 'field-mobility', 'funding']],
  ])('passes for %j', (categories) => {
    expect(codesAfter((g) => (g.draft.categories = categories))).toEqual([]);
  });
});

describe('G1_CATEGORY_UNKNOWN', () => {
  it('fails once for each category outside the vocabulary and names it', () => {
    const out = checkG1(mutate(cloneGolden(), (g) => (g.draft.categories = ['humanoids', 'robots', 'Funding'])), defaultContext());
    expect(out.failures.map((failure) => failure.code)).toEqual(['G1_CATEGORY_UNKNOWN', 'G1_CATEGORY_UNKNOWN']);
    expect(out.failures[0]?.message).toContain('robots');
    expect(out.failures[1]?.message).toContain('Funding');
  });

  it('does not also complain about a missing beat when the only category is unknown', () => {
    expect(codesAfter((g) => (g.draft.categories = ['robots']))).toEqual(['G1_CATEGORY_UNKNOWN']);
  });
});

describe('G1_CATEGORY_NO_BEAT', () => {
  it('fails when funding is the only category', () => {
    expect(codesAfter((g) => (g.draft.categories = ['funding']))).toEqual(['G1_CATEGORY_NO_BEAT']);
  });

  it('fails when funding sits beside an unknown category, because there is still no beat', () => {
    expect(codesAfter((g) => (g.draft.categories = ['funding', 'robots']))).toEqual([
      'G1_CATEGORY_UNKNOWN',
      'G1_CATEGORY_NO_BEAT',
    ]);
  });

  it('passes when a beat comes with funding', () => {
    expect(codesAfter((g) => (g.draft.categories = ['funding', 'policy-standards']))).toEqual([]);
  });
});

describe('G1_AUTHOR_MISSING', () => {
  it.each(['', '   '])('fails for the author name %j', (name) => {
    expect(codesAfter((g) => (g.draft.author.name = name))).toEqual(['G1_AUTHOR_MISSING']);
  });

  it('fails when the author is missing altogether', () => {
    expect(codesAfter((g) => ((g.draft as { author?: unknown }).author = undefined))).toEqual(['G1_AUTHOR_MISSING']);
  });
});

describe('G1_AUTHOR_NOT_DESK', () => {
  it.each(['Jane Doe', 'Robywire', 'robywire desk', 'Robywire  Desk', 'Robywire Desk ', ' Robywire Desk', 'Robywire Desk.'])(
    'fails for the author name %j, and says what it must be',
    (name) => {
      const out = checkG1(mutate(cloneGolden(), (g) => (g.draft.author.name = name)), defaultContext());
      expect(out.failures).toEqual([
        {
          check: 'G1',
          code: 'G1_AUTHOR_NOT_DESK',
          message: `the author is "${name}", but every piece is written by the Desk: the author must be "Robywire Desk"`,
          where: 'author',
        },
      ]);
    },
  );

  it('passes for the Desk', () => {
    expect(codesAfter((g) => (g.draft.author.name = DESK_AUTHOR_NAME))).toEqual([]);
  });

  it('is not also reported for a blank name, which is the missing author', () => {
    expect(codesAfter((g) => (g.draft.author.name = ''))).toEqual(['G1_AUTHOR_MISSING']);
    expect(codesAfter((g) => (g.draft.author.name = '  '))).toEqual(['G1_AUTHOR_MISSING']);
    expect(codesAfter((g) => ((g.draft as { author?: unknown }).author = undefined))).toEqual(['G1_AUTHOR_MISSING']);
  });
});

describe('G1: several problems at once', () => {
  it('reports every one, so a single revision round can fix them all', () => {
    const codes = codesAfter((g) => {
      g.draft.title.text = '';
      g.draft.description.text = 'x'.repeat(300);
      g.draft.publishedAt = 'yesterday';
      g.draft.slug = 'Bad Slug';
      g.draft.categories = [];
      g.draft.author.name = 'Jane Doe';
    });
    expect(codes).toEqual([
      'G1_TITLE_EMPTY',
      'G1_DESCRIPTION_TOO_LONG',
      'G1_BAD_DATE',
      'G1_SLUG_FORMAT',
      'G1_CATEGORY_COUNT',
      'G1_AUTHOR_NOT_DESK',
    ]);
  });
});
