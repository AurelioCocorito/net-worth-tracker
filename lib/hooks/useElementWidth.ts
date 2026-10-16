'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The width of an element, kept current by a `ResizeObserver` — for a choice that belongs to the
 * box something is drawn in, not to the viewport (since 2026-10-16: a tile that can be a row of the
 * landscape index is a phone's width at a tablet's viewport; AGENTS.md § Tailwind Breakpoints).
 * `null` until the element is measured: the caller falls back to its viewport guess for that frame.
 */
export function useElementWidth(): [ref: (node: HTMLElement | null) => void, width: number | null] {
  const [width, setWidth] = useState<number | null>(null);
  const observer = useRef<ResizeObserver | null>(null);

  const ref = useCallback((node: HTMLElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!node) return;
    setWidth(node.getBoundingClientRect().width);
    observer.current = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.current.observe(node);
  }, []);
  useEffect(() => () => observer.current?.disconnect(), []);

  // A pair, not an object: an object holding a callback ref reads as a ref to the React Compiler, and its other fields with it.
  return [ref, width];
}
