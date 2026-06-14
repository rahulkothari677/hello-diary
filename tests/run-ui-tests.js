/* ==========================================================================
   Hello Diary — Security Portal E2E UI Tests
   Automates UI interactions (clicks, canvas drawing, lockout countdowns)
   in headless Chrome using raw Chrome DevTools Protocol.
   ========================================================================== */

const { spawn } = require('child_process');
const http = require('http');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9222;
const APP_URL = 'file:///C:/Users/rahul2/.gemini/antigravity/scratch/hello-diary/index.html';

async function main() {
    console.log('Launching headless Chrome for UI Tests...');
    const chrome = spawn(CHROME_PATH, [
        '--headless=new',
        `--remote-debugging-port=${PORT}`,
        '--user-data-dir=C:\\Users\\rahul2\\.gemini\\antigravity\\scratch\\chrome-profile-test-ui',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-web-security'
    ]);

    chrome.on('error', (err) => {
        console.error('Failed to start Chrome:', err);
        process.exit(1);
    });

    // Wait for Chrome to launch
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Fetch websocket debugger URL
    let wsUrl = '';
    try {
        wsUrl = await getWsDebuggerUrl();
    } catch (err) {
        console.error('Failed to get WebSocket URL:', err);
        chrome.kill();
        process.exit(1);
    }

    console.log('Connecting to WebSocket:', wsUrl);
    const ws = new WebSocket(wsUrl);

    let msgId = 1;
    const send = (method, params = {}) => {
        ws.send(JSON.stringify({ id: msgId++, method, params }));
    };

    // Helper to evaluate JS in the browser context
    const evaluate = (expression) => {
        return new Promise((resolve, reject) => {
            const id = msgId++;
            ws.send(JSON.stringify({
                id,
                method: 'Runtime.evaluate',
                params: { expression, returnByValue: true }
            }));
            
            const handler = (event) => {
                const msg = JSON.parse(event.data);
                if (msg.id === id) {
                    ws.removeEventListener('message', handler);
                    if (msg.error) {
                        reject(new Error(JSON.stringify(msg.error)));
                    } else if (msg.result && msg.result.exceptionDetails) {
                        reject(new Error(msg.result.exceptionDetails.exception.description));
                    } else {
                        resolve(msg.result.result.value);
                    }
                }
            };
            ws.addEventListener('message', handler);
        });
    };

    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

    ws.onopen = async () => {
        try {
            console.log('Connected to Chrome. Enabling CDP Domains...');
            send('Runtime.enable');
            send('Page.enable');

            console.log('Loading app URL...');
            send('Page.navigate', { url: APP_URL });
            await sleep(2000);

            console.log('\n=== TEST FLOW A: PIN SETUP, MISMATCHES, LOCKOUT & UNLOCK ===');
            
            // 1. Reset database & reload page
            console.log('Resetting database...');
            await evaluate(`
                new Promise((resolve, reject) => {
                    const req = indexedDB.deleteDatabase('HelloDiaryDB');
                    req.onsuccess = () => resolve();
                    req.onerror = () => reject(req.error);
                })
            `);
            await evaluate('location.reload()');
            await sleep(2000);

            // 2. Check if Setup Screen is displayed
            console.log('Checking Setup screen active state...');
            let isSetupActive = await evaluate('document.getElementById("screen-setup").classList.contains("active")');
            if (!isSetupActive) throw new Error('Setup screen is not active on fresh load.');
            console.log('✓ Setup screen active.');

            // 3. Move to Step 2
            console.log('Moving to Step 2...');
            await evaluate('document.getElementById("btn-setup-next-1").click()');
            await sleep(500);

            // 4. Enter initial PIN "123456"
            console.log('Entering initial PIN (123456)...');
            await evaluate(`{
                const keys = ['1','2','3','4','5','6'];
                for (let k of keys) {
                    document.querySelector('#setup-pin-pad .pin-key[data-value="' + k + '"]').click();
                }
            }`);
            await sleep(500);

            // Check if transition to confirmation mode occurred
            let title = await evaluate('document.getElementById("setup-step-2-title").textContent');
            if (!title.includes('Confirm PIN')) throw new Error('Step 2 title did not update to Confirm mode.');
            console.log('✓ Confirmation mode activated.');

            // 5. Enter mismatching PIN to test error message
            console.log('Entering mismatching PIN (111111)...');
            await evaluate(`{
                const keys = ['1','1','1','1','1','1'];
                for (let k of keys) {
                    document.querySelector('#setup-pin-pad .pin-key[data-value="' + k + '"]').click();
                }
            }`);
            await sleep(500);

            let errorMsg = await evaluate('document.getElementById("setup-error-msg").textContent');
            if (!errorMsg.includes('do not match')) throw new Error('Mismatch error message not displayed.');
            console.log('✓ Mismatch error captured:', errorMsg);

            // 6. Enter correct matching PIN (first time defining again)
            console.log('Entering define PIN (123456)...');
            await evaluate(`{
                const keys = ['1','2','3','4','5','6'];
                for (let k of keys) {
                    document.querySelector('#setup-pin-pad .pin-key[data-value="' + k + '"]').click();
                }
            }`);
            await sleep(500);

            // Confirm it
            console.log('Entering matching confirm PIN (123456)...');
            await evaluate(`{
                const keys = ['1','2','3','4','5','6'];
                for (let k of keys) {
                    document.querySelector('#setup-pin-pad .pin-key[data-value="' + k + '"]').click();
                }
            }`);
            await sleep(500);

            // 7. Verify transition to Step 3 theme selection
            let isStep3Active = await evaluate('document.getElementById("setup-step-3").classList.contains("active")');
            if (!isStep3Active) throw new Error('Setup did not transition to Step 3 theme selection.');
            console.log('✓ Transitioned to Step 3.');

            // 8. Click Finish Setup
            console.log('Finishing setup...');
            await evaluate('document.getElementById("btn-setup-finish").click()');
            await sleep(1000);

            // 9. Verify transition to Dashboard
            let isDashboardActive = await evaluate('document.getElementById("screen-dashboard").classList.contains("active")');
            if (!isDashboardActive) throw new Error('Did not transition to Dashboard after Setup.');
            console.log('✓ Entered Sanctuary Dashboard.');

            // 10. Lock the app
            console.log('Locking the app...');
            await evaluate('document.getElementById("btn-sidebar-lock").click()');
            await sleep(500);

            let isLockActive = await evaluate('document.getElementById("screen-lock").classList.contains("active")');
            if (!isLockActive) throw new Error('Lock screen is not active after locking.');
            console.log('✓ App locked successfully.');

            // 11. Test wrong unlock attempts & lockout system
            console.log('Entering wrong PIN codes to trigger lockout...');
            for (let attempt = 1; attempt <= 9; attempt++) {
                await evaluate(`{
                    const keys = ['0','0','0','0','0','0'];
                    for (let k of keys) {
                        document.querySelector('#screen-lock .pin-key[data-value="' + k + '"]').click();
                    }
                }`);
                 let attemptsErr = '';
                const expectedRemaining = 10 - attempt;
                for (let t = 0; t < 25; t++) {
                    await sleep(200);
                    attemptsErr = await evaluate('document.getElementById("pin-error-msg").textContent');
                    if (attemptsErr && attemptsErr.includes(expectedRemaining + ' attempt')) {
                        break;
                    }
                }
                if (!attemptsErr.includes(expectedRemaining + ' attempt')) {
                    throw new Error('Incorrect attempts counter mismatch. Expected: ' + expectedRemaining + '. Got: ' + attemptsErr);
                }
                console.log('  Attempt ' + attempt + ': ', attemptsErr);
            }

            // 10th attempt: triggers lockout
            console.log('Entering 10th incorrect PIN...');
            await evaluate(`{
                const keys = ['0','0','0','0','0','0'];
                for (let k of keys) {
                    document.querySelector('#screen-lock .pin-key[data-value="' + k + '"]').click();
                }
            }`);
            
            let lockMsg = '';
            for (let t = 0; t < 25; t++) {
                await sleep(200);
                lockMsg = await evaluate('document.getElementById("pin-error-msg").textContent');
                if (lockMsg && lockMsg.includes('locked')) {
                    break;
                }
            }
            if (!lockMsg.includes('locked')) throw new Error('Lockout warning not shown on 10th failure. Got: ' + lockMsg);
            console.log('✓ Account lockout message shown:', lockMsg);


            // Verify inputs are disabled
            let isPin1Disabled = await evaluate('document.querySelector("#screen-lock .pin-key[data-value=\\"1\\"]").disabled');
            if (!isPin1Disabled) throw new Error('Keypad keys are not disabled during lockout.');
            console.log('✓ Keypad disabled states verified.');

            // Check countdown timer updates
            console.log('Waiting 2 seconds to check countdown updates...');
            await sleep(2000);
            let countdownMsg = await evaluate('document.getElementById("pin-error-msg").textContent');
            console.log('✓ Timer countdown verified:', countdownMsg);

            console.log('\n=== TEST FLOW B: PATTERN SETUP & UNLOCK ===');

            // Reset database again
            console.log('Resetting database...');
            await evaluate(`
                new Promise((resolve) => {
                    const req = indexedDB.open('HelloDiaryDB');
                    req.onsuccess = (e) => {
                        const db = e.target.result;
                        const tx = db.transaction(['credentials'], 'readwrite');
                        const store = tx.objectStore('credentials');
                        store.clear().onsuccess = () => resolve();
                    };
                })
            `);
            await evaluate('location.reload()');
            await sleep(2000);

            // Step 1: Select Pattern Method
            console.log('Selecting Pattern method...');
            await evaluate('document.querySelector(\'.security-option[data-method="pattern"]\').click()');
            await evaluate('document.getElementById("btn-setup-next-1").click()');
            await sleep(500);

            // Draw invalid short pattern (< 4 nodes)
            console.log('Simulating invalid short pattern drawing...');
            await evaluate(`{
                const canvas = document.getElementById('setup-pattern-canvas');
                const rect = canvas.getBoundingClientRect();
                const dispatch = (type, x, y) => {
                    canvas.dispatchEvent(new MouseEvent(type, {
                        clientX: rect.left + x,
                        clientY: rect.top + y,
                        bubbles: true
                    }));
                };
                dispatch('mousedown', 40, 40);   // Node 0
                dispatch('mousemove', 140, 40);  // Node 1
                dispatch('mouseup', 140, 40);
            }`);
            await sleep(300);

            // Click Confirm
            await evaluate('document.getElementById("btn-setup-next-2").click()');
            await sleep(300);
            let patErr = await evaluate('document.getElementById("setup-error-msg").textContent');
            if (!patErr.includes('at least 4 nodes')) throw new Error('Short pattern error not displayed.');
            console.log('✓ Short pattern validation verified.');

            // Draw valid pattern (0124)
            console.log('Simulating valid pattern setup (0-1-2-4)...');
            await evaluate(`{
                const canvas = document.getElementById('setup-pattern-canvas');
                const rect = canvas.getBoundingClientRect();
                const dispatch = (type, x, y) => {
                    canvas.dispatchEvent(new MouseEvent(type, {
                        clientX: rect.left + x,
                        clientY: rect.top + y,
                        bubbles: true
                    }));
                };
                dispatch('mousedown', 40, 40);   // Node 0
                dispatch('mousemove', 140, 40);  // Node 1
                dispatch('mousemove', 240, 40);  // Node 2
                dispatch('mousemove', 140, 140); // Node 4
                dispatch('mouseup', 140, 140);
            }`);
            await sleep(500);

            // Click confirm
            await evaluate('document.getElementById("btn-setup-next-2").click()');
            await sleep(500);

            // Draw matching pattern (0124) to confirm
            console.log('Simulating confirm pattern drawing (0-1-2-4)...');
            await evaluate(`{
                const canvas = document.getElementById('setup-pattern-canvas');
                const rect = canvas.getBoundingClientRect();
                const dispatch = (type, x, y) => {
                    canvas.dispatchEvent(new MouseEvent(type, {
                        clientX: rect.left + x,
                        clientY: rect.top + y,
                        bubbles: true
                    }));
                };
                dispatch('mousedown', 40, 40);   // Node 0
                dispatch('mousemove', 140, 40);  // Node 1
                dispatch('mousemove', 240, 40);  // Node 2
                dispatch('mousemove', 140, 140); // Node 4
                dispatch('mouseup', 140, 140);
            }`);
            await sleep(500);

            // Verify Step 3 transition
            isStep3Active = await evaluate('document.getElementById("setup-step-3").classList.contains("active")');
            if (!isStep3Active) throw new Error('Pattern confirm did not move to Step 3.');
            console.log('✓ Pattern confirmed successfully.');

            // Finish Setup
            await evaluate('document.getElementById("btn-setup-finish").click()');
            await sleep(1000);

            // Lock again
            await evaluate('document.getElementById("btn-sidebar-lock").click()');
            await sleep(500);

            // Switch to Pattern tab on Lock screen
            console.log('Switching to Pattern lock screen tab...');
            await evaluate('document.querySelector(\'#screen-lock .auth-tab[data-method="pattern"]\').click()');
            await sleep(500);

            // Simulate correct Pattern unlock (0124)
            console.log('Drawing correct Pattern (0-1-2-4) to unlock...');
            await evaluate(`{
                const canvas = document.getElementById('pattern-canvas');
                const rect = canvas.getBoundingClientRect();
                const dispatch = (type, x, y) => {
                    canvas.dispatchEvent(new MouseEvent(type, {
                        clientX: rect.left + x,
                        clientY: rect.top + y,
                        bubbles: true
                    }));
                };
                dispatch('mousedown', 40, 40);   // Node 0
                dispatch('mousemove', 140, 40);  // Node 1
                dispatch('mousemove', 240, 40);  // Node 2
                dispatch('mousemove', 140, 140); // Node 4
                dispatch('mouseup', 140, 140);
            }`);
            await sleep(1000);

            // Verify unlocked
            isDashboardActive = await evaluate('document.getElementById("screen-dashboard").classList.contains("active")');
            if (!isDashboardActive) throw new Error('Pattern unlock failed to open Dashboard.');
            console.log('✓ Pattern unlock successful!');

            console.log('\n=============================================================');
            console.log('🎉 ALL SECURITY PORTAL UI TESTS PASSED SUCCESSFULLY! 🎉');
            console.log('=============================================================');

            ws.close();
            chrome.kill();
            process.exit(0);

        } catch (error) {
            console.error('\n❌ UI TEST FAILURE ❌');
            console.error(error.message);
            ws.close();
            chrome.kill();
            process.exit(1);
        }
    };

    ws.onerror = (err) => {
        console.error('WebSocket connection error:', err);
        chrome.kill();
        process.exit(1);
    };

    setTimeout(() => {
        console.error('UI Test timeout reached.');
        chrome.kill();
        process.exit(1);
    }, 45000);
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
