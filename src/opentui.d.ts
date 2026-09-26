// The TUI host injects these modules at runtime, the same way it provides
// `@opencode/plugin/tui`. The plugin deliberately does not depend on them, so
// they are declared here to keep the build typechecking without vendoring.

declare module "@opentui/solid" {
  /** Creates a detached renderable element, e.g. `createElement("text")`. */
  export function createElement(tag: string): any;
  /** Appends a child element, or a string, to a parent element. */
  export function insert(parent: any, child: any): void;
  /** Sets a prop on an element, including event handlers like `onMouseUp`. */
  export function setProp(node: any, key: string, value: unknown): void;
}
