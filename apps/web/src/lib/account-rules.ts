/**
 * What makes a username and a password acceptable — shared, so the form can
 * say what is wrong as the person types and the server enforces the same.
 */

/** Lowercase letters and digits, and `. _ -` after the first; 3 to 30 long. */
export const USERNAME = /^[a-z0-9][a-z0-9_.-]{2,29}$/;
const PASSWORD_MAX = 200;

/** A username as typed, in the one form it is stored under: capitals never matter. */
export const normalizeUsername = (raw: string) => raw.trim().toLowerCase();

export const USERNAME_RULE = "Use 3 to 30 letters or numbers. After the first, . _ and - are allowed too.";

/**
 * What is wrong with a new password, if anything. Any letters, digits or
 * symbols in any script are fine and so is any length; only what cannot be
 * typed back reliably is refused: spaces (a phone's keyboard adds and drops
 * them unseen) and invisible control characters.
 */
export function passwordProblem(password: string): string | null {
  if (/\s/u.test(password)) return "Leave out spaces.";
  if (/\p{Cc}/u.test(password)) return "Use only characters you can type.";
  if (password.length > PASSWORD_MAX) return "That password is too long.";
  return null;
}
