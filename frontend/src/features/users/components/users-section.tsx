'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useFranchiseUsers,
  useInviteUser,
  useUpdateUserMembership,
} from '@/features/users/hooks';
import { ROLE_OPTIONS, type FranchiseRole, type FranchiseUser } from '@/features/users/api';

interface InviteValues {
  email: string;
  full_name: string;
  role: FranchiseRole;
}

/**
 * Manage users assigned to a franchise. Admins can invite new users (or
 * re-add existing ones), change roles, and revoke membership without
 * affecting the user's other franchises.
 */
export function UsersSection({ franchiseId }: { franchiseId: string }) {
  const { data, isLoading, error } = useFranchiseUsers(franchiseId);
  const invite = useInviteUser();
  const update = useUpdateUserMembership(franchiseId);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<InviteValues>({
    defaultValues: { email: '', full_name: '', role: 'billing_user' },
  });

  async function onInvite(values: InviteValues) {
    try {
      const res = await invite.mutateAsync({
        email: values.email.trim().toLowerCase(),
        full_name: values.full_name.trim(),
        franchise_id: franchiseId,
        role: values.role,
      });
      toast.success(
        res.invited ? 'Invite email sent — they can set a password and log in.' : 'User added.',
      );
      reset({ email: '', full_name: '', role: 'billing_user' });
    } catch (e) {
      toast.error((e as Error).message || 'Invite failed');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Users &amp; permissions</CardTitle>
        <CardDescription>
          Invite people to bill from this franchise. Inviting an email that already has an account
          on the platform just adds them to this franchise — re-use is intentional so a user can
          belong to multiple franchises.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Invite form */}
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_140px_auto]"
          onSubmit={handleSubmit(onInvite)}
        >
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
          <div className="space-y-1">
            <Label>Role</Label>
            <select
              {...register('role')}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={invite.isPending} className="w-full sm:w-auto">
              {invite.isPending ? 'Inviting…' : 'Invite'}
            </Button>
          </div>
        </form>

        {/* Users list */}
        <div className="space-y-2">
          {isLoading && <p className="text-sm text-muted-foreground">Loading users…</p>}
          {error && (
            <p className="text-sm text-destructive">
              {(error as Error).message || 'Failed to load users'}
            </p>
          )}
          {data && data.users.length === 0 && (
            <p className="text-sm text-muted-foreground">No users yet — invite one above.</p>
          )}
          {data && data.users.length > 0 && (
            <ul className="divide-y divide-border/60 rounded-md border border-border">
              {data.users.map((u) => (
                <UserRow key={u.ufr_id} user={u} onUpdate={(p) => update.mutate(p)} />
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function UserRow({
  user,
  onUpdate,
}: {
  user: FranchiseUser;
  onUpdate: (input: { ufr_id: string; role?: FranchiseRole; is_active?: boolean }) => void;
}) {
  const [busy, setBusy] = useState(false);

  function withBusy(fn: () => void) {
    setBusy(true);
    try {
      fn();
    } finally {
      // The mutate is fire-and-forget; UI optimism is fine because the
      // query is invalidated on success and re-renders fresh data.
      setTimeout(() => setBusy(false), 250);
    }
  }

  return (
    <li
      className={`flex flex-wrap items-center justify-between gap-3 px-3 py-3 ${
        user.ufr_active ? '' : 'bg-muted/30'
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">
          {user.full_name || user.email}
          {!user.user_active && (
            <span className="ml-2 rounded-full border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              account disabled
            </span>
          )}
        </div>
        <div className="truncate text-xs text-muted-foreground">{user.email}</div>
      </div>
      <select
        value={user.role}
        disabled={busy || !user.ufr_active}
        onChange={(e) =>
          withBusy(() =>
            onUpdate({ ufr_id: user.ufr_id, role: e.target.value as FranchiseRole }),
          )
        }
        className="h-9 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
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
        disabled={busy}
        onClick={() => withBusy(() => onUpdate({ ufr_id: user.ufr_id, is_active: !user.ufr_active }))}
      >
        {user.ufr_active ? 'Deactivate' : 'Reactivate'}
      </Button>
    </li>
  );
}
