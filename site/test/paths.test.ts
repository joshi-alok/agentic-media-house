import { describe, expect, it } from 'vitest';
import { articlePath, cardPath, receiptsPath, topicPath } from '../src/lib/paths';

describe('route paths', () => {
  it('builds the article, receipts and card paths for a slug', () => {
    expect(articlePath('fixture-robotics-ships-fx-1')).toBe('/news/fixture-robotics-ships-fx-1/');
    expect(receiptsPath('fixture-robotics-ships-fx-1')).toBe('/news/fixture-robotics-ships-fx-1/receipts/');
    expect(cardPath('fixture-robotics-ships-fx-1')).toBe('/news/fixture-robotics-ships-fx-1/card.png');
  });

  it('builds the topic path for a beat or tag', () => {
    expect(topicPath('payments-commerce')).toBe('/topics/payments-commerce/');
    expect(topicPath('funding')).toBe('/topics/funding/');
  });

  it.each([[''], ['Has-Capitals'], ['has space'], ['../escape'], ['a/b'], ['-leading'], ['trailing-'], ['double--hyphen']])(
    'refuses the slug %j',
    (slug) => {
      expect(() => articlePath(slug)).toThrow(`not a slug: ${JSON.stringify(slug)}`);
      expect(() => receiptsPath(slug)).toThrow('not a slug');
      expect(() => cardPath(slug)).toThrow('not a slug');
    },
  );

  it('refuses a topic that is not in the vocabulary', () => {
    expect(() => topicPath('robots')).toThrow('not a beat or a tag: "robots"');
  });
});
