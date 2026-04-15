const STORAGE_KEY = "whissle_device_id";

export function getDeviceId(): string {
  if (typeof window === "undefined") return "browser";
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = "browser_" + Math.random().toString(36).slice(2, 12);
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}
