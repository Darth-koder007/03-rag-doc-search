export interface GadgetProps {
  active: boolean;
}

export function Gadget({ active }: GadgetProps) {
  return <span>{active ? "on" : "off"}</span>;
}
