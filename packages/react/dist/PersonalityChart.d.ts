import type { BehavioralProfile } from "@whissle/live-assist-core";
export declare function getProfileSegments(profile: BehavioralProfile): {
    key: "HAPPY" | "SAD" | "ANGRY" | "NEUTRAL" | "FEAR" | "SURPRISE" | "DISGUST";
    value: number;
}[];
export declare function EmotionDonut({ segments, size, centerEmoji }: {
    segments: Array<{
        key: string;
        value: number;
    }>;
    size?: number;
    centerEmoji?: boolean;
}): any;
/**
 * Vertical profile card — donut fills available width, stats below.
 * Designed for sidebar placement (150–200px wide).
 */
export declare function InlineProfileChart({ profile, size }: {
    profile: BehavioralProfile;
    size?: number;
}): any;
//# sourceMappingURL=PersonalityChart.d.ts.map