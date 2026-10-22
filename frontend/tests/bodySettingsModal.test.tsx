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

const SIZE_INPUT = "18";
const FAMILY_LABEL = "IBM Plex Serif";
function typeFamily(name: string): void {
  fireEvent.change(screen.getByLabelText("Body Font Family"), {
    target: { value: "__other__" },
  });
  fireEvent.change(screen.getByLabelText("Body Font Family other name"), {
    target: { value: name },
  });
}

describe("BodySettingsModal", () => {
  it("qualifies the scope and states the 1.8 minimum and own-spacing rule", () => {
    renderInDialog(
      <BodySettingsModal
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const text = document.body.textContent ?? "";
    expect(text).not.toContain("apply to all editor body text");
    expect(text).toContain("no spacing of its own");
    expect(text).toContain("at least 1.8");
    expect(text).toContain("a paragraph with its own spacing keeps it");
  });

  it("renders all body field labels", () => {
    renderInDialog(
      <BodySettingsModal
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByLabelText("Body Font Family")).toBeInTheDocument();
    expect(screen.getByLabelText("Body Font Size")).toBeInTheDocument();
    expect(screen.getByLabelText("Body Line Height")).toBeInTheDocument();
    expect(screen.getByLabelText("Body Paragraph Spacing")).toBeInTheDocument();
  });

  it("populates fields from initialBody", () => {
    renderInDialog(
      <BodySettingsModal
        initialBody={{ fontFamily: "Georgia", fontSize: "18px" }}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByLabelText("Body Font Family")).toHaveValue("Georgia");
    expect(screen.getByLabelText("Body Font Size")).toHaveValue(18);
  });

  it("calls onSave with sanitized values and closes on success", async () => {
    const onClose = vi.fn();
    const onSave = vi.fn().mockResolvedValue(undefined);

    renderInDialog(<BodySettingsModal onClose={onClose} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText("Body Font Family"), {
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

    fireEvent.change(screen.getByLabelText("Body Font Family"), {
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
      // Feature 91 rule: previews use buildFontFamilyValue (quoted + fallback).
      expect(preview.style.fontFamily).toBe(
        '"Georgia", "IBM Plex Serif", serif',
      );
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

      fireEvent.change(screen.getByLabelText("Body Font Family"), {
        target: { value: "Merriweather" },
      });

      const preview = screen.getByLabelText("Body text preview") as HTMLElement;
      expect(preview.style.fontFamily).toBe(
        '"Merriweather", "IBM Plex Serif", serif',
      );
    });

    it("preview updates when line height field changes", () => {
      renderInDialog(
        <BodySettingsModal
          onClose={vi.fn()}
          onSave={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      fireEvent.change(screen.getByLabelText("Body Line Height"), {
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

        const field = screen.getByLabelText("Body Line Height");
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

    it("announces a refused 1.2 as an alert linked to the field (FR-29 a), keeps the value and saves nothing", async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      renderInDialog(<BodySettingsModal onClose={vi.fn()} onSave={onSave} />);

      const field = screen.getByLabelText("Body Line Height");
      fireEvent.change(field, { target: { value: "1.2" } });
      fireEvent.click(screen.getByRole("button", { name: /save/i }));

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(
        "Line height must be a number of at least 1.8.",
      );
      expect(field).toHaveAttribute("aria-describedby", alert.id);
      expect(field).toHaveAttribute("aria-invalid", "true");
      expect(field).toHaveValue("1.2");
      expect(onSave).not.toHaveBeenCalled();
    });

    it.each([
      ["", {}],
      ["2", { lineHeight: "2" }],
    ])("saves %j", async (value, expected) => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      renderInDialog(<BodySettingsModal onClose={vi.fn()} onSave={onSave} />);

      fireEvent.change(screen.getByLabelText("Body Line Height"), {
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
      const field = screen.getByLabelText("Body Line Height");
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
      fireEvent.change(screen.getByLabelText("Body Line Height"), {
        target: { value: "1.7" },
      });
      fireEvent.click(screen.getByRole("button", { name: /save/i }));
      await screen.findByText(LINE_HEIGHT_FLOOR_MESSAGE);

      await runAxe(container);
    });
  });

  describe("stored output per field (FR-14, expectations captured from the pre-change component, green before the swap)", () => {
    async function saveFrom(
      initialBody: Record<string, string>,
      edit: () => void,
    ): Promise<unknown> {
      const onSave = vi.fn().mockResolvedValue(undefined);
      renderInDialog(
        <BodySettingsModal
          initialBody={initialBody}
          onClose={vi.fn()}
          onSave={onSave}
        />,
      );
      edit();
      fireEvent.click(screen.getByRole("button", { name: /save/i }));
      await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
      return onSave.mock.calls[0][0];
    }

    it("size 18 is stored as 18px", async () => {
      expect(
        await saveFrom({}, () =>
          fireEvent.change(screen.getByLabelText("Body Font Size"), {
            target: { value: SIZE_INPUT },
          }),
        ),
      ).toEqual({ fontSize: "18px" });
    });

    it("a stored non-px size is saved unchanged when untouched", async () => {
      expect(await saveFrom({ fontSize: "1.5rem" }, () => undefined)).toEqual({
        fontSize: "1.5rem",
      });
    });

    it("paragraph spacing is stored as typed", async () => {
      expect(
        await saveFrom({}, () =>
          fireEvent.change(screen.getByLabelText("Body Paragraph Spacing"), {
            target: { value: "1.2em" },
          }),
        ),
      ).toEqual({ paragraphSpacing: "1.2em" });
    });

    it("a family chosen from the list is stored as its label", async () => {
      expect(
        await saveFrom({}, () =>
          fireEvent.change(screen.getByLabelText("Body Font Family"), {
            target: { value: FAMILY_LABEL },
          }),
        ),
      ).toEqual({ fontFamily: "IBM Plex Serif" });
    });

    it("a typed family name is stored as typed", async () => {
      expect(await saveFrom({}, () => typeFamily("Garamond"))).toEqual({
        fontFamily: "Garamond",
      });
    });
  });

  it("shows a stored non-px size as stored and Discard drops a refused typed line height", () => {
    renderInDialog(
      <BodySettingsModal
        initialBody={{ fontSize: "1.5rem" }}
        closeOnSave={false}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(screen.getByText("Current value: 1.5rem")).toBeInTheDocument();

    const field = screen.getByLabelText("Body Line Height");
    fireEvent.change(field, { target: { value: "1.2" } });
    expect(field).toHaveValue("1.2");
    fireEvent.click(screen.getByRole("button", { name: /discard changes/i }));
    expect(screen.getByLabelText("Body Line Height")).toHaveValue("");
  });
});
