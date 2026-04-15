/**
 * Stable device ID for identifying this browser across sessions.
 * Shared with lulu.whissle.ai so memories persist across apps.
 */

const STORAGE_KEY = "whissle_device_id";

function generateId(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function getDeviceId(): string {
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = `device_${generateId()}`;
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}
