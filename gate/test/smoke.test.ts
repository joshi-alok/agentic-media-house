import { describe, expect, it } from 'vitest';
import * as entry from '../src/index';

describe('@robywire/gate entry point', () => {
  it('exports its own package name', () => {
    expect(entry.GATE_PACKAGE).toBe('@robywire/gate');
  });

  it('resolves through the workspace link by package name', async () => {
    const linked = await import('@robywire/gate');
    expect(linked.GATE_PACKAGE).toBe('@robywire/gate');
  });
});
