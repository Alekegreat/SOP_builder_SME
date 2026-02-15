import { describe, it, expect } from 'vitest';
import {
  parseSemver,
  formatSemver,
  bumpMinor,
  bumpMajor,
  initialVersion,
  compareSemver,
  determineBumpType,
} from '@sop/engine';

describe('Semver', () => {
  describe('parseSemver', () => {
    it('parses v1.0', () => {
      const result = parseSemver('v1.0');
      expect(result).toEqual({ major: 1, minor: 0 });
    });

    it('parses v2.5', () => {
      const result = parseSemver('v2.5');
      expect(result).toEqual({ major: 2, minor: 5 });
    });

    it('throws on invalid format', () => {
      expect(() => parseSemver('1.0')).toThrow();
      expect(() => parseSemver('v1')).toThrow();
      expect(() => parseSemver('v1.0.0')).toThrow();
    });
  });

  describe('formatSemver', () => {
    it('formats to vMAJOR.MINOR', () => {
      expect(formatSemver({ major: 1, minor: 0 })).toBe('v1.0');
      expect(formatSemver({ major: 3, minor: 7 })).toBe('v3.7');
    });
  });

  describe('bumpMinor', () => {
    it('increments minor version', () => {
      expect(bumpMinor('v1.0')).toBe('v1.1');
      expect(bumpMinor('v2.5')).toBe('v2.6');
    });
  });

  describe('bumpMajor', () => {
    it('increments major and resets minor', () => {
      expect(bumpMajor('v1.5')).toBe('v2.0');
    });
  });

  describe('initialVersion', () => {
    it('returns v1.0', () => {
      expect(initialVersion()).toBe('v1.0');
    });
  });

  describe('compareSemver', () => {
    it('compares versions correctly', () => {
      expect(compareSemver('v1.0', 'v1.1')).toBeLessThan(0);
      expect(compareSemver('v2.0', 'v1.5')).toBeGreaterThan(0);
      expect(compareSemver('v1.0', 'v1.0')).toBe(0);
    });
  });

  describe('determineBumpType', () => {
    it('returns major for scope changes', () => {
      expect(determineBumpType({ scopeChanged: true, purposeChanged: false, rolesChanged: false, stepsChanged: 0, stepsTotal: 10 })).toBe('major');
    });

    it('returns major for purpose changes', () => {
      expect(determineBumpType({ scopeChanged: false, purposeChanged: true, rolesChanged: false, stepsChanged: 0, stepsTotal: 10 })).toBe('major');
    });

    it('returns major for >50% step changes', () => {
      expect(determineBumpType({ scopeChanged: false, purposeChanged: false, rolesChanged: false, stepsChanged: 6, stepsTotal: 10 })).toBe('major');
    });

    it('returns minor for small changes', () => {
      expect(determineBumpType({ scopeChanged: false, purposeChanged: false, rolesChanged: false, stepsChanged: 1, stepsTotal: 10 })).toBe('minor');
    });
  });
});
