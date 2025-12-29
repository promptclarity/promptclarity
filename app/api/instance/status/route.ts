import { NextResponse } from 'next/server';
import { dbHelpers } from '@/app/lib/db/database';
import { config, DEPLOYMENT_MODE } from '@/app/lib/config';
import db from '@/app/lib/db/database';

// Force dynamic - never cache this route
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface InstanceSettings {
  id: number;
  initialized: number;
  initialized_at: string | null;
  owner_user_id: string | null;
  deployment_mode: string;
  instance_name: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * GET /api/instance/status
 * Returns the instance initialization status
 * This endpoint is public (no auth required) to allow first-run detection
 */
export async function GET() {
  try {
    // First check: do any users exist? If so, instance is already set up
    // This handles existing installations that don't have instance_settings yet
      console.log('!!!!!!!!!!!!!');
      let userCount = 0;
    try {
      const result = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
      userCount = result?.count || 0;
      console.log('[instance/status] userCount:', userCount, 'result:', result);
    } catch (err) {
      // Table might not exist yet on very fresh install
      console.log('[instance/status] error counting users:', err);
      userCount = 0;
    }

    // If users exist, the instance is initialized (regardless of instance_settings)
    if (userCount > 0) {
      // Try to get instance settings for additional info
      let settings: InstanceSettings | undefined;
      try {
        settings = dbHelpers.getInstanceSettings.get() as InstanceSettings | undefined;
      } catch {
        // Table might not exist yet
      }

      // If instance_settings exists but isn't marked initialized, mark it now
      // (This handles migration for existing installs)
      if (settings && !settings.initialized) {
        try {
          db.prepare(`
            UPDATE instance_settings
            SET initialized = 1, initialized_at = datetime('now'), updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
          `).run();
        } catch {
          // Ignore errors
        }
      }

      return NextResponse.json({
        initialized: true,
        instanceName: settings?.instance_name,
        deploymentMode: DEPLOYMENT_MODE,
        allowPublicRegistration: config.selfHosted.allowPublicRegistration,
        showSignupLink: config.selfHosted.showSignupLink,
      });
    }

    // No users exist - check instance_settings
    let settings: InstanceSettings | undefined;
    try {
      settings = dbHelpers.getInstanceSettings.get() as InstanceSettings | undefined;
      console.log('[instance/status] instance_settings:', settings);
    } catch (err) {
      // Table doesn't exist yet (fresh install)
      console.log('[instance/status] error getting instance_settings:', err);
    }

    // If instance_settings shows initialized, trust that (handles edge cases)
    if (settings?.initialized) {
      console.log('[instance/status] returning initialized=true from instance_settings');
      return NextResponse.json({
        initialized: true,
        instanceName: settings.instance_name,
        deploymentMode: DEPLOYMENT_MODE,
        allowPublicRegistration: config.selfHosted.allowPublicRegistration,
        showSignupLink: config.selfHosted.showSignupLink,
      });
    }

    // Fresh install - no users, not initialized
    console.log('[instance/status] returning initialized=false, userCount:', userCount, 'settings:', settings);
    return NextResponse.json({
      initialized: false,
      deploymentMode: DEPLOYMENT_MODE,
      allowPublicRegistration: config.selfHosted.allowPublicRegistration,
      showSignupLink: config.selfHosted.showSignupLink,
    });
  } catch (error) {
    console.error('Error getting instance status:', error);
    // On error, assume initialized to avoid blocking existing users
    return NextResponse.json({
      initialized: true,
      deploymentMode: DEPLOYMENT_MODE,
      allowPublicRegistration: config.selfHosted.allowPublicRegistration,
      showSignupLink: config.selfHosted.showSignupLink,
    });
  }
}
