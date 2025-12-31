import { Resend } from 'resend';

// Lazy-load Resend instance to avoid build-time errors when API key is not available
let resendInstance: Resend | null = null;

function getResend(): Resend {
  if (!resendInstance) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY environment variable is not set');
    }
    resendInstance = new Resend(apiKey);
  }
  return resendInstance;
}

interface SendInvitationEmailParams {
  to: string;
  inviterName: string;
  businessName: string;
  inviteLink: string;
  tempPassword: string;
}

export async function sendInvitationEmail({
  to,
  inviterName,
  businessName,
  inviteLink,
  tempPassword,
}: SendInvitationEmailParams) {
  const { data, error } = await getResend().emails.send({
    from: process.env.RESEND_FROM_EMAIL || 'PromptClarity <noreply@PromptClarity.com>',
    to,
    subject: `${inviterName} invited you to join ${businessName} on PromptClarity`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">You're Invited!</h1>
          </div>

          <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
            <p style="font-size: 16px; margin-bottom: 20px;">
              <strong>${inviterName}</strong> has invited you to join <strong>${businessName}</strong> on PromptClarity.
            </p>

            <p style="font-size: 14px; color: #666; margin-bottom: 20px;">
              PromptClarity helps businesses track and improve their visibility across AI platforms like ChatGPT, Claude, and Perplexity.
            </p>

            <div style="background: white; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
              <p style="font-size: 14px; color: #666; margin: 0 0 10px 0;">Your login credentials:</p>
              <p style="font-size: 14px; margin: 0 0 8px 0;"><strong>Email:</strong> ${to}</p>
              <p style="font-size: 14px; margin: 0;"><strong>Temporary Password:</strong> <code style="background: #f0f0f0; padding: 4px 8px; border-radius: 4px; font-family: monospace;">${tempPassword}</code></p>
            </div>

            <a href="${inviteLink}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
              Accept Invitation
            </a>

            <p style="font-size: 12px; color: #999; margin-top: 30px;">
              This invitation will expire in 7 days. You can change your password after signing in. If you didn't expect this invitation, you can safely ignore this email.
            </p>

            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

            <p style="font-size: 12px; color: #999; margin: 0;">
              If the button doesn't work, copy and paste this link into your browser:<br>
              <a href="${inviteLink}" style="color: #667eea;">${inviteLink}</a>
            </p>
          </div>
        </body>
      </html>
    `,
  });

  if (error) {
    console.error('Failed to send invitation email:', error);
    throw new Error(`Failed to send invitation email: ${error.message}`);
  }

  return data;
}
