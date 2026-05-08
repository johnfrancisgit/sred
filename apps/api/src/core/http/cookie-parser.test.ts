import { describe, expect, it } from 'vitest';
import { parseCookieHeader } from './cookie-parser.js';

describe('parseCookieHeader', () => {
  it('returns {} for an empty / missing header', () => {
    expect(parseCookieHeader('')).toEqual({});
    expect(parseCookieHeader(undefined)).toEqual({});
    expect(parseCookieHeader(null)).toEqual({});
  });

  it('parses a single cookie', () => {
    expect(parseCookieHeader('session=abc123')).toEqual({ session: 'abc123' });
  });

  it('parses multiple cookies separated by semicolons', () => {
    expect(parseCookieHeader('a=1; b=2; c=3')).toEqual({ a: '1', b: '2', c: '3' });
  });

  it('trims leading/trailing whitespace around names and values', () => {
    expect(parseCookieHeader('  a = 1 ;  b =  2 ')).toEqual({ a: '1', b: '2' });
  });

  it('ignores entries with no name (orphan separators, leading semicolons)', () => {
    expect(parseCookieHeader(';;a=1;')).toEqual({ a: '1' });
  });

  it('keeps the last value when a cookie name appears more than once', () => {
    expect(parseCookieHeader('a=1; a=2')).toEqual({ a: '2' });
  });
});
