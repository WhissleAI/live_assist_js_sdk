export interface LiveAssistConfig {
    asrUrl: string;
    agentUrl: string;
    backendUrl?: string;
    deviceId?: string;
    llmApiKey?: string;
    llmProvider?: "gemini" | "anthropic" | "local";
    audioWorkletUrl?: string;
}
export declare function resolveDeviceId(config: LiveAssistConfig): string;
//# sourceMappingURL=config.d.ts.map