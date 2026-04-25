import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { EditorBodyConfig, EditorHeading, EditorHeadings } from "../lib/models";

type EditorConfigState = {
    headings: {
        [key in EditorHeadings]?: EditorHeading;
    };
    body?: EditorBodyConfig;
};

const initialState: EditorConfigState = {
    headings: {},
};

const editorConfigSlice = createSlice({
    name: "editorConfig",
    initialState,
    reducers: {
        setEditorConfig(state, action: PayloadAction<EditorConfigState>) {
            state.headings = action.payload.headings;
            state.body = action.payload.body;
            return state;
        },
    },
});
export const { setEditorConfig } = editorConfigSlice.actions;
export default editorConfigSlice.reducer;

export const selectEditorConfig = (state: {
    editorConfig: EditorConfigState;
}) => state.editorConfig;
