import {createSlice, type PayloadAction} from "@reduxjs/toolkit";

type WorkspaceUiState = {
    activeWorkspaceId: string | null;
};

const initialState: WorkspaceUiState = {
    activeWorkspaceId: null,
};

const workspaceSlice = createSlice({
    name: "workspace",
    initialState,
    reducers: {
        setActiveWorkspace(state, action: PayloadAction<string>) {
            state.activeWorkspaceId = action.payload;
        },
        clearActiveWorkspace(state) {
            state.activeWorkspaceId = null;
        },
    },
});

export const {setActiveWorkspace, clearActiveWorkspace} =
    workspaceSlice.actions;
export const workspaceReducer = workspaceSlice.reducer;
export type {WorkspaceUiState};
