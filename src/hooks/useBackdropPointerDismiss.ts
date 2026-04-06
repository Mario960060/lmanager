import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefCallback } from "react";

export type BackdropPointerDismissBind = {
  backdropRef: RefCallback<HTMLDivElement>;
  onBackdropPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPanelPointerDownCapture: (e: ReactPointerEvent) => void;
};

/**
 * Close only after a full press on the backdrop (pointer down + up, both on backdrop).
 * Prevents closing when the user finishes a text selection with pointer up outside the panel
 * (click event would otherwise target the backdrop).
 */
export function useBackdropPointerDismiss(onDismiss: () => void, enabled: boolean): BackdropPointerDismissBind {
  const backdropElRef = useRef<HTMLDivElement | null>(null);
  const armCloseRef = useRef(false);

  const backdropRef = useCallback((el: HTMLDivElement | null) => {
    backdropElRef.current = el;
  }, []);

  const onBackdropPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!enabled) return;
      if (e.target !== e.currentTarget) return;
      armCloseRef.current = true;
    },
    [enabled]
  );

  const onPanelPointerDownCapture = useCallback((_: ReactPointerEvent) => {
    armCloseRef.current = false;
  }, []);

  useEffect(() => {
    if (!enabled) {
      armCloseRef.current = false;
      return;
    }
    const onDocPointerUp = (e: PointerEvent) => {
      if (!armCloseRef.current) return;
      armCloseRef.current = false;
      const root = backdropElRef.current;
      if (!root) return;
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      if (hit === root) onDismiss();
    };
    document.addEventListener("pointerup", onDocPointerUp, true);
    return () => {
      document.removeEventListener("pointerup", onDocPointerUp, true);
      armCloseRef.current = false;
    };
  }, [enabled, onDismiss]);

  return { backdropRef, onBackdropPointerDown, onPanelPointerDownCapture };
}
