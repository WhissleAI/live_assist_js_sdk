/** Default agenda items that work with the default instructions. User can edit. */
export const DEFAULT_AGENDA_TITLES = [
    "Identify key pain points or needs",
    "Present solution or options",
    "Discuss next steps or agreements",
    "Confirm action items",
];
const AGENDA_STORAGE_KEY = "whissle_live_assist_agenda";
function makeItem(title) {
    return {
        id: `agenda_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        title,
        status: "pending",
        confidence: 0,
    };
}
export function getDefaultAgendaItems() {
    return DEFAULT_AGENDA_TITLES.map((t) => makeItem(t));
}
export function getStoredAgenda() {
    if (typeof window === "undefined")
        return [];
    try {
        const raw = localStorage.getItem(AGENDA_STORAGE_KEY);
        if (!raw)
            return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr.map((a) => ({ ...a, id: a.id || `agenda_${Date.now()}` })) : [];
    }
    catch {
        return [];
    }
}
export function setStoredAgenda(items) {
    if (typeof window === "undefined")
        return;
    try {
        localStorage.setItem(AGENDA_STORAGE_KEY, JSON.stringify(items));
    }
    catch { }
}
//# sourceMappingURL=agendaDefaults.js.map