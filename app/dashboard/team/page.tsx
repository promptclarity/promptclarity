'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Badge } from '@/app/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/app/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/app/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/app/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/app/components/ui/table';
import { Plus, Mail, Trash2, Loader2, Clock, CheckCircle2, Copy } from 'lucide-react';
import { useBusiness } from '@/app/contexts/BusinessContext';

interface TeamMember {
  id: number;
  userId: string;
  name: string;
  email: string;
  image?: string;
  role: string;
  joinedAt: string;
  invitedByName?: string;
}

interface PendingInvitation {
  id: number;
  email: string;
  role: string;
  invitedByName: string;
  createdAt: string;
  expiresAt: string;
}

interface Owner {
  id: string;
  name: string;
  email: string;
  image?: string;
  role: string;
}

export default function TeamPage() {
  const { business } = useBusiness();
  const [owner, setOwner] = useState<Owner | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [isExistingUser, setIsExistingUser] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [passwordCopied, setPasswordCopied] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(null);
  const [invitationToCancel, setInvitationToCancel] = useState<PendingInvitation | null>(null);

  const fetchTeamData = async (refresh = false) => {
    if (!business?.id) return;

    try {
      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      const response = await fetch(`/api/team/members?businessId=${business.id}`);
      if (response.ok) {
        const data = await response.json();
        setOwner(data.owner);
        setMembers(data.members || []);
        setPendingInvitations(data.pendingInvitations || []);
        setIsOwner(data.isOwner || false);
      }
    } catch (error) {
      console.error('Error fetching team data:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTeamData();
  }, [business?.id]);

  const handleSendInvite = async () => {
    if (!inviteName.trim() || !inviteEmail.trim() || !business?.id) return;

    setIsSendingInvite(true);
    setInviteError(null);
    setInviteSuccess(null);

    try {
      const response = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: business.id,
          name: inviteName.trim(),
          email: inviteEmail.trim(),
          role: inviteRole,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setInviteError(data.error || 'Failed to send invitation');
        return;
      }

      setInviteSuccess(`User created for ${inviteEmail}`);
      setInviteLink(data.inviteLink);
      setTempPassword(data.tempPassword);
      setIsExistingUser(data.isExistingUser || false);
      // Keep email for display, but clear name
      setInviteName('');
      // Don't clear email - we need it for display
      fetchTeamData(true);

      // Don't auto-close - let user copy the link first
    } catch (error) {
      setInviteError('Failed to send invitation');
    } finally {
      setIsSendingInvite(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!memberToRemove || !business?.id) return;

    try {
      const response = await fetch('/api/team/members', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: business.id,
          userId: memberToRemove.userId,
        }),
      });

      if (response.ok) {
        fetchTeamData(true);
      }
    } catch (error) {
      console.error('Error removing member:', error);
    } finally {
      setMemberToRemove(null);
    }
  };

  const handleCancelInvitation = async () => {
    if (!invitationToCancel || !business?.id) return;

    try {
      const response = await fetch('/api/team/invite', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: business.id,
          invitationId: invitationToCancel.id,
        }),
      });

      if (response.ok) {
        fetchTeamData(true);
      }
    } catch (error) {
      console.error('Error canceling invitation:', error);
    } finally {
      setInvitationToCancel(null);
    }
  };

  const handleCopyLink = async () => {
    if (inviteLink) {
      await navigator.clipboard.writeText(inviteLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  };

  const handleCopyPassword = async () => {
    if (tempPassword) {
      await navigator.clipboard.writeText(tempPassword);
      setPasswordCopied(true);
      setTimeout(() => setPasswordCopied(false), 2000);
    }
  };

  const handleCloseInviteDialog = (open: boolean) => {
    setShowInviteDialog(open);
    if (!open) {
      // Reset state when closing
      setInviteName('');
      setInviteEmail('');
      setInviteError(null);
      setInviteSuccess(null);
      setInviteLink(null);
      setTempPassword(null);
      setIsExistingUser(false);
      setLinkCopied(false);
      setPasswordCopied(false);
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'owner':
        return 'bg-amber-100 text-amber-800';
      case 'admin':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-sm text-muted-foreground">Loading team...</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Team Members */}
      <Card className="mb-4">
        <CardContent className="pt-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm">Team Members</span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchTeamData(true)}
                disabled={isRefreshing}
              >
                <Loader2 className={`h-4 w-4 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              {isOwner && (
                <Button size="sm" onClick={() => setShowInviteDialog(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Member
                </Button>
              )}
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Owner */}
              {owner && (
                <TableRow>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={owner.image} alt={owner.name} />
                        <AvatarFallback>{owner.name?.[0] || owner.email[0]}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm ">{owner.name || 'No name'}</p>
                        <p className="text-xs text-muted-foreground">{owner.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="bg-amber-100 text-amber-800">Owner</Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">-</span>
                  </TableCell>
                  <TableCell></TableCell>
                </TableRow>
              )}

              {/* Members */}
              {members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={member.image} alt={member.name} />
                        <AvatarFallback>{member.name?.[0] || member.email[0]}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm ">{member.name || 'No name'}</p>
                        <p className="text-xs text-muted-foreground">{member.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={getRoleBadgeVariant(member.role)}>
                      {member.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {new Date(member.joinedAt).toLocaleDateString()}
                    </span>
                  </TableCell>
                  <TableCell>
                    {isOwner && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setMemberToRemove(member)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}

              {!owner && members.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4}>
                    <div className="flex items-center justify-center py-8">
                      <span className="text-sm text-muted-foreground">No team members yet</span>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pending Invitations */}
      {pendingInvitations.length > 0 && (
        <Card>
          <CardContent className="pt-3">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Pending Invitations</span>
              <span className="text-muted-foreground text-sm">·</span>
              <span className="text-sm text-muted-foreground">Invitations waiting to be accepted</span>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Invited By</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingInvitations.map((invitation) => (
                  <TableRow key={invitation.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{invitation.email}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={getRoleBadgeVariant(invitation.role)}>
                        {invitation.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">{invitation.invitedByName}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {new Date(invitation.expiresAt).toLocaleDateString()}
                      </span>
                    </TableCell>
                    <TableCell>
                      {isOwner && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setInvitationToCancel(invitation)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Invite Dialog */}
      <Dialog open={showInviteDialog} onOpenChange={handleCloseInviteDialog}>
        <DialogContent className="max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{inviteSuccess ? 'User Created' : 'Add Team Member'}</DialogTitle>
            <DialogDescription>
              {inviteSuccess
                ? 'Share the login credentials below with your team member.'
                : `Add a new team member to ${business?.businessName}.`
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {!inviteSuccess && (
              <>
                <div>
                  <label className="text-sm mb-2 block">Name</label>
                  <Input
                    placeholder="John Doe"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm mb-2 block">Email Address</label>
                  <Input
                    placeholder="colleague@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    type="email"
                  />
                </div>
              </>
            )}

            {inviteError && (
              <p className="text-sm text-destructive">{inviteError}</p>
            )}

            {inviteSuccess && (
              <div className="space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-md p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium text-green-800">User added successfully!</span>
                  </div>
                  <p className="text-sm text-green-700">
                    Share the login credentials below with your team member.
                  </p>
                </div>

                {isExistingUser ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
                    <p className="text-sm text-amber-800">
                      This user already has an account. They can sign in with their <strong>existing password</strong> and will have access to this project.
                    </p>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="text-sm mb-2 block font-medium">Email</label>
                      <div className="flex gap-2">
                        <Input
                          value={inviteEmail}
                          readOnly
                          className="flex-1"
                        />
                      </div>
                    </div>

                    {tempPassword && (
                      <div>
                        <label className="text-sm mb-2 block font-medium">Temporary Password</label>
                        <div className="flex gap-2">
                          <Input
                            value={tempPassword}
                            readOnly
                            className="flex-1 font-mono"
                          />
                          <Button onClick={handleCopyPassword} variant={passwordCopied ? 'secondary' : 'default'}>
                            {passwordCopied ? (
                              <>
                                <CheckCircle2 className="h-4 w-4 mr-1" />
                                Copied!
                              </>
                            ) : (
                              <>
                                <Copy className="h-4 w-4 mr-1" />
                                Copy
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    )}

                    <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                      <p className="text-sm text-blue-800">
                        Tell your team member to log in using this email and the password we've generated for them.
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            {inviteSuccess ? (
              <Button variant="secondary" onClick={() => handleCloseInviteDialog(false)}>
                Done
              </Button>
            ) : (
              <>
                <Button variant="secondary" onClick={() => handleCloseInviteDialog(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSendInvite}
                  disabled={!inviteName.trim() || !inviteEmail.trim() || isSendingInvite}
                >
                  {isSendingInvite ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Add User
                    </>
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Member Confirmation */}
      <AlertDialog open={!!memberToRemove} onOpenChange={() => setMemberToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Team Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{memberToRemove?.name || memberToRemove?.email}</strong> from the team?
              They will no longer have access to this project.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveMember} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove Member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Invitation Confirmation */}
      <AlertDialog open={!!invitationToCancel} onOpenChange={() => setInvitationToCancel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Invitation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel the invitation to <strong>{invitationToCancel?.email}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Invitation</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelInvitation} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Cancel Invitation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
