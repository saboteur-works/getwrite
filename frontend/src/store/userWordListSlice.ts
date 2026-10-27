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
 *
 * Ordering. A mutation's result is the persisted list, so a read that began
 * before or during a mutation must not replace it with an older list. Each
 * mutation takes a sequence number on `pending` (`mutationSeq`) and counts as
 * in flight until it settles. A read records `{ mutationSeq, inFlight }` when
 * it starts and applies its words only if no mutation was in flight then, none
 * has started since, and none is in flight now; otherwise it keeps the current
 * words (still marking the status `loaded`). A mutation result is applied only
 * if its sequence number exceeds `appliedMutationSeq`, so results arriving out
 * of order cannot roll the list back. A failed read is unaffected: it still
 * sets `failed` (`docs/standards/failure-visibility.md`).
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
  /** Count of mutations started; the sequence number of the latest. */
  mutationSeq: number;
  /** Mutations started and not yet settled. */
  inFlight: number;
  /** Highest mutation sequence number whose result is stored in `words`. */
  appliedMutationSeq: number;
  /** Sequence number of each unsettled mutation, by request id. */
  pendingSeqs: Record<string, number>;
}

/** Payload of a rejected user-list thunk. */
export interface UserWordListFailure {
  reason: string;
  message: string;
}

/** The state before any read or mutation (also the base for fixtures). */
export const initialUserWordListState: UserWordListState = {
  status: "idle",
  words: [],
  reason: null,
  errorMessage: "",
  mutationSeq: 0,
  inFlight: 0,
  appliedMutationSeq: 0,
  pendingSeqs: {},
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

type UserWordListRoot = { userWordList: UserWordListState };

/** What a read saw of the mutations when it started. */
interface ReadStartMeta {
  mutationSeq: number;
  inFlight: number;
}

/**
 * Reads the persisted list. Rejects with a failure payload on any error. A
 * successful read is also what clears the session override in
 * `spellingAvailabilitySlice` (it listens for `loadUserList.fulfilled`).
 */
export const loadUserList = createAsyncThunk<
  string[],
  void,
  ThunkConfig & { state: UserWordListRoot; fulfilledMeta: ReadStartMeta }
>(
  "userWordList/load",
  async (_arg, { getState, rejectWithValue, fulfillWithValue }) => {
    const { mutationSeq, inFlight } = getState().userWordList;
    try {
      return fulfillWithValue(await getUserWords(), { mutationSeq, inFlight });
    } catch (error) {
      return rejectWithValue(toFailure(error));
    }
  },
);

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
  initialState: initialUserWordListState,
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
        const { mutationSeq, inFlight } = action.meta;
        const isCurrent =
          inFlight === 0 &&
          state.inFlight === 0 &&
          state.mutationSeq === mutationSeq;
        if (isCurrent) state.words = action.payload;
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
      builder
        .addCase(thunk.pending, (state, action) => {
          state.mutationSeq += 1;
          state.inFlight += 1;
          state.pendingSeqs[action.meta.requestId] = state.mutationSeq;
        })
        .addCase(thunk.fulfilled, (state, action) => {
          const seq = state.pendingSeqs[action.meta.requestId] ?? 0;
          delete state.pendingSeqs[action.meta.requestId];
          state.inFlight = Math.max(0, state.inFlight - 1);
          if (seq > state.appliedMutationSeq) {
            state.words = action.payload;
            state.appliedMutationSeq = seq;
          }
        })
        .addCase(thunk.rejected, (state, action) => {
          delete state.pendingSeqs[action.meta.requestId];
          state.inFlight = Math.max(0, state.inFlight - 1);
        });
    }
  },
});

export default userWordListSlice.reducer;

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
