const test = require('node:test');
const assert = require('node:assert/strict');
const { debugLog, setDebugLogging } = require('../dist/logger');

test('debug logging is opt-in and redacts sensitive diagnostics', () => {
    const originalLog = console.log;
    const output = [];
    console.log = message => output.push(String(message));
    try {
        setDebugLogging(false);
        debugLog('ComponentTools', 'value: private-value', {
            authToken: 'secret-token',
            script: 'dangerous-script',
            body: 'request-body',
            path: '/Users/starle/private-project'
        });
        assert.equal(output.length, 0);

        setDebugLogging(true);
        debugLog(
            'ComponentTools',
            'Bearer raw-token value: private-value at /Users/starle/private-project',
            {
                authToken: 'secret-token',
                script: 'dangerous-script',
                body: 'request-body'
            }
        );
        assert.equal(output.length, 1);
        assert.match(output[0], /\[redacted\]/);
        for (const secret of [
            'raw-token',
            'private-value',
            'starle',
            'secret-token',
            'dangerous-script',
            'request-body'
        ]) {
            assert.equal(output[0].includes(secret), false);
        }
    } finally {
        setDebugLogging(false);
        console.log = originalLog;
    }
});
