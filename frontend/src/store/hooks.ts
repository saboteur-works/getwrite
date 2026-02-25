import {
    TypedUseSelectorHook,
    useDispatch,
    useSelector,
    useStore,
} from "react-redux";
import { type RootState, type AppDispatch, AppStore } from "./store";

export const useAppStore = useStore.withTypes<AppStore>();
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

export default useAppSelector;
