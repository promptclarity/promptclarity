import { NextRequest } from 'next/server';
import { promptExecutionConnections } from '@/app/lib/services/prompt-execution.service';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const businessId = searchParams.get('businessId');

  if (!businessId) {
    return new Response('Business ID is required', { status: 400 });
  }

  const businessIdNum = parseInt(businessId);

  // Create a TransformStream for SSE
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();

  // Send initial connection message
  writer.write(encoder.encode('data: {"type":"connected"}\n\n'));

  // Store the connection
  const sendUpdate = (data: any) => {
    const message = `data: ${JSON.stringify({ type: 'execution_update', ...data })}\n\n`;
    writer.write(encoder.encode(message)).catch(() => {
      // Connection closed, clean up
      promptExecutionConnections.delete(businessIdNum);
    });
  };

  promptExecutionConnections.set(businessIdNum, sendUpdate);

  // Clean up on disconnect
  request.signal.addEventListener('abort', () => {
    promptExecutionConnections.delete(businessIdNum);
    writer.close();
  });

  // Keep connection alive with periodic pings
  const pingInterval = setInterval(() => {
    writer.write(encoder.encode(':ping\n\n')).catch(() => {
      clearInterval(pingInterval);
      promptExecutionConnections.delete(businessIdNum);
    });
  }, 30000);

  // Clean up interval on disconnect
  request.signal.addEventListener('abort', () => {
    clearInterval(pingInterval);
  });

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}