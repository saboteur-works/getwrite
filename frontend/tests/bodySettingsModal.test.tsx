import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import BodySettingsModal from "../components/preferences/BodySettingsModal";
import { Dialog } from "../components/common/UI/Dialog/Dialog";
import { runAxe } from "./a11y/helpers/axe";
import { LINE_HEIGHT_FLOOR_MESSAGE } from "../src/lib/editor-body-settings";

function renderInDialog(ui: React.ReactElement) {
  return render(
    <Dialog open onOpenChange={() => undefined}>
      {ui}
    </Dialog>,
  );
}

describe("BodySettingsModal", () => {
  it("renders all body field labels", () => {
    renderInDialog(
      <BodySettingsModal
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByLabelText("Font Family")).toBeInTheDocument();
    expect(screen.getByLabelText("Font Size")).toBeInTheDocument();
    expect(screen.getByLabelText("Line Height")).toBeInTheDocument();
    expect(screen.getByLabelText("Paragraph Spacing")).toBeInTheDocument();
  });

  it("populates fields from initialBody", () => {
    renderInDialog(
      <BodySettingsModal
        initialBody={{ fontFamily: "Georgia", fontSize: "18px" }}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByLabelText("Font Family")).toHaveValue("Georgia");
    expect(screen.getByLabelText("Font Size")).toHaveValue("18px");
  });

  it("calls onSave with sanitized values and closes on success", async () => {
    const onClose = vi.fn();
    const onSave = vi.fn().mockResolvedValue(undefined);

    renderInDialog(<BodySettingsModal onClose={onClose} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText("Font Family"), {
      target: { value: "IBM Plex Serif" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({ fontFamily: "IBM Plex Serif" });
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("does not close on successful save when closeOnSave is false", async () => {
    const onClose = vi.fn();
    const onSave = vi.fn().mockResolvedValue(undefined);

    renderInDialog(
      <BodySettingsModal
        onClose={onClose}
        onSave={onSave}
        closeOnSave={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows an error message when save fails", async () => {
    renderInDialog(
      <BodySettingsModal
        onClose={vi.fn()}
        onSave={vi.fn().mockRejectedValue(new Error("Network error"))}
      />,
    );

    fireEvent.change(screen.getByLabelText("Font Family"), {
      target: { value: "Arial" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Network error");
    });
  });

  describe("body text preview", () => {
    it("renders a preview paragraph", () => {
      renderInDialog(
        <BodySettingsModal
          onClose={vi.fn()}
          onSave={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      expect(screen.getByLabelText("Body text preview")).toBeInTheDocument();
    });

    it("preview reflects initial fontFamily and fontSize", () => {
      renderInDialog(
        <BodySettingsModal
          initialBody={{
            fontFamily: "Georgia",
            fontSize: "18px",
            lineHeight: "1.9",
          }}
          onClose={vi.fn()}
          onSave={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      const preview = screen.getByLabelText("Body text preview") as HTMLElement;
      expect(preview.style.fontFamily).toBe("Georgia");
      expect(preview.style.fontSize).toBe("18px");
      expect(preview.style.lineHeight).toBe("1.9");
    });

    it("preview updates when font family field changes", () => {
      renderInDialog(
        <BodySettingsModal
          onClose={vi.fn()}
          onSave={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      fireEvent.change(screen.getByLabelText("Font Family"), {
        target: { value: "Merriweather" },
      });

      const preview = screen.getByLabelText("Body text preview") as HTMLElement;
      expect(preview.style.fontFamily).toBe("Merriweather");
    });

    it("preview updates when line height field changes", () => {
      renderInDialog(
        <BodySettingsModal
          onClose={vi.fn()}
          onSave={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      fireEvent.change(screen.getByLabelText("Line Height"), {
        target: { value: "2.0" },
      });

      const preview = screen.getByLabelText("Body text preview") as HTMLElement;
      expect(preview.style.lineHeight).toBe("2");
    });

    it("preview has no inline style when no values are set", () => {
      renderInDialog(
        <BodySettingsModal
          onClose={vi.fn()}
          onSave={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      const preview = screen.getByLabelText("Body text preview") as HTMLElement;
      expect(preview.style.fontFamily).toBe("");
      expect(preview.style.fontSize).toBe("");
      expect(preview.style.lineHeight).toBe("");
    });
  });

  describe("line height floor (FR-22 a, FR-23)", () => {
    it.each(["1.7", "normal"])(
      "refuses %j on Save: message linked to the field, value kept, no request",
      async (value) => {
        const onSave = vi.fn().mockResolvedValue(undefined);
        const onClose = vi.fn();
        renderInDialog(<BodySettingsModal onClose={onClose} onSave={onSave} />);

        const field = screen.getByLabelText("Line Height");
        fireEvent.change(field, { target: { value } });
        fireEvent.click(screen.getByRole("button", { name: /save/i }));

        const message = await screen.findByText(LINE_HEIGHT_FLOOR_MESSAGE);
        expect(message.textContent).toBe(
          "Line height must be a number of at least 1.8.",
        );
        expect(field).toHaveAttribute("aria-describedby", message.id);
        expect(field).toHaveAttribute("aria-invalid", "true");
        expect(field).toHaveValue(value);
        expect(onSave).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
      },
    );

    it.each([
      ["", {}],
      ["2", { lineHeight: "2" }],
    ])("saves %j", async (value, expected) => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      renderInDialog(<BodySettingsModal onClose={vi.fn()} onSave={onSave} />);

      fireEvent.change(screen.getByLabelText("Line Height"), {
        target: { value },
      });
      fireEvent.click(screen.getByRole("button", { name: /save/i }));

      await waitFor(() => expect(onSave).toHaveBeenCalledWith(expected));
      expect(screen.queryByText(LINE_HEIGHT_FLOOR_MESSAGE)).toBeNull();
    });

    it("clears the message once the value is edited", async () => {
      renderInDialog(
        <BodySettingsModal
          onClose={vi.fn()}
          onSave={vi.fn().mockResolvedValue(undefined)}
        />,
      );
      const field = screen.getByLabelText("Line Height");
      fireEvent.change(field, { target: { value: "1.7" } });
      fireEvent.click(screen.getByRole("button", { name: /save/i }));
      await screen.findByText(LINE_HEIGHT_FLOOR_MESSAGE);

      fireEvent.change(field, { target: { value: "1.9" } });

      expect(screen.queryByText(LINE_HEIGHT_FLOOR_MESSAGE)).toBeNull();
      expect(field).not.toHaveAttribute("aria-describedby");
    });

    it("has no axe violations with the linked message shown", async () => {
      const { container } = renderInDialog(
        <BodySettingsModal
          onClose={vi.fn()}
          onSave={vi.fn().mockResolvedValue(undefined)}
        />,
      );
      fireEvent.change(screen.getByLabelText("Line Height"), {
        target: { value: "1.7" },
      });
      fireEvent.click(screen.getByRole("button", { name: /save/i }));
      await screen.findByText(LINE_HEIGHT_FLOOR_MESSAGE);

      await runAxe(container);
    });
  });
});
