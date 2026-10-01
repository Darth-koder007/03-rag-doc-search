import type { Meta, StoryObj } from "@storybook/react";
import { Widget } from "./Widget";

const meta: Meta<typeof Widget> = {
  title: "Primitives/Widget",
  component: Widget,
  args: { label: "Hello" },
};

export default meta;
type Story = StoryObj<typeof Widget>;

export const Small: Story = { args: { size: "sm" } };
export const Large: Story = { args: { size: "lg" } };
export const Row: Story = {
  render: (args) => (
    <div style={{ display: "flex" }}>
      <Widget {...args} size="sm" />
      <Widget {...args} size="lg" />
    </div>
  ),
};
