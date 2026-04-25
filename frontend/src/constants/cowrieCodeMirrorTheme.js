import { EditorView } from "@codemirror/view";

/** Light editor chrome matching Cowrie Shell — use with `theme="none"` on @uiw/react-codemirror */
export const cowrieEditorTheme = EditorView.theme(
  {
    "&": { minHeight: "min(52vh, 520px)", backgroundColor: "#ffffff", color: "#111111" },
    ".cm-scroller": { fontFamily: "JetBrains Mono, ui-monospace, monospace", overflow: "auto" },
    ".cm-content, .cm-gutter": { fontSize: "13px", lineHeight: "1.5" },
    ".cm-gutters": {
      backgroundColor: "#f5f3ef",
      color: "#aaaaaa",
      borderRight: "1px solid rgba(17,17,17,0.06)",
    },
  },
  { dark: false }
);
