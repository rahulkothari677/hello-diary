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

    // Public controller exports
    return {
        init,
        getSessionKey,
        showScreen,
        checkLockoutState
    };

})();

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    HelloApp.init();
});
