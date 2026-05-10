'use client';

import * as React from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Single-select dropdown for franchises that shows the franchise name on the
 * left and the slug as a monospaced chip on the right — both in the trigger
 * and in each menu item. Native `<select>` can't render rich option content,
 * which is why this is a Radix DropdownMenu instead.
 */

export interface FranchisePickerOption {
  id: string;
  name: string;
  slug: string;
}

interface FranchisePickerProps {
  value: string;
  onChange: (id: string) => void;
  options: FranchisePickerOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** When true, uses the compact h-8 / text-xs sizing (matches the inline
   *  "assign to another franchise" row). Otherwise default form sizing. */
  compact?: boolean;
}

export function FranchisePicker({
  value,
  onChange,
  options,
  placeholder = 'Pick a franchise…',
  disabled,
  className,
  compact,
}: FranchisePickerProps) {
  const selected = options.find((o) => o.id === value) ?? null;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            'flex w-full items-center gap-2 rounded-md border border-input bg-background ring-offset-background',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
            compact ? 'h-8 px-2 text-xs' : 'h-10 px-3 text-sm',
            className,
          )}
        >
          <span className={cn('flex-1 truncate text-left', !selected && 'text-muted-foreground')}>
            {selected ? selected.name : placeholder}
          </span>
          {selected && <SlugChip slug={selected.slug} />}
          <ChevronDown
            className={cn(
              'shrink-0 text-muted-foreground',
              compact ? 'h-3 w-3' : 'h-4 w-4',
            )}
          />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={4}
          className={cn(
            'z-50 max-h-72 min-w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto',
            'rounded-md border border-border bg-popover p-1 text-sm text-popover-foreground shadow-md',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          )}
        >
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">No franchises</div>
          ) : (
            options.map((o) => (
              <DropdownMenu.Item
                key={o.id}
                onSelect={() => onChange(o.id)}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm outline-none',
                  'data-[highlighted]:bg-secondary data-[highlighted]:text-secondary-foreground',
                  o.id === value && 'bg-secondary/60',
                )}
              >
                <Check
                  className={cn(
                    'h-3.5 w-3.5 shrink-0',
                    o.id === value ? 'opacity-100' : 'opacity-0',
                  )}
                />
                <span className="flex-1 truncate">{o.name}</span>
                <SlugChip slug={o.slug} />
              </DropdownMenu.Item>
            ))
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function SlugChip({ slug }: { slug: string }) {
  return (
    <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
      {slug}
    </span>
  );
}
