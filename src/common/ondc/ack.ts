// ACK/NACK shape for the synchronous response to any inbound ONDC request.
// See docs/ondc/overview.md "ACK / NACK".

export function buildAck() {
  return { message: { ack: { status: 'ACK' as const } } };
}

export function buildNack(code: string, message: string) {
  return {
    message: { ack: { status: 'NACK' as const } },
    error: { code, message },
  };
}
