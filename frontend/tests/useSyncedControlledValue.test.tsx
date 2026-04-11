import React, { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import useSyncedControlledValue from "../components/Sidebar/controls/useSyncedControlledValue";

// Minimal wrapper component to exercise the hook in a render environment
function TestInput({
    externalValue,
    onChange,
}: {
    externalValue: string;
    onChange?: (v: string) => void;
}) {
    const [val, setVal] = useSyncedControlledValue(externalValue, onChange);
    return (
        <input
            data-testid="input"
            value={val}
            onChange={(e) => setVal(e.target.value)}
        />
    );
}

// Wrapper to drive externalValue changes from outside
function ControlledWrapper({
    initialValue,
    onChange,
}: {
    initialValue: string;
    onChange?: (v: string) => void;
}) {
    const [value, setValue] = useState(initialValue);
    return (
        <>
            <TestInput externalValue={value} onChange={onChange} />
            <button onClick={() => setValue("synced")}>sync</button>
        </>
    );
}

describe("useSyncedControlledValue", () => {
    it("reflects the initial external value", () => {
        render(<TestInput externalValue="hello" />);

        expect((screen.getByTestId("input") as HTMLInputElement).value).toBe(
            "hello",
        );
    });

    it("setter updates internal state", () => {
        render(<TestInput externalValue="initial" />);

        fireEvent.change(screen.getByTestId("input"), {
            target: { value: "updated" },
        });

        expect((screen.getByTestId("input") as HTMLInputElement).value).toBe(
            "updated",
        );
    });

    it("setter calls onChange with the new value", () => {
        const onChange = vi.fn();
        render(<TestInput externalValue="initial" onChange={onChange} />);

        fireEvent.change(screen.getByTestId("input"), {
            target: { value: "next" },
        });

        expect(onChange).toHaveBeenCalledWith("next");
    });

    it("syncs internal state when externalValue prop changes", () => {
        render(<ControlledWrapper initialValue="first" />);

        expect((screen.getByTestId("input") as HTMLInputElement).value).toBe(
            "first",
        );

        act(() => {
            fireEvent.click(screen.getByText("sync"));
        });

        expect((screen.getByTestId("input") as HTMLInputElement).value).toBe(
            "synced",
        );
    });
});
