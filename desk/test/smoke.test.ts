import { describe, expect, it } from 'vitest';
import { GATE_PACKAGE } from '@robywire/gate';
import * as entry from '../src/index';

describe('@robywire/desk entry point', () => {
  it('exports its own package name', () => {
    expect(entry.DESK_PACKAGE).toBe('@robywire/desk');
  });

  it('resolves through the workspace link by package name', async () => {
    const linked = await import('@robywire/desk');
    expect(linked.DESK_PACKAGE).toBe('@robywire/desk');
  });

  it('reaches the gate through its workspace dependency', () => {
    expect(GATE_PACKAGE).toBe('@robywire/gate');
  });
});
