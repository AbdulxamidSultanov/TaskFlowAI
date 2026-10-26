import {
    combineReducers,
    configureStore,
    type AnyAction,
    type UnknownAction,
} from "@reduxjs/toolkit";
import {setupListeners} from "@reduxjs/toolkit/query";

import {taskflowApi} from "./api";
import {loadPersistedState, startStatePersistence} from "./persistence";
import {workspaceReducer} from "./workspace-slice";

const HYDRATE_ACTION = "taskflow/hydrate";

const appReducer = combineReducers({
    [taskflowApi.reducerPath]: taskflowApi.reducer,
    workspace: workspaceReducer,
});

export type RootState = ReturnType<typeof appReducer>;

/**
 * Restores only the small UI state that should survive a reload. The RTK
 * Query cache is intentionally not persisted: stale snapshots made counters
 * and lists show old data after a reload (sometimes indefinitely, because a
 * hydrated query is already considered "cached"). API data is always fetched
 * fresh from the server instead.
 */
function rootReducer(
    state: RootState | undefined,
    action: AnyAction | UnknownAction,
): RootState {
    if (action.type === HYDRATE_ACTION) {
        const base = state ?? appReducer(undefined, {type: "@@INIT"});
        const persisted = (action.payload ?? {}) as Partial<RootState>;
        return {
            ...base,
            workspace: persisted.workspace ?? base.workspace,
        };
    }
    return appReducer(state, action as UnknownAction);
}

function buildStore() {
    return configureStore({
        reducer: rootReducer,
        middleware: (getDefaultMiddleware) =>
            getDefaultMiddleware().concat(taskflowApi.middleware),
        devTools: process.env.NODE_ENV !== "production",
    });
}

export type AppStore = ReturnType<typeof buildStore>;
export type AppDispatch = AppStore["dispatch"];

let clientStore: AppStore | undefined;
const hydratedStores = new WeakSet<AppStore>();

/**
 * Creates a fresh store. The client Provider keeps one store per tab and
 * restores the previous tab state after hydration via `hydrateStore`.
 */
export function makeStore(): AppStore {
    // StrictMode can invoke the provider initializer twice in development;
    // reuse one browser store instead of creating duplicate subscriptions.
    if (typeof window !== "undefined" && clientStore) return clientStore;

    const store = buildStore();

    if (typeof window !== "undefined") {
        clientStore = store;
        setupListeners(store.dispatch);

        if (process.env.NODE_ENV !== "production") {
            // Dev-only access for debugging from the browser console.
            const debugWindow = window as typeof window & {
                __TASKFLOW_STORE__?: AppStore;
                __TASKFLOW_API__?: typeof taskflowApi;
            };
            debugWindow.__TASKFLOW_STORE__ = store;
            debugWindow.__TASKFLOW_API__ = taskflowApi;
        }
    }

    return store;
}

/**
 * Restores the sessionStorage snapshot once the app is mounted. Persistence
 * starts only afterwards, so the empty initial state cannot overwrite the
 * snapshot before it has been applied.
 */
export function hydrateStore(store: AppStore) {
    if (typeof window === "undefined" || hydratedStores.has(store)) return;
    hydratedStores.add(store);

    const persisted = loadPersistedState<RootState>();

    if (persisted) {
        store.dispatch({type: HYDRATE_ACTION, payload: persisted});
    }

    startStatePersistence(store, (state) => {
        const {workspace} = state as RootState;
        return {workspace};
    });
}
