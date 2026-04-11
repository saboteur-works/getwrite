import { useState, useEffect, useCallback } from "react";

/**
 * Keeps a piece of internal state in sync with an external prop value.
 * When `externalValue` changes, internal state is updated.
 * The returned setter updates internal state and fires `onChange`.
 */
export default function useSyncedControlledValue<T>(
    externalValue: T,
    onChange?: (next: T) => void,
): [T, (next: T) => void] {
    const [value, setValue] = useState<T>(externalValue);

    useEffect(() => {
        setValue(externalValue);
    }, [externalValue]);

    const handleChange = useCallback(
        (next: T) => {
            setValue(next);
            onChange?.(next);
        },
        [onChange],
    );

    return [value, handleChange];
}
