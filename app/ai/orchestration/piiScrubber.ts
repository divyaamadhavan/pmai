/**
 * PII scrubber — removes common personally-identifiable information
 * from text before it is sent to any external AI API.
 */

// Pattern for email addresses
const EMAIL_PATTERN = /[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/g;

// Pattern for US/international phone numbers
const PHONE_PATTERN =
  /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;

// Pattern for Social Security Numbers (US)
const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/g;

// Pattern for credit card numbers (16-digit groups)
const CREDIT_CARD_PATTERN = /\b(?:\d{4}[\s-]?){3}\d{4}\b/g;

// Pattern for common name prefixes followed by a capitalised name
const NAME_PATTERN = /\b(Mr|Mrs|Ms|Dr|Prof)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g;

// Pattern for IPv4 addresses
const IPV4_PATTERN = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;

// Pattern for URLs containing potential user data
const URL_WITH_TOKEN_PATTERN = /https?:\/\/[^\s]*[?&](token|key|auth|api_key|secret)=[^\s&]*/gi;

export function scrubPII(text: string): string {
  return text
    .replace(EMAIL_PATTERN, '[EMAIL]')
    .replace(PHONE_PATTERN, '[PHONE]')
    .replace(SSN_PATTERN, '[SSN]')
    .replace(CREDIT_CARD_PATTERN, '[CARD]')
    .replace(NAME_PATTERN, '[NAME]')
    .replace(IPV4_PATTERN, '[IP]')
    .replace(URL_WITH_TOKEN_PATTERN, '[URL_WITH_TOKEN]');
}

export function scrubPIIFromItems<T extends { text: string }>(
  items: T[]
): T[] {
  return items.map((item) => ({ ...item, text: scrubPII(item.text) }));
}
