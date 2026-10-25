// Window events the guide's "Show me" sends to a screen that is already (or about to be)
// mounted: the screen owns its own state, the guide only asks.

/** The open chat opens its menu (the desktop kebab, the phone sheet). */
export const GUIDE_MENU_EVENT = 'rp-guide-chat-menu'

/** The phone's More sheet opens (the Inbox, Help and the sections that are not in the tab bar live there). */
export const GUIDE_MORE_EVENT = 'rp-guide-more'
/** The guide is done pointing: the More sheet it opened closes again. */
export const GUIDE_MORE_CLOSE_EVENT = 'rp-guide-more-close'

/** True when `event` happened on the guide's own overlay: a menu or sheet the guide is
 *  pointing into must not close because the user pressed Next on the bubble. */
export function guideTarget(event: Event | undefined): boolean {
  // a pointer press has a target; a focus leaving the menu has the overlay's button as relatedTarget
  const near = (n: EventTarget | null | undefined) => n instanceof Element && n.closest('[data-guide-overlay]') !== null
  return near(event?.target) || near((event as FocusEvent | undefined)?.relatedTarget)
}

/** detail: 'lorebooks' | 'presets'. That view opens its first entry (a phone shows the list first). */
export const GUIDE_DETAIL_EVENT = 'rp-guide-detail'
