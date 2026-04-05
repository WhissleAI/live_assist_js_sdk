export interface DigitTrial {
  length: number;
  trial: number;
  sequence: number[];
}

export const DIGIT_SPAN_FORWARD: DigitTrial[] = [
  { length: 3, trial: 1, sequence: [5, 8, 2] },
  { length: 3, trial: 2, sequence: [6, 9, 4] },
  { length: 4, trial: 1, sequence: [6, 4, 3, 9] },
  { length: 4, trial: 2, sequence: [7, 2, 8, 6] },
  { length: 5, trial: 1, sequence: [4, 2, 7, 3, 1] },
  { length: 5, trial: 2, sequence: [7, 5, 8, 3, 6] },
  { length: 6, trial: 1, sequence: [6, 1, 9, 4, 7, 3] },
  { length: 6, trial: 2, sequence: [3, 9, 2, 4, 8, 7] },
  { length: 7, trial: 1, sequence: [5, 9, 1, 7, 4, 2, 8] },
  { length: 7, trial: 2, sequence: [4, 1, 7, 9, 3, 8, 6] },
  { length: 8, trial: 1, sequence: [5, 8, 1, 9, 2, 6, 4, 7] },
  { length: 8, trial: 2, sequence: [3, 8, 2, 9, 6, 1, 7, 4] },
  { length: 9, trial: 1, sequence: [2, 7, 5, 8, 6, 2, 5, 8, 4] },
  { length: 9, trial: 2, sequence: [7, 1, 3, 9, 4, 2, 5, 6, 8] },
];

export const DIGIT_SPAN_BACKWARD: DigitTrial[] = [
  { length: 2, trial: 1, sequence: [2, 4] },
  { length: 2, trial: 2, sequence: [5, 7] },
  { length: 3, trial: 1, sequence: [6, 2, 9] },
  { length: 3, trial: 2, sequence: [4, 1, 5] },
  { length: 4, trial: 1, sequence: [3, 2, 7, 9] },
  { length: 4, trial: 2, sequence: [4, 9, 6, 8] },
  { length: 5, trial: 1, sequence: [1, 5, 2, 8, 6] },
  { length: 5, trial: 2, sequence: [6, 1, 8, 4, 3] },
  { length: 6, trial: 1, sequence: [5, 3, 9, 4, 1, 8] },
  { length: 6, trial: 2, sequence: [7, 2, 4, 8, 5, 6] },
  { length: 7, trial: 1, sequence: [8, 1, 2, 9, 3, 6, 5] },
  { length: 7, trial: 2, sequence: [4, 7, 3, 9, 1, 2, 8] },
  { length: 8, trial: 1, sequence: [9, 4, 3, 7, 6, 2, 5, 8] },
  { length: 8, trial: 2, sequence: [7, 2, 8, 1, 9, 6, 5, 3] },
];
