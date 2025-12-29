/**
 * Application Configuration
 *
 * Supports two deployment modes:
 * - 'self-hosted': Single instance, first user is owner, no public registration
 * - 'cloud': Multi-tenant SaaS, public registration, email invitations
 */

export type DeploymentMode = 'self-hosted' | 'cloud';

// Get deployment mode from environment variable, default to 'self-hosted'
export const DEPLOYMENT_MODE: DeploymentMode =
  (process.env.DEPLOYMENT_MODE as DeploymentMode) || 'self-hosted';

// Feature flags based on deployment mode
export const config = {
  // Deployment mode
  deploymentMode: DEPLOYMENT_MODE,

  // Self-hosted mode settings
  selfHosted: {
    // Allow public registration (signup page)
    allowPublicRegistration: DEPLOYMENT_MODE === 'cloud',

    // Allow Google OAuth signup (creates new accounts)
    allowOAuthSignup: DEPLOYMENT_MODE === 'cloud',

    // Show "Sign up" link on signin page
    showSignupLink: DEPLOYMENT_MODE === 'cloud',

    // Send email invitations (vs just showing temp password)
    sendEmailInvitations: DEPLOYMENT_MODE === 'cloud',
  },

  // Cloud mode settings (preserved for future SaaS version)
  cloud: {
    // Allow multiple businesses per user
    allowMultipleBusinesses: true,

    // Enable subscription/billing features
    enableBilling: false,

    // Enable email verification
    requireEmailVerification: false,
  },
};

// Helper to check if we're in self-hosted mode
export const isSelfHosted = () => DEPLOYMENT_MODE === 'self-hosted';

// Helper to check if we're in cloud mode
export const isCloudMode = () => DEPLOYMENT_MODE === 'cloud';

