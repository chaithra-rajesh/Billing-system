'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

/**
 * Landing page for invite emails.
 *
 * The Supabase invite link redirects here with a one-time token in the URL
 * (`?code=...` for PKCE, `#access_token=...` for the implicit flow). The
 * supabase-js client is configured with `detectSessionInUrl: true`, so by
 * the time React mounts the session has already been established. We just
 * need to let the user pick a password and call `auth.updateUser` to set it.
 *
 * If the URL doesn't contain a token (someone visited the page directly,
 * or the token expired), `useAuth` resolves with no session and we surface
 * an "invalid or expired invite" message instead of a password form.
 */
interface SetPasswordValues {
  password: string;
  confirmPassword: string;
}

export default function AcceptInvitePage() {
  const router = useRouter();
  const { session, user, loading } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<SetPasswordValues>({
    defaultValues: { password: '', confirmPassword: '' },
  });
  const passwordValue = watch('password');

  // Strip the auth fragment / query params from the URL after Supabase has
  // consumed them so a future refresh doesn't try to re-process the token.
  useEffect(() => {
    if (loading) return;
    if (typeof window !== 'undefined' && (window.location.hash || window.location.search)) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [loading]);

  async function onSubmit(values: SetPasswordValues) {
    if (values.password !== values.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setSubmitting(true);
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.updateUser({ password: values.password });
    setSubmitting(false);
    if (error) {
      toast.error(error.message || 'Could not set password');
      return;
    }
    toast.success('Password set — welcome!');
    router.replace('/franchises');
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <p className="text-sm text-muted-foreground">Verifying invite…</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Invite link expired</CardTitle>
            <CardDescription>
              This invite link is invalid or has already been used. Ask your franchise admin to
              re-send the invite, or sign in if you've already set a password.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button variant="outline" onClick={() => router.replace('/login')} className="w-full">
              Go to sign in
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Welcome{user?.email ? `, ${user.email}` : ''}</CardTitle>
          <CardDescription>Set a password to finish creating your account.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                aria-invalid={errors.password ? true : undefined}
                {...register('password', {
                  required: 'Password is required',
                  minLength: { value: 8, message: 'Must be at least 8 characters' },
                })}
              />
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                aria-invalid={errors.confirmPassword ? true : undefined}
                {...register('confirmPassword', {
                  required: 'Confirm your password',
                  validate: (v) => v === passwordValue || 'Passwords do not match',
                })}
              />
              {errors.confirmPassword && (
                <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Saving…' : 'Set password & continue'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
