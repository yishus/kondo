// 32 symbols gives 40 random bits without ambiguous 0/o or 1/l pairs.
export const TRIP_CODE_ALPHABET = "23456789abcdefghijkmnpqrstuvwxyz";

export function newTripCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)),
    (byte) => TRIP_CODE_ALPHABET[byte & 31]).join("");
}
