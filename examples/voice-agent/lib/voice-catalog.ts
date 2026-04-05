export interface VoiceEntry {
  id: string;
  name: string;
  description: string;
  gender: "male" | "female" | "neutral";
  accent: string;
  tags: string[];
}

export const DEFAULT_VOICE_ID = "cbaf8084-f009-4838-a096-07ee2e6612b1";

export const VOICE_CATALOG: VoiceEntry[] = [
  {
    id: "cbaf8084-f009-4838-a096-07ee2e6612b1",
    name: "Maya",
    description: "Warm and expressive, great for empathetic conversations",
    gender: "female",
    accent: "American",
    tags: ["warm", "expressive", "empathetic"],
  },
  {
    id: "a0e99841-438c-4a64-b679-ae501e7d6091",
    name: "Barbershop Man",
    description: "Deep and professional, ideal for authoritative roles",
    gender: "male",
    accent: "American",
    tags: ["deep", "professional", "authoritative"],
  },
  {
    id: "79a125e8-cd45-4c13-8a67-188112f4dd22",
    name: "British Lady",
    description: "Polished and refined British accent",
    gender: "female",
    accent: "British",
    tags: ["polished", "refined", "british"],
  },
  {
    id: "5ee9feff-1265-424a-9d7f-8e4d431a12c7",
    name: "Ronald",
    description: "Intense and deep, great for casual confident conversations",
    gender: "male",
    accent: "American",
    tags: ["confident", "deep", "professional"],
  },
  {
    id: "79f8b5fb-2cc8-479a-80df-29f7a7cf1a3e",
    name: "Theo",
    description: "Steady and confident narrator voice",
    gender: "male",
    accent: "American",
    tags: ["narrator", "steady", "engaging"],
  },
  {
    id: "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
    name: "Jacqueline",
    description: "Reassuring and empathic, perfect for healthcare or support",
    gender: "female",
    accent: "American",
    tags: ["calm", "reassuring", "empathic"],
  },
  {
    id: "638efaaa-4d0c-442e-b701-3fae16aad012",
    name: "Southern Gentleman",
    description: "Warm Southern American accent, approachable and trustworthy",
    gender: "male",
    accent: "Southern American",
    tags: ["warm", "trustworthy", "southern"],
  },
  {
    id: "41534e16-2966-4c6b-9670-111411def906",
    name: "Young Professional",
    description: "Energetic young female voice for modern brands",
    gender: "female",
    accent: "American",
    tags: ["energetic", "modern", "youthful"],
  },
  {
    id: "f786b574-daa5-4673-aa0c-cbe3e8534c02",
    name: "Katie",
    description: "Stable and realistic, great for professional narration",
    gender: "female",
    accent: "American",
    tags: ["stable", "realistic", "professional"],
  },
  {
    id: "c961b81c-a935-4c17-bfb3-ba2239de8c2f",
    name: "Kyle",
    description: "Emotive and natural, excellent for dynamic conversations",
    gender: "male",
    accent: "American",
    tags: ["emotive", "natural", "dynamic"],
  },
];

const VOICE_ID_SET = new Set(VOICE_CATALOG.map((v) => v.id));

export function isValidVoiceId(id: string): boolean {
  return VOICE_ID_SET.has(id);
}

export function resolveVoiceId(id: string | undefined): string {
  if (id && VOICE_ID_SET.has(id)) return id;
  return DEFAULT_VOICE_ID;
}
