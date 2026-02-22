import { readAccountsFile } from '@/lib/accounts';
import { execCommand } from '@/lib/docker';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const data = await readAccountsFile();
    // accounts.json structure: { accounts: [...], active: 'email' }
    // accounts array members: { email, refresh_token, extracted_at }
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { action, payload } = await request.json();

    if (action === 'set') {
      try {
        const output = await execCommand(['zg', 'accounts', 'set', payload.email || '']);
        return NextResponse.json({ success: true, message: output });
      } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
      }
    } else if (action === 'remove') {
      try {
        const output = await execCommand(['zg', 'accounts', 'remove', payload.email || '']);
        return NextResponse.json({ success: true, message: output });
      } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
      }
    } else if (action === 'extract') {
      try {
        // Read existing accounts to detect duplicates later
        const beforeData = await readAccountsFile();
        const beforeTokens = (beforeData.accounts || []).map(a => a.refresh_token);

        const output = await execCommand(['zg', 'extract']);

        // Read updated accounts
        const afterData = await readAccountsFile();
        const afterAccounts = afterData.accounts || [];

        // Check for duplicates
        // If there's an account in afterData whose token is in beforeTokens, it means no new token was added
        // Alternatively, if afterAccounts length is the same and all tokens are identical
        const newAccounts = afterAccounts.filter(a => !beforeTokens.includes(a.refresh_token));

        if (newAccounts.length === 0 && afterAccounts.length > 0) {
          return NextResponse.json({
            success: true,
            duplicate: true,
            warning: 'Token captured, but it is the same as an existing one. Did you switch accounts in Antigravity?',
            message: output
          });
        }

        return NextResponse.json({
          success: true,
          duplicate: false,
          message: output
        });
      } catch (err) {
        // If zg extract fails for some reason
        return NextResponse.json({ error: err.message, failed: true }, { status: 500 });
      }
    } else {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
