export interface EvalCase {
  id: string;
  question: string;
  /** The component whose chunk should appear in top-k retrieval. `null` for adversarial cases
   * that have no correct answer in this design system — retrieval should report not-confident. */
  expectedComponent: string | null;
}

export const EVAL_CASES: EvalCase[] = [
  {
    id: "q01",
    question: "What are the valid size options for a Button?",
    expectedComponent: "Button",
  },
  {
    id: "q02",
    question: "Is there a deprecated prop on Button I should avoid using?",
    expectedComponent: "Button",
  },
  {
    id: "q03",
    question: "How do I show a danger-toned button for a destructive action?",
    expectedComponent: "Button",
  },
  {
    id: "q04",
    question: "How do I show a validation error state on a text input?",
    expectedComponent: "Input",
  },
  {
    id: "q05",
    question: "How do I add helper text below an input field?",
    expectedComponent: "Input",
  },
  {
    id: "q06",
    question: "How do I show an indeterminate checkbox state?",
    expectedComponent: "Checkbox",
  },
  {
    id: "q07",
    question: "How do I combine a checkbox with a visible label?",
    expectedComponent: "Checkbox",
  },
  { id: "q08", question: "How do I add a label to a radio button?", expectedComponent: "Radio" },
  {
    id: "q09",
    question: "How do I disable a specific option in a dropdown select?",
    expectedComponent: "Select",
  },
  {
    id: "q10",
    question: "How do I show placeholder text in a select element?",
    expectedComponent: "Select",
  },
  {
    id: "q11",
    question: "What tone options does Badge support for a warning indicator?",
    expectedComponent: "Badge",
  },
  { id: "q12", question: "How do I control the size of an icon?", expectedComponent: "Icon" },
  {
    id: "q13",
    question: "How do I close a modal dialog programmatically?",
    expectedComponent: "Modal",
  },
  { id: "q14", question: "What prop sets the modal's title?", expectedComponent: "Modal" },
  {
    id: "q15",
    question: "How do I disable a specific item in a dropdown menu?",
    expectedComponent: "Dropdown",
  },
  {
    id: "q16",
    question: "How do I show a trigger button for a dropdown?",
    expectedComponent: "Dropdown",
  },
  {
    id: "q17",
    question: "How do I control which tab is active from outside the component?",
    expectedComponent: "Tabs",
  },
  {
    id: "q18",
    question: "How do I set how long a toast notification stays visible?",
    expectedComponent: "Toast",
  },
  {
    id: "q19",
    question: "What tone options does a toast message support?",
    expectedComponent: "Toast",
  },
  { id: "q20", question: "How do I control the padding inside a Card?", expectedComponent: "Card" },
  { id: "q21", question: "How do I enable row selection in a table?", expectedComponent: "Table" },
  { id: "q22", question: "How do I make a table column sortable?", expectedComponent: "Table" },
  {
    id: "q23",
    question: "How do I change which side a tooltip appears on?",
    expectedComponent: "Tooltip",
  },
  { id: "q24", question: "What content can go inside a tooltip?", expectedComponent: "Tooltip" },

  // --- Adversarial: genuinely no answer in this design system ---
  { id: "a01", question: "How do I file my taxes?", expectedComponent: null },
  { id: "a02", question: "What's the capital of France?", expectedComponent: null },
  { id: "a03", question: "How do I configure a kubernetes ingress?", expectedComponent: null },
  { id: "a04", question: "How do I set up OAuth2 login?", expectedComponent: null },
  { id: "a05", question: "What's the best pizza topping?", expectedComponent: null },
  { id: "a06", question: "How do I connect to a PostgreSQL database?", expectedComponent: null },
];
