import { describe, it, expect } from "vitest";
import {
  ORGANIZER_GRID_CARD_CAP,
  applyCardCap,
} from "../components/WorkArea/Views/OrganizerView/organizerGridCap";

// Counts are taken from array lengths so no card-cap figure is written here.
const cards = (names: string[]): number => names.length;
const few = ["a", "b"];
const several = ["a", "b", "c", "d", "e"];

describe("ORGANIZER_GRID_CARD_CAP", () => {
  it("is null or a positive integer", () => {
    const cap = ORGANIZER_GRID_CARD_CAP;
    if (cap !== null) {
      expect(Number.isInteger(cap)).toBe(true);
      expect(cap).toBeGreaterThan(0);
    } else {
      expect(cap).toBeNull();
    }
  });
});

describe("applyCardCap", () => {
  it("shows every card and reports none hidden when no cap is set", () => {
    expect(applyCardCap(cards(several), null)).toEqual({
      shown: cards(several),
      notShown: 0,
    });
  });

  it("shows every card when the count is under the cap", () => {
    expect(applyCardCap(cards(few), cards(several))).toEqual({
      shown: cards(few),
      notShown: 0,
    });
  });

  it("shows every card when the count equals the cap", () => {
    expect(applyCardCap(cards(few), cards(few))).toEqual({
      shown: cards(few),
      notShown: 0,
    });
  });

  it("reports the cards past the cap as not shown", () => {
    expect(applyCardCap(cards(several), cards(few))).toEqual({
      shown: cards(few),
      notShown: cards(several) - cards(few),
    });
  });

  it("handles an empty grid", () => {
    expect(applyCardCap(0, cards(few))).toEqual({ shown: 0, notShown: 0 });
    expect(applyCardCap(0, null)).toEqual({ shown: 0, notShown: 0 });
  });

  it("defaults to the module constant", () => {
    expect(applyCardCap(cards(several))).toEqual(
      applyCardCap(cards(several), ORGANIZER_GRID_CARD_CAP),
    );
  });

  it("throws on a cap that is not a positive integer", () => {
    expect(() => applyCardCap(cards(few), 0)).toThrow(RangeError);
    expect(() => applyCardCap(cards(few), -cards(few))).toThrow(RangeError);
    expect(() => applyCardCap(cards(few), cards(few) / cards(several))).toThrow(
      RangeError,
    );
    expect(() => applyCardCap(cards(few), Number.NaN)).toThrow(RangeError);
  });

  it("throws on a card count that is not a non-negative integer", () => {
    expect(() => applyCardCap(-cards(few), null)).toThrow(RangeError);
    expect(() => applyCardCap(Number.NaN, null)).toThrow(RangeError);
  });
});
