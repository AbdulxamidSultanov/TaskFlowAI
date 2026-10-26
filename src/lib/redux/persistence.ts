/**
 * The app uses sessionStorage instead of localStorage on purpose:
 * the saved Redux state survives page reloads in the current tab and is
 * removed by the browser when that tab/window is closed.
 */
export const REDUX_STORAGE_KEY = "taskflowai:redux-state";
const STORAGE_VERSION = 1;
const SAVE_DELAY_MS = 180;
// After an explicit clear (logout) ignore any in-flight follow-up actions so
// the snapshot is not recreated a few milliseconds later. Real user actions
// after this short guard window are persisted normally.
const CLEAR_SAVE_GUARD_MS = 1000;

const pendingSaveCancels = new Set<() => void>();
let persistBlockedUntil = 0;

type PersistedEnvelope = {
    version: number;
    savedAt: number;
    state: unknown;
};

type PersistableStore = {
    getState: () => unknown;
    subscribe: (listener: () => void) => () => void;
};

export function loadPersistedState<T>(): T | undefined {
    if (typeof window === "undefined") return undefined;

    try {
        const raw = window.sessionStorage.getItem(REDUX_STORAGE_KEY);
        if (!raw) return undefined;

        const parsed = JSON.parse(raw) as Partial<PersistedEnvelope>;
        if (
            parsed.version !== STORAGE_VERSION ||
            !parsed.state ||
            typeof parsed.state !== "object"
        ) {
            window.sessionStorage.removeItem(REDUX_STORAGE_KEY);
            return undefined;
        }

        return parsed.state as T;
    } catch {
        // Corrupted or unavailable storage must never break the app.
        return undefined;
    }
}

export function persistState(state: unknown) {
    if (typeof window === "undefined") return;
    if (Date.now() < persistBlockedUntil) return;

    const envelope: PersistedEnvelope = {
        version: STORAGE_VERSION,
        savedAt: Date.now(),
        state,
    };

    try {
        window.sessionStorage.setItem(
            REDUX_STORAGE_KEY,
            JSON.stringify(envelope),
        );
    } catch (error) {
        // sessionStorage has a small quota (often around 5 MB). If an API
        // response is too large, drop the cached snapshot instead of making
        // every future store update fail.
        try {
            window.sessionStorage.removeItem(REDUX_STORAGE_KEY);
        } catch {
            // Ignore a second storage failure (private mode, disabled storage).
        }

        if (process.env.NODE_ENV !== "production") {
            console.warn(
                "TaskFlowAI: unable to persist Redux state in sessionStorage.",
                error,
            );
        }
    }
}

export function clearPersistedState() {
    if (typeof window === "undefined") return;

    // A logout/reset action schedules a debounced save. Cancel it so the
    // snapshot is not immediately recreated right after it was removed.
    for (const cancel of pendingSaveCancels) cancel();
    persistBlockedUntil = Date.now() + CLEAR_SAVE_GUARD_MS;

    try {
        window.sessionStorage.removeItem(REDUX_STORAGE_KEY);
    } catch {
        // Ignore storage failures.
    }
}

/**
 * Saves Redux state after actions are dispatched and flushes immediately when
 * the page is being hidden/unloaded. Returns an unsubscribe/cleanup function.
 */
export function startStatePersistence(store: PersistableStore) {
    if (typeof window === "undefined") return () => {};

    let timer: ReturnType<typeof setTimeout> | undefined;

    const cancelPendingSave = () => {
        if (timer) {
            clearTimeout(timer);
            timer = undefined;
        }
    };

    const flush = () => {
        cancelPendingSave();
        persistState(store.getState());
    };

    pendingSaveCancels.add(cancelPendingSave);

    const unsubscribe = store.subscribe(() => {
        cancelPendingSave();
        timer = setTimeout(flush, SAVE_DELAY_MS);
    });

    window.addEventListener("pagehide", flush);

    return () => {
        pendingSaveCancels.delete(cancelPendingSave);
        window.removeEventListener("pagehide", flush);
        cancelPendingSave();
        unsubscribe();
    };
}
