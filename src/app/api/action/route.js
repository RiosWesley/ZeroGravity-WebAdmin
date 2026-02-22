import { restartContainer, stopContainer, startContainer } from '@/lib/docker';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { action } = await request.json();

    if (action === 'restart') {
      await restartContainer();
      return NextResponse.json({ success: true, message: 'Container restarted' });
    } else if (action === 'stop') {
      await stopContainer();
      return NextResponse.json({ success: true, message: 'Container stopped' });
    } else if (action === 'start') {
      await startContainer();
      return NextResponse.json({ success: true, message: 'Container started' });
    } else {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
