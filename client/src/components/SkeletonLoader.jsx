import React from 'react';

export function SkeletonCard({ count = 1 }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="ghost-panel p-4 animate-pulse">
          <div className="flex justify-between items-center mb-3">
            <div className="h-3 bg-ghost-muted rounded-sm w-1/3"></div>
            <div className="h-4 w-4 bg-ghost-muted rounded-sm"></div>
          </div>
          <div className="h-6 bg-ghost-muted rounded-sm w-1/2 mb-2"></div>
          <div className="h-2.5 bg-ghost-muted/80 rounded-sm w-2/3"></div>
        </div>
      ))}
    </>
  );
}

export function SkeletonList({ rows = 4 }) {
  return (
    <div className="ghost-panel p-4 space-y-3 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between py-2.5 border-b border-ghost-border/60 last:border-0">
          <div className="space-y-1.5 flex-1">
            <div className="h-3 bg-ghost-muted rounded-sm w-2/5"></div>
            <div className="h-2 bg-ghost-muted/80 rounded-sm w-1/3"></div>
          </div>
          <div className="h-4 bg-ghost-muted rounded-sm w-16 ml-4"></div>
        </div>
      ))}
    </div>
  );
}
