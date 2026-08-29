import { describe, expect, it } from '@jest/globals';
import { version, greet } from '../src';

describe('Kraken Foundation', () => {
  it('should have a version', () => {
    expect(version).toBe('0.1.0');
  });

  it('should greet', () => {
    expect(greet()).toBe('Hello, Kraken');
  });
});
