/**
 * Verification feature.
 *
 * A blue verified tick can be granted by the official developer account
 * (@PhotoSocialOfficial). Only that account may toggle verification on any
 * profile (enforced in the client by hiding the button and in Firestore
 * rules by checking the writer's `isOfficial` flag).
 */

// The official account's unique username. Anyone whose profile username
// matches this (case-insensitively) is treated as the official developer.
export const OFFICIAL_USERNAME = "photosocialofficial";

/**
 * Whether a profile belongs to the official developer account.
 * Matches on the reserved username or the `isOfficial` flag (set once in the
 * Firebase console for bootstrap).
 * @param {{ username?: string, isOfficial?: boolean } | null | undefined} profile
 * @returns {boolean}
 */
export function isOfficialAccount(profile) {
  if (!profile) return false;
  if (profile.isOfficial === true) return true;
  return (profile.username || "").toString().trim().toLowerCase() === OFFICIAL_USERNAME;
}

/**
 * Whether a profile should display the blue verified tick. The official
 * developer account is always verified; everyone else only when the tick has
 * been granted by the official account.
 * @param {{ username?: string, isOfficial?: boolean, isVerified?: boolean } | null | undefined} profile
 * @returns {boolean}
 */
export function isVerified(profile) {
  return Boolean(profile?.isVerified) || isOfficialAccount(profile);
}
