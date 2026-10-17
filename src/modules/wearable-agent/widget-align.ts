/** Fired (bubbling out of the widget's shadow root) when a full-screen mobile surface opens —
 *  the chat or a Details panel. The embed host answers by scrolling the store's page so the
 *  whole widget sits in view below the store's header. Outside an embed nobody listens. */
export const WIDGET_ALIGN_EVENT = "autoshopping:align-widget";

export function requestWidgetAlign(from: Element | null) {
  from?.dispatchEvent(new CustomEvent(WIDGET_ALIGN_EVENT, { bubbles: true, composed: true }));
}
