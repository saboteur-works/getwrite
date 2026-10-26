/**
 * @module userWordListSlice
 *
 * **Feature 96, Task 9.** The cross-project user word list: global per
 * tenant/device, not per project, so it is its own slice rather than part of
 * `spellingSlice` (which is keyed by and reset per project).
 *
 * Status is `idle | loading | loaded | failed`. A failed read is `failed`
 * with a `reason`, never `loaded` with an empty list
 * (`docs/standards/failure-visibility.md`). Add and remove make no change
 * until the transport resolves and then store exactly the list it returned;
 * a rejected mutation leaves state untouched and rejects with
 * `{ reason, message }` as the thunk payload. The project dictionary
 * (`spellingSlice`) is never read or written here (FR-17).
 */
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import {
  addUserWord,
  getUserWords,
  removeUserWord,
  UserWordListTransportError,
} from "../lib/api/user-word-list";

/** Load state of the user word list. */
export type UserWordListStatus = "idle" | "loading" | "loaded" | "failed";

/** State held by this slice. */
export interface UserWordListState {
  status: UserWordListStatus;
  /** The persisted list; empty unless `status` is `loaded` (or re-loading). */
  words: string[];
  /** Why the last read failed; `null` unless `status` is `failed`. */
  reason: string | null;
  /** Human-readable text for `reason`; empty unless `failed`. */
  errorMessage: string;
}

/** Payload of a rejected user-list thunk. */
export interface UserWordListFailure {
  reason: string;
  message: string;
}

const initialState: UserWordListState = {
  status: "idle",
  words: [],
  reason: null,
  errorMessage: "",
};

/** Maps any thrown value to the `{ reason, message }` the state exposes. */
function toFailure(error: unknown): UserWordListFailure {
  if (error instanceof UserWordListTransportError) {
    return { reason: error.reason, message: error.message };
  }
  const message =
    error instanceof Error ? error.message : "The user word list failed.";
  return { reason: message, message };
}

type ThunkConfig = { rejectValue: UserWordListFailure };

/** Reads the persisted list. Rejects with a failure payload on any error. */
export const loadUserList = createAsyncThunk<string[], void, ThunkConfig>(
  "userWordList/load",
  async (_arg, { rejectWithValue }) => {
    try {
      return await getUserWords();
    } catch (error) {
      return rejectWithValue(toFailure(error));
    }
  },
);

/**
 * "Retry" after a failed read (FR-16): the same read as `loadUserList`. A
 * successful result clears the session override in `spellingAvailabilitySlice`
 * (it listens for `loadUserList.fulfilled`); a failure leaves it as it was.
 */
export const retryUserList = loadUserList;

function createMutationThunk(
  type: string,
  call: (word: string) => Promise<string[]>,
) {
  return createAsyncThunk<string[], string, ThunkConfig>(
    type,
    async (word, { rejectWithValue }) => {
      try {
        return await call(word);
      } catch (error) {
        return rejectWithValue(toFailure(error));
      }
    },
  );
}

/** Adds `word`; fulfils with the persisted list. */
export const addToUserList = createMutationThunk(
  "userWordList/add",
  addUserWord,
);
/** Removes `word`; fulfils with the persisted list. */
export const removeFromUserList = createMutationThunk(
  "userWordList/remove",
  removeUserWord,
);

const userWordListSlice = createSlice({
  name: "userWordList",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(loadUserList.pending, (state) => {
        state.status = "loading";
        state.reason = null;
        state.errorMessage = "";
      })
      .addCase(loadUserList.fulfilled, (state, action) => {
        state.status = "loaded";
        state.words = action.payload;
        state.reason = null;
        state.errorMessage = "";
      })
      .addCase(loadUserList.rejected, (state, action) => {
        const failure = action.payload ?? toFailure(action.error);
        state.status = "failed";
        state.words = [];
        state.reason = failure.reason;
        state.errorMessage = failure.message;
      });
    for (const thunk of [addToUserList, removeFromUserList]) {
      builder.addCase(thunk.fulfilled, (state, action) => {
        state.words = action.payload;
      });
    }
  },
});

export default userWordListSlice.reducer;

type UserWordListRoot = { userWordList: UserWordListState };

/** The stored list (empty unless the status is `loaded`). */
export const selectUserWords = (state: UserWordListRoot): string[] =>
  state.userWordList.words;

/** Load status of the user word list. */
export const selectUserWordListStatus = (
  state: UserWordListRoot,
): UserWordListStatus => state.userWordList.status;

/** Failure reason of the last read, or `null`. */
export const selectUserWordListReason = (
  state: UserWordListRoot,
): string | null => state.userWordList.reason;
