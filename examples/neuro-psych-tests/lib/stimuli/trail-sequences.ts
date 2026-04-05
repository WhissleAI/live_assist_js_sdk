export const TMT_A_SEQUENCE = Array.from({ length: 25 }, (_, i) => String(i + 1));

const letters = "ABCDEFGHIJKLM";
export const TMT_B_SEQUENCE: string[] = [];
for (let i = 0; i < 13; i++) {
  TMT_B_SEQUENCE.push(String(i + 1));
  TMT_B_SEQUENCE.push(letters[i]);
}
