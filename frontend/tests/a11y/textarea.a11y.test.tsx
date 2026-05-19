import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Textarea from "../../components/common/UI/Textarea/Textarea";

describe("a11y: Textarea primitive", () => {
    it("renders a native textarea element", () => {
        render(<Textarea aria-label="notes" />);
        expect(screen.getByRole("textbox")).toBeInTheDocument();
    });

    it("renders with brand border token class", () => {
        render(<Textarea aria-label="notes" />);
        const ta = screen.getByRole("textbox");
        expect(ta.className).toContain("border-gw-border");
    });

    it("renders with chrome2 background token", () => {
        render(<Textarea aria-label="notes" />);
        const ta = screen.getByRole("textbox");
        expect(ta.className).toContain("bg-gw-chrome2");
    });

    it("renders with resize-y and min-height classes", () => {
        render(<Textarea aria-label="notes" />);
        const ta = screen.getByRole("textbox");
        expect(ta.className).toContain("resize-y");
        expect(ta.className).toContain("min-h-[80px]");
    });

    it("disabled textarea is not interactable", async () => {
        const onChange = vi.fn();
        render(<Textarea aria-label="notes" disabled onChange={onChange} />);
        const ta = screen.getByRole("textbox");
        expect(ta).toBeDisabled();
        await userEvent.type(ta, "hello");
        expect(onChange).not.toHaveBeenCalled();
    });

    it("caller className is merged with base classes", () => {
        render(<Textarea aria-label="notes" className="w-full mt-2" />);
        const ta = screen.getByRole("textbox");
        expect(ta.className).toContain("w-full");
        expect(ta.className).toContain("border-gw-border");
    });

    it("forwards ref to the underlying textarea element", () => {
        const ref = React.createRef<HTMLTextAreaElement>();
        render(<Textarea ref={ref} aria-label="notes" />);
        expect(ref.current).toBeInstanceOf(HTMLTextAreaElement);
    });

    it("forwards aria-label to the textarea element", () => {
        render(<Textarea aria-label="synopsis" />);
        expect(screen.getByRole("textbox", { name: "synopsis" })).toBeInTheDocument();
    });
});
