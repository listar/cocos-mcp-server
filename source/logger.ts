let debugLoggingEnabled = false;

const MAX_STRING_LENGTH = 500;

export function setDebugLogging(enabled: boolean): void {
    debugLoggingEnabled = enabled;
}

export function debugLog(scope: string, message: unknown, ...details: unknown[]): void {
    if (!debugLoggingEnabled) return;
    const parts = [`[${scope}]`, formatMessage(message)];
    if (details.length > 0) parts.push('[details redacted]');
    console.log(parts.join(' '));
}

export function errorLog(scope: string, message: unknown, ...details: unknown[]): void {
    const parts = [`[${scope}]`, formatMessage(message)];
    if (details.length > 0) parts.push('[details redacted]');
    console.error(parts.join(' '));
}

function formatMessage(value: unknown): string {
    if (typeof value !== 'string') return '[diagnostic event]';
    return redactString(value)
        .replace(/:\s*[\s\S]+$/, ': [redacted]')
        .replace(/\b(node|uuid|path|value|data)\s+[^,\s]+/gi, '$1 [redacted]')
        .replace(/=\s*.+?(?=\s+(?:on|for|to)\b|$)/gi, '= [redacted]');
}

function redactString(value: string): string {
    return value
        .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
        .replace(/(["']?(?:authToken|token|authorization)["']?\s*[:=]\s*)["']?[^"',\s}]+/gi, '$1[redacted]')
        .replace(/\/Users\/[^/\s]+/g, '/Users/[redacted]')
        .slice(0, MAX_STRING_LENGTH);
}
