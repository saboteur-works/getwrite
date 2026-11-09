import { describe, it, expect } from "vitest";
import {
  resourceErrorState,
  RESOURCE_READ_FAILED_MESSAGE,
  RESOURCE_LOCKED_MESSAGE,
  RESOURCE_OUT_OF_MEMORY_MESSAGE,
} from "../../src/lib/resource-object-url-state";

// Fakes carrying the text measured on the device; they are not evidence
// about memory, only about the classifier's text match.
const DEVICE_MESSAGE =
  "Couldn't load the attachment. 'readFile' failed with: Failed to allocate a 83886092 byte allocation with 4194304 free bytes and 68MB until OOM, growth limit 268435456";

describe("resourceErrorState out-of-memory", () => {
  it("classifies the measured 'Failed to allocate' text", () => {
    expect(resourceErrorState(new Error(DEVICE_MESSAGE))).toEqual({
      status: "failed",
      message: "Not enough memory on this device to show this file.",
    });
    expect(RESOURCE_OUT_OF_MEMORY_MESSAGE).toBe(
      "Not enough memory on this device to show this file.",
    );
  });

  it("classifies 'OutOfMemory' text", () => {
    expect(
      resourceErrorState(new Error("Throwing OutOfMemoryError")),
    ).toMatchObject({ message: RESOURCE_OUT_OF_MEMORY_MESSAGE });
  });

  it("classifies a plain object or string carrying the text", () => {
    expect(
      resourceErrorState({ message: "java.lang.OutOfMemoryError: x" }),
    ).toMatchObject({ message: RESOURCE_OUT_OF_MEMORY_MESSAGE });
    expect(resourceErrorState("Failed to allocate 5 bytes")).toMatchObject({
      message: RESOURCE_OUT_OF_MEMORY_MESSAGE,
    });
  });

  it("keeps the generic message for any other failure", () => {
    expect(resourceErrorState(new Error("EIO"))).toEqual({
      status: "failed",
      message: RESOURCE_READ_FAILED_MESSAGE,
    });
    expect(resourceErrorState(undefined)).toMatchObject({
      message: RESOURCE_READ_FAILED_MESSAGE,
    });
  });

  it("leaves the refusal unchanged", () => {
    const refusal = new Error("too big");
    refusal.name = "ResourceBytesTooLargeError";
    expect(resourceErrorState(refusal)).toEqual({
      status: "refused",
      message: "too big",
    });
  });

  it("keeps locked above the text match", () => {
    expect(RESOURCE_LOCKED_MESSAGE).toContain("locked");
  });
});
