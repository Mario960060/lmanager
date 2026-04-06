import { useEffect, useRef } from 'react';
import { LM_SIDEBAR_NAV_EVENT, type SidebarNavDetail } from '../lib/sidebarNav';

/** When the user clicks the sidebar entry for `targetHref`, run `reset` (e.g. close modals). */
export function useSidebarSectionReset(targetHref: string, reset: () => void) {
  const resetRef = useRef(reset);
  resetRef.current = reset;
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<SidebarNavDetail>;
      if (ce.detail?.href === targetHref) {
        resetRef.current();
      }
    };
    window.addEventListener(LM_SIDEBAR_NAV_EVENT, handler);
    return () => window.removeEventListener(LM_SIDEBAR_NAV_EVENT, handler);
  }, [targetHref]);
}
