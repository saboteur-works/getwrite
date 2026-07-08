import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import BodySettingsModal from "../components/preferences/BodySettingsModal";
import { Dialog } from "../components/common/UI/Dialog/Dialog";

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
});
