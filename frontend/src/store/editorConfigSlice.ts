createSlice;
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { EditorHeading, EditorHeadings } from "../lib/models";
import { initial } from "lodash";

type EditorConfigState = {
    headings: {
        [key in EditorHeadings]?: EditorHeading;
    };
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
            return state;
        },
    },
});
export const { setEditorConfig } = editorConfigSlice.actions;
export default editorConfigSlice.reducer;

export const selectEditorConfig = (state: {
    editorConfig: EditorConfigState;
}) => state.editorConfig;
