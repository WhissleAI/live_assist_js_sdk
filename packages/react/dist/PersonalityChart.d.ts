import type { BehavioralProfile } from "@whissle/live-assist-core";
export declare function getProfileSegments(profile: BehavioralProfile): {
    key: "NEUTRAL" | "HAPPY" | "SAD" | "ANGRY" | "FEAR" | "SURPRISE" | "DISGUST";
    value: number;
}[];
export declare function EmotionDonut({ segments, size, centerEmoji }: {
    segments: Array<{
        key: string;
        value: number;
    }>;
    size?: number;
    centerEmoji?: boolean;
}): import("react/jsx-runtime").JSX.Element;
export declare function InlineProfileChart({ profile, size }: {
    profile: BehavioralProfile;
    size?: number;
}): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=PersonalityChart.d.ts.map