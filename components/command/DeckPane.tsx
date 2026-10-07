"use client";

export function DeckPane({
  drag: _drag = 0,
  dragging: _dragging = false,
  axis = "x",
  children,
  className = "",
}: {
  drag?: number;
  dragging?: boolean;
  axis?: "x" | "y";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`deck-pane stationary${className ? ` ${className}` : ""}`} data-deck-axis={axis}>
      {children}
    </div>
  );
}
