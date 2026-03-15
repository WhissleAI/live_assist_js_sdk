import type { TranscriptEntry } from "@whissle/live-assist-core";
export interface TranscriptViewProps {
    entries: TranscriptEntry[];
    maxHeight?: number;
    showTimeline?: boolean;
    durationSec?: number;
    currentTimeSec?: number;
    onSeek?: (sec: number) => void;
}
export declare function TranscriptView({ entries, maxHeight, showTimeline, durationSec, currentTimeSec, onSeek, }: TranscriptViewProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=TranscriptView.d.ts.map