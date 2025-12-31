'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Card, CardContent } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

interface InvitationData {
  id: number;
  email: string;
  role: string;
  businessName: string;
  invitedByName: string;
  invitedByEmail: string;
  expiresAt: string;
}

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const [invitation, setInvitation] = useState<InvitationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [password, setPassword] = useState('');

  const token = params.token as string;

  useEffect(() => {
    const fetchInvitation = async () => {
      try {
        const response = await fetch(`/api/team/invite/accept?token=${token}`);
        const data = await response.json();

        if (!response.ok) {
          setError(data.error || 'Invalid or expired invitation');
          return;
        }

        setInvitation(data.invitation);
      } catch (err) {
        setError('Failed to load invitation');
      } finally {
        setLoading(false);
      }
    };

    fetchInvitation();
  }, [token]);

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password.trim()) {
      setError('Please enter your temporary password');
      return;
    }

    setAccepting(true);
    setError(null);

    try {
      // First accept the invitation (this creates the user if needed)
      const acceptResponse = await fetch('/api/team/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const acceptData = await acceptResponse.json();

      if (!acceptResponse.ok) {
        setError(acceptData.error || 'Failed to accept invitation');
        setAccepting(false);
        return;
      }

      // Now sign in with the credentials
      const signInResult = await signIn('credentials', {
        email: invitation?.email,
        password: password,
        redirect: false,
      });

      if (signInResult?.error) {
        // User was created but sign in failed - redirect to sign in page
        setSuccess(true);
        setTimeout(() => {
          router.push('/auth/signin');
        }, 2000);
        return;
      }

      setSuccess(true);

      // Redirect to dashboard after a short delay
      setTimeout(() => {
        router.push('/dashboard');
      }, 2000);
    } catch (err) {
      setError('Failed to accept invitation');
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error && !invitation) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-muted/30">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center gap-4 p-6">
            <XCircle className="h-12 w-12 text-red-500" />
            <h2 className="text-xl font-semibold">Invalid Invitation</h2>
            <p className="text-sm text-muted-foreground text-center">{error}</p>
            <Button onClick={() => router.push('/')}>Go to Homepage</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-muted/30">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center gap-4 p-6">
            <CheckCircle className="h-12 w-12 text-green-500" />
            <h2 className="text-xl font-semibold">Welcome to {invitation?.businessName}!</h2>
            <p className="text-sm text-muted-foreground text-center">
              You have successfully joined the team. Redirecting...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-muted/30">
      <Card className="max-w-md w-full">
        <CardContent className="flex flex-col gap-4 p-6">
          <div className="text-center">
            <h1 className="text-2xl font-semibold mb-2">You're Invited!</h1>
            <p className="text-sm text-muted-foreground">
              {invitation?.invitedByName} has invited you to join
            </p>
          </div>

          <Card className="bg-primary/5">
            <CardContent className="flex flex-col items-center gap-2 p-4">
              <h2 className="text-xl font-semibold">{invitation?.businessName}</h2>
              <p className="text-sm text-muted-foreground">Role: {invitation?.role}</p>
            </CardContent>
          </Card>

          <form onSubmit={handleAccept} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={invitation?.email || ''}
                disabled
                className="bg-muted"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Temporary Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter the password from your email"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Check your email for the temporary password
              </p>
            </div>

            {error && (
              <p className="text-sm text-red-500 text-center">{error}</p>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={accepting}>
              {accepting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Joining...
                </>
              ) : (
                'Accept Invitation'
              )}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center">
            This invitation expires on {invitation?.expiresAt ? new Date(invitation.expiresAt).toLocaleDateString() : 'N/A'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
