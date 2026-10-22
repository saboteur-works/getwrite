import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import HeadingSettingsModal from "../components/preferences/HeadingSettingsModal";
import { Dialog } from "../components/common/UI/Dialog/Dialog";

function renderInDialog(ui: React.ReactElement) {
  return render(
    <Dialog open onOpenChange={() => undefined}>
      {ui}
    </Dialog>,
  );
}

describe("HeadingSettingsModal", () => {
  it("renders H1 through H3 by default and can add optional levels", () => {
    renderInDialog(
      <HeadingSettingsModal
        initialHeadings={{}}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByText("H1")).toBeInTheDocument();
    expect(screen.getByText("H2")).toBeInTheDocument();
    expect(screen.getByText("H3")).toBeInTheDocument();
    expect(screen.queryByText("H4")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /add h4/i }));

    expect(screen.getByText("H4")).toBeInTheDocument();
  });

  it("removes optional heading levels from the draft", () => {
    renderInDialog(
      <HeadingSettingsModal
        initialHeadings={{ h4: { fontSize: "18px" } }}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByText("H4")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /remove h4/i }));

    expect(screen.queryByText("H4")).not.toBeInTheDocument();
  });

  it("saves sanitized heading values and closes on success", async () => {
    const onClose = vi.fn();
    const onSave = vi.fn().mockResolvedValue(undefined);

    renderInDialog(
      <HeadingSettingsModal
        initialHeadings={{}}
        onClose={onClose}
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByLabelText("H1 Font Size"), {
      target: { value: "32" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add h4/i }));
    fireEvent.change(screen.getByLabelText("H4 Font Family"), {
      target: { value: "IBM Plex Sans" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        h1: { fontSize: "32px" },
        h4: { fontFamily: "IBM Plex Sans" },
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("font family is the shared dropdown listing every font, with Other... (FR-8, FR-12)", () => {
    renderInDialog(
      <HeadingSettingsModal
        initialHeadings={{ h1: { fontFamily: "Inter" } }}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const select = screen.getByLabelText("H1 Font Family") as HTMLSelectElement;
    expect(select.tagName.toLowerCase()).toBe("select");
    expect(select.getAttribute("list")).toBeNull();
    const labels = Array.from(select.options).map((o) => o.textContent);
    expect(labels).toContain("Playfair Display");
    expect(labels).toContain("Georgia");
    expect(labels).toContain("Other...");
    expect(labels.length).toBeGreaterThan(10);
  });

  it("each heading level has its own independent font family control", () => {
    renderInDialog(
      <HeadingSettingsModal
        initialHeadings={{}}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const h1 = screen.getByLabelText("H1 Font Family");
    const h2 = screen.getByLabelText("H2 Font Family");
    expect(h1.id).not.toBe(h2.id);
  });

  it("a stored heading weight other than 400/700 shows as an extra entry and is not rewritten on open (FR-14)", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderInDialog(
      <HeadingSettingsModal
        initialHeadings={{ h3: { fontWeight: "500" } }}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    const weight = screen.getByLabelText("H3 Font Weight") as HTMLSelectElement;
    expect(weight.value).not.toBe("");
    expect(weight.selectedOptions[0].textContent).toContain("500");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("an unlisted stored family opens as Other... with the text unchanged", () => {
    renderInDialog(
      <HeadingSettingsModal
        initialHeadings={{ h1: { fontFamily: "Garamond" } }}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByLabelText("H1 Font Family other name")).toHaveValue(
      "Garamond",
    );
  });

  it("does not close on successful save when closeOnSave is false", async () => {
    const onClose = vi.fn();
    const onSave = vi.fn().mockResolvedValue(undefined);

    renderInDialog(
      <HeadingSettingsModal
        initialHeadings={{}}
        onClose={onClose}
        onSave={onSave}
        closeOnSave={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("embedded: Discard changes resets to the last saved values and does not close (D-12)", async () => {
    const onClose = vi.fn();
    const onSave = vi.fn().mockResolvedValue(undefined);

    renderInDialog(
      <HeadingSettingsModal
        initialHeadings={{}}
        onClose={onClose}
        onSave={onSave}
        closeOnSave={false}
      />,
    );

    fireEvent.change(screen.getByLabelText("H1 Font Size"), {
      target: { value: "40" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText("H1 Font Size"), {
      target: { value: "50" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(screen.getByLabelText("H1 Font Size")).toHaveValue(40);
    expect(onClose).not.toHaveBeenCalled();
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("says an added level with no styles is not kept on save, until a style is set (D-11)", () => {
    renderInDialog(
      <HeadingSettingsModal
        initialHeadings={{}}
        onClose={vi.fn()}
        onSave={vi.fn()}
        closeOnSave={false}
      />,
    );
    const note = "No styles set, so this level is not kept when you save.";
    expect(screen.queryByText(note)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /add h4/i }));
    expect(screen.getByText(note)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("H4 Font Size"), {
      target: { value: "22" },
    });
    expect(screen.queryByText(note)).toBeNull();
  });

  it("does not save when cancel is clicked", () => {
    const onClose = vi.fn();
    const onSave = vi.fn();

    renderInDialog(
      <HeadingSettingsModal
        initialHeadings={{}}
        onClose={onClose}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  describe("heading preview", () => {
    it("renders a preview paragraph for each visible heading level", () => {
      renderInDialog(
        <HeadingSettingsModal
          initialHeadings={{}}
          onClose={vi.fn()}
          onSave={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      expect(screen.getByLabelText("H1 preview")).toBeInTheDocument();
      expect(screen.getByLabelText("H2 preview")).toBeInTheDocument();
      expect(screen.getByLabelText("H3 preview")).toBeInTheDocument();
    });

    it("preview reflects the initial font size", () => {
      renderInDialog(
        <HeadingSettingsModal
          initialHeadings={{ h1: { fontSize: "40px" } }}
          onClose={vi.fn()}
          onSave={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      const preview = screen.getByLabelText("H1 preview") as HTMLElement;
      expect(preview.style.fontSize).toBe("40px");
    });

    it("preview uses the same family value as the editor (FR-9)", () => {
      renderInDialog(
        <HeadingSettingsModal
          initialHeadings={{ h1: { fontFamily: "Source Serif 4" } }}
          onClose={vi.fn()}
          onSave={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      const preview = screen.getByLabelText("H1 preview") as HTMLElement;
      expect(preview.style.fontFamily).toBe(
        '"Source Serif 4", "IBM Plex Serif", serif',
      );
    });

    it("preview updates when font size field changes", () => {
      renderInDialog(
        <HeadingSettingsModal
          initialHeadings={{}}
          onClose={vi.fn()}
          onSave={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      fireEvent.change(screen.getByLabelText("H1 Font Size"), {
        target: { value: "28" },
      });

      const preview = screen.getByLabelText("H1 preview") as HTMLElement;
      expect(preview.style.fontSize).toBe("28px");
    });

    it("preview uses ink color token when no color is set", () => {
      renderInDialog(
        <HeadingSettingsModal
          initialHeadings={{}}
          onClose={vi.fn()}
          onSave={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      const preview = screen.getByLabelText("H1 preview") as HTMLElement;
      expect(preview.style.color).toBe("var(--color-gw-ink)");
    });

    it("preview uses the user-set color when provided", () => {
      renderInDialog(
        <HeadingSettingsModal
          initialHeadings={{ h2: { color: "#cc0000" } }}
          onClose={vi.fn()}
          onSave={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      const preview = screen.getByLabelText("H2 preview") as HTMLElement;
      expect(preview.style.color).toBe("rgb(204, 0, 0)");
    });
  });

  describe("stored output per field (FR-14, expectations captured from the pre-change component, green before the swap)", () => {
    function setFamilyLabel(level: string, label: string): void {
      fireEvent.change(screen.getByLabelText(`${level} Font Family`), {
        target: { value: label },
      });
    }
    function setFamilyTyped(level: string, name: string): void {
      fireEvent.change(screen.getByLabelText(`${level} Font Family`), {
        target: { value: "__other__" },
      });
      fireEvent.change(
        screen.getByLabelText(`${level} Font Family other name`),
        { target: { value: name } },
      );
    }
    async function saveFrom(
      initialHeadings: Record<string, Record<string, string>>,
      edit: () => void,
    ): Promise<unknown> {
      const onSave = vi.fn().mockResolvedValue(undefined);
      renderInDialog(
        <HeadingSettingsModal
          initialHeadings={initialHeadings}
          onClose={vi.fn()}
          onSave={onSave}
        />,
      );
      edit();
      fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
      await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
      return onSave.mock.calls[0][0];
    }

    it("family chosen from the list is stored as its label", async () => {
      expect(
        await saveFrom({}, () => setFamilyLabel("H1", "Playfair Display")),
      ).toEqual({ h1: { fontFamily: "Playfair Display" } });
    });

    it("a typed family name is stored as typed", async () => {
      expect(
        await saveFrom({}, () => setFamilyTyped("H1", "Garamond")),
      ).toEqual({ h1: { fontFamily: "Garamond" } });
    });

    it("size is stored as <n>px", async () => {
      expect(
        await saveFrom({}, () =>
          fireEvent.change(screen.getByLabelText("H1 Font Size"), {
            target: { value: "32" },
          }),
        ),
      ).toEqual({ h1: { fontSize: "32px" } });
    });

    it.each(["400", "700"])("weight %s is stored as chosen", async (w) => {
      expect(
        await saveFrom({}, () =>
          fireEvent.change(screen.getByLabelText("H1 Font Weight"), {
            target: { value: w },
          }),
        ),
      ).toEqual({ h1: { fontWeight: w } });
    });

    it("a stored weight of 500 is saved unchanged when untouched", async () => {
      expect(
        await saveFrom({ h3: { fontWeight: "500" } }, () => undefined),
      ).toEqual({ h3: { fontWeight: "500" } });
    });

    it("letter spacing is stored as <n>em", async () => {
      expect(
        await saveFrom({}, () =>
          fireEvent.change(screen.getByLabelText("H1 Letter Spacing"), {
            target: { value: "0.05" },
          }),
        ),
      ).toEqual({ h1: { letterSpacing: "0.05em" } });
    });

    it("colour is stored as the picked #rrggbb", async () => {
      expect(
        await saveFrom({}, () =>
          fireEvent.change(document.getElementById("h1-color") as HTMLElement, {
            target: { value: "#112233" },
          }),
        ),
      ).toEqual({ h1: { color: "#112233" } });
    });
  });
});
