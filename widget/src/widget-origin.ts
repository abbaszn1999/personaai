/** Our own origin, as read off the widget's <script> tag by the bootstrap in main.tsx. Needed
 *  by anything that has to build an absolute URL to a sibling asset at runtime: inside a
 *  merchant's page a root-relative `/widget-live.js` would resolve against *their* origin. */
let origin = "";

export function setWidgetOrigin(value: string): void {
  origin = value;
}

export function getWidgetOrigin(): string {
  return origin;
}
