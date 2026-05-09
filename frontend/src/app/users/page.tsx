'use client';

import { useEffect, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Building2, Mail, Plus, ShieldCheck, UserPlus, X } from 'lucide-react';
import { RequireAuth } from '@/components/auth/require-auth';
import { AppShell, PageTitle } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingTableCard } from '@/components/ui/loading-states';
import { useMyFranchises } from '@/features/franchises/hooks';
import {
  useAllUsers,
  useInviteUser,
  useSetUserActive,
  useUpdateMembershipGlobal,
} from '@/features/users/hooks';
import {
  ROLE_OPTIONS,
  roleLabel,
  type FranchiseRole,
  type PlatformUser,
  type UserMembership,
} from '@/features/users/api';
import type { FranchiseListItem } from '@/features/franchises/api';

interface InviteAssignment {
  franchise_id: string;
  role: FranchiseRole;
}

interface InviteValues {
  email: string;
  full_name: string;
  assignments: InviteAssignment[];
}

export default function UsersPage() {
  return (
    <RequireAuth>
      <UsersView />
    </RequireAuth>
  );
}

function UsersView() {
  const { data: myFranchises, isLoading: loadingFranchises } = useMyFranchises();
  const isSuper = myFranchises?.is_super_admin ?? false;

  const { data, isLoading, error } = useAllUsers();
  const setActive = useSetUserActive();
  const updateMembership = useUpdateMembershipGlobal();
  const invite = useInviteUser();

  const franchises = myFranchises?.franchises ?? [];

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    control,
    watch,
  } = useForm<InviteValues>({
    defaultValues: {
      email: '',
      full_name: '',
      assignments: [{ franchise_id: '', role: 'billing_user' }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'assignments' });

  // Once the franchises list resolves, populate any blank franchise_id slots
  // with the first franchise (so the dropdown isn't sitting on the "Pick…"
  // placeholder by default).
  const watchedAssignments = watch('assignments');
  useEffect(() => {
    if (franchises.length === 0) return;
    watchedAssignments.forEach((a, idx) => {
      if (!a.franchise_id) {
        setValue(`assignments.${idx}.franchise_id`, franchises[0].id);
      }
    });
  }, [watchedAssignments, franchises, setValue]);

  if (loadingFranchises) {
    return (
      <AppShell>
        <PageTitle title="Users" />
        <LoadingTableCard rows={5} cols={4} />
      </AppShell>
    );
  }

  if (!isSuper) {
    return (
      <AppShell>
        <PageTitle title="Users" />
        <Card>
          <CardHeader>
            <CardTitle>Super admins only</CardTitle>
            <CardDescription>
              The global users page is reserved for platform owners. Franchise admins can manage
              users for their own franchise from the franchise&apos;s Settings page.
            </CardDescription>
          </CardHeader>
        </Card>
      </AppShell>
    );
  }

  async function onInvite(values: InviteValues) {
    const email = values.email.trim().toLowerCase();
    const full_name = values.full_name.trim();
    // De-duplicate franchises in case the user picked the same one twice.
    const seen = new Set<string>();
    const assignments = values.assignments.filter((a) => {
      if (!a.franchise_id || seen.has(a.franchise_id)) return false;
      seen.add(a.franchise_id);
      return true;
    });
    if (assignments.length === 0) {
      toast.error('Pick at least one franchise');
      return;
    }

    let invitedFlag = false;
    try {
      // The first call may send the auth invite (if the email is new); the
      // rest find the existing public.users row and just add memberships.
      for (const a of assignments) {
        const res = await invite.mutateAsync({
          email,
          full_name,
          franchise_id: a.franchise_id,
          role: a.role,
        });
        if (res.invited) invitedFlag = true;
      }
      toast.success(
        invitedFlag
          ? `Invite sent · added to ${assignments.length} franchise${assignments.length === 1 ? '' : 's'}`
          : `Added to ${assignments.length} franchise${assignments.length === 1 ? '' : 's'}`,
      );
      reset({
        email: '',
        full_name: '',
        assignments: [{ franchise_id: franchises[0]?.id ?? '', role: 'billing_user' }],
      });
    } catch (e) {
      toast.error((e as Error).message || 'Invite failed');
    }
  }

  return (
    <AppShell>
      <PageTitle
        title="Users"
        subtitle="Every account on the platform and the franchises it belongs to."
      />

      {/* Invite / add-to-franchise form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" /> Invite a user
          </CardTitle>
          <CardDescription>
            New email → Auth invite + the memberships below. Existing email → just adds the
            memberships (existing memberships are left untouched). Add multiple franchise rows to
            assign the user to several franchises in one go, with a different role per franchise
            if needed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit(onInvite)}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Email</Label>
                <Input
                  type="email"
                  placeholder="user@example.com"
                  {...register('email', {
                    required: 'Required',
                    pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Invalid email' },
                  })}
                  aria-invalid={!!errors.email}
                />
                <FormError message={errors.email?.message} />
              </div>
              <div className="space-y-1">
                <Label>Full name</Label>
                <Input
                  {...register('full_name', { required: 'Required', maxLength: 200 })}
                  aria-invalid={!!errors.full_name}
                />
                <FormError message={errors.full_name?.message} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Franchise &amp; role</Label>
              <ul className="space-y-2">
                {fields.map((field, idx) => (
                  <li
                    key={field.id}
                    className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_180px_auto]"
                  >
                    <select
                      {...register(`assignments.${idx}.franchise_id`, { required: true })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Pick a franchise…</option>
                      {franchises.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                    <select
                      {...register(`assignments.${idx}.role`)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      {ROLE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => remove(idx)}
                      disabled={fields.length === 1}
                      className="inline-flex h-10 items-center justify-center rounded-md border border-border px-3 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="Remove franchise"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => append({ franchise_id: '', role: 'billing_user' })}
                className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground transition hover:border-foreground/40 hover:text-foreground"
              >
                <Plus className="h-3 w-3" />
                Add another franchise
              </button>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={invite.isPending}>
                {invite.isPending ? 'Inviting…' : 'Invite'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* User list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">All users</h2>
          {data && (
            <span className="text-xs text-muted-foreground">
              {data.total} {data.total === 1 ? 'account' : 'accounts'}
            </span>
          )}
        </div>

        {isLoading && <LoadingTableCard rows={4} cols={4} />}
        {error && (
          <p className="text-sm text-destructive">
            {(error as Error).message || 'Failed to load users'}
          </p>
        )}
        {data && data.users.length === 0 && (
          <p className="text-sm text-muted-foreground">No users yet.</p>
        )}

        {data && data.users.length > 0 && (
          <ul className="grid gap-3">
            {data.users.map((u) => (
              <UserCard
                key={u.id}
                user={u}
                franchises={franchises}
                onToggleActive={(is_active) => setActive.mutate({ user_id: u.id, is_active })}
                onUpdateMembership={(input) => updateMembership.mutate(input)}
                onAssignFranchise={async (franchise_id, role) => {
                  try {
                    await invite.mutateAsync({
                      email: u.email,
                      full_name: u.full_name || u.email,
                      franchise_id,
                      role,
                    });
                    toast.success('Added to franchise');
                  } catch (e) {
                    toast.error((e as Error).message || 'Assign failed');
                  }
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}

function UserCard({
  user,
  franchises,
  onToggleActive,
  onUpdateMembership,
  onAssignFranchise,
}: {
  user: PlatformUser;
  franchises: FranchiseListItem[];
  onToggleActive: (is_active: boolean) => void;
  onUpdateMembership: (input: { ufr_id: string; role?: FranchiseRole; is_active?: boolean }) => void;
  onAssignFranchise: (franchiseId: string, role: FranchiseRole) => Promise<void>;
}) {
  const assignedFranchiseIds = new Set(user.memberships.map((m) => m.franchise_id));
  const availableFranchises = franchises.filter((f) => !assignedFranchiseIds.has(f.id));

  return (
    <li
      className={`rounded-xl border border-border bg-card shadow-sm ${
        user.is_active ? '' : 'opacity-75'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 pb-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{user.full_name || user.email}</span>
            {user.is_super_admin && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
                <ShieldCheck className="h-3 w-3" /> super admin
              </span>
            )}
            {!user.is_active && (
              <span className="rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-destructive">
                disabled
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Mail className="h-3 w-3" />
            <span className="truncate">{user.email}</span>
          </div>
        </div>

        {!user.is_super_admin && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onToggleActive(!user.is_active)}
          >
            {user.is_active ? 'Disable account' : 'Enable account'}
          </Button>
        )}
      </div>

      <div className="border-t border-border bg-secondary/20 px-4 py-3">
        <div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          <Building2 className="h-3 w-3" />
          Memberships
        </div>
        {user.memberships.length === 0 ? (
          <p className="text-xs text-muted-foreground">No franchise memberships.</p>
        ) : (
          <ul className="space-y-2">
            {user.memberships.map((m) => (
              <MembershipRow
                key={m.ufr_id}
                membership={m}
                onUpdate={(input) => onUpdateMembership({ ufr_id: m.ufr_id, ...input })}
              />
            ))}
          </ul>
        )}

        {availableFranchises.length > 0 && (
          <AssignFranchiseRow
            availableFranchises={availableFranchises}
            onAssign={onAssignFranchise}
          />
        )}
      </div>
    </li>
  );
}

function AssignFranchiseRow({
  availableFranchises,
  onAssign,
}: {
  availableFranchises: FranchiseListItem[];
  onAssign: (franchiseId: string, role: FranchiseRole) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [franchiseId, setFranchiseId] = useState(availableFranchises[0]?.id ?? '');
  const [role, setRole] = useState<FranchiseRole>('billing_user');
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2.5 py-1.5 text-xs text-muted-foreground transition hover:border-foreground/40 hover:text-foreground"
      >
        <Plus className="h-3 w-3" />
        Assign to another franchise
      </button>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-border bg-background px-2.5 py-2 text-xs">
      <select
        value={franchiseId}
        onChange={(e) => setFranchiseId(e.target.value)}
        className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs"
      >
        {availableFranchises.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as FranchiseRole)}
        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
      >
        {ROLE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Button
        type="button"
        size="sm"
        disabled={busy || !franchiseId}
        onClick={async () => {
          setBusy(true);
          try {
            await onAssign(franchiseId, role);
            setOpen(false);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Adding…' : 'Add'}
      </Button>
      <button
        type="button"
        className="rounded-md p-1 text-muted-foreground hover:bg-secondary"
        onClick={() => setOpen(false)}
        aria-label="Cancel"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function MembershipRow({
  membership,
  onUpdate,
}: {
  membership: UserMembership;
  onUpdate: (input: { role?: FranchiseRole; is_active?: boolean }) => void;
}) {
  const muted = !membership.is_active;
  return (
    <li
      className={`flex flex-wrap items-center gap-2 rounded-md border bg-background px-3 py-2 text-xs ${
        muted ? 'border-border/60 text-muted-foreground' : 'border-border'
      }`}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <span className={`truncate text-sm ${muted ? 'line-through' : 'font-medium text-foreground'}`}>
          {membership.franchise_name}
        </span>
        <span className="rounded-full border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
          {membership.franchise_slug}
        </span>
        {!muted && <RoleChip role={membership.role} />}
        {muted && (
          <span className="rounded-full border border-border px-1.5 py-0.5 text-[9px] uppercase tracking-wide">
            inactive
          </span>
        )}
      </div>

      <select
        value={membership.role}
        disabled={muted}
        onChange={(e) => onUpdate({ role: e.target.value as FranchiseRole })}
        className="h-8 rounded-md border border-input bg-background px-2 text-xs disabled:opacity-50"
      >
        {ROLE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onUpdate({ is_active: !membership.is_active })}
      >
        {membership.is_active ? 'Deactivate' : 'Reactivate'}
      </Button>
    </li>
  );
}

function RoleChip({ role }: { role: FranchiseRole }) {
  const styles: Record<FranchiseRole, string> = {
    franchise_admin: 'bg-foreground text-background',
    billing_user: 'border border-border bg-secondary text-secondary-foreground',
    system_user: 'border border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide ${styles[role]}`}
    >
      {roleLabel(role)}
    </span>
  );
}
