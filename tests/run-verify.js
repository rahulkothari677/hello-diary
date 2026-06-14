/* ==========================================================================
   Hello Diary — Headless Chrome Test Runner
   Runs verify-db-crypto.js tests in headless Chrome via native WebSockets.
   ========================================================================== */

const { spawn } = require('child_process');
const http = require('http');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9222;
const TEST_URL = 'file:///C:/Users/rahul2/.gemini/antigravity/scratch/hello-diary/tests/test.html';

async function main() {
    console.log('Launching headless Chrome...');
    const chrome = spawn(CHROME_PATH, [
        '--headless=new',
        `--remote-debugging-port=${PORT}`,
        '--user-data-dir=C:\\Users\\rahul2\\.gemini\\antigravity\\scratch\\chrome-profile-test',
        '--disable-gpu',
        '--no-sandbox'
    ]);

    chrome.on('error', (err) => {
        console.error('Failed to start Chrome:', err);
        process.exit(1);
    });

    // Wait for Chrome to open the port
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Get websocket debugger URL
    let wsUrl = '';
    try {
        wsUrl = await getWsDebuggerUrl();
    } catch (err) {
        console.error('Failed to get WebSocket debugger URL:', err);
        chrome.kill();
        process.exit(1);
    }

    console.log('Connecting to WebSocket:', wsUrl);
    const ws = new WebSocket(wsUrl);

    let msgId = 1;
    const send = (method, params = {}) => {
        ws.send(JSON.stringify({ id: msgId++, method, params }));
    };

    ws.onopen = () => {
        console.log('Connected to Chrome. Enabling CDP Domains...');
        send('Runtime.enable');
        send('Page.enable');
        
        // Navigate to test page
        console.log('Navigating to test page:', TEST_URL);
        send('Page.navigate', { url: TEST_URL });
    };

    let testPassed = false;
    let testFailed = false;

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.method === 'Runtime.consoleAPICalled') {
            const args = msg.params.args;
            const text = args.map(arg => {
                if (arg.value !== undefined) return arg.value;
                if (arg.description !== undefined) return arg.description;
                return JSON.stringify(arg);
            }).join(' ');
            console.log('[BROWSER CONSOLE]', text);

            if (text.includes('TESTS_STATUS: PASSED')) {
                testPassed = true;
                cleanup();
            } else if (text.includes('TESTS_STATUS: FAILED')) {
                testFailed = true;
                cleanup();
            }
        }
    };

    ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        chrome.kill();
        process.exit(1);
    };

    function cleanup() {
        console.log('Closing websocket...');
        ws.close();
        console.log('Terminating Chrome...');
        chrome.kill();
        if (testPassed) {
            console.log('Tests Passed!');
            process.exit(0);
        } else {
            console.log('Tests Failed!');
            process.exit(1);
        }
    }

    // Timeout fallback after 30 seconds
    setTimeout(() => {
        console.error('Test timeout exceeded.');
        chrome.kill();
        process.exit(1);
    }, 30000);
}

function getWsDebuggerUrl() {
    return new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${PORT}/json/list`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const list = JSON.parse(data);
                    const page = list.find(p => p.type === 'page');
                    if (page && page.webSocketDebuggerUrl) {
                        resolve(page.webSocketDebuggerUrl);
                    } else {
                        reject(new Error('No target page found'));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

main();
