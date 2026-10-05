import { describe, it, expect } from "vitest";
import {
  getNoiseObservation,
  NOISE_OBSERVATION_NAME,
  NOISE_OBSERVATION_ALIAS,
} from "../../src/lib/models/entity-noise-copy";

/**
 * Regression guard against reintroducing directive/imperative language into
 * the noise-observation copy (FR-10). Matches the kind of phrasing the prior
 * `entity-alias-warnings.ts` strings used ("will match frequently and add
 * noise") as well as generic imperative verbs an editor might reach for.
 */
const IMPERATIVE_TRIGGER_WORDS =
  /\b(fix|remove|will add noise|should change|must change|avoid using)\b/i;

describe("entity-noise-copy", () => {
  it("exports a non-empty name observation constant", () => {
    expect(typeof NOISE_OBSERVATION_NAME).toBe("string");
    expect(NOISE_OBSERVATION_NAME.length).toBeGreaterThan(0);
  });

  it("exports a non-empty alias observation constant", () => {
    expect(typeof NOISE_OBSERVATION_ALIAS).toBe("string");
    expect(NOISE_OBSERVATION_ALIAS.length).toBeGreaterThan(0);
  });

  it("the name constant avoids imperative trigger language", () => {
    expect(NOISE_OBSERVATION_NAME).not.toMatch(IMPERATIVE_TRIGGER_WORDS);
  });

  it("the alias constant avoids imperative trigger language", () => {
    expect(NOISE_OBSERVATION_ALIAS).not.toMatch(IMPERATIVE_TRIGGER_WORDS);
  });

  it("getNoiseObservation returns a non-empty string for the name kind", () => {
    const result = getNoiseObservation("Case", "name");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toMatch(IMPERATIVE_TRIGGER_WORDS);
  });

  it("getNoiseObservation returns a non-empty string for the alias kind", () => {
    const result = getNoiseObservation("Tiny", "alias");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toMatch(IMPERATIVE_TRIGGER_WORDS);
  });

  it("getNoiseObservation includes the flagged term verbatim", () => {
    expect(getNoiseObservation("Hope", "name")).toContain("Hope");
    expect(getNoiseObservation("Will", "alias")).toContain("Will");
  });

  it("getNoiseObservation distinguishes name vs alias wording", () => {
    const nameResult = getNoiseObservation("Grace", "name");
    const aliasResult = getNoiseObservation("Grace", "alias");
    expect(nameResult).not.toBe(aliasResult);
    expect(nameResult).toContain("name");
    expect(aliasResult).toContain("alias");
  });
});
