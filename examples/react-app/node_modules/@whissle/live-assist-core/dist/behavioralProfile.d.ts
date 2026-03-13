export declare const EMOTION_KEYS: readonly ["NEUTRAL", "HAPPY", "SAD", "ANGRY", "FEAR", "SURPRISE", "DISGUST"];
export type Channel = "microphone" | "system";
export interface BehavioralProfile {
    emotionProfile: Record<string, number>;
    intentProfile: Record<string, number>;
    segmentCount: number;
}
export declare function createBehavioralProfileManager(initialUser?: BehavioralProfile): {
    update: (channel: Channel, emotionProbs: Array<{
        token: string;
        probability: number;
    }>, intentProbs: Array<{
        token: string;
        probability: number;
    }>) => void;
    getProfiles: () => {
        user: BehavioralProfile;
        other: BehavioralProfile;
    };
    getSessionUserProfile: () => BehavioralProfile;
    reset: () => void;
};
export declare const EMOTION_EMOJI: Record<string, string>;
export declare const EMOTION_COLORS: Record<string, string>;
export declare function getDominantEmotion(profile: BehavioralProfile): string;
export declare function getMoodTag(profile: BehavioralProfile): string;
export declare function topIntents(profile: BehavioralProfile, n: number): string[];
export declare function intentDisplayLabel(key: string): string;
export declare function getToneDescription(profile: BehavioralProfile): string;
//# sourceMappingURL=behavioralProfile.d.ts.map