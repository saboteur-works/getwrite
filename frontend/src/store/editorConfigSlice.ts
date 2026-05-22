import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { EditorBodyConfig, EditorHeading, EditorHeadings } from "../lib/models";
import {
  DEFAULT_HEADING_CONFIG,
  ORDERED_HEADING_LEVELS,
  sanitizeEditorHeadingMap,
  type EditorHeadingMap,
} from "../lib/editor-heading-settings";
import {
  DEFAULT_BODY_CONFIG,
  sanitizeEditorBody,
} from "../lib/editor-body-settings";

type EditorConfigState = {
  headings: { [key in EditorHeadings]?: EditorHeading };
  body?: EditorBodyConfig;
};

const initialState: EditorConfigState = { headings: {} };

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

export const selectResolvedEditorConfig = (state: {
  editorConfig: EditorConfigState;
}): { headings: EditorHeadingMap; body: EditorBodyConfig } => {
  const stored = state.editorConfig;
  const sanitizedHeadings = sanitizeEditorHeadingMap(stored.headings);
  const sanitizedBody = sanitizeEditorBody(stored.body);

  const resolvedHeadings: EditorHeadingMap = {};
  for (const level of ORDERED_HEADING_LEVELS) {
    const defaultForLevel = DEFAULT_HEADING_CONFIG[level];
    const storedForLevel = sanitizedHeadings[level];
    if (!defaultForLevel && !storedForLevel) continue;
    resolvedHeadings[level] = {
      ...(defaultForLevel ?? {}),
      ...(storedForLevel ?? {}),
    };
  }

  return {
    headings: resolvedHeadings,
    body: { ...DEFAULT_BODY_CONFIG, ...(sanitizedBody ?? {}) },
  };
};
