'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { RequireAuth } from '@/components/auth/require-auth';
import { AppShell, PageActions, PageTitle } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateFranchise, useMyFranchises } from '@/features/franchises/hooks';

interface CreateValues {
  name: string;
  slug: string;
  gstin: string;
  address: string;
  phone: string;
  state: string;
  state_code: string;
}

export default function NewFranchisePage() {
  return (
    <RequireAuth>
      <NewFranchiseView />
    </RequireAuth>
  );
}

function NewFranchiseView() {
  const router = useRouter();
  const { data, isLoading } = useMyFranchises();
  const create = useCreateFranchise();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateValues>({
    defaultValues: {
      name: '',
      slug: '',
      gstin: '',
      address: '',
      phone: '',
      state: '',
      state_code: '',
    },
  });

  if (isLoading) {
    return (
      <AppShell>
        <PageTitle title="New franchise" />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </AppShell>
    );
  }

  if (!data?.is_super_admin) {
    return (
      <AppShell>
        <PageTitle title="New franchise" />
        <Card>
          <CardHeader>
            <CardTitle>Super admins only</CardTitle>
            <CardDescription>
              Creating a new franchise is reserved for platform owners. Talk to your super admin if
              you need a new franchise provisioned.
            </CardDescription>
          </CardHeader>
        </Card>
      </AppShell>
    );
  }

  async function onSubmit(values: CreateValues) {
    try {
      const res = await create.mutateAsync({
        name: values.name.trim(),
        slug: values.slug.trim().toLowerCase(),
        gstin: values.gstin.trim().toUpperCase(),
        address: values.address.trim() || undefined,
        phone: values.phone.trim() || undefined,
        state: values.state.trim() || undefined,
        state_code: values.state_code.trim() || undefined,
      });
      toast.success(`${res.franchise.name} created`);
      // Send them straight into Settings so they can add bank, GST, logos.
      router.push(`/franchises/${res.franchise.slug}/settings`);
    } catch (e) {
      toast.error((e as Error).message || 'Create failed');
    }
  }

  return (
    <AppShell>
      <PageTitle title="New franchise" />

      <PageActions>
        <Button variant="outline" onClick={() => router.push('/franchises')}>
          Cancel
        </Button>
      </PageActions>

      <div className="mx-auto w-full max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Franchise details</CardTitle>
            <CardDescription>
              Bank details, GST rates, logos, and signature can be added after creation from the
              franchise&apos;s Settings page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit(onSubmit)}>
              <Field label="Name" error={errors.name?.message}>
                <Input
                  {...register('name', { required: 'Required', maxLength: 200 })}
                  aria-invalid={!!errors.name}
                  placeholder="M.R. Air Conditioning &amp; Refrigeration Engineering"
                />
              </Field>
              <Field label="Slug" error={errors.slug?.message}>
                <Input
                  {...register('slug', {
                    required: 'Required',
                    pattern: {
                      value: /^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?$/,
                      message: 'Lowercase letters, digits, hyphens (2–30 chars)',
                    },
                  })}
                  aria-invalid={!!errors.slug}
                  className="font-mono"
                  placeholder="mr-aircon"
                />
              </Field>
              <Field label="GSTIN" className="sm:col-span-2" error={errors.gstin?.message}>
                <Input
                  {...register('gstin', {
                    required: 'Required',
                    pattern: {
                      value: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[0-9A-Z]{1}$/,
                      message: 'Invalid GSTIN format',
                    },
                  })}
                  aria-invalid={!!errors.gstin}
                  className="font-mono uppercase"
                  placeholder="29AOBPK1486M1ZI"
                />
              </Field>
              <Field label="Address" className="sm:col-span-2" error={errors.address?.message}>
                <Input {...register('address', { maxLength: 1000 })} />
              </Field>
              <Field label="Phone" error={errors.phone?.message}>
                <Input {...register('phone', { maxLength: 30 })} />
              </Field>
              <Field label="State" error={errors.state?.message}>
                <Input {...register('state', { maxLength: 100 })} placeholder="Karnataka" />
              </Field>
              <Field label="State code" error={errors.state_code?.message}>
                <Input
                  {...register('state_code', { maxLength: 10 })}
                  className="font-mono"
                  placeholder="29"
                />
              </Field>
              <div className="sm:col-span-2 flex justify-end">
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending ? 'Creating…' : 'Create franchise'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function Field({
  label,
  error,
  children,
  className,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1 ${className ?? ''}`}>
      <Label>{label}</Label>
      {children}
      <FormError message={error} />
    </div>
  );
}
