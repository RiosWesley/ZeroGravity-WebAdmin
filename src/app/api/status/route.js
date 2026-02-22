import { getContainerStatus } from '@/lib/docker';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const status = await getContainerStatus();

    // Also try to hit the actual ZeroGravity API to check proxy health
    let zgHealth = 'unknown';
    try {
      const res = await fetch('http://localhost:8741/v1/models', { timeout: 2000 });
      if (res.ok) {
        zgHealth = 'healthy';
        const models = await res.json();
        return NextResponse.json({ ...status, zgHealth, models: models.data || [] });
      } else {
        zgHealth = 'unhealthy';
      }
    } catch (e) {
      zgHealth = 'offline/' + e.message;
    }

    return NextResponse.json({ ...status, zgHealth });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
