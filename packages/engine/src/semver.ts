/**
 * Semantic version bump logic for SOP versions.
 * Format: vMAJOR.MINOR (e.g., v1.0, v1.1, v2.0)
 *
 * Rules:
 * - First version is always v1.0
 * - Minor bump: small changes, additions, clarifications
 * - Major bump: significant restructuring, scope changes, breaking changes
 */

export interface SemverParts {
  major: number;
  minor: number;
}

/**
 * Parse a semver string into parts
 */
export function parseSemver(version: string): SemverParts {
  const match = version.match(/^v(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`Invalid semver format: ${version}. Expected vMAJOR.MINOR`);
  }
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
  };
}

/**
 * Format semver parts into string
 */
export function formatSemver(parts: SemverParts): string {
  return `v${parts.major}.${parts.minor}`;
}

/**
 * Bump minor version
 */
export function bumpMinor(version: string): string {
  const parts = parseSemver(version);
  return formatSemver({ major: parts.major, minor: parts.minor + 1 });
}

/**
 * Bump major version (resets minor to 0)
 */
export function bumpMajor(version: string): string {
  const parts = parseSemver(version);
  return formatSemver({ major: parts.major + 1, minor: 0 });
}

/**
 * Get initial version
 */
export function initialVersion(): string {
  return 'v1.0';
}

/**
 * Compare semvers: returns -1, 0, or 1
 */
export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);

  if (pa.major !== pb.major) return pa.major < pb.major ? -1 : 1;
  if (pa.minor !== pb.minor) return pa.minor < pb.minor ? -1 : 1;
  return 0;
}

/**
 * Determine bump type from change analysis.
 * Returns 'major' if there are significant structural changes,
 * 'minor' otherwise.
 */
export function determineBumpType(changes: {
  stepsChanged: number;
  stepsTotal: number;
  scopeChanged: boolean;
  purposeChanged: boolean;
  rolesChanged: boolean;
}): 'major' | 'minor' {
  // Major if scope/purpose/roles changed or >50% steps changed
  if (changes.scopeChanged || changes.purposeChanged || changes.rolesChanged) {
    return 'major';
  }
  if (changes.stepsTotal > 0 && changes.stepsChanged / changes.stepsTotal > 0.5) {
    return 'major';
  }
  return 'minor';
}
