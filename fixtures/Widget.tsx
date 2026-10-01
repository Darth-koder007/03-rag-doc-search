export type WidgetSize = "sm" | "md" | "lg";

export interface WidgetProps {
  size?: WidgetSize;
  /** @deprecated Use `size` instead. Will be removed in 1.0. */
  scale?: WidgetSize;
  label: string;
}

export function Widget({ size = "md", label }: WidgetProps) {
  return <div className={size}>{label}</div>;
}
