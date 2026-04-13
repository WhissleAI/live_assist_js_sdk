import type { TranscriptEntry } from "@whissle/live-assist-core";
export interface TranscriptViewProps {
    entries: TranscriptEntry[];
    maxHeight?: number;
    showTimeline?: boolean;
    durationSec?: number;
    currentTimeSec?: number;
    onSeek?: (sec: number) => void;
}
export declare function TranscriptView({ entries, maxHeight, showTimeline, durationSec, currentTimeSec, onSeek, }: TranscriptViewProps): any;
export declare function EmotionTimelineBar({ entries, durationSec, currentTimeSec, onSeek, height, amplitudes, amplitudeIntervalSec, }: {
    entries: TranscriptEntry[];
    durationSec: number;
    currentTimeSec?: number;
    onSeek?: (sec: number) => void;
    height?: number;
    amplitudes?: number[];
    amplitudeIntervalSec?: number;
}): any;
/** Keyword bag: collects extracted entities as tags for a channel */
export declare function KeywordBag({ entries, label }: {
    entries: TranscriptEntry[];
    label: string;
}): any;
//# sourceMappingURL=TranscriptView.d.ts.map