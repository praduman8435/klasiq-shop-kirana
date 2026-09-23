import { randomInt } from "node:crypto";

/**
 * Crockford-ish alphabet with 0/O/1/I/L removed — shared by every
 * human-read-aloud identifier in this app (order numbers, customer IDs).
 * Removing these pairs means a digit can never be confused with a letter
 * (no 0 to confuse with O, no 1 to confuse with I or L), so a shop
 * assistant reading a code back over the phone never has to guess.
 */
export const UNAMBIGUOUS_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

export function generateUnambiguousCode(length: number): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += UNAMBIGUOUS_ALPHABET[randomInt(UNAMBIGUOUS_ALPHABET.length)];
  }
  return code;
}
