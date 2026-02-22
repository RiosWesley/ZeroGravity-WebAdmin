// src/app/api/logs/route.js
import { getLogs } from '@/lib/docker';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const url = new URL(request.url);
  const tail = url.searchParams.get('tail') || 100;

  try {
    const logs = await getLogs(parseInt(tail, 10));
    return NextResponse.json({ logs });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
