import { configureStore } from "@reduxjs/toolkit";
import projectsReducer from "./projectsSlice";

/**
 * @deprecated This is a temporary store instance for development and testing. In production, use makeStore to create a new store instance for each client.
 */
export const store = configureStore({
    reducer: {
        projects: projectsReducer,
    },
});

export const makeStore = () => {
    return configureStore({
        reducer: {
            projects: projectsReducer,
        },
    });
};
export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];

export default store;
