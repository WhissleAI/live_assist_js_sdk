let _deviceId;
export function resolveDeviceId(config) {
    if (config.deviceId)
        return config.deviceId;
    if (_deviceId)
        return _deviceId;
    _deviceId = "sdk_" + Math.random().toString(36).slice(2, 12) + "_" + Date.now();
    return _deviceId;
}
//# sourceMappingURL=config.js.map