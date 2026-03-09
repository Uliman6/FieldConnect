/**
 * Project Invitations Controller
 * Handles inviting users to projects and managing invitations
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { getUserProjectAccess } = require('../middleware/auth.middleware');

/**
 * Send an invitation to join a project
 */
async function sendInvitation(req, res) {
  try {
    const { projectId } = req.params;
    const { email, role = 'MEMBER', message } = req.body;
    const inviterId = req.user.id;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Check if user has permission to invite (must be OWNER or ADMIN, or system admin)
    const access = await getUserProjectAccess(inviterId, projectId);
    if (!access || (!access.isSystemAdmin && !['OWNER', 'ADMIN'].includes(access.role))) {
      return res.status(403).json({ error: 'You do not have permission to invite users to this project' });
    }

    // Check if there's already a pending invitation for this email
    const existingInvitation = await prisma.projectInvitation.findFirst({
      where: {
        projectId,
        email: email.toLowerCase(),
        status: 'PENDING'
      }
    });

    if (existingInvitation) {
      return res.status(400).json({ error: 'An invitation has already been sent to this email' });
    }

    // Check if user is already a member
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (existingUser) {
      const existingMembership = await prisma.userProject.findUnique({
        where: {
          userId_projectId: {
            userId: existingUser.id,
            projectId
          }
        }
      });

      if (existingMembership) {
        return res.status(400).json({ error: 'This user is already a member of the project' });
      }
    }

    // Create the invitation (expires in 7 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invitation = await prisma.projectInvitation.create({
      data: {
        email: email.toLowerCase(),
        role,
        message,
        projectId,
        invitedById: inviterId,
        expiresAt
      },
      include: {
        project: {
          select: { id: true, name: true }
        },
        invitedBy: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    // TODO: Send email notification to invitee

    res.status(201).json(invitation);
  } catch (error) {
    console.error('[invitations] Error sending invitation:', error);
    res.status(500).json({ error: 'Failed to send invitation' });
  }
}

/**
 * Get all invitations for a project
 */
async function getProjectInvitations(req, res) {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;

    // Check if user has access to the project (including system admins)
    const access = await getUserProjectAccess(userId, projectId);
    if (!access) {
      return res.status(403).json({ error: 'You do not have access to this project' });
    }

    const invitations = await prisma.projectInvitation.findMany({
      where: { projectId },
      include: {
        invitedBy: {
          select: { id: true, name: true, email: true }
        },
        acceptedBy: {
          select: { id: true, name: true, email: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(invitations);
  } catch (error) {
    console.error('[invitations] Error fetching project invitations:', error);
    res.status(500).json({ error: 'Failed to fetch invitations' });
  }
}

/**
 * Get my pending invitations
 */
async function getMyInvitations(req, res) {
  try {
    const userEmail = req.user.email;

    const invitations = await prisma.projectInvitation.findMany({
      where: {
        email: userEmail.toLowerCase(),
        status: 'PENDING',
        expiresAt: { gt: new Date() }
      },
      include: {
        project: {
          select: { id: true, name: true, number: true, address: true }
        },
        invitedBy: {
          select: { id: true, name: true, email: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(invitations);
  } catch (error) {
    console.error('[invitations] Error fetching my invitations:', error);
    res.status(500).json({ error: 'Failed to fetch invitations' });
  }
}

/**
 * Accept an invitation
 */
async function acceptInvitation(req, res) {
  try {
    const { invitationId } = req.params;
    const userId = req.user.id;
    const userEmail = req.user.email;

    const invitation = await prisma.projectInvitation.findUnique({
      where: { id: invitationId },
      include: {
        project: {
          select: { id: true, name: true }
        }
      }
    });

    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    if (invitation.email.toLowerCase() !== userEmail.toLowerCase()) {
      return res.status(403).json({ error: 'This invitation was not sent to you' });
    }

    if (invitation.status !== 'PENDING') {
      return res.status(400).json({ error: `Invitation has already been ${invitation.status.toLowerCase()}` });
    }

    if (new Date() > invitation.expiresAt) {
      await prisma.projectInvitation.update({
        where: { id: invitationId },
        data: { status: 'EXPIRED' }
      });
      return res.status(400).json({ error: 'Invitation has expired' });
    }

    // Create the membership and update invitation in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create membership
      const membership = await tx.userProject.create({
        data: {
          userId,
          projectId: invitation.projectId,
          role: invitation.role
        }
      });

      // Update invitation
      const updatedInvitation = await tx.projectInvitation.update({
        where: { id: invitationId },
        data: {
          status: 'ACCEPTED',
          acceptedById: userId,
          acceptedAt: new Date()
        },
        include: {
          project: {
            select: { id: true, name: true }
          }
        }
      });

      return { membership, invitation: updatedInvitation };
    });

    res.json({
      message: `Successfully joined project "${invitation.project.name}"`,
      membership: result.membership,
      invitation: result.invitation
    });
  } catch (error) {
    console.error('[invitations] Error accepting invitation:', error);
    res.status(500).json({ error: 'Failed to accept invitation' });
  }
}

/**
 * Decline an invitation
 */
async function declineInvitation(req, res) {
  try {
    const { invitationId } = req.params;
    const userEmail = req.user.email;

    const invitation = await prisma.projectInvitation.findUnique({
      where: { id: invitationId }
    });

    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    if (invitation.email.toLowerCase() !== userEmail.toLowerCase()) {
      return res.status(403).json({ error: 'This invitation was not sent to you' });
    }

    if (invitation.status !== 'PENDING') {
      return res.status(400).json({ error: `Invitation has already been ${invitation.status.toLowerCase()}` });
    }

    const updatedInvitation = await prisma.projectInvitation.update({
      where: { id: invitationId },
      data: { status: 'DECLINED' }
    });

    res.json({ message: 'Invitation declined', invitation: updatedInvitation });
  } catch (error) {
    console.error('[invitations] Error declining invitation:', error);
    res.status(500).json({ error: 'Failed to decline invitation' });
  }
}

/**
 * Cancel an invitation (by project admin)
 */
async function cancelInvitation(req, res) {
  try {
    const { invitationId } = req.params;
    const userId = req.user.id;

    const invitation = await prisma.projectInvitation.findUnique({
      where: { id: invitationId }
    });

    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    // Check if user has permission to cancel (including system admins)
    const access = await getUserProjectAccess(userId, invitation.projectId);
    if (!access || (!access.isSystemAdmin && !['OWNER', 'ADMIN'].includes(access.role))) {
      return res.status(403).json({ error: 'You do not have permission to cancel this invitation' });
    }

    if (invitation.status !== 'PENDING') {
      return res.status(400).json({ error: 'Only pending invitations can be cancelled' });
    }

    await prisma.projectInvitation.delete({
      where: { id: invitationId }
    });

    res.json({ message: 'Invitation cancelled' });
  } catch (error) {
    console.error('[invitations] Error cancelling invitation:', error);
    res.status(500).json({ error: 'Failed to cancel invitation' });
  }
}

/**
 * Get project members
 */
async function getProjectMembers(req, res) {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;

    // Check if user has access to the project (including system admins)
    const access = await getUserProjectAccess(userId, projectId);
    if (!access) {
      return res.status(403).json({ error: 'You do not have access to this project' });
    }

    const members = await prisma.userProject.findMany({
      where: { projectId },
      include: {
        user: {
          select: { id: true, name: true, email: true }
        }
      },
      orderBy: [
        { role: 'asc' },
        { createdAt: 'asc' }
      ]
    });

    res.json(members);
  } catch (error) {
    console.error('[invitations] Error fetching project members:', error);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
}

/**
 * Remove a member from a project
 */
async function removeMember(req, res) {
  try {
    const { projectId, memberId } = req.params;
    const userId = req.user.id;

    // Check if user has permission (must be OWNER or ADMIN, or system admin)
    const access = await getUserProjectAccess(userId, projectId);
    if (!access || (!access.isSystemAdmin && !['OWNER', 'ADMIN'].includes(access.role))) {
      return res.status(403).json({ error: 'You do not have permission to remove members' });
    }

    // Can't remove yourself if you're the only owner
    if (memberId === userId && access.role === 'OWNER') {
      const ownerCount = await prisma.userProject.count({
        where: { projectId, role: 'OWNER' }
      });
      if (ownerCount <= 1) {
        return res.status(400).json({ error: 'Cannot remove the only owner of the project' });
      }
    }

    // Check if target is also an owner (only owners can remove owners)
    const targetMembership = await prisma.userProject.findUnique({
      where: {
        userId_projectId: {
          userId: memberId,
          projectId
        }
      }
    });

    if (!targetMembership) {
      return res.status(404).json({ error: 'Member not found' });
    }

    if (targetMembership.role === 'OWNER' && access.role !== 'OWNER') {
      return res.status(403).json({ error: 'Only owners can remove other owners' });
    }

    await prisma.userProject.delete({
      where: {
        userId_projectId: {
          userId: memberId,
          projectId
        }
      }
    });

    res.json({ message: 'Member removed from project' });
  } catch (error) {
    console.error('[invitations] Error removing member:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
}

module.exports = {
  sendInvitation,
  getProjectInvitations,
  getMyInvitations,
  acceptInvitation,
  declineInvitation,
  cancelInvitation,
  getProjectMembers,
  removeMember
};
