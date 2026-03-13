export interface LiveAssistConfig {
  asrUrl: string;
  agentUrl: string;
  backendUrl?: string;
  deviceId?: string;
  agentId?: string;
  llmApiKey?: string;
  llmProvider?: "gemini" | "anthropic" | "local";
  audioWorkletUrl?: string;
}

let _deviceId: string | undefined;

export function resolveDeviceId(config: LiveAssistConfig): string {
  if (config.deviceId) return config.deviceId;
  if (_deviceId) return _deviceId;
  _deviceId = "sdk_" + Math.random().toString(36).slice(2, 12) + "_" + Date.now();
  return _deviceId;
}
