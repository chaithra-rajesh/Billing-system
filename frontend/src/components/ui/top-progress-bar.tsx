'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useIsFetching, useIsMutating } from '@tanstack/react-query';

const NAV_GRACE_MS = 400;

export function TopProgressBar() {
  const pathname = usePathname();
  const isFetching = useIsFetching();
  const isMutating = useIsMutating();

  const [navTick, setNavTick] = useState(false);

  useEffect(() => {
    setNavTick(true);
    const t = setTimeout(() => setNavTick(false), NAV_GRACE_MS);
    return () => clearTimeout(t);
  }, [pathname]);

  const visible = isFetching > 0 || isMutating > 0 || navTick;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden"
    >
      <div
        className={`h-full origin-left bg-primary transition-opacity duration-200 motion-reduce:animate-none ${
          visible ? 'opacity-100 animate-progress-indeterminate' : 'opacity-0'
        }`}
      />
    </div>
  );
}
