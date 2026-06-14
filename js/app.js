/* ==========================================================================
   Hello Diary — Application Controller (Step 3)
   Manages application bootstrap, security portal (Auth & Setup flows),
   custom pattern lock drawing, biometric mockup, and lockout countdowns.
   ========================================================================== */

'use strict';

// --------------------------------------------------------------------------
// 1. REUSABLE CUSTOM 3x3 PATTERN LOCK CANVAS CONTROLLER
// --------------------------------------------------------------------------
class PatternCanvas {
    constructor(canvasId, onComplete) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.onComplete = onComplete;
        
        this.nodes = [];
        this.selectedNodes = [];
        this.isDrawing = false;
        this.currentPos = { x: 0, y: 0 };
        this.isDisabled = false;

        this.initNodes();
        this.bindEvents();
        this.draw();
    }

    /**
     * Initializes the coordinates for the 3x3 node grid.
     */
    initNodes() {
        const width = this.canvas.width;
        const height = this.canvas.height;
        const padding = 40;
        const spacingX = (width - 2 * padding) / 2;
        const spacingY = (height - 2 * padding) / 2;

        this.nodes = [];
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                this.nodes.push({
                    id: r * 3 + c,
                    x: padding + c * spacingX,
                    y: padding + r * spacingY
                });
            }
        }
    }

    /**
     * Binds mouse and touch listeners for interactive pattern drawing.
     */
    bindEvents() {
        const start = (e) => {
            if (this.isDisabled) return;
            e.preventDefault();
            this.isDrawing = true;
            this.selectedNodes = [];
            this.updateCurrentPos(e);
            this.checkCollision();
            this.draw();
        };

        const move = (e) => {
            if (!this.isDrawing || this.isDisabled) return;
            e.preventDefault();
            this.updateCurrentPos(e);
            this.checkCollision();
            this.draw();
        };

        const end = (e) => {
            if (!this.isDrawing || this.isDisabled) return;
            e.preventDefault();
            this.isDrawing = false;
            
            const sequence = this.selectedNodes.map(n => n.id).join('');
            if (this.onComplete) {
                this.onComplete(sequence);
            }
            this.draw();
        };

        // Mouse Listeners
        this.canvas.addEventListener('mousedown', start);
        this.canvas.addEventListener('mousemove', move);
        window.addEventListener('mouseup', end);

        // Touch Listeners
        this.canvas.addEventListener('touchstart', start, { passive: false });
        this.canvas.addEventListener('touchmove', move, { passive: false });
        window.addEventListener('touchend', end);
    }

    /**
     * Computes relative mouse/touch position inside the canvas.
     */
    updateCurrentPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        this.currentPos = {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    }

    /**
     * Detects if mouse/finger coordinates collide with any unselected nodes.
     */
    checkCollision() {
        const radius = 25; // Touch target radius
        for (let node of this.nodes) {
            const dist = Math.hypot(this.currentPos.x - node.x, this.currentPos.y - node.y);
            if (dist < radius) {
                if (!this.selectedNodes.includes(node)) {
                    this.selectedNodes.push(node);
                    // Trigger light vibration if supported
                    if (navigator.vibrate) {
                        navigator.vibrate(15);
                    }
                }
            }
        }
    }

    setDisabled(disabled) {
        this.isDisabled = disabled;
        this.draw();
    }

    clear() {
        this.selectedNodes = [];
        this.isDrawing = false;
        this.draw();
    }

    /**
     * Paints the pattern grid, active node halos, and linking lines.
     */
    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Fetch styling tokens dynamically from root variables
        const style = getComputedStyle(document.documentElement);
        const accentColor = style.getPropertyValue('--accent').trim() || '#6B7FD7';
        const textColor = style.getPropertyValue('--text-primary').trim() || '#333';
        const borderLight = style.getPropertyValue('--border').trim() || 'rgba(128,128,128,0.2)';

        // 1. Draw connecting lines
        if (this.selectedNodes.length > 0) {
            this.ctx.beginPath();
            this.ctx.strokeStyle = this.isDisabled ? 'rgba(128, 128, 128, 0.4)' : accentColor;
            this.ctx.lineWidth = 4;
            this.ctx.lineJoin = 'round';
            this.ctx.lineCap = 'round';

            this.ctx.moveTo(this.selectedNodes[0].x, this.selectedNodes[0].y);
            for (let i = 1; i < this.selectedNodes.length; i++) {
                this.ctx.lineTo(this.selectedNodes[i].x, this.selectedNodes[i].y);
            }

            if (this.isDrawing && !this.isDisabled) {
                this.ctx.lineTo(this.currentPos.x, this.currentPos.y);
            }
            this.ctx.stroke();
        }

        // 2. Draw nodes
        for (let node of this.nodes) {
            const isSelected = this.selectedNodes.includes(node);

            // Outer ring
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, 22, 0, Math.PI * 2);
            if (isSelected) {
                this.ctx.strokeStyle = this.isDisabled ? 'rgba(128, 128, 128, 0.5)' : accentColor;
                this.ctx.fillStyle = this.isDisabled ? 'rgba(128, 128, 128, 0.1)' : accentColor + '20'; // 12% opacity
                this.ctx.fill();
            } else {
                this.ctx.strokeStyle = borderLight;
            }
            this.ctx.lineWidth = 2;
            this.ctx.stroke();

            // Inner center dot
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, 6, 0, Math.PI * 2);
            this.ctx.fillStyle = isSelected 
                ? (this.isDisabled ? 'rgba(128, 128, 128, 0.7)' : accentColor)
                : textColor;
            this.ctx.fill();
        }
    }
}

// --------------------------------------------------------------------------
// 2. MAIN APPLICATION CONTROLLER DEFINITION
// --------------------------------------------------------------------------
const HelloApp = (function() {
    
    // Cryptographic derived key cached ONLY in volatile RAM closure
    let sessionKey = null;
    
    // In-memory key backup to allow mock biometrics to unlock within an active session
    let biometricBackupKey = null;

    // Countdown timer interval for lockout screen
    let lockoutIntervalId = null;
    let lockoutUntilTime = 0;

    // Pattern Canvas instances
    let setupPatternCanvas = null;
    let lockPatternCanvas = null;

    // Multistep Setup State variables
    let setupMethod = 'pin'; // 'pin' or 'pattern'
    let setupConfirmMode = false;
    let setupFirstCode = '';
    let setupFinalPasscode = '';
    let setupEnteredPin = '';

    // Lock screen state variables
    let lockEnteredPin = '';

    // --- Step 4 State Variables ---
    let cachedEntries = []; // RAM cached array of decrypted diary entries
    let currentCalendarDate = new Date();
    let searchMoodFilter = 'all';
    let searchTagsFilter = new Set();
    
    // Editor state
    let activeEntryId = null; 
    let activeEntryDate = null;
    let editorDirty = false;
    let autoSaveIntervalId = null;

    /**
     * Returns the current volatile session key.
     */
    function getSessionKey() {
        return sessionKey;
    }

    /**
     * Boots the application lifecycle on DOM load.
     */
    async function init() {
        try {
            // 1. Initialize DB Connection
            await HelloDB.initDatabase();

            // 2. Wrap the global applyTheme function to save to DB settings store
            wrapThemeSwitches();

            // 3. Load user theme from database settings
            const dbTheme = await HelloDB.getSetting('theme');
            if (dbTheme && window.applyTheme) {
                window.applyTheme(dbTheme);
            }

            // 4. Load biometrics settings checkbox state
            const bioConfig = await HelloDB.getSetting('biometrics');
            const bioToggle = document.getElementById('toggle-biometrics');
            if (bioToggle) {
                bioToggle.checked = !!bioConfig;
            }

            // 5. Check lockout status
            await checkLockoutState();

            // 6. Bind all UI controllers
            initSetupFlow();
            initLockFlow();
            initDashboardControllers();
            initEditorControllers();

            // Start Auto-save Engine
            startAutoSaveInterval();

            // 7. Redirect to Setup screen or Lock screen
            const hasCredentials = await HelloDB.hasCredentials();
            if (!hasCredentials) {
                showScreen('screen-setup');
            } else {
                showScreen('screen-lock');
            }

        } catch (err) {
            console.error('App initialization error:', err);
            showToast('Failed to initialize application database.');
        }
    }

    /**
     * Wraps the global applyTheme function from dev-toggle.js to write setting to database.
     */
    function wrapThemeSwitches() {
        const originalApplyTheme = window.applyTheme;
        window.applyTheme = function(themeId) {
            if (originalApplyTheme) {
                originalApplyTheme(themeId);
            }
            // Save theme selection in IndexedDB
            HelloDB.setSetting('theme', themeId).catch(err => {
                console.error('Failed to save theme in settings:', err);
            });
        };
    }

    /**
     * Changes the visible active layout screen.
     */
    function showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(scr => {
            scr.classList.remove('active');
        });
        const target = document.getElementById(screenId);
        if (target) {
            target.classList.add('active');
        }
        
        // Synchronize the developer switcher panel selection
        const devSelect = document.querySelector('#dev-screens-toggle-panel select');
        if (devSelect) {
            devSelect.value = screenId;
        }

        if (screenId === 'screen-dashboard' && sessionKey) {
            loadAndRenderDashboard();
        }
    }

    // --------------------------------------------------------------------------
    // 3. FIRST-TIME SETUP FLOW CONTROLLER
    // --------------------------------------------------------------------------
    function initSetupFlow() {
        // Step navigation DOM triggers
        const next1 = document.getElementById('btn-setup-next-1');
        const next2 = document.getElementById('btn-setup-next-2');
        const back2 = document.getElementById('btn-setup-back-2');
        const back3 = document.getElementById('btn-setup-back-3');
        const finishSetup = document.getElementById('btn-setup-finish');
        
        const setupStep1 = document.getElementById('setup-step-1');
        const setupStep2 = document.getElementById('setup-step-2');
        const setupStep3 = document.getElementById('setup-step-3');
        const progressFill = document.getElementById('setup-progress-fill');

        // Select protection method selector cards
        document.querySelectorAll('.security-option').forEach(card => {
            card.addEventListener('click', () => {
                document.querySelectorAll('.security-option').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                setupMethod = card.dataset.method;
            });
        });

        // Step 1 -> Step 2
        if (next1) {
            next1.addEventListener('click', () => {
                setupStep1.classList.remove('active');
                setupStep2.classList.add('active');
                progressFill.style.width = '66.6%';
                resetSetupStep2State();
            });
        }

        // Step 2 -> Step 1
        if (back2) {
            back2.addEventListener('click', () => {
                setupStep2.classList.remove('active');
                setupStep1.classList.add('active');
                progressFill.style.width = '33.3%';
                resetSetupStep2State();
            });
        }

        // Step 3 -> Step 2
        if (back3) {
            back3.addEventListener('click', () => {
                setupStep3.classList.remove('active');
                setupStep2.classList.add('active');
                progressFill.style.width = '66.6%';
                resetSetupStep2State();
            });
        }

        // Initialize Pattern Lock Canvas for setup
        setupPatternCanvas = new PatternCanvas('setup-pattern-canvas', (sequence) => {
            setupConfirmModeSubmit(sequence);
        });

        // PIN pad keypad logic for setup
        setupEnteredPin = '';
        const setupPinDots = document.querySelectorAll('#setup-pin-dots .pin-dot');
        document.querySelectorAll('#setup-pin-pad .pin-key').forEach(key => {
            key.addEventListener('click', () => {
                const val = key.dataset.value;
                if (val === 'back') {
                    setupEnteredPin = setupEnteredPin.slice(0, -1);
                } else if (setupEnteredPin.length < 6) {
                    setupEnteredPin += val;
                }

                // Render dot fills
                setupPinDots.forEach((dot, idx) => {
                    dot.classList.toggle('filled', idx < setupEnteredPin.length);
                });

                document.getElementById('setup-error-msg').textContent = '';

                // Auto submit PIN at 6 digits
                if (setupEnteredPin.length === 6) {
                    setupConfirmModeSubmit(setupEnteredPin);
                }
            });
        });

        // Confirm Code Button click in Step 2
        if (next2) {
            next2.addEventListener('click', () => {
                if (setupMethod === 'pin') {
                    if (setupEnteredPin.length < 6) {
                        document.getElementById('setup-error-msg').textContent = 'PIN must be exactly 6 digits.';
                        return;
                    }
                    setupConfirmModeSubmit(setupEnteredPin);
                } else {
                    const nodes = setupPatternCanvas.selectedNodes.map(n => n.id).join('');
                    if (nodes.length < 4) {
                        document.getElementById('setup-error-msg').textContent = 'Pattern must connect at least 4 nodes.';
                        return;
                    }
                    setupConfirmModeSubmit(nodes);
                }
            });
        }

        // Enter Sanctuary Finish Click (Step 3)
        if (finishSetup) {
            finishSetup.onclick = async () => {
                try {
                    const themeId = localStorage.getItem('hello-diary-theme') || 'serene-dawn';
                    
                    // 1. Save passcode configuration to DB credentials and settings
                    await HelloDB.saveCredentials(setupFinalPasscode);
                    await HelloDB.setSetting('theme', themeId);

                    // 2. Perform verification to derive key and cache in volatile RAM closure
                    sessionKey = await HelloDB.verifyCredentials(setupFinalPasscode);
                    biometricBackupKey = sessionKey;

                    showToast('Setup complete! Welcome to Hello Diary ✨');
                    showScreen('screen-dashboard');
                    if (window.switchDashboardView) {
                        window.switchDashboardView('timeline');
                    }
                } catch (err) {
                    console.error('Setup finalization error:', err);
                    document.getElementById('setup-error-msg').textContent = 'Failed to save configuration. Please try again.';
                }
            };
        }
    }

    /**
     * Controls the confirmation toggle logic for passcode setting.
     */
    function setupConfirmModeSubmit(passcode) {
        const titleEl = document.getElementById('setup-step-2-title');
        const descEl = document.getElementById('setup-step-2-desc');
        const next2Btn = document.getElementById('btn-setup-next-2');
        const errorEl = document.getElementById('setup-error-msg');

        errorEl.textContent = '';

        if (!setupConfirmMode) {
            // First entry: save and switch to confirm prompt
            if (setupMethod === 'pin' && passcode.length < 6) {
                errorEl.textContent = 'PIN must be exactly 6 digits.';
                return;
            }
            if (setupMethod === 'pattern' && passcode.length < 4) {
                errorEl.textContent = 'Pattern must connect at least 4 nodes.';
                return;
            }

            setupFirstCode = passcode;
            setupConfirmMode = true;

            // Clear inputs
            clearSetupInputs();

            // Transition text prompts
            if (setupMethod === 'pin') {
                titleEl.textContent = 'Confirm PIN Lock';
                descEl.textContent = 'Please re-enter your new 6-digit access code to confirm.';
            } else {
                titleEl.textContent = 'Confirm Pattern Lock';
                descEl.textContent = 'Please draw the pattern again to confirm.';
            }
            if (next2Btn) next2Btn.textContent = 'Confirm & Continue';

        } else {
            // Second entry: compare and match
            if (passcode === setupFirstCode) {
                // SUCCESS
                setupFinalPasscode = passcode;
                
                // Go to step 3
                document.getElementById('setup-step-2').classList.remove('active');
                document.getElementById('setup-step-3').classList.add('active');
                document.getElementById('setup-progress-fill').style.width = '100%';
            } else {
                resetSetupStep2State();
                errorEl.textContent = 'Passcodes do not match. Please start over.';
                
                // Shake elements
                const container = setupMethod === 'pin' 
                    ? document.getElementById('setup-pin-dots')
                    : document.getElementById('setup-pattern-canvas');
                
                if (container) {
                    container.style.animation = 'none';
                    void container.offsetWidth; // Reflow
                    container.style.animation = 'shake 0.3s ease';
                }

            }
        }
    }

    /**
     * Clears step 2 input variables and displays.
     */
    function clearSetupInputs() {
        setupEnteredPin = '';
        document.querySelectorAll('#setup-pin-dots .pin-dot').forEach(d => d.classList.remove('filled'));
        if (setupPatternCanvas) {
            setupPatternCanvas.clear();
        }
    }

    /**
     * Resets Setup Step 2 titles, button text, and variables back to default define view.
     */
    function resetSetupStep2State() {
        setupConfirmMode = false;
        setupFirstCode = '';
        clearSetupInputs();

        const titleEl = document.getElementById('setup-step-2-title');
        const descEl = document.getElementById('setup-step-2-desc');
        const next2Btn = document.getElementById('btn-setup-next-2');
        const pinArea = document.getElementById('setup-pin-container');
        const patArea = document.getElementById('setup-pattern-container');

        if (setupMethod === 'pin') {
            titleEl.textContent = 'Step 2: Create a PIN';
            descEl.textContent = 'Input a secure 6-digit PIN code.';
            pinArea.style.display = 'flex';
            patArea.style.display = 'none';
        } else {
            titleEl.textContent = 'Step 2: Draw a Pattern';
            descEl.textContent = 'Draw a pattern connecting at least 4 nodes.';
            pinArea.style.display = 'none';
            patArea.style.display = 'flex';
            if (setupPatternCanvas) setupPatternCanvas.draw();
        }

        if (next2Btn) next2Btn.textContent = 'Confirm Code';
        document.getElementById('setup-error-msg').textContent = '';
    }

    // --------------------------------------------------------------------------
    // 4. LOCK SCREEN SECURITY FLOW CONTROLLER
    // --------------------------------------------------------------------------
    function initLockFlow() {
        // 1. PIN Keypad listeners
        lockEnteredPin = '';
        const lockPinDots = document.querySelectorAll('#lock-pin-section .pin-dot');
        
        document.querySelectorAll('#lock-pin-section .pin-key').forEach(key => {
            key.addEventListener('click', async () => {
                if (lockoutUntilTime > Date.now()) return; // Lockout active

                const val = key.dataset.value;
                console.log('Lock PIN click:', val, 'Current length:', lockEnteredPin.length);
                if (val === 'back') {
                    lockEnteredPin = lockEnteredPin.slice(0, -1);
                } else if (lockEnteredPin.length < 6) {
                    lockEnteredPin += val;
                }

                // Render dot active states
                lockPinDots.forEach((dot, idx) => {
                    dot.classList.toggle('filled', idx < lockEnteredPin.length);
                });

                document.getElementById('pin-error-msg').textContent = '';

                // Submit automatically at 6 digits
                if (lockEnteredPin.length === 6) {
                    setPinKeysDisabled(true);
                    console.log('Submitting PIN for verification:', lockEnteredPin);
                    try {
                        const key = await HelloDB.verifyCredentials(lockEnteredPin);
                        console.log('Verification success!');
                        
                        // Success
                        sessionKey = key;
                        biometricBackupKey = key;
                        lockEnteredPin = '';
                        lockPinDots.forEach(d => d.classList.remove('filled'));

                        showToast('Welcome back to your Sanctuary! 🌙');
                        showScreen('screen-dashboard');
                        if (window.switchDashboardView) {
                            window.switchDashboardView('timeline');
                        }
                    } catch (err) {
                        console.error('Verification failure:', err.message);
                        // Failure
                        lockEnteredPin = '';
                        lockPinDots.forEach(dot => {
                            dot.classList.remove('filled');
                            dot.style.animation = 'none';
                            void dot.offsetWidth; // Reflow
                            dot.style.animation = 'shake 0.3s ease';
                        });

                        document.getElementById('pin-error-msg').textContent = err.message;
                        await checkLockoutState();
                    } finally {
                        if (lockoutUntilTime <= Date.now()) {
                            setPinKeysDisabled(false);
                        }
                    }
                }
            });
        });

        // 2. Initialize Pattern Canvas for Lock screen
        lockPatternCanvas = new PatternCanvas('pattern-canvas', async (sequence) => {
            if (lockoutUntilTime > Date.now()) return;

            if (sequence.length < 4) {
                document.getElementById('pattern-error-msg').textContent = 'Pattern must connect at least 4 nodes.';
                lockPatternCanvas.clear();
                return;
            }

            lockPatternCanvas.setDisabled(true);
            try {
                const key = await HelloDB.verifyCredentials(sequence);
                
                // Success
                sessionKey = key;
                biometricBackupKey = key;
                lockPatternCanvas.clear();

                showToast('Welcome back to your Sanctuary! 🌙');
                showScreen('screen-dashboard');
                if (window.switchDashboardView) {
                    window.switchDashboardView('timeline');
                }
            } catch (err) {
                // Failure
                lockPatternCanvas.clear();
                document.getElementById('pattern-error-msg').textContent = err.message;
                await checkLockoutState();
            } finally {
                if (lockoutUntilTime <= Date.now()) {
                    lockPatternCanvas.setDisabled(false);
                }
            }
        });

        // 3. Biometric scan button listener
        const bioTrigger = document.getElementById('lock-bio-trigger');
        if (bioTrigger) {
            bioTrigger.addEventListener('click', async () => {
                if (lockoutUntilTime > Date.now()) return;

                const bioErrorEl = document.getElementById('bio-error-msg');
                bioErrorEl.textContent = '';

                // Verify in DB if biometrics is active
                const bioConfig = await HelloDB.getSetting('biometrics');
                if (!bioConfig) {
                    bioErrorEl.textContent = 'Biometrics not enabled. Enable it in Settings first.';
                    return;
                }

                // Run scan mock animation
                bioTrigger.classList.add('scanning');
                const originalText = bioTrigger.querySelector('span').textContent;
                bioTrigger.querySelector('span').textContent = 'Scanning fingerprint...';

                setTimeout(() => {
                    bioTrigger.classList.remove('scanning');
                    bioTrigger.querySelector('span').textContent = originalText;

                    if (biometricBackupKey) {
                        sessionKey = biometricBackupKey;
                        showToast('Welcome back via Biometrics! 🌙');
                        showScreen('screen-dashboard');
                        if (window.switchDashboardView) {
                            window.switchDashboardView('timeline');
                        }
                    } else {
                        // Key not loaded in volatile memory
                        bioErrorEl.textContent = 'Biometrics approved. For security on startup, please verify with PIN/Pattern.';
                        
                        // Shake biometric button
                        bioTrigger.style.animation = 'none';
                        void bioTrigger.offsetWidth; // Reflow
                        bioTrigger.style.animation = 'shake 0.3s ease';
                    }
                }, 1500);
            });
        }

        // 4. Sidebar Lock Button trigger
        const sidebarLock = document.getElementById('btn-sidebar-lock');
        if (sidebarLock) {
            sidebarLock.addEventListener('click', () => {
                // Purge key from memory
                sessionKey = null;
                
                // Clear UI states
                lockEnteredPin = '';
                lockPinDots.forEach(d => d.classList.remove('filled'));
                if (lockPatternCanvas) lockPatternCanvas.clear();
                
                document.getElementById('pin-error-msg').textContent = '';
                document.getElementById('pattern-error-msg').textContent = '';
                document.getElementById('bio-error-msg').textContent = '';

                showToast('Diary locked securely. 🌙');
                showScreen('screen-lock');
            });
        }

        // 5. Settings toggle switch binding
        const bioToggle = document.getElementById('toggle-biometrics');
        if (bioToggle) {
            bioToggle.addEventListener('change', async (e) => {
                try {
                    await HelloDB.setSetting('biometrics', e.target.checked);
                    showToast(e.target.checked ? 'Biometric login enabled.' : 'Biometric login disabled.');
                } catch (err) {
                    console.error('Failed to save biometric setting:', err);
                    showToast('Failed to update biometric setting.');
                }
            });
        }
    }

    /**
     * Disable/Enable pin pad buttons during lockout or submission.
     */
    function setPinKeysDisabled(disabled) {
        document.querySelectorAll('#lock-pin-section .pin-key').forEach(key => {
            if (!key.classList.contains('pin-key--empty')) {
                key.disabled = disabled;
            }
        });
    }

    /**
     * Checks database credentials configuration for lockout status.
     * Starts active interval countdown timer if account is locked out.
     */
    async function checkLockoutState() {
        try {
            const config = await HelloDB.getLockoutConfig();
            if (!config) return;

            const now = Date.now();
            if (config.lockoutUntil && config.lockoutUntil > now) {
                lockoutUntilTime = config.lockoutUntil;
                startLockoutCountdown();
            } else {
                lockoutUntilTime = 0;
                stopLockoutCountdown();
            }
        } catch (err) {
            console.error('Failed to retrieve lockout configuration:', err);
        }
    }

    /**
     * Starts interval ticks updating countdown text across all tabs.
     */
    function startLockoutCountdown() {
        // Disable UI controls
        setPinKeysDisabled(true);
        if (lockPatternCanvas) lockPatternCanvas.setDisabled(true);
        const bioBtn = document.getElementById('lock-bio-trigger');
        if (bioBtn) bioBtn.disabled = true;

        if (lockoutIntervalId) clearInterval(lockoutIntervalId);

        const updateUI = () => {
            const timeLeft = lockoutUntilTime - Date.now();
            if (timeLeft <= 0) {
                // Lockout completed!
                stopLockoutCountdown(true);
                return;
            }

            const minutes = Math.floor(timeLeft / 60000);
            const seconds = Math.floor((timeLeft % 60000) / 1000);
            const countdownStr = `Account locked due to 10 failed attempts. Try again in ${minutes}m ${seconds}s.`;

            // Display on all error nodes
            document.getElementById('pin-error-msg').textContent = countdownStr;
            document.getElementById('pattern-error-msg').textContent = countdownStr;
            document.getElementById('bio-error-msg').textContent = countdownStr;
        };

        updateUI();
        lockoutIntervalId = setInterval(updateUI, 1000);
    }

    /**
     * Stops the lockout timer and restores UI controls to active state.
     */
    function stopLockoutCountdown(clearMessages = false) {
        if (lockoutIntervalId) {
            clearInterval(lockoutIntervalId);
            lockoutIntervalId = null;
        }
        lockoutUntilTime = 0;

        if (clearMessages) {
            // Clear warning messages
            document.getElementById('pin-error-msg').textContent = '';
            document.getElementById('pattern-error-msg').textContent = '';
            document.getElementById('bio-error-msg').textContent = '';
        }

        // Re-enable UI controls
        setPinKeysDisabled(false);
        if (lockPatternCanvas) {
            lockPatternCanvas.setDisabled(false);
            lockPatternCanvas.clear();
        }
        const bioBtn = document.getElementById('lock-bio-trigger');
        if (bioBtn) bioBtn.disabled = false;
    }

    /**
     * Loads and decrypts all entries to cache them in RAM and triggers rendering of views.
     */
    async function loadAndRenderDashboard() {
        if (!sessionKey) return;
        try {
            cachedEntries = await HelloDB.getAllDecryptedEntries(sessionKey);
            renderTimeline();
            renderCalendar(currentCalendarDate);
            renderOnThisDay();
            renderSearchFilters();
        } catch (err) {
            console.error('Failed to load dashboard data:', err);
            showToast('Error decrypting diary entries.');
        }
    }

    /**
     * Renders entries on the Timeline view.
     */
    function renderTimeline() {
        const grid = document.querySelector('#view-timeline .entries-grid');
        if (!grid) return;
        
        grid.innerHTML = '';
        
        if (cachedEntries.length === 0) {
            grid.innerHTML = `
                <div class="glass-card" style="grid-column: 1 / -1; padding: var(--space-xl); text-align: center; width: 100%;">
                    <span style="font-size: 3rem;">✍️</span>
                    <h3 class="font-title" style="margin-top: var(--space-md); font-weight: 600;">No memories written yet</h3>
                    <p style="color: var(--text-secondary); font-size: 0.9rem; margin-top: 4px;">Click the floating + button to write your first entry.</p>
                </div>
            `;
            return;
        }
        
        const MOODS_MAP = {
            1: { emoji: '😢', name: 'Awful' },
            2: { emoji: '😕', name: 'Bad' },
            3: { emoji: '😐', name: 'Okay' },
            4: { emoji: '🙂', name: 'Good' },
            5: { emoji: '😊', name: 'Great' }
        };
        
        cachedEntries.forEach(entry => {
            const formattedDate = new Date(entry.date).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric'
            }).toUpperCase();
            
            const card = document.createElement('div');
            card.className = 'glass-card spring-hover';
            card.style.padding = 'var(--space-md)';
            card.style.display = 'flex';
            card.style.flexDirection = 'column';
            card.style.gap = 'var(--space-sm)';
            card.style.cursor = 'pointer';
            card.style.borderLeft = `4px solid var(--mood-${entry.mood})`;
            
            const tagsHtml = (entry.tags || []).map(t => `<span class="tag-pill" style="padding: 2px 8px; font-size: 0.7rem;">#${escapeHtml(t)}</span>`).join('');
            
            let snippet = stripHtml(entry.content);
            if (snippet.length > 150) {
                snippet = snippet.substring(0, 150) + '...';
            }
            
            card.innerHTML = `
                <div class="flex justify-between align-center">
                    <span style="font-size: 0.8rem; font-weight: 600; color: var(--text-muted);">${formattedDate}</span>
                    <span style="font-size: 1.3rem;" title="${MOODS_MAP[entry.mood]?.name || 'Okay'}">${MOODS_MAP[entry.mood]?.emoji || '😐'}</span>
                </div>
                <h3 class="font-title" style="font-size: 1.15rem; font-weight: 600;">${escapeHtml(entry.title || 'Untitled')}</h3>
                <p style="font-size: 0.88rem; color: var(--text-secondary); line-height: 1.6; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">
                    ${escapeHtml(snippet)}
                </p>
                <div class="flex" style="gap: 4px; margin-top: auto; flex-wrap: wrap;">
                    ${tagsHtml}
                </div>
            `;
            
            card.addEventListener('click', () => {
                openViewModal(entry);
            });
            
            grid.appendChild(card);
        });
    }

    /**
     * Renders the Calendar month grid.
     */
    function renderCalendar(date) {
        const grid = document.getElementById('calendar-grid');
        const monthYearLabel = document.getElementById('calendar-month-year');
        if (!grid || !monthYearLabel) return;
        
        const year = date.getFullYear();
        const month = date.getMonth();
        
        const monthNames = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
        ];
        monthYearLabel.textContent = `${monthNames[month]} ${year}`;
        
        let html = '';
        
        // 1. Weekday Headers
        const weekdays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
        weekdays.forEach(day => {
            html += `<div style="font-size: 0.75rem; font-weight: 600; color: var(--text-muted); padding: 4px 0;">${day}</div>`;
        });
        
        // 2. Pad previous month days
        const firstDayIndex = new Date(year, month, 1).getDay();
        const prevMonthDaysCount = new Date(year, month, 0).getDate();
        for (let i = firstDayIndex - 1; i >= 0; i--) {
            const dayNum = prevMonthDaysCount - i;
            html += `<div style="padding: 10px 0; opacity: 0.25; font-size: 0.9rem;">${dayNum}</div>`;
        }
        
        // 3. Render current month days
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const today = new Date();
        const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
        
        for (let d = 1; d <= daysInMonth; d++) {
            const isToday = isCurrentMonth && today.getDate() === d;
            
            const dayEntries = cachedEntries.filter(entry => {
                const entryDate = new Date(entry.date);
                return entryDate.getFullYear() === year &&
                       entryDate.getMonth() === month &&
                       entryDate.getDate() === d;
            });
            
            let dotHtml = '';
            if (dayEntries.length > 0) {
                const latestEntry = dayEntries[0]; // newest first
                dotHtml = `<span class="calendar-dot calendar-dot--mood-${latestEntry.mood}"></span>`;
            }
            
            html += `
                <div class="calendar-day-cell spring-hover" 
                     data-date="${year}-${month + 1}-${d}"
                     style="padding: 10px 0; border-radius: var(--radius-sm); cursor: pointer; position: relative; font-size: 0.9rem; ${isToday ? 'background: var(--accent-soft); color: var(--accent); font-weight: 700;' : ''}">
                    ${d}
                    ${dotHtml}
                </div>
            `;
        }
        
        grid.innerHTML = html;
    }

    /**
     * Renders On This Day flashback if memories exist.
     */
    function renderOnThisDay() {
        const widget = document.getElementById('flashback-widget');
        const content = document.getElementById('flashback-content');
        if (!widget || !content) return;
        
        const today = new Date();
        const currentMonth = today.getMonth();
        const currentDay = today.getDate();
        const currentYear = today.getFullYear();
        
        const flashbacks = cachedEntries.filter(entry => {
            const entryDate = new Date(entry.date);
            return entryDate.getMonth() === currentMonth &&
                   entryDate.getDate() === currentDay &&
                   entryDate.getFullYear() < currentYear;
        });
        
        if (flashbacks.length > 0) {
            const entry = flashbacks[Math.floor(Math.random() * flashbacks.length)];
            const yearsAgo = currentYear - new Date(entry.date).getFullYear();
            
            let snippet = stripHtml(entry.content);
            if (snippet.length > 150) {
                snippet = snippet.substring(0, 150) + '...';
            }
            
            content.innerHTML = `${yearsAgo} year(s) ago, you wrote: "${escapeHtml(snippet)}"`;
            widget.style.display = 'flex';
        } else {
            widget.style.display = 'none';
        }
    }

    /**
     * Renders tag filters inside the Search Overlay dynamically based on active tags.
     */
    function renderSearchFilters() {
        const container = document.getElementById('search-tags-container');
        if (!container) return;
        
        const tags = getUniqueTags();
        if (tags.length === 0) {
            container.innerHTML = '<span style="font-size: 0.8rem; color: var(--text-muted);">No tags used yet</span>';
            return;
        }
        
        container.innerHTML = tags.map(tag => {
            const isActive = searchTagsFilter.has(tag);
            return `<button class="search-tag-btn ${isActive ? 'active' : ''}" data-tag="${tag}">#${tag}</button>`;
        }).join('');
        
        container.querySelectorAll('.search-tag-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tag = btn.dataset.tag;
                if (searchTagsFilter.has(tag)) {
                    searchTagsFilter.delete(tag);
                    btn.classList.remove('active');
                } else {
                    searchTagsFilter.add(tag);
                    btn.classList.add('active');
                }
                filterAndRenderSearch();
            });
        });
    }

    function getUniqueTags() {
        const tags = new Set();
        cachedEntries.forEach(entry => {
            if (entry.tags) {
                entry.tags.forEach(t => tags.add(t));
            }
        });
        return Array.from(tags).sort();
    }

    /**
     * Filters cached entries and renders them inside the search results list.
     */
    function filterAndRenderSearch() {
        const searchBox = document.getElementById('search-box');
        const listContainer = document.getElementById('search-list-box');
        if (!searchBox || !listContainer) return;
        
        const query = searchBox.value.trim().toLowerCase();
        
        const filtered = cachedEntries.filter(entry => {
            const matchesText = !query || 
                (entry.title && entry.title.toLowerCase().includes(query)) ||
                (entry.content && stripHtml(entry.content).toLowerCase().includes(query)) ||
                (entry.tags && entry.tags.some(t => t.toLowerCase().includes(query)));
                
            const matchesMood = searchMoodFilter === 'all' || entry.mood === parseInt(searchMoodFilter);
            
            const matchesTags = searchTagsFilter.size === 0 || 
                (entry.tags && Array.from(searchTagsFilter).every(t => entry.tags.includes(t)));
                
            return matchesText && matchesMood && matchesTags;
        });
        
        if (filtered.length === 0) {
            listContainer.innerHTML = `
                <div class="glass-card" style="padding: var(--space-xl); text-align: center; width: 100%;">
                    <span style="font-size: 2.5rem;">🔍</span>
                    <h4 class="font-title" style="margin-top: var(--space-md); font-weight: 600;">No matching entries found</h4>
                    <p style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 4px;">Try modifying your keyword, mood, or tag filters.</p>
                </div>
            `;
            return;
        }
        
        const MOODS_MAP = {
            1: { emoji: '😢', name: 'Awful' },
            2: { emoji: '😕', name: 'Bad' },
            3: { emoji: '😐', name: 'Okay' },
            4: { emoji: '🙂', name: 'Good' },
            5: { emoji: '😊', name: 'Great' }
        };
        
        listContainer.innerHTML = '';
        
        filtered.forEach(entry => {
            const formattedDate = new Date(entry.date).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            }).toUpperCase();
            
            const card = document.createElement('div');
            card.className = 'glass-card spring-hover';
            card.style.padding = 'var(--space-md)';
            card.style.display = 'flex';
            card.style.flexDirection = 'column';
            card.style.gap = 'var(--space-sm)';
            card.style.cursor = 'pointer';
            card.style.borderLeft = `4px solid var(--mood-${entry.mood})`;
            card.style.width = '100%';
            
            const highlightedTitle = highlightText(entry.title || 'Untitled', query);
            const highlightedBody = highlightHtml(entry.content || '', query);
            const tagsHtml = (entry.tags || []).map(t => `<span class="tag-pill" style="padding: 2px 8px; font-size: 0.7rem;">#${highlightText(t, query)}</span>`).join('');
            
            card.innerHTML = `
                <div class="flex justify-between align-center">
                    <span style="font-size: 0.8rem; font-weight: 600; color: var(--text-muted);">${formattedDate}</span>
                    <span style="font-size: 1.3rem;" title="${MOODS_MAP[entry.mood]?.name || 'Okay'}">${MOODS_MAP[entry.mood]?.emoji || '😐'}</span>
                </div>
                <h3 class="font-title" style="font-size: 1.15rem; font-weight: 600;">${highlightedTitle}</h3>
                <p style="font-size: 0.88rem; color: var(--text-secondary); line-height: 1.6;">
                    ${highlightedBody}
                </p>
                <div class="flex" style="gap: 4px; margin-top: auto; flex-wrap: wrap;">
                    ${tagsHtml}
                </div>
            `;
            
            card.addEventListener('click', () => {
                const searchPanel = document.getElementById('search-panel');
                if (searchPanel) searchPanel.classList.remove('active');
                openViewModal(entry);
            });
            
            listContainer.appendChild(card);
        });
    }

    function highlightText(text, query) {
        if (!query) return escapeHtml(text);
        const escapedQuery = query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`(${escapedQuery})`, 'gi');
        return escapeHtml(text).replace(regex, '<mark>$1</mark>');
    }

    function highlightHtml(html, query) {
        const text = stripHtml(html);
        const idx = query ? text.toLowerCase().indexOf(query) : -1;
        let snippet = text;
        if (idx > 50) {
            snippet = '...' + text.substring(idx - 40, idx + 100);
        } else if (text.length > 150) {
            snippet = text.substring(0, 150) + '...';
        }
        
        if (!query) return escapeHtml(snippet);
        
        const escapedQuery = query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`(${escapedQuery})`, 'gi');
        return escapeHtml(snippet).replace(regex, '<mark>$1</mark>');
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function stripHtml(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        return doc.body.textContent || "";
    }

    function extractTitleAndBody(html) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        
        const h1 = tempDiv.querySelector('h1');
        let title = 'Untitled Entry';
        if (h1) {
            title = h1.textContent.trim() || 'Untitled Entry';
            h1.remove();
        }
        
        const content = tempDiv.innerHTML.trim();
        return { title, content };
    }

    async function openNewEditor() {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById('screen-editor').classList.add('active');
        
        // Pre-generate ID for auto-save draft capability
        activeEntryId = ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
            (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
        );
        activeEntryDate = Date.now();
        editorDirty = false;
        
        const dateStr = new Date(activeEntryDate).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });
        document.querySelector('.editor-date').textContent = dateStr;
        document.getElementById('rich-editor-field').innerHTML = '<h1></h1><p><br></p>';
        
        document.querySelectorAll('.mood-picker .mood-btn').forEach(b => b.classList.remove('selected'));
        const greatBtn = document.querySelector('.mood-picker .mood-btn[data-mood="5"]');
        if (greatBtn) greatBtn.classList.add('selected');
        
        document.getElementById('editor-tags-list').innerHTML = '';
        
        const saveBadge = document.getElementById('save-indicator-badge');
        if (saveBadge) saveBadge.classList.remove('show');
        
        await applyPreferredTypography();
        updateEditorStats();
        
        const devSelect = document.querySelector('#dev-screens-toggle-panel select');
        if (devSelect) devSelect.value = 'screen-editor';
    }

    async function openEntryForEditing(entry) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById('screen-editor').classList.add('active');
        
        activeEntryId = entry.id;
        activeEntryDate = entry.date;
        editorDirty = false;
        
        const dateStr = new Date(entry.date).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });
        document.querySelector('.editor-date').textContent = dateStr;
        
        document.getElementById('rich-editor-field').innerHTML = `<h1>${escapeHtml(entry.title)}</h1>${entry.content}`;
        
        document.querySelectorAll('.mood-picker .mood-btn').forEach(b => b.classList.remove('selected'));
        const moodBtn = document.querySelector(`.mood-picker .mood-btn[data-mood="${entry.mood}"]`);
        if (moodBtn) moodBtn.classList.add('selected');
        
        const tagsList = document.getElementById('editor-tags-list');
        tagsList.innerHTML = '';
        if (entry.tags) {
            entry.tags.forEach(t => appendTagPill(t, false));
        }
        
        const saveBadge = document.getElementById('save-indicator-badge');
        if (saveBadge) saveBadge.classList.remove('show');
        
        await applyPreferredTypography();
        updateEditorStats();
        
        const devSelect = document.querySelector('#dev-screens-toggle-panel select');
        if (devSelect) devSelect.value = 'screen-editor';
    }

    async function saveActiveEntry() {
        const html = document.getElementById('rich-editor-field').innerHTML;
        const { title, content } = extractTitleAndBody(html);
        
        const selectedMoodBtn = document.querySelector('.mood-picker .mood-btn.selected');
        const moodVal = selectedMoodBtn ? parseInt(selectedMoodBtn.dataset.mood) : 5;
        
        const tags = [];
        document.querySelectorAll('#editor-tags-list .tag-pill').forEach(pill => {
            const text = pill.textContent.replace('×', '').trim().replace('#', '');
            if (text) tags.push(text);
        });
        
        const entryObj = {
            title: title,
            content: content,
            tags: tags,
            mood: moodVal,
            date: activeEntryDate || Date.now()
        };
        
        try {
            if (!activeEntryId) {
                activeEntryId = ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
                    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
                );
            }
            entryObj.id = activeEntryId;
            
            await HelloDB.updateEntry(entryObj, sessionKey);
            editorDirty = false;
            
            const saveBadge = document.getElementById('save-indicator-badge');
            if (saveBadge) {
                saveBadge.textContent = 'Auto-Saved';
                saveBadge.classList.add('show');
                setTimeout(() => {
                    if (saveBadge.textContent === 'Auto-Saved') {
                        saveBadge.classList.remove('show');
                    }
                }, 2000);
            }
            
            showToast('Entry saved successfully! ✓');
            await loadAndRenderDashboard();
        } catch (err) {
            console.error('Failed to save entry:', err);
            showToast('Error saving entry to database.');
        }
    }

    function appendTagPill(tagName, isUserAction = false) {
        if (!tagName) return;
        const formatted = tagName.trim().toLowerCase().replace('#', '');
        if (!formatted) return;
        
        const tagsList = document.getElementById('editor-tags-list');
        if (!tagsList) return;
        
        let exists = false;
        tagsList.querySelectorAll('.tag-pill').forEach(pill => {
            if (pill.textContent.replace('×', '').trim().replace('#', '') === formatted) {
                exists = true;
            }
        });
        if (exists) return;
        
        const pill = document.createElement('span');
        pill.className = 'tag-pill';
        pill.innerHTML = `#${formatted} <button class="tag-remove">&times;</button>`;
        
        pill.querySelector('.tag-remove').addEventListener('click', () => {
            pill.remove();
            editorDirty = true;
            const saveBadge = document.getElementById('save-indicator-badge');
            if (saveBadge) {
                saveBadge.textContent = 'Unsaved Changes';
                saveBadge.classList.add('show');
            }
        });
        
        tagsList.appendChild(pill);
        
        if (isUserAction) {
            editorDirty = true;
            const saveBadge = document.getElementById('save-indicator-badge');
            if (saveBadge) {
                saveBadge.textContent = 'Unsaved Changes';
                saveBadge.classList.add('show');
            }
        }
    }

    /* Auto-save Helpers */
    function startAutoSaveInterval() {
        if (autoSaveIntervalId) clearInterval(autoSaveIntervalId);
        autoSaveIntervalId = setInterval(async () => {
            const editorScreen = document.getElementById('screen-editor');
            if (editorScreen && editorScreen.classList.contains('active') && editorDirty && sessionKey) {
                await autoSaveDraft();
            }
        }, 30000); // 30s
    }

    async function autoSaveDraft() {
        if (!sessionKey || !editorDirty) return;
        
        const html = document.getElementById('rich-editor-field').innerHTML;
        const { title, content } = extractTitleAndBody(html);
        
        const selectedMoodBtn = document.querySelector('.mood-picker .mood-btn.selected');
        const moodVal = selectedMoodBtn ? parseInt(selectedMoodBtn.dataset.mood) : 5;
        
        const tags = [];
        document.querySelectorAll('#editor-tags-list .tag-pill').forEach(pill => {
            const text = pill.textContent.replace('×', '').trim().replace('#', '');
            if (text) tags.push(text);
        });
        
        const entryObj = {
            title: title,
            content: content,
            tags: tags,
            mood: moodVal,
            date: activeEntryDate || Date.now()
        };
        
        const saveBadge = document.getElementById('save-indicator-badge');
        if (saveBadge) {
            saveBadge.textContent = 'Saving...';
            saveBadge.classList.add('show');
        }
        
        try {
            if (!activeEntryId) {
                activeEntryId = ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
                    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
                );
            }
            entryObj.id = activeEntryId;
            
            await HelloDB.updateEntry(entryObj, sessionKey);
            editorDirty = false;
            
            if (saveBadge) {
                saveBadge.textContent = 'Auto-Saved';
                setTimeout(() => {
                    if (saveBadge.textContent === 'Auto-Saved') {
                        saveBadge.classList.remove('show');
                    }
                }, 2000);
            }
            await loadAndRenderDashboard();
        } catch (err) {
            console.error('Failed to auto-save:', err);
            if (saveBadge) {
                saveBadge.textContent = 'Save Error';
                saveBadge.classList.add('show');
            }
        }
    }

    async function applyPreferredTypography() {
        const prefFont = await HelloDB.getSetting('preferred-font') || 'font-merriweather';
        const prefSize = await HelloDB.getSetting('preferred-size') || 'size-medium';
        
        const editorField = document.getElementById('rich-editor-field');
        if (editorField) {
            editorField.className.split(' ').forEach(cls => {
                if (cls.startsWith('font-') || cls.startsWith('size-')) {
                    editorField.classList.remove(cls);
                }
            });
            editorField.classList.add(prefFont);
            editorField.classList.add(prefSize);
        }
        
        document.querySelectorAll('.font-option').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.font === prefFont);
        });
        document.querySelectorAll('.size-option').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.size === prefSize);
        });
    }

    function updateEditorStats() {
        const editorField = document.getElementById('rich-editor-field');
        if (!editorField) return;
        
        const text = editorField.textContent || '';
        const words = text.trim().split(/\s+/).filter(w => w.length > 0);
        const wordCount = words.length;
        const readTime = Math.max(1, Math.ceil(wordCount / 200));
        
        const wordCountEl = document.getElementById('editor-word-count');
        const readTimeEl = document.getElementById('editor-read-time');
        
        if (wordCountEl) {
            wordCountEl.textContent = `${wordCount} word${wordCount !== 1 ? 's' : ''}`;
        }
        if (readTimeEl) {
            readTimeEl.textContent = `${readTime} min read`;
        }
    }

    function openViewModal(entry) {
        const viewModal = document.getElementById('modal-view-entry');
        if (!viewModal) return;
        
        activeEntryId = entry.id;
        
        const formattedDate = new Date(entry.date).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        }).toUpperCase();
        
        const MOODS_MAP = {
            1: { emoji: '😢', name: 'Awful' },
            2: { emoji: '😕', name: 'Bad' },
            3: { emoji: '😐', name: 'Okay' },
            4: { emoji: '🙂', name: 'Good' },
            5: { emoji: '😊', name: 'Great' }
        };
        
        document.getElementById('view-modal-title').textContent = entry.title || 'Untitled';
        document.getElementById('view-modal-subtitle').textContent = `${formattedDate} · ${MOODS_MAP[entry.mood]?.emoji || '😐'} ${MOODS_MAP[entry.mood]?.name || 'Okay'}`;
        document.getElementById('view-modal-body').innerHTML = entry.content || '';
        
        viewModal.classList.add('active');
    }

    /**
     * Binds all dashboard, search, and editor event handlers for Step 4.
     */
    function initDashboardControllers() {
        const searchToggle = document.getElementById('btn-search-toggle');
        const searchClose = document.getElementById('btn-search-close');
        const searchPanel = document.getElementById('search-panel');
        
        if (searchToggle && searchPanel) {
            searchToggle.addEventListener('click', () => {
                searchPanel.classList.add('active');
                const searchBox = document.getElementById('search-box');
                if (searchBox) {
                    searchBox.value = '';
                    searchBox.focus();
                }
                searchMoodFilter = 'all';
                searchTagsFilter.clear();
                document.querySelectorAll('.search-mood-btn').forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.mood === 'all');
                });
                renderSearchFilters();
                filterAndRenderSearch();
            });
        }
        
        if (searchClose && searchPanel) {
            searchClose.addEventListener('click', () => {
                searchPanel.classList.remove('active');
            });
        }
        
        const searchBox = document.getElementById('search-box');
        if (searchBox) {
            searchBox.addEventListener('input', () => {
                filterAndRenderSearch();
            });
        }
        
        document.querySelectorAll('.search-mood-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.search-mood-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                searchMoodFilter = btn.dataset.mood;
                filterAndRenderSearch();
            });
        });
        
        const prevMonth = document.getElementById('btn-calendar-prev');
        const nextMonth = document.getElementById('btn-calendar-next');
        
        if (prevMonth) {
            prevMonth.addEventListener('click', () => {
                currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
                renderCalendar(currentCalendarDate);
            });
        }
        
        if (nextMonth) {
            nextMonth.addEventListener('click', () => {
                currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
                renderCalendar(currentCalendarDate);
            });
        }
        
        const grid = document.getElementById('calendar-grid');
        if (grid) {
            grid.addEventListener('click', (e) => {
                const cell = e.target.closest('.calendar-day-cell');
                if (!cell || !cell.dataset.date) return;
                
                const [y, m, d] = cell.dataset.date.split('-').map(Number);
                const targetEntries = cachedEntries.filter(entry => {
                    const entryDate = new Date(entry.date);
                    return entryDate.getFullYear() === y && 
                           (entryDate.getMonth() + 1) === m && 
                           entryDate.getDate() === d;
                });
                
                if (targetEntries.length > 0) {
                    openViewModal(targetEntries[0]);
                }
            });
            
            grid.addEventListener('dblclick', (e) => {
                const cell = e.target.closest('.calendar-day-cell');
                if (!cell || !cell.dataset.date) return;
                
                const targetDateStr = cell.dataset.date;
                activeEntryId = null;
                activeEntryDate = new Date(targetDateStr).getTime();
                
                openNewEditor();
            });
        }
        
        const flashbackClose = document.getElementById('btn-flashback-close');
        if (flashbackClose) {
            flashbackClose.addEventListener('click', () => {
                document.getElementById('flashback-widget').style.display = 'none';
            });
        }
        
        const fabBtn = document.getElementById('btn-fab-new-entry');
        const mobFabBtn = document.getElementById('btn-mobile-fab');
        
        const onFabClick = () => {
            activeEntryId = null;
            activeEntryDate = Date.now();
            openNewEditor();
        };
        
        if (fabBtn) fabBtn.addEventListener('click', onFabClick);
        if (mobFabBtn) mobFabBtn.addEventListener('click', onFabClick);
        
        const viewModalClose = document.getElementById('btn-view-modal-close');
        const viewModalDone = document.getElementById('btn-view-modal-done');
        const viewModalEdit = document.getElementById('btn-view-modal-edit');
        const viewModal = document.getElementById('modal-view-entry');
        
        if (viewModalClose && viewModal) {
            viewModalClose.addEventListener('click', () => {
                viewModal.classList.remove('active');
            });
        }
        
        if (viewModalDone && viewModal) {
            viewModalDone.addEventListener('click', () => {
                viewModal.classList.remove('active');
            });
        }
        
        if (viewModalEdit && viewModal) {
            viewModalEdit.addEventListener('click', () => {
                viewModal.classList.remove('active');
                if (activeEntryId) {
                    const entry = cachedEntries.find(e => e.id === activeEntryId);
                    if (entry) {
                        openEntryForEditing(entry);
                    }
                }
            });
        }
        
        const editorBack = document.getElementById('btn-editor-back');
        if (editorBack) {
            editorBack.addEventListener('click', async () => {
                if (sessionKey) {
                    await saveActiveEntry();
                }
                showScreen('screen-dashboard');
                if (window.switchDashboardView) {
                    window.switchDashboardView('timeline');
                }
            });
        }
        
        const deleteBtn = document.getElementById('btn-editor-delete');
        const confirmCancel = document.getElementById('btn-confirm-cancel');
        const confirmOk = document.getElementById('btn-confirm-ok');
        const confirmModal = document.getElementById('modal-confirm');
        
        if (deleteBtn && confirmModal) {
            deleteBtn.addEventListener('click', () => {
                document.getElementById('confirm-modal-title').textContent = 'Delete entry?';
                document.getElementById('confirm-modal-desc').textContent = 'This action is permanent and cannot be undone. Are you sure you want to delete this memory?';
                confirmModal.classList.add('active');
            });
        }
        
        if (confirmCancel && confirmModal) {
            confirmCancel.addEventListener('click', () => {
                confirmModal.classList.remove('active');
            });
        }
        
        if (confirmOk && confirmModal) {
            confirmOk.addEventListener('click', async () => {
                confirmModal.classList.remove('active');
                if (activeEntryId) {
                    await HelloDB.deleteEntry(activeEntryId);
                    activeEntryId = null;
                    showToast('Entry deleted successfully.');
                    await loadAndRenderDashboard();
                }
                showScreen('screen-dashboard');
                if (window.switchDashboardView) {
                    window.switchDashboardView('timeline');
                }
            });
        }
        
        const addTagBtn = document.getElementById('btn-editor-add-tag');
        const tagModal = document.getElementById('modal-add-tag');
        const tagCancel = document.getElementById('btn-tag-modal-cancel');
        const tagAddConfirm = document.getElementById('btn-tag-modal-add');
        const tagInput = document.getElementById('tag-modal-input');
        
        if (addTagBtn && tagModal) {
            addTagBtn.addEventListener('click', () => {
                tagModal.classList.add('active');
                if (tagInput) {
                    tagInput.value = '';
                    tagInput.focus();
                }
            });
        }
        
        if (tagCancel && tagModal) {
            tagCancel.addEventListener('click', () => {
                tagModal.classList.remove('active');
            });
        }
        
        if (tagAddConfirm && tagModal && tagInput) {
            tagAddConfirm.addEventListener('click', () => {
                appendTagPill(tagInput.value, true);
                tagModal.classList.remove('active');
            });
            tagInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    appendTagPill(tagInput.value, true);
                    tagModal.classList.remove('active');
                }
            });
        }
        
        document.querySelectorAll('.tag-suggestion').forEach(btn => {
            btn.addEventListener('click', () => {
                appendTagPill(btn.dataset.tag, true);
                if (tagModal) tagModal.classList.remove('active');
            });
        });
        
        document.querySelectorAll('.mood-picker .mood-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.mood-picker .mood-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                editorDirty = true;
                const saveBadge = document.getElementById('save-indicator-badge');
                if (saveBadge) {
                    saveBadge.textContent = 'Unsaved Changes';
                    saveBadge.classList.add('show');
                }
            });
        });
    }

    /**
     * Binds all editor toolbar, dropdown, and typography controls for Step 5.
     */
    function initEditorControllers() {
        const editorField = document.getElementById('rich-editor-field');
        if (!editorField) return;

        // 1. Text input listener for stats & dirty state
        editorField.addEventListener('input', () => {
            editorDirty = true;
            const saveBadge = document.getElementById('save-indicator-badge');
            if (saveBadge) {
                saveBadge.textContent = 'Unsaved Changes';
                saveBadge.classList.add('show');
            }
            updateEditorStats();
        });

        // 2. Toolbar simple commands
        document.querySelectorAll('.editor-toolbar .toolbar-btn[data-cmd]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const cmd = btn.dataset.cmd;
                const val = btn.dataset.val || null;
                
                if (cmd === 'h1' || cmd === 'h2') {
                    document.execCommand('formatBlock', false, `<${cmd}>`);
                } else if (cmd === 'quote') {
                    document.execCommand('formatBlock', false, '<blockquote>');
                } else {
                    document.execCommand(cmd, false, val);
                }
                
                editorDirty = true;
                const saveBadge = document.getElementById('save-indicator-badge');
                if (saveBadge) {
                    saveBadge.textContent = 'Unsaved Changes';
                    saveBadge.classList.add('show');
                }
                
                updateEditorStats();
                editorField.focus();
            });
        });

        // 3. Link inserter trigger
        const insertLinkBtn = document.getElementById('btn-insert-link');
        if (insertLinkBtn) {
            insertLinkBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const url = prompt('Enter the link URL (e.g., https://example.com):');
                if (url) {
                    let cleanUrl = url.trim();
                    if (!/^https?:\/\//i.test(cleanUrl)) {
                        cleanUrl = 'https://' + cleanUrl;
                    }
                    document.execCommand('createLink', false, cleanUrl);
                    editorDirty = true;
                    const saveBadge = document.getElementById('save-indicator-badge');
                    if (saveBadge) {
                        saveBadge.textContent = 'Unsaved Changes';
                        saveBadge.classList.add('show');
                    }
                    editorField.focus();
                }
            });
        }

        // 4. Focus mode toggle button
        const focusModeBtn = document.getElementById('btn-focus-mode');
        if (focusModeBtn) {
            focusModeBtn.addEventListener('click', () => {
                const editorScreen = document.getElementById('screen-editor');
                if (editorScreen) {
                    editorScreen.classList.toggle('focus-mode');
                    focusModeBtn.classList.toggle('active');
                }
            });
        }

        // 5. Dropdowns Toggle Controller
        const popups = [
            { btn: 'btn-font-picker', menu: 'dropdown-font' },
            { btn: 'btn-size-picker', menu: 'dropdown-size' },
            { btn: 'btn-color-picker', menu: 'dropdown-color' },
            { btn: 'btn-highlight-picker', menu: 'dropdown-highlight' }
        ];

        popups.forEach(({ btn, menu }) => {
            const btnEl = document.getElementById(btn);
            const menuEl = document.getElementById(menu);
            if (btnEl && menuEl) {
                btnEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    // Close others
                    popups.forEach(p => {
                        if (p.menu !== menu) {
                            const otherMenu = document.getElementById(p.menu);
                            if (otherMenu) otherMenu.classList.remove('active');
                        }
                    });
                    menuEl.classList.toggle('active');
                });
            }
        });

        // Global dismiss for drop-downs
        document.addEventListener('click', (e) => {
            popups.forEach(({ btn, menu }) => {
                const btnEl = document.getElementById(btn);
                const menuEl = document.getElementById(menu);
                if (btnEl && menuEl) {
                    if (!btnEl.contains(e.target) && !menuEl.contains(e.target)) {
                        menuEl.classList.remove('active');
                    }
                }
            });
        });

        // 6. Font picker option click
        document.querySelectorAll('.font-option').forEach(btn => {
            btn.addEventListener('click', async () => {
                const fontClass = btn.dataset.font;
                
                // Remove existing font styles
                editorField.className.split(' ').forEach(cls => {
                    if (cls.startsWith('font-')) {
                        editorField.classList.remove(cls);
                    }
                });
                editorField.classList.add(fontClass);
                
                // Toggle active highlights
                document.querySelectorAll('.font-option').forEach(o => o.classList.remove('active'));
                btn.classList.add('active');
                
                // Save setting
                await HelloDB.setSetting('preferred-font', fontClass);
                
                const dropdown = document.getElementById('dropdown-font');
                if (dropdown) dropdown.classList.remove('active');
            });
        });

        // 7. Size picker option click
        document.querySelectorAll('.size-option').forEach(btn => {
            btn.addEventListener('click', async () => {
                const sizeClass = btn.dataset.size;
                
                // Remove existing size styles
                editorField.className.split(' ').forEach(cls => {
                    if (cls.startsWith('size-')) {
                        editorField.classList.remove(cls);
                    }
                });
                editorField.classList.add(sizeClass);
                
                // Toggle active highlights
                document.querySelectorAll('.size-option').forEach(o => o.classList.remove('active'));
                btn.classList.add('active');
                
                // Save setting
                await HelloDB.setSetting('preferred-size', sizeClass);
                
                const dropdown = document.getElementById('dropdown-size');
                if (dropdown) dropdown.classList.remove('active');
            });
        });

        // 8. Color picker options selection
        document.querySelectorAll('#dropdown-color .color-circle').forEach(circle => {
            circle.addEventListener('click', () => {
                const colorVal = circle.dataset.color;
                
                document.querySelectorAll('#dropdown-color .color-circle').forEach(c => c.classList.remove('active'));
                circle.classList.add('active');
                
                if (colorVal === 'default') {
                    document.execCommand('foreColor', false, 'inherit');
                } else {
                    document.execCommand('foreColor', false, colorVal);
                }
                
                editorDirty = true;
                const saveBadge = document.getElementById('save-indicator-badge');
                if (saveBadge) {
                    saveBadge.textContent = 'Unsaved Changes';
                    saveBadge.classList.add('show');
                }
                
                const dropdown = document.getElementById('dropdown-color');
                if (dropdown) dropdown.classList.remove('active');
            });
        });

        // 9. Highlight picker options selection
        document.querySelectorAll('#dropdown-highlight .color-circle').forEach(circle => {
            circle.addEventListener('click', () => {
                const highlightVal = circle.dataset.highlight;
                
                document.querySelectorAll('#dropdown-highlight .color-circle').forEach(c => c.classList.remove('active'));
                circle.classList.add('active');
                
                if (highlightVal === 'default') {
                    document.execCommand('hiliteColor', false, 'rgba(0,0,0,0)');
                } else {
                    document.execCommand('hiliteColor', false, highlightVal);
                }
                
                editorDirty = true;
                const saveBadge = document.getElementById('save-indicator-badge');
                if (saveBadge) {
                    saveBadge.textContent = 'Unsaved Changes';
                    saveBadge.classList.add('show');
                }
                
                const dropdown = document.getElementById('dropdown-highlight');
                if (dropdown) dropdown.classList.remove('active');
            });
        });
    }

    // Public controller exports
    return {
        init,
        getSessionKey,
        showScreen,
        checkLockoutState,
        loadAndRenderDashboard
    };

})();

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    HelloApp.init();
});
