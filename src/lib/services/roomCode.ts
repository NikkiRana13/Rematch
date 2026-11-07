import { randomInt } from "node:crypto";

// No 0/O/1/I/L to avoid confusion when read aloud or copied from a board.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateRoomCode(taken: Set<string> = new Set(), length = 6): string {
  for (let i = 0; i < 100; i++) {
    let code = "";
    for (let j = 0; j < length; j++) code += ALPHABET[randomInt(ALPHABET.length)];
    if (!taken.has(code)) return code;
  }
  throw new Error("Could not generate a unique room code");
}

export function normalizeRoomCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
