"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type MapRouteFloatingPanelProps = {
  open: boolean;
  title?: string;
  onClose?: () => void;
  children: React.ReactNode;
};

const DEFAULT_POS = { x: 16, y: 72 };

export function MapRouteFloatingPanel({
  open,
  title = "Route planner",
  onClose,
  children,
}: MapRouteFloatingPanelProps) {
  const [pos, setPos] = useState(DEFAULT_POS);
  const [collapsed, setCollapsed] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(
    null,
  );
  const panelRef = useRef<HTMLDivElement>(null);

  const onHeaderPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest("button")) return;
      e.preventDefault();
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: pos.x,
        origY: pos.y,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [pos.x, pos.y],
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragRef.current || !panelRef.current?.offsetParent) return;
      const parent = panelRef.current.offsetParent as HTMLElement;
      const maxX = Math.max(8, parent.clientWidth - panelRef.current.offsetWidth - 8);
      const maxY = Math.max(8, parent.clientHeight - panelRef.current.offsetHeight - 8);
      const nextX = dragRef.current.origX + (e.clientX - dragRef.current.startX);
      const nextY = dragRef.current.origY + (e.clientY - dragRef.current.startY);
      setPos({
        x: Math.min(maxX, Math.max(8, nextX)),
        y: Math.min(maxY, Math.max(8, nextY)),
      });
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className={`ic-route-float${collapsed ? " ic-route-float--collapsed" : ""}`}
      style={{ left: pos.x, top: pos.y }}
      role="dialog"
      aria-label={title}
    >
      <header
        className="ic-route-float__head"
        onPointerDown={onHeaderPointerDown}
        title="Drag to move"
      >
        <span className="ic-route-float__title">{title}</span>
        <div className="ic-route-float__actions">
          <button
            type="button"
            className="ic-route-float__icon-btn"
            aria-label={collapsed ? "Expand panel" : "Collapse panel"}
            onClick={() => setCollapsed((v) => !v)}
          >
            {collapsed ? "▢" : "—"}
          </button>
          {onClose ? (
            <button type="button" className="ic-route-float__icon-btn" aria-label="Close" onClick={onClose}>
              ×
            </button>
          ) : null}
        </div>
      </header>
      {!collapsed ? <div className="ic-route-float__body">{children}</div> : null}
    </div>
  );
}
