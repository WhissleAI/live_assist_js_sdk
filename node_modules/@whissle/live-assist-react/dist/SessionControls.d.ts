import type { AgendaItem } from "@whissle/live-assist-core";
export declare function SessionControls({ isCapturing, onStart, onStop, onAgendaChange, hasTabAudio, instructions, onInstructionsSave, }: {
    isCapturing: boolean;
    onStart: (opts?: {
        includeTab?: boolean;
        agenda?: AgendaItem[];
        instructions?: string;
        recordAudio?: boolean;
    }) => void;
    onStop: () => void;
    onAgendaChange?: (items: AgendaItem[]) => void;
    hasTabAudio?: boolean;
    instructions?: string;
    onInstructionsSave?: (s: string) => void;
}): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=SessionControls.d.ts.map