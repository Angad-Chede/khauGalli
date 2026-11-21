import React from 'react';

/**
 * Standard Indian Veg Marker: Green square outline with a green solid filled circle.
 */
export function GreenVegIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <div
      className={`border-2 border-emerald-600 rounded-[3px] p-[2px] flex items-center justify-center shrink-0 ${className}`}
      title="Pure Vegetarian"
      aria-label="Vegetarian"
    >
      <div className="w-2 h-2 rounded-full bg-emerald-600" />
    </div>
  );
}

/**
 * Standard Indian Non-Veg Marker: Brown/Red square outline with a red solid filled circle/triangle.
 */
export function RedNonVegIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <div
      className={`border-2 border-rose-600 rounded-[3px] p-[2px] flex items-center justify-center shrink-0 ${className}`}
      title="Non-Vegetarian"
      aria-label="Non-Vegetarian"
    >
      <div className="w-2 h-2 rounded-full bg-rose-600" />
    </div>
  );
}
