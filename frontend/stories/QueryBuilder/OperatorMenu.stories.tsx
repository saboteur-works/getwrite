import React, { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { QueryAST } from "../../src/lib/models/query-ast";
import OperatorMenu from "../../components/QueryBuilder/OperatorMenu";

const meta: Meta<typeof OperatorMenu> = {
  title: "QueryBuilder/OperatorMenu",
  component: OperatorMenu,
  parameters: { layout: "padded" },
};

export default meta;

type Story = StoryObj<typeof OperatorMenu>;

function noop(_op: string, _stub: QueryAST): void {}

// ─── Per field-type stories ───────────────────────────────────────────────────

export const TextField: Story = {
  args: {
    fieldType: "text",
    fieldKey: "synopsis",
    value: "contains",
    onChange: noop,
  },
};

export const NumberField: Story = {
  args: {
    fieldType: "number",
    fieldKey: "wordCount",
    value: "is-less-than",
    onChange: noop,
  },
};

export const DateField: Story = {
  args: {
    fieldType: "date",
    fieldKey: "createdAt",
    value: "is-after",
    onChange: noop,
  },
};

export const BooleanField: Story = {
  args: {
    fieldType: "boolean",
    fieldKey: "published",
    value: "is-true",
    onChange: noop,
  },
};

export const SelectField: Story = {
  args: { fieldType: "select", fieldKey: "type", value: "is", onChange: noop },
};

export const MultiselectField: Story = {
  args: {
    fieldType: "multiselect",
    fieldKey: "statuses",
    value: "includes",
    onChange: noop,
  },
};

export const ResourceRefField: Story = {
  args: {
    fieldType: "resource-ref",
    fieldKey: "pov",
    value: "is",
    onChange: noop,
  },
};

export const MultiResourceRefField: Story = {
  args: {
    fieldType: "multi-resource-ref",
    fieldKey: "tags",
    value: "includes",
    onChange: noop,
  },
};

// ─── Disabled state ───────────────────────────────────────────────────────────

export const Disabled: Story = {
  args: {
    fieldType: "text",
    fieldKey: "synopsis",
    value: "is",
    disabled: true,
    onChange: noop,
  },
};

// ─── Interactive ──────────────────────────────────────────────────────────────

export const Interactive: Story = {
  args: {
    fieldType: "text",
    fieldKey: "synopsis",
    value: null,
    onChange: noop,
  },
  render: (args: React.ComponentProps<typeof OperatorMenu>) => {
    const [operator, setOperator] = useState<string | null>(null);
    const [lastStub, setLastStub] = useState<QueryAST | null>(null);

    return (
      <div
        style={{
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <OperatorMenu
          {...args}
          value={operator}
          onChange={(op, stub) => {
            setOperator(op);
            setLastStub(stub);
          }}
        />
        {lastStub && (
          <pre style={{ fontFamily: "monospace", fontSize: 11, opacity: 0.6 }}>
            {JSON.stringify(lastStub, null, 2)}
          </pre>
        )}
      </div>
    );
  },
};
