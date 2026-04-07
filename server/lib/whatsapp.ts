import crypto from 'crypto';

export interface ParsedMessage {
  from: string;
  messageId: string;
  text: string;
  timestamp: Date;
  contactName?: string;
}

/**
 * Parses an inbound WhatsApp webhook payload (Cloud API format / 360dialog)
 */
export function parseInboundMessage(body: any): ParsedMessage | null {
  if (body.object !== 'whatsapp_business_account' && !body.entry) {
    return null;
  }

  const entry = body.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;
  const messages = value?.messages;

  if (!messages || messages.length === 0) {
    return null;
  }

  const message = messages[0];
  const contact = value.contacts?.[0];

  // Only handle text for now
  if (message.type !== 'text') {
    return null;
  }

  return {
    from: message.from,
    messageId: message.id,
    text: message.text.body,
    timestamp: new Date(parseInt(message.timestamp) * 1000),
    contactName: contact?.profile?.name,
  };
}

/**
 * Verify webhook signature (for Meta direct or similar requiring hub.signature)
 * 360dialog does hub.verify_token in GET req.
 */
export function verifyWebhookSignature(payload: string, signature: string, appSecret: string): boolean {
  if (!signature) return false;
  
  const expectedHash = crypto
    .createHmac('sha256', appSecret)
    .update(payload)
    .digest('hex');
    
  // Often signature comes as sha256=...
  const actualHash = signature.includes('=') ? signature.split('=')[1] : signature;
  return expectedHash === actualHash;
}
