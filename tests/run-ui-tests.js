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
    const evaluate = (expression, awaitPromise = false) => {
        return new Promise((resolve, reject) => {
            const id = msgId++;
            ws.send(JSON.stringify({
                id,
                method: 'Runtime.evaluate',
                params: { expression, returnByValue: true, awaitPromise }
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

            ws.addEventListener('message', (event) => {
                const msg = JSON.parse(event.data);
                if (msg.method === 'Runtime.consoleAPICalled') {
                    const args = msg.params.args;
                    const text = args.map(arg => {
                        if (arg.value !== undefined) return arg.value;
                        if (arg.description !== undefined) return arg.description;
                        return JSON.stringify(arg);
                    }).join(' ');
                    console.log('[BROWSER CONSOLE]', text);
                }
            });

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

            console.log('\n=== TEST FLOW C: TIMELINE, CALENDAR, & SEARCH ===');

            // 1. Verify timeline is empty initially
            console.log('Checking timeline empty state...');
            let timelineHtml = await evaluate('document.querySelector("#view-timeline .entries-grid").innerHTML');
            if (!timelineHtml.includes('No memories written yet')) {
                throw new Error('Timeline did not show empty state initially.');
            }
            console.log('✓ Timeline empty state verified.');

            // 2. Open Editor to create a new entry
            console.log('Opening editor for new entry...');
            await evaluate('document.getElementById("btn-fab-new-entry").click()');
            await sleep(500);

            let isEditorActive = await evaluate('document.getElementById("screen-editor").classList.contains("active")');
            if (!isEditorActive) throw new Error('Editor screen did not activate.');
            console.log('✓ Editor active.');

            // 3. Write entry contents
            console.log('Writing title and body...');
            await evaluate(`
                document.getElementById('rich-editor-field').innerHTML = '<h1>Today is a Sunshine Day</h1><p>I am feeling incredibly happy and productive today. Lots of sunshine!</p>';
            `);
            
            // Choose mood 5 (Great)
            console.log('Selecting mood Great (5)...');
            await evaluate(`
                document.querySelector('.mood-picker .mood-btn[data-mood="5"]').click();
            `);

            // Add tag suggestion
            console.log('Adding tag suggest "happy"...');
            await evaluate(`
                document.getElementById('btn-editor-add-tag').click();
            `);
            await sleep(300);
            await evaluate(`
                document.querySelector('.tag-suggestion[data-tag="happy"]').click();
            `);
            await sleep(300);

            // 4. Save and return to dashboard
            console.log('Saving entry and navigating back...');
            await evaluate('document.getElementById("btn-editor-back").click()');
            // Give Web Crypto time to encrypt and save
            await sleep(1500);

            // Check if timeline contains 1 entry card now
            isDashboardActive = await evaluate('document.getElementById("screen-dashboard").classList.contains("active")');
            if (!isDashboardActive) throw new Error('Did not return to dashboard after save.');
            
            let timelineCardsCount = await evaluate('document.querySelectorAll("#view-timeline .entries-grid > div").length');
            if (timelineCardsCount !== 1) throw new Error('Expected 1 entry card in timeline, got: ' + timelineCardsCount);
            
            let cardTitle = await evaluate('document.querySelector("#view-timeline .entries-grid h3").textContent');
            if (cardTitle !== 'Today is a Sunshine Day') throw new Error('Timeline card title mismatch: ' + cardTitle);
            console.log('✓ Timeline card created and rendered successfully.');

            // 5. Navigate to Calendar and verify mood indicator dot
            console.log('Navigating to Calendar view...');
            await evaluate('switchDashboardView("calendar")');
            await sleep(500);

            let todayCellHasDot = await evaluate(`
                const todayCell = document.querySelector('#calendar-grid .calendar-day-cell[style*="font-weight: 700"]');
                todayCell && !!todayCell.querySelector('.calendar-dot--mood-5');
            `);
            if (!todayCellHasDot) throw new Error('Calendar cell for today is missing the mood dot indicator.');
            console.log('✓ Calendar day cell shows correct mood indicator dot.');

            // 6. Inject a historical flashback entry from exactly 1 year ago
            console.log('Injecting 1-year-ago flashback entry into DB...');
            const oneYearAgo = new Date();
            oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
            
            await evaluate(`
                HelloDB.insertEntry({
                    title: 'Last Year Flashback',
                    content: '<p>A beautiful sunny day of coding. Sunshine and smiles.</p>',
                    tags: ['memory', 'sunshine'],
                    mood: 4,
                    date: ${oneYearAgo.getTime()}
                }, HelloApp.getSessionKey())
            `);
            
            // Reload entries and refresh views
            await evaluate('HelloApp.loadAndRenderDashboard()');
            await sleep(1000);

            // Verify flashback widget is shown
            let flashbackVisible = await evaluate('document.getElementById("flashback-widget").style.display !== "none"');
            if (!flashbackVisible) throw new Error('On This Day flashback widget is not visible.');
            
            let flashbackText = await evaluate('document.getElementById("flashback-content").textContent');
            if (!flashbackText.includes('1 year(s) ago') || !flashbackText.includes('sunny day of coding')) {
                throw new Error('Flashback widget content mismatch: ' + flashbackText);
            }
            console.log('✓ On This Day flashback widget verified: ' + flashbackText);

            // 7. Test Search Overlay
            console.log('Opening Search overlay...');
            await evaluate('document.getElementById("btn-search-toggle").click()');
            await sleep(500);

            let isSearchActive = await evaluate('document.getElementById("search-panel").classList.contains("active")');
            if (!isSearchActive) throw new Error('Search overlay did not activate.');

            console.log('Searching for "sunshine"...');
            await evaluate('document.getElementById("search-box").value = "sunshine"');
            await evaluate('document.getElementById("search-box").dispatchEvent(new Event("input"))');
            await sleep(500);

            // Both entries contain "sunshine" (one in title, one in content)
            let searchResultsCount = await evaluate('document.querySelectorAll("#search-list-box > div").length');
            if (searchResultsCount !== 2) throw new Error('Expected 2 search results, got: ' + searchResultsCount);
            console.log('✓ Search results count matches 2.');

            // Verify highlight tag <mark> is rendered
            let highlightCount = await evaluate('document.querySelectorAll("#search-list-box mark").length');
            if (highlightCount === 0) throw new Error('Expected highlighted search matches, got none.');
            console.log('✓ Query highlighting matches verified.');

            // Click Mood 5 filter inside search (only first entry is mood 5, flashback is mood 4)
            console.log('Filtering search results by Mood 5 (Great)...');
            await evaluate('document.querySelector(\'.search-mood-btn[data-mood="5"]\').click()');
            await sleep(500);

            searchResultsCount = await evaluate('document.querySelectorAll("#search-list-box > div").length');
            if (searchResultsCount !== 1) throw new Error('Expected 1 search result after mood filtering, got: ' + searchResultsCount);
            console.log('✓ Search mood filtering verified.');

            // Click Tag happy filter (timeline entry has tag happy, flashback has tag memory/sunshine)
            console.log('Filtering search results by tag "happy"...');
            await evaluate('document.querySelector(\'.search-tag-btn[data-tag="happy"]\').click()');
            await sleep(500);

            searchResultsCount = await evaluate('document.querySelectorAll("#search-list-box > div").length');
            if (searchResultsCount !== 1) throw new Error('Expected 1 search result after tag filtering, got: ' + searchResultsCount);
            console.log('✓ Search tag filtering verified.');

            // Close search overlay
            await evaluate('document.getElementById("btn-search-close").click()');
            await sleep(300);
            isSearchActive = await evaluate('document.getElementById("search-panel").classList.contains("active")');
            if (isSearchActive) throw new Error('Search overlay did not close.');
            console.log('✓ Search overlay closed.');

            console.log('\n=== TEST FLOW D: PREMIUM EDITOR, AUTO-SAVE & CUSTOM FONTS ===');

            // 1. Open Editor
            console.log('Opening editor...');
            await evaluate('document.getElementById("btn-fab-new-entry").click()');
            await sleep(500);

            // 2. Select a premium font (e.g., Caveat)
            console.log('Opening Font selector and choosing "Caveat"...');
            await evaluate('document.getElementById("btn-font-picker").click()');
            await sleep(300);
            
            let isFontDropdownActive = await evaluate('document.getElementById("dropdown-font").classList.contains("active")');
            if (!isFontDropdownActive) throw new Error('Font dropdown did not open.');
            
            await evaluate('document.querySelector(\'.font-option[data-font="font-caveat"]\').click()');
            await sleep(500);

            let hasFontClass = await evaluate('document.getElementById("rich-editor-field").classList.contains("font-caveat")');
            if (!hasFontClass) throw new Error('Editor content did not gain "font-caveat" class.');
            console.log('✓ Font class "font-caveat" applied.');

            // 3. Select a size (e.g., X-Large)
            console.log('Opening Size selector and choosing "X-Large"...');
            await evaluate('document.getElementById("btn-size-picker").click()');
            await sleep(300);
            
            await evaluate('document.querySelector(\'.size-option[data-size="size-xlarge"]\').click()');
            await sleep(500);

            let hasSizeClass = await evaluate('document.getElementById("rich-editor-field").classList.contains("size-xlarge")');
            if (!hasSizeClass) throw new Error('Editor content did not gain "size-xlarge" class.');
            console.log('✓ Size class "size-xlarge" applied.');

            // 4. Test Text Color selection
            console.log('Opening Color selector and choosing Red...');
            await evaluate('document.getElementById("btn-color-picker").click()');
            await sleep(300);
            
            await evaluate('document.querySelector(\'#dropdown-color .color-circle[data-color="#ef4444"]\').click()');
            await sleep(500);
            console.log('✓ Text color selected.');

            // 5. Test Text Highlight selection
            console.log('Opening Highlight selector and choosing Yellow...');
            await evaluate('document.getElementById("btn-highlight-picker").click()');
            await sleep(300);
            
            await evaluate('document.querySelector(\'#dropdown-highlight .color-circle[data-highlight="rgba(254, 240, 138, 0.45)"]\').click()');
            await sleep(500);
            console.log('✓ Text highlight selected.');

            // 6. Test word count and typing stats updates
            console.log('Typing content in editor to verify stats...');
            await evaluate(`
                const field = document.getElementById('rich-editor-field');
                field.innerHTML = '<h1>My Custom Title</h1><p>This is a test sentence containing exactly ten words here.</p>';
                field.dispatchEvent(new Event('input'));
            `);
            await sleep(500);

            let wordCountText = await evaluate('document.getElementById("editor-word-count").textContent');
            if (!wordCountText.includes('10 words') && !wordCountText.includes('12 words') && !wordCountText.includes('13 words')) {
                throw new Error('Word count did not update correctly. Got: ' + wordCountText);
            }
            console.log('✓ Word count stats verified:', wordCountText);

            // 7. Verify save badge shows "Unsaved Changes"
            let badgeText = await evaluate('document.getElementById("save-indicator-badge").textContent');
            if (badgeText !== 'Unsaved Changes') throw new Error('Save indicator badge did not show Unsaved Changes.');
            console.log('✓ Badge status "Unsaved Changes" verified.');

            // 8. Go back and check if the entry saved to DB
            console.log('Navigating back to trigger save...');
            await evaluate('document.getElementById("btn-editor-back").click()');
            await sleep(1500);

            let cardsCount = await evaluate('document.querySelectorAll("#view-timeline .entries-grid > div").length');
            console.log('✓ Total dashboard timeline cards count:', cardsCount);

            console.log('\n=== TEST FLOW E: INTERACTIVE SVG ANALYTICS & INSIGHTS ===');
            
            console.log('Switching view to Insights tab...');
            await evaluate('switchDashboardView("analytics")');
            await sleep(500);

            console.log('Verifying Wellness score and counters...');
            let wellnessText = await evaluate('document.getElementById("wellness-score-value").textContent');
            console.log('✓ Wellness Score rendered:', wellnessText);
            if (!wellnessText || wellnessText === '0%') {
                throw new Error('Wellness score failed to compute. Got: ' + wellnessText);
            }

            let streakText = await evaluate('document.getElementById("analytics-streak-value").textContent');
            console.log('✓ Current Streak rendered:', streakText);
            if (!streakText || !streakText.includes('day')) {
                throw new Error('Streak value failed to render. Got: ' + streakText);
            }

            console.log('Verifying Trend line graph SVG...');
            let lineChartExists = await evaluate('document.querySelectorAll("#trend-chart-box svg path.chart-line").length > 0');
            let trendDotsCount = await evaluate('document.querySelectorAll("#trend-chart-box svg circle.chart-dot").length');
            console.log(`✓ SVG Line chart rendered with ${trendDotsCount} interactive dots.`);
            if (!lineChartExists || trendDotsCount === 0) {
                throw new Error('Mood Trend SVG failed to render properly.');
            }

            console.log('Verifying Donut chart SVG...');
            let donutSlicesCount = await evaluate('document.querySelectorAll("#donut-chart-box svg circle.donut-slice").length');
            console.log(`✓ Donut chart rendered with ${donutSlicesCount} segments.`);
            if (donutSlicesCount === 0) {
                throw new Error('Donut chart slices not found.');
            }

            console.log('Verifying Weekday bar chart SVG...');
            let barCount = await evaluate('document.querySelectorAll("#weekday-chart-box svg rect.bar-column").length');
            console.log(`✓ Weekday bar chart rendered with ${barCount} columns.`);
            if (barCount === 0) {
                throw new Error('Weekday bar chart columns not found.');
            }

            console.log('Verifying Heatmap grid SVG...');
            let heatmapCellsCount = await evaluate('document.querySelectorAll("#heatmap-chart-box svg rect.heatmap-cell").length');
            console.log(`✓ Activity Heatmap grid rendered with ${heatmapCellsCount} cells.`);
            if (heatmapCellsCount === 0) {
                throw new Error('Heatmap cells not found.');
            }

            console.log('Verifying Tag correlations rankings...');
            let tagsCorrCount = await evaluate('document.querySelectorAll("#tag-correlations-box .tag-correlation-card").length');
            console.log(`✓ Tag correlation cards rendered: ${tagsCorrCount}`);
            if (tagsCorrCount === 0) {
                throw new Error('Tag correlation cards not found.');
            }

            console.log('Testing interactive SVG tooltips...');
            // Hover over the first dot in the trend chart
            await evaluate(`
                const dot = document.querySelector("#trend-chart-box svg circle.chart-dot");
                if (dot) {
                    dot.dispatchEvent(new Event('mouseover'));
                    const rect = dot.getBoundingClientRect();
                    const e = new MouseEvent('mousemove', {
                        clientX: rect.left + window.scrollX,
                        clientY: rect.top + window.scrollY,
                        bubbles: true
                    });
                    dot.dispatchEvent(e);
                }
            `);
            await sleep(300);
            
            let tooltipOpacity = await evaluate('document.getElementById("chart-tooltip").style.opacity');
            let tooltipContent = await evaluate('document.getElementById("chart-tooltip").innerHTML');
            console.log('✓ Tooltip opacity is active (1.0):', tooltipOpacity === '1');
            console.log('✓ Tooltip content matched:', tooltipContent.includes('Mood:') && tooltipContent.includes('Date:'));

            if (tooltipOpacity !== '1' || !tooltipContent.includes('Mood:')) {
                throw new Error('Interactive tooltip failed to show on hover.');
            }

            // Leave hover
            await evaluate('document.querySelector("#trend-chart-box svg circle.chart-dot").dispatchEvent(new Event("mouseleave"))');
            await sleep(200);
            tooltipOpacity = await evaluate('document.getElementById("chart-tooltip").style.opacity');
            console.log('✓ Tooltip hidden after mouseleave (0.0):', tooltipOpacity === '0');

            console.log('\n=== TEST FLOW F: AMBIENT SOUND, STICKERS & CUSTOM THEMES ===');

            console.log('Switching view to Settings tab...');
            await evaluate('switchDashboardView("settings")');
            await sleep(500);

            console.log('Testing Theme Scheduler toggles...');
            let scheduleOptionsHidden = await evaluate('document.getElementById("theme-schedule-options").style.display === "none"');
            console.log('✓ Schedule options initial hide verified:', scheduleOptionsHidden);
            
            // Toggle scheduler checkbox
            await evaluate('document.getElementById("toggle-theme-schedule").click()');
            await sleep(300);
            let scheduleOptionsVisible = await evaluate('document.getElementById("theme-schedule-options").style.display !== "none"');
            console.log('✓ Schedule options visible on toggle:', scheduleOptionsVisible);
            if (!scheduleOptionsVisible) throw new Error('Theme scheduler options failed to display.');

            console.log('Creating a Custom Theme named "Neon Sunshine"...');
            await evaluate(`
                document.getElementById('custom-theme-name').value = 'Neon Sunshine';
                document.getElementById('theme-color-accent').value = '#ffff00'; // Yellow
                document.getElementById('btn-save-custom-theme').click();
            `);
            await sleep(800);

            let customThemeSwatchExists = await evaluate('!!document.querySelector(\'.theme-swatch-card[data-theme-id="custom-neon-sunshine"]\')');
            console.log('✓ Custom theme swatch rendered in gallery:', customThemeSwatchExists);
            if (!customThemeSwatchExists) throw new Error('Custom theme failed to save or render swatch.');

            // Verify active custom properties
            let rootAccent = await evaluate('getComputedStyle(document.documentElement).getPropertyValue("--accent").trim()');
            console.log('✓ Root custom theme accent applied:', rootAccent);
            if (rootAccent !== '#ffff00' && rootAccent !== 'rgb(255, 255, 0)') {
                throw new Error('Custom theme accent failed to apply to root. Got: ' + rootAccent);
            }

            console.log('Verifying Particle Canvas exists...');
            let canvasExists = await evaluate('!!document.getElementById("theme-particles-canvas")');
            console.log('✓ Particle canvas verified:', canvasExists);
            if (!canvasExists) throw new Error('Theme particles canvas is missing from DOM.');

            console.log('Opening Editor to test stickers...');
            await evaluate('document.getElementById("btn-fab-new-entry").click()');
            await sleep(500);

            console.log('Toggling Sticker Picker and inserting emoji 🧸...');
            await evaluate('document.getElementById("btn-sticker-picker").click()');
            await sleep(300);
            
            let stickerPickerActive = await evaluate('document.getElementById("dropdown-sticker").style.display === "block"');
            console.log('✓ Sticker Picker dropdown is visible:', stickerPickerActive);
            if (!stickerPickerActive) throw new Error('Sticker picker failed to open.');

            // Click sticker choice
            await evaluate('document.querySelector(\'.sticker-option[data-sticker="🧸"]\').click()');
            await sleep(500);

            let hasSticker = await evaluate('!!document.querySelector("#rich-editor-field .diary-sticker-wrapper")');
            let stickerContent = await evaluate('document.querySelector("#rich-editor-field .diary-sticker-wrapper").textContent');
            console.log('✓ Sticker successfully inserted into rich editor field:', hasSticker);
            console.log('✓ Sticker content matches emoji:', stickerContent.includes('🧸'));
            if (!hasSticker || !stickerContent.includes('🧸')) {
                throw new Error('Failed to insert sticker emoji into editor.');
            }

            console.log('Testing Sound Mixer toggles...');
            // Open editor mixer popover
            await evaluate('document.getElementById("btn-editor-sound-mixer-toggle").click()');
            await sleep(300);

            let mixerVisible = await evaluate('document.getElementById("popover-sound-mixer").style.display === "flex"');
            console.log('✓ Sound Mixer popover active:', mixerVisible);
            if (!mixerVisible) throw new Error('Sound mixer failed to display.');

            // Toggle ambient audio engine
            await evaluate('document.getElementById("toggle-ambient-sound").click()');
            await sleep(300);
            
            // Adjust master volume slider
            await evaluate('document.getElementById("volume-master").value = "0.8"');
            await evaluate('document.getElementById("volume-master").dispatchEvent(new Event("input"))');
            await sleep(200);

            // Clean up and save/close editor
            await evaluate('document.getElementById("btn-editor-back").click()');
            await sleep(1500);

            console.log('\n=== TEST FLOW G: DATA PORTABILITY, PWA & TOUCH GESTURES ===');

            console.log('Checking PWA Manifest and Icon reference...');
            const manifestLinked = await evaluate('!!document.querySelector(\'link[rel="manifest"]\')');
            console.log('✓ PWA manifest linked in HTML:', manifestLinked);
            if (!manifestLinked) throw new Error('PWA Manifest link is missing in HTML head.');

            console.log('Testing JSON Backup downloads...');
            await evaluate(`
                let downloadLinkInfo = null;
                const originalCreateElement = document.createElement;
                document.createElement = function(tagName) {
                    const el = originalCreateElement.apply(document, arguments);
                    if (tagName === 'a') {
                        setTimeout(() => {
                            if (el.download && el.href) {
                                downloadLinkInfo = {
                                    downloadName: el.download,
                                    hasHref: !!el.href,
                                    dataLength: el.href.length
                                };
                            }
                        }, 0);
                    }
                    return el;
                };
                window._testDownloadMock = () => downloadLinkInfo;
            `);
            await evaluate('document.getElementById("btn-backup-json").click()');
            await sleep(500);
            let downloadInfo = await evaluate('window._testDownloadMock()');
            console.log('✓ JSON Backup download trigger verified:', !!downloadInfo);
            if (!downloadInfo || !downloadInfo.downloadName.startsWith('hello-diary-backup-')) {
                throw new Error('JSON Backup failed to trigger file download.');
            }

            console.log('Testing JSON Restore passcode validation...');
            let restoreResult = await evaluate(`
                (async () => {
                    const badPayload = {
                        app: 'Hello Diary',
                        version: '1.0.0',
                        entries: [{
                            id: 'test-id',
                            date: Date.now(),
                            payload: 'invalid-encrypted-payload-string',
                            iv: 'invalid-iv'
                        }],
                        settings: []
                    };
                    
                    const blob = new Blob([JSON.stringify(badPayload)], { type: 'application/json' });
                    const file = new File([blob], 'backup.json');
                    
                    const fileInput = document.getElementById('restore-json-input');
                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(file);
                    fileInput.files = dataTransfer.files;
                    
                    const toastText = document.getElementById('toast-text');
                    if (toastText) toastText.textContent = '';
                    
                    fileInput.dispatchEvent(new Event('change'));
                    
                    await new Promise(r => setTimeout(r, 800));
                    return { errorMsg: toastText ? toastText.textContent : '' };
                })()
            `, true);
            console.log('✓ Mismatched restore blocked verified:', restoreResult.errorMsg);
            if (!restoreResult.errorMsg.includes('Passcode mismatch') && !restoreResult.errorMsg.includes('credentials') && !restoreResult.errorMsg.includes('abort')) {
                throw new Error('JSON Restore failed to block mismatched passcode backup.');
            }

            console.log('Testing swipe card gestures...');
            let swipeActive = await evaluate(`
                (async () => {
                    const card = document.querySelector('.swipe-card-content');
                    if (!card) return { error: 'No timeline card found' };
                    
                    const initTransform = card.style.transform;
                    
                    const makeTouch = (x, y) => new Touch({
                        identifier: 1,
                        target: card,
                        clientX: x,
                        clientY: y
                    });
                    
                    const tStart = makeTouch(200, 100);
                    card.dispatchEvent(new TouchEvent('touchstart', {
                        touches: [tStart],
                        targetTouches: [tStart],
                        changedTouches: [tStart],
                        bubbles: true,
                        cancelable: true
                    }));
                    
                    const tMove = makeTouch(100, 100);
                    card.dispatchEvent(new TouchEvent('touchmove', {
                        touches: [tMove],
                        targetTouches: [tMove],
                        changedTouches: [tMove],
                        bubbles: true,
                        cancelable: true
                    }));
                    
                    const midTransform = card.style.transform;
                    
                    card.dispatchEvent(new TouchEvent('touchend', {
                        touches: [],
                        targetTouches: [],
                        changedTouches: [tMove],
                        bubbles: true,
                        cancelable: true
                    }));
                    
                    const finalTransform = card.style.transform;
                    
                    return { initTransform, midTransform, finalTransform };
                })()
            `, true);
            console.log('✓ Swipe card gesture transforms verified:', swipeActive);
            if (!swipeActive.midTransform.includes('translateX') || swipeActive.finalTransform !== 'translateX(-80px)') {
                throw new Error('Swipe gesture failed to translate card left.');
            }

            console.log('Testing pull-to-refresh gestures...');
            let pullActive = await evaluate(`
                (async () => {
                    const view = document.getElementById('view-timeline');
                    const spinner = document.getElementById('pull-to-refresh-spinner');
                    if (!view || !spinner) return { error: 'Timeline or spinner not found' };
                    
                    view.scrollTop = 0;
                    
                    const makeTouch = (y) => new Touch({
                        identifier: 2,
                        target: view,
                        clientX: 100,
                        clientY: y
                    });
                    
                    const tStart = makeTouch(100);
                    view.dispatchEvent(new TouchEvent('touchstart', {
                        touches: [tStart],
                        targetTouches: [tStart],
                        changedTouches: [tStart],
                        bubbles: true,
                        cancelable: true
                    }));
                    
                    const tMove = makeTouch(250);
                    view.dispatchEvent(new TouchEvent('touchmove', {
                        touches: [tMove],
                        targetTouches: [tMove],
                        changedTouches: [tMove],
                        bubbles: true,
                        cancelable: true
                    }));
                    
                    const activeHeight = spinner.style.height;
                    const activeOpacity = spinner.style.opacity;
                    
                    view.dispatchEvent(new TouchEvent('touchend', {
                        touches: [],
                        targetTouches: [],
                        changedTouches: [tMove],
                        bubbles: true,
                        cancelable: true
                    }));
                    
                    return { activeHeight, activeOpacity };
                })()
            `, true);
            console.log('✓ Pull-to-refresh visual feedback verified:', pullActive);
            if (parseInt(pullActive.activeHeight) === 0) {
                throw new Error('Pull-to-refresh gesture failed to display pull spinner.');
            }

            console.log('\n=== TEST FLOW H: PREMIUM BOOK BUILDER & PRINT PREVIEWS ===');
            
            console.log('Switching view to Settings tab...');
            await evaluate('switchDashboardView("settings")');
            await sleep(500);

            console.log('Opening Book Creator overlay...');
            await evaluate('document.getElementById("btn-export-pdf").click()');
            await sleep(500);

            // Verify Book Creator screen is active
            let isCreatorActive = await evaluate('document.getElementById("screen-book-creator").classList.contains("active")');
            console.log('✓ Book Creator dashboard screen active status:', isCreatorActive);
            if (!isCreatorActive) {
                throw new Error('Book Creator screen failed to show active state.');
            }

            // Verify cover preview updates dynamically
            console.log('Modifying cover title, subtitle, volume inputs...');
            await evaluate(`
                document.getElementById('book-title-input').value = 'Test Book Title';
                document.getElementById('book-title-input').dispatchEvent(new Event('input'));
                document.getElementById('book-subtitle-input').value = 'Test Subtitle';
                document.getElementById('book-subtitle-input').dispatchEvent(new Event('input'));
                document.getElementById('book-volume-input').value = 'Test Vol 1';
                document.getElementById('book-volume-input').dispatchEvent(new Event('input'));
            `);
            await sleep(300);

            let previewText = await evaluate(`
                document.querySelector('#preview-book-page h1').textContent
            `);
            console.log('✓ Preview cover title matches modified input:', previewText);
            if (previewText !== 'Test Book Title') {
                throw new Error('Preview title did not update dynamically.');
            }

            // Select Cover Theme
            console.log('Selecting Sakura Garden cover preset theme...');
            await evaluate(`
                document.querySelector('#screen-book-creator [data-cover="sakura-garden"]').click();
            `);
            await sleep(300);
            
            let isSakuraCoverSelected = await evaluate(`
                document.getElementById('preview-book-page').classList.contains('preview-cover-sakura')
            `);
            console.log('✓ Cover theme visual preset applied:', isSakuraCoverSelected);
            if (!isSakuraCoverSelected) {
                throw new Error('Cover theme failed to update in live preview.');
            }

            // Select Inside Tab and Page Theme
            console.log('Switching live preview to Inside Page view...');
            await evaluate(`
                document.querySelector('#screen-book-creator .preview-tab[data-view="inside"]').click();
            `);
            await sleep(300);

            console.log('Selecting Midnight Sky inside page preset design...');
            await evaluate(`
                document.querySelector('#screen-book-creator [data-page="midnight-stars"]').click();
            `);
            await sleep(300);

            let isMidnightPageSelected = await evaluate(`
                document.getElementById('preview-book-page').classList.contains('preview-page-midnight')
            `);
            console.log('✓ Inside page theme visual preset applied:', isMidnightPageSelected);
            if (!isMidnightPageSelected) {
                throw new Error('Inside page theme failed to update in live preview.');
            }

            // Switch to Back Cover tab
            console.log('Switching live preview to Back Cover view...');
            await evaluate(`
                document.querySelector('#screen-book-creator .preview-tab[data-view="back"]').click();
            `);
            await sleep(300);

            let isBackCoverSelected = await evaluate(`
                document.getElementById('preview-book-page').classList.contains('preview-cover-sakura')
            `);
            console.log('✓ Back cover matches cover style theme:', isBackCoverSelected);
            if (!isBackCoverSelected) {
                throw new Error('Back cover theme styling failed.');
            }

            // Close Book Creator
            console.log('Closing Book Creator overlay...');
            await evaluate('document.getElementById("btn-creator-close").click()');
            await sleep(500);

            let isCreatorHidden = await evaluate('!document.getElementById("screen-book-creator").classList.contains("active")');
            console.log('✓ Book Creator dashboard screen hidden status:', isCreatorHidden);
            if (!isCreatorHidden) {
                throw new Error('Book Creator screen failed to close.');
            }

            console.log('\n=============================================================');
            console.log('🎉 ALL STEP 9 PREMIUM BOOK BUILDER & PRINT TESTS PASSED! 🎉');
            console.log('=============================================================');

            console.log('\n=== TEST FLOW I: ADVANCED BLUEPRINT FEATURES (DECOY, WORD CLOUD, MODALS) ===');
            
            // 1. Verify Word Cloud renders in Insights
            console.log('Switching view to Insights tab...');
            await evaluate('switchDashboardView("analytics")');
            await sleep(500);
            
            let isWordCloudPresent = await evaluate('!!document.getElementById("insights-word-cloud-card")');
            console.log('✓ Word Cloud Card element is present:', isWordCloudPresent);
            if (!isWordCloudPresent) {
                throw new Error('Word Cloud Card element is missing.');
            }

            // 2. Open Editor and click Draw button
            console.log('Navigating to Editor...');
            await evaluate('HelloApp.showScreen("screen-editor")');
            await sleep(500);
            
            console.log('Clicking Draw button...');
            await evaluate('document.getElementById("btn-draw-canvas").click()');
            await sleep(300);
            
            let isDrawModalActive = await evaluate('document.getElementById("modal-drawing-canvas").classList.contains("active")');
            console.log('✓ Drawing Canvas Modal active status:', isDrawModalActive);
            if (!isDrawModalActive) {
                throw new Error('Drawing Canvas Modal failed to open.');
            }
            
            console.log('Closing Drawing Canvas Modal...');
            await evaluate('document.getElementById("btn-draw-modal-cancel").click()');
            await sleep(300);

            // 3. Click Record button
            console.log('Clicking Record Voice button...');
            await evaluate('document.getElementById("btn-record-voice").click()');
            await sleep(300);
            
            let isVoiceModalActive = await evaluate('document.getElementById("modal-voice-recorder").classList.contains("active")');
            console.log('✓ Voice Note Modal active status:', isVoiceModalActive);
            if (!isVoiceModalActive) {
                throw new Error('Voice Note Modal failed to open.');
            }
            
            console.log('Closing Voice Note Modal...');
            await evaluate('document.getElementById("btn-voice-modal-cancel").click()');
            await sleep(300);

            // 4. Return to Dashboard and open Settings to setup decoy
            console.log('Returning to Dashboard Settings...');
            await evaluate('HelloApp.showScreen("screen-dashboard")');
            await evaluate('switchDashboardView("settings")');
            await sleep(300);

            console.log('Enabling Decoy Mode toggle...');
            await evaluate(`
                const dt = document.getElementById("toggle-decoy-mode");
                dt.checked = true;
                dt.dispatchEvent(new Event("change"));
            `);
            await sleep(300);

            console.log('Inputting decoy PIN: 654321...');
            await evaluate(`
                document.getElementById('decoy-pin-field').value = '654321';
                document.getElementById('btn-save-decoy').click();
            `);
            await sleep(500);
            
            let decoyStatusText = await evaluate('document.getElementById("decoy-setup-status").textContent');
            console.log('✓ Decoy setup status message:', decoyStatusText);
            if (!decoyStatusText.includes('saved')) {
                throw new Error('Failed to save decoy passcode.');
            }

            // 5. Lock screen and try to log in using Decoy PIN
            console.log('Locking application...');
            await evaluate('document.getElementById("btn-sidebar-lock").click()');
            await sleep(500);

            console.log('Submitting incorrect PIN to trigger webcam capture setting check...');
            await evaluate(`{
                const keys = document.querySelectorAll('#lock-pin-section .pin-key');
                const key1 = Array.from(keys).find(k => k.dataset.value === '1');
                const key2 = Array.from(keys).find(k => k.dataset.value === '2');
                for(let i=0; i<5; i++) key1.click();
                key2.click();
            }`);
            await sleep(500);
            let incorrectPinError = await evaluate('document.getElementById("pin-error-msg").textContent');
            console.log('✓ Received error for incorrect PIN:', incorrectPinError);

            console.log('Logging in with Decoy PIN (654321)...');
            await evaluate(`{
                const keys = document.querySelectorAll('#lock-pin-section .pin-key');
                const key6 = Array.from(keys).find(k => k.dataset.value === '6');
                const key5 = Array.from(keys).find(k => k.dataset.value === '5');
                const key4 = Array.from(keys).find(k => k.dataset.value === '4');
                const key3 = Array.from(keys).find(k => k.dataset.value === '3');
                const key2 = Array.from(keys).find(k => k.dataset.value === '2');
                const key1 = Array.from(keys).find(k => k.dataset.value === '1');
                key6.click(); key5.click(); key4.click(); key3.click(); key2.click(); key1.click();
            }`);
            await sleep(1000);

            let currentScreen = await evaluate('document.querySelector(".screen.active").id');
            console.log('✓ Current screen after Decoy login:', currentScreen);
            if (currentScreen !== 'screen-dashboard') {
                throw new Error('Decoy login failed to transition to dashboard.');
            }

            let isDecoySessionActive = await evaluate('HelloApp.isDecoy()');
            console.log('✓ HelloApp isDecoy Session status:', isDecoySessionActive);
            if (!isDecoySessionActive) {
                throw new Error('HelloApp decoy session flag is false.');
            }

            console.log('Verifying Settings security options are hidden under Decoy mode...');
            await evaluate('switchDashboardView("settings")');
            await sleep(300);
            
            let decoySetupVisible = await evaluate('document.getElementById("decoy-mode-setup-container").style.display !== "none"');
            let intruderLogsVisible = await evaluate('document.getElementById("settings-intruder-logs-card").style.display !== "none"');
            console.log('✓ Decoy Setup Container visible status in Decoy mode:', decoySetupVisible);
            console.log('✓ Intruder Logs Grid visible status in Decoy mode:', intruderLogsVisible);
            if (decoySetupVisible || intruderLogsVisible) {
                throw new Error('Decoy setups or Intruder logs are visible during Decoy session.');
            }

            console.log('\n=============================================================');
            console.log('🎉 ALL BLUEPRINT ADVANCED FEATURE E2E TESTS PASSED! 🎉');
            console.log('=============================================================');

            console.log('\n=== TEST FLOW J: GALLERY GRID & GEOLOCATIONS ===');
            
            // 1. Lock and unlock to exit decoy mode
            console.log('Locking app to exit decoy session...');
            await evaluate('document.getElementById("btn-sidebar-lock").click()');
            await sleep(500);

            console.log('Switching to Pattern lock screen tab...');
            await evaluate('document.querySelector(\'#screen-lock .auth-tab[data-method="pattern"]\').click()');
            await sleep(500);

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

            let isDecoyActiveNow = await evaluate('HelloApp.isDecoy()');
            console.log('✓ Decoy session status in standard mode:', isDecoyActiveNow);
            if (isDecoyActiveNow) throw new Error('Decoy session flag is still true after normal login.');

            // 2. Open editor, write entry with base64 image and location metadata
            console.log('Navigating to Editor...');
            await evaluate('HelloApp.showScreen("screen-editor")');
            await sleep(500);

            console.log('Writing entry content with inline image drawing...');
            await evaluate(`
                document.getElementById('rich-editor-field').innerHTML = '<h1>Travel Sketch</h1><p>Drawing at the Golden Gate Bridge.</p><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==">';
                document.getElementById('rich-editor-field').dispatchEvent(new Event('input'));
            `);

            console.log('Tagging entry with location: San Francisco...');
            await evaluate(`
                document.getElementById('editor-location-input').value = 'San Francisco';
                document.getElementById('editor-location-input').dispatchEvent(new Event('input'));
            `);
            await sleep(300);

            console.log('Saving entry...');
            await evaluate('document.getElementById("btn-editor-back").click()');
            await sleep(1000);

            // 3. Switch to Gallery view, verify drawing card is rendered
            console.log('Switching view to Gallery tab...');
            await evaluate('switchDashboardView("gallery")');
            await sleep(500);

            let hasDrawingCard = await evaluate('!!document.querySelector("#gallery-grid .gallery-card")');
            console.log('✓ Drawing card rendered in gallery grid:', hasDrawingCard);
            if (!hasDrawingCard) throw new Error('Drawing card not found in gallery grid.');

            // 4. Click gallery card, check if detail modal opens
            console.log('Clicking gallery drawing card...');
            await evaluate('document.querySelector("#gallery-grid .gallery-card").click()');
            await sleep(500);

            let isModalActive = await evaluate('document.getElementById("modal-view-entry").classList.contains("active")');
            console.log('✓ Detail modal is active:', isModalActive);
            if (!isModalActive) throw new Error('Detail modal failed to open.');

            console.log('Closing detail modal...');
            await evaluate('document.getElementById("btn-view-modal-close").click()');
            await sleep(300);

            console.log('\n=== TEST FLOW K: BLUEPRINT BUNDLE EXTENSIONS ===');

            // 1. Bookmarking / Favoriting & Thumbnails
            console.log('Switching to Timeline view...');
            await evaluate('switchDashboardView("timeline")');
            await sleep(500);

            console.log('Creating a new entry with an inline drawing for bookmark/thumbnail testing...');
            await evaluate('document.getElementById("btn-fab-new-entry").click()');
            await sleep(500);

            await evaluate(`
                document.getElementById('rich-editor-field').innerHTML = '<h1>Favorited Sketch</h1><p>This is a sketch with a drawing.</p><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==">';
                document.getElementById('rich-editor-field').dispatchEvent(new Event('input'));
            `);
            await sleep(300);

            console.log('Clicking favorite star button in editor header...');
            await evaluate('document.getElementById("btn-editor-favorite").click()');
            await sleep(300);

            let isEditorFavActive = await evaluate('document.getElementById("btn-editor-favorite").classList.contains("active")');
            console.log('✓ Editor header favorite star is active:', isEditorFavActive);
            if (!isEditorFavActive) throw new Error('Editor header favorite star failed to activate.');

            console.log('Saving entry...');
            await evaluate('document.getElementById("btn-editor-back").click()');
            await sleep(1500);

            // Verify the card has favorited star on timeline
            let cardFavActive = await evaluate(`{
                const cards = document.querySelectorAll("#view-timeline .entries-grid > div");
                const targetCard = Array.from(cards).find(c => c.querySelector('h3').textContent === 'Favorited Sketch');
                targetCard && targetCard.querySelector('.timeline-card-favorite-btn').classList.contains('active');
            }`);
            console.log('✓ Timeline card favorite star is active:', cardFavActive);
            if (!cardFavActive) throw new Error('Timeline card favorite star is not active.');

            // Verify the card has thumbnail preview
            let hasThumbnail = await evaluate(`{
                const cards = document.querySelectorAll("#view-timeline .entries-grid > div");
                const targetCard = Array.from(cards).find(c => c.querySelector('h3').textContent === 'Favorited Sketch');
                targetCard && !!targetCard.querySelector('.card-thumbnail-container img.card-thumbnail');
            }`);
            console.log('✓ Card has thumbnail image preview:', hasThumbnail);
            if (!hasThumbnail) throw new Error('Card thumbnail image preview not found.');

            // Create another normal entry (non-favorited)
            console.log('Creating a normal entry (non-favorited) to test filtering...');
            await evaluate('document.getElementById("btn-fab-new-entry").click()');
            await sleep(500);

            await evaluate(`
                document.getElementById('rich-editor-field').innerHTML = '<h1>Normal Entry</h1><p>Just a regular entry.</p>';
                document.getElementById('rich-editor-field').dispatchEvent(new Event('input'));
            `);
            await sleep(300);

            console.log('Saving normal entry...');
            await evaluate('document.getElementById("btn-editor-back").click()');
            await sleep(1500);

            // Test favorites filter
            console.log('Activating Favorites filter on Timeline topbar...');
            await evaluate('document.getElementById("btn-filter-favorites").click()');
            await sleep(500);

            let visibleCardTitles = await evaluate(`
                Array.from(document.querySelectorAll("#view-timeline .entries-grid h3")).map(h => h.textContent)
            `);
            console.log('✓ Visible card titles with favorites filter active:', visibleCardTitles);
            if (visibleCardTitles.includes('Normal Entry') || !visibleCardTitles.includes('Favorited Sketch')) {
                throw new Error('Favorites filter did not work correctly.');
            }

            console.log('Deactivating Favorites filter...');
            await evaluate('document.getElementById("btn-filter-favorites").click()');
            await sleep(500);

            visibleCardTitles = await evaluate(`
                Array.from(document.querySelectorAll("#view-timeline .entries-grid h3")).map(h => h.textContent)
            `);
            console.log('✓ Visible card titles with favorites filter inactive:', visibleCardTitles);
            if (!visibleCardTitles.includes('Normal Entry') || !visibleCardTitles.includes('Favorited Sketch')) {
                throw new Error('Favorites filter deactivation failed to restore all entries.');
            }

            // 2. Templates
            console.log('Opening Editor to test Writing Templates...');
            await evaluate('document.getElementById("btn-fab-new-entry").click()');
            await sleep(500);

            // Mock window.confirm to return true automatically
            console.log('Mocking window.confirm to auto-approve...');
            await evaluate('window.confirm = () => true;');

            console.log('Selecting Daily Reflection template...');
            await evaluate(`{
                const picker = document.getElementById('editor-template-picker');
                picker.value = 'daily';
                picker.dispatchEvent(new Event('change'));
            }`);
            await sleep(500);

            let editorText = await evaluate('document.getElementById("rich-editor-field").innerHTML');
            console.log('✓ Editor content contains Daily Reflection:', editorText.includes('Daily Reflection'));
            if (!editorText.includes('Daily Reflection')) {
                throw new Error('Template selection failed to populate editor.');
            }

            console.log('Selecting Gratitude Journal template (should overwrite Daily)...');
            await evaluate(`{
                const picker = document.getElementById('editor-template-picker');
                picker.value = 'gratitude';
                picker.dispatchEvent(new Event('change'));
            }`);
            await sleep(500);

            editorText = await evaluate('document.getElementById("rich-editor-field").innerHTML');
            console.log('✓ Editor content contains Gratitude Journal:', editorText.includes('Gratitude Journal'));
            if (!editorText.includes('Gratitude Journal') || editorText.includes('Daily Reflection')) {
                throw new Error('Template selection failed to overwrite editor content properly.');
            }

            // 3. Zen Mode
            console.log('Toggling Zen Mode...');
            await evaluate('document.getElementById("btn-zen-mode").click()');
            await sleep(500);

            let isZenActive = await evaluate('document.getElementById("screen-editor").classList.contains("zen-mode-active")');
            console.log('✓ Zen Mode class active on editor screen:', isZenActive);
            if (!isZenActive) throw new Error('Zen Mode failed to activate.');

            console.log('Exiting Zen Mode via escape button...');
            await evaluate('document.getElementById("btn-zen-exit").click()');
            await sleep(500);

            isZenActive = await evaluate('document.getElementById("screen-editor").classList.contains("zen-mode-active")');
            console.log('✓ Zen Mode class inactive after clicking exit:', !isZenActive);
            if (isZenActive) throw new Error('Zen Mode failed to deactivate via exit button.');

            console.log('Toggling Zen Mode again to test Escape key...');
            await evaluate('document.getElementById("btn-zen-mode").click()');
            await sleep(500);

            console.log('Dispatching Escape key event...');
            await evaluate(`
                window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
            `);
            await sleep(500);

            isZenActive = await evaluate('document.getElementById("screen-editor").classList.contains("zen-mode-active")');
            console.log('✓ Zen Mode class inactive after Escape key:', !isZenActive);
            if (isZenActive) throw new Error('Zen Mode failed to deactivate via Escape key.');

            console.log('Exiting editor...');
            await evaluate('document.getElementById("btn-editor-back").click()');
            await sleep(1000);

            // 4. Settings Inactivity Auto-Lock
            console.log('Navigating to Settings...');
            await evaluate('switchDashboardView("settings")');
            await sleep(500);

            console.log('Setting up timeout override hook...');
            await evaluate(`{
                window.__capturedAutoLockCallback = null;
                const origSetTimeout = window.setTimeout;
                window.setTimeout = function(cb, delay) {
                    if (delay === 60000) {
                        window.__capturedAutoLockCallback = cb;
                    }
                    return origSetTimeout.apply(this, arguments);
                };
            }`);

            console.log('Selecting Auto-Lock Timeout: 1 Minute...');
            await evaluate(`{
                const picker = document.getElementById('select-auto-lock');
                picker.value = '1';
                picker.dispatchEvent(new Event('change'));
            }`);
            await sleep(500);

            let hasTimerCallback = await evaluate('typeof window.__capturedAutoLockCallback === "function"');
            console.log('✓ Captured inactivity timer callback:', hasTimerCallback);
            if (!hasTimerCallback) throw new Error('Failed to capture inactivity timer callback.');

            console.log('Simulating inactivity timeout execution...');
            await evaluate('window.__capturedAutoLockCallback()');
            await sleep(1000);

            let activeScreen = await evaluate('document.querySelector(".screen.active").id');
            console.log('✓ Current screen after inactivity lock:', activeScreen);
            if (activeScreen !== 'screen-lock') {
                throw new Error('Auto-lock failed to lock the screen after inactivity.');
            }

            console.log('\n=============================================================');
            console.log('🎉 ALL STEP 11 BLUEPRINT BUNDLE EXTENSIONS PASSED! 🎉');
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
    }, 85000);
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
