/**
 * Feature 116 (Citations at compile), Task 46: the "Licences" entry in App
 * Settings and the bundled licence texts it points at.
 */
import React from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import spellingReducer from "../../src/store/spellingSlice";
import spellingAvailabilityReducer from "../../src/store/spellingAvailabilitySlice";
import userWordListReducer from "../../src/store/userWordListSlice";
import { StaticSharingLimitsProvider } from "../../components/Sharing/SharingLimitsContext";
import * as userWordTransport from "../../src/lib/api/user-word-list";
import AppSettingsDialog from "../../components/AppSettings/AppSettingsDialog";
import { getGlobalNoiseWords } from "../../src/lib/api/global-noise-words";
import LicencesSetting from "../../components/AppSettings/LicencesSetting";
import { runAxe } from "../a11y/helpers/axe";

vi.mock("../../src/lib/api/global-noise-words", () => ({
  getGlobalNoiseWords: vi.fn(),
  setGlobalNoiseWords: vi.fn(),
}));

vi.mock("../../src/lib/api/user-word-list", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/lib/api/user-word-list")>();
  return { ...actual, getUserWords: vi.fn() };
});

const FRONTEND = path.resolve(__dirname, "..", "..");

function read(...segments: string[]): string {
  return readFileSync(path.join(FRONTEND, ...segments), "utf8");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LicencesSetting", () => {
  it("shows a Licences heading with the engine, the style and the locale", () => {
    render(<LicencesSetting />);
    expect(
      screen.getByRole("heading", { name: "Licences", level: 3 }),
    ).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent(/Hayagriva/);
    expect(items[0]).toHaveTextContent(/Apache-2\.0/);
    expect(items[0]).toHaveTextContent(/NOTICE/);
    expect(items[1]).toHaveTextContent(/Chicago Manual of Style 18th edition/);
    expect(items[1]).toHaveTextContent(/Andrew Dunning/);
    expect(items[2]).toHaveTextContent(/en-US/);
    expect(items[2]).toHaveTextContent(/Brenton M\. Wiernik/);
  });

  it("credits the CSL project with its address as text, not a link", () => {
    const { container } = render(<LicencesSetting />);
    expect(container.textContent).toContain("https://citationstyles.org/");
    expect(container.textContent).toContain("Creative Commons");
    expect(container.querySelector("a")).toBeNull();
  });

  it("names the bundled licence file as text", () => {
    const { container } = render(<LicencesSetting />);
    expect(container.textContent).toContain("licences/citations-licences.txt");
  });

  it("requests nothing at run time", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(<LicencesSetting />);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("has no axe violations", async () => {
    const { container } = render(<LicencesSetting />);
    await runAxe(container);
  });
});

describe("App Settings dialog", () => {
  it("shows the Licences entry", async () => {
    vi.mocked(getGlobalNoiseWords).mockResolvedValue([]);
    vi.mocked(userWordTransport.getUserWords).mockResolvedValue([]);
    const store = configureStore({
      reducer: {
        spelling: spellingReducer,
        spellingAvailability: spellingAvailabilityReducer,
        userWordList: userWordListReducer,
      },
    });
    render(
      <Provider store={store}>
        <StaticSharingLimitsProvider value={{ state: { state: "exempt" } }}>
          <AppSettingsDialog isOpen onClose={() => undefined} />
        </StaticSharingLimitsProvider>
      </Provider>,
    );
    expect(
      await screen.findByRole("heading", { name: "Licences" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Hayagriva 0\.10\.1/)).toBeInTheDocument();
  });
});

describe("bundled citations-licences.txt", () => {
  const bundled = read("public", "licences", "citations-licences.txt");

  it("holds Hayagriva's LICENSE-APACHE and NOTICE verbatim", () => {
    const apache = read("src", "lib", "citations", "engine", "LICENSE-APACHE");
    const notice = read("src", "lib", "citations", "engine", "NOTICE");
    expect(bundled).toContain(apache);
    expect(bundled).toContain(notice);
  });

  it("holds the style and locale attribution text as recorded", () => {
    expect(bundled).toContain(
      "a clear mention of the CSL project and a link to https://citationstyles.org/",
    );
    expect(bundled).toContain(
      "a clear mention of the CSL project and a link to CitationStyles.org",
    );
    expect(bundled).toContain("Andrew Dunning");
    expect(bundled).toContain("Brenton M. Wiernik");
  });
});
