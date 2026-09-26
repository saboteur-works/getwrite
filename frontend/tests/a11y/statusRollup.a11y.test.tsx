import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StatusRollup from "../../components/WorkArea/StatusRollup";
import { runAxe } from "./helpers/axe";
import {
  Empty,
  Populated,
  OffList,
  NoStatusesConfigured,
} from "../../stories/WorkArea/StatusRollup.stories";

type StoryArgs = React.ComponentProps<typeof StatusRollup>;

const states: ReadonlyArray<[string, StoryArgs]> = [
  ["empty", Empty.args as StoryArgs],
  ["populated", Populated.args as StoryArgs],
  ["off-list", OffList.args as StoryArgs],
  ["no statuses configured", NoStatusesConfigured.args as StoryArgs],
];

describe("a11y: StatusRollup", () => {
  it.each(states)("%s state has zero axe violations", async (...[, args]) => {
    const { container } = render(<StatusRollup {...args} />);
    await runAxe(container);
  });

  it("populated state exposes a captioned table with row and column headers", () => {
    render(<StatusRollup {...(Populated.args as StoryArgs)} />);
    expect(
      screen.getByRole("table", { name: "Resources and words by status" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader")).toHaveLength(3);
    expect(
      screen.getByRole("rowheader", { name: "Draft" }),
    ).toBeInTheDocument();
  });

  it("off-list and unset rows are identified by text, not colour", () => {
    render(<StatusRollup {...(OffList.args as StoryArgs)} />);
    expect(screen.getByRole("rowheader", { name: /Archived/ })).toBeVisible();
    expect(screen.getByRole("rowheader", { name: "No status" })).toBeVisible();
  });
});
