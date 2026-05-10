'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useIsFetching, useIsMutating } from '@tanstack/react-query';

const SHOW_DELAY_MS = 120;
const MIN_VISIBLE_MS = 350;
const NAV_GRACE_MS = 400;

export function TopProgressBar() {
  const pathname = usePathname();
  const isFetching = useIsFetching();
  const isMutating = useIsMutating();

  const [navActive, setNavActive] = useState(false);
  const [visible, setVisible] = useState(false);
  const [runId, setRunId] = useState(0);

  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shownAt = useRef<number | null>(null);

  useEffect(() => {
    setNavActive(true);
    const t = setTimeout(() => setNavActive(false), NAV_GRACE_MS);
    return () => clearTimeout(t);
  }, [pathname]);

  const active = isFetching > 0 || isMutating > 0 || navActive;

  useEffect(() => {
    if (active) {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      if (!visible && !showTimer.current) {
        showTimer.current = setTimeout(() => {
          shownAt.current = Date.now();
          setRunId((id) => id + 1);
          setVisible(true);
          showTimer.current = null;
        }, SHOW_DELAY_MS);
      }
    } else {
      if (showTimer.current) {
        clearTimeout(showTimer.current);
        showTimer.current = null;
      }
      if (visible && !hideTimer.current) {
        const elapsed = shownAt.current ? Date.now() - shownAt.current : 0;
        const wait = Math.max(0, MIN_VISIBLE_MS - elapsed);
        hideTimer.current = setTimeout(() => {
          setVisible(false);
          shownAt.current = null;
          hideTimer.current = null;
        }, wait);
      }
    }
  }, [active, visible]);

  useEffect(
    () => () => {
      if (showTimer.current) clearTimeout(showTimer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
  );

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden"
    >
      <div
        key={runId}
        className={`h-full origin-left bg-primary transition-opacity duration-200 motion-reduce:animate-none ${
          visible ? 'opacity-100 animate-progress-creep' : 'opacity-0'
        }`}
      />
    </div>
  );
}
