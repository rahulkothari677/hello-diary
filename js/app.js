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

            // Register PWA Service Worker
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('sw.js')
                    .then(reg => console.log('[Service Worker] Registered:', reg.scope))
                    .catch(err => console.error('[Service Worker] Registration failed:', err));
            }

            // Load custom themes from database and populate THEMES array
            const customThemes = await HelloDB.getSetting('custom-themes');
            if (customThemes && Array.isArray(customThemes)) {
                customThemes.forEach(theme => {
                    if (window.THEMES && !window.THEMES.find(t => t.id === theme.id)) {
                        window.THEMES.push(theme);
                    }
                });
            }

            // Start Particle Canvas Loop
            HelloParticles.init();

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
            await initImmersiveControllers();
            initStep8Features();
            initBookCreator();

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
            renderAnalytics();
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
            
            // Create wrapper container for swipe gestures
            const container = document.createElement('div');
            container.className = 'swipe-container';
            
            const deleteBg = document.createElement('div');
            deleteBg.className = 'delete-swipe-bg';
            deleteBg.textContent = 'Delete';
            
            const card = document.createElement('div');
            card.className = 'swipe-card-content spring-hover';
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
                // If the card is currently swiped open, reset it on click instead of viewing details
                if (card.style.transform === 'translateX(-80px)') {
                    card.style.transform = 'translateX(0px)';
                } else {
                    openViewModal(entry);
                }
            });
            
            // Touch Swipe Handlers for mobile swipe-to-delete
            let startX = 0;
            let currentX = 0;
            let isSwiping = false;
            
            card.addEventListener('touchstart', (e) => {
                startX = e.touches[0].clientX;
                currentX = startX;
                card.style.transition = 'none';
                isSwiping = true;
            }, { passive: true });
            
            card.addEventListener('touchmove', (e) => {
                if (!isSwiping) return;
                currentX = e.touches[0].clientX;
                const diffX = currentX - startX;
                
                if (diffX < 0) {
                    const translateVal = Math.max(diffX, -80);
                    card.style.transform = `translateX(${translateVal}px)`;
                } else {
                    card.style.transform = 'translateX(0px)';
                }
            }, { passive: true });
            
            card.addEventListener('touchend', (e) => {
                if (!isSwiping) return;
                isSwiping = false;
                card.style.transition = 'transform 0.22s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
                const diffX = currentX - startX;
                
                if (diffX < -40) {
                    card.style.transform = 'translateX(-80px)';
                } else {
                    card.style.transform = 'translateX(0px)';
                }
            }, { passive: true });
            
            deleteBg.addEventListener('click', (e) => {
                e.stopPropagation();
                activeEntryId = entry.id;
                document.getElementById('confirm-modal-title').textContent = 'Delete entry?';
                document.getElementById('confirm-modal-desc').textContent = 'This action is permanent and cannot be undone. Are you sure you want to delete this memory?';
                document.getElementById('modal-confirm').classList.add('active');
            });
            
            container.appendChild(deleteBg);
            container.appendChild(card);
            grid.appendChild(container);
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

    let analyticsDaysLimit = 7; // Default to 7 days for trend line chart

    /**
     * Helper to count words in HTML text safely.
     */
    function countWordsInHtml(html) {
        if (!html) return 0;
        const text = html.replace(/<\/?[^>]+(>|$)/g, " ");
        const words = text.trim().split(/\s+/).filter(w => w.length > 0);
        return words.length;
    }

    /**
     * Helper to bind glassmorphism tooltips to SVG elements.
     */
    function bindChartTooltips(elements) {
        const tooltip = document.getElementById('chart-tooltip');
        if (!tooltip) return;

        elements.forEach(el => {
            el.addEventListener('mouseover', (e) => {
                const date = el.dataset.date;
                const title = el.dataset.title;
                const words = el.dataset.words;
                const mood = el.dataset.mood;
                const count = el.dataset.count;
                const pct = el.dataset.pct;
                const avg = el.dataset.avg;
                const level = el.dataset.level;

                if (title) { // Line chart node
                    tooltip.innerHTML = `
                        <h5>${title}</h5>
                        <p><b>Date:</b> ${date}</p>
                        <p><b>Mood:</b> ${mood}</p>
                        <p><b>Words:</b> ${words} words</p>
                    `;
                } else if (pct) { // Donut slice
                    tooltip.innerHTML = `
                        <h5>${mood}</h5>
                        <p>${pct} of entries (${count})</p>
                    `;
                } else if (avg) { // Weekday bar
                    tooltip.innerHTML = `
                        <h5>${el.dataset.day}</h5>
                        <p><b>Average Mood:</b> ${avg} / 5.0</p>
                        <p><b>Frequency:</b> ${count}</p>
                    `;
                } else if (level) { // Heatmap cell
                    tooltip.innerHTML = `
                        <h5>${date}</h5>
                        <p>${entries} entry(ies) · ${words} words (${level})</p>
                    `;
                } else {
                    tooltip.innerHTML = `<p>${date || mood}</p>`;
                }
                tooltip.style.opacity = '1';
            });

            el.addEventListener('mousemove', (e) => {
                tooltip.style.left = e.pageX + 'px';
                tooltip.style.top = (e.pageY - 12) + 'px';
            });

            el.addEventListener('mouseleave', () => {
                tooltip.style.opacity = '0';
            });
        });
    }

    /**
     * Processes RAM cached diary entries to calculate analytics metrics.
     */
    function getAnalyticsStats() {
        const stats = {
            totalEntries: cachedEntries.length,
            totalWords: 0,
            avgMood: 0,
            avgWordCount: 0,
            currentStreak: 0,
            longestStreak: 0,
            wellnessScore: 0,
            moodCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
            weekdayMoods: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] },
            tagStats: {}
        };

        if (cachedEntries.length === 0) return stats;

        let moodSum = 0;
        const activeDates = new Set();

        cachedEntries.forEach(entry => {
            const words = countWordsInHtml(entry.title + ' ' + (entry.content || ''));
            stats.totalWords += words;

            const mood = Number(entry.mood) || 3;
            moodSum += mood;
            stats.moodCounts[mood]++;

            const entryDate = new Date(entry.date);
            const dateStr = entryDate.toISOString().split('T')[0];
            activeDates.add(dateStr);

            const dayOfWeek = entryDate.getDay();
            stats.weekdayMoods[dayOfWeek].push(mood);

            if (entry.tags) {
                entry.tags.forEach(tag => {
                    if (!stats.tagStats[tag]) {
                        stats.tagStats[tag] = { count: 0, moodSum: 0 };
                    }
                    stats.tagStats[tag].count++;
                    stats.tagStats[tag].moodSum += mood;
                });
            }
        });

        stats.avgMood = Number((moodSum / stats.totalEntries).toFixed(1));
        stats.avgWordCount = Math.round(stats.totalWords / stats.totalEntries);

        // Streaks Calculation
        const sortedDates = Array.from(activeDates).sort((a, b) => new Date(b) - new Date(a));
        if (sortedDates.length > 0) {
            let current = 0;
            let longest = 0;
            let tempStreak = 0;

            const today = new Date().toISOString().split('T')[0];
            const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
            const hasWrittenRecently = sortedDates.includes(today) || sortedDates.includes(yesterday);

            let lastDate = null;
            const ascDates = Array.from(activeDates).sort((a, b) => new Date(a) - new Date(b));
            
            ascDates.forEach(dateStr => {
                const curDate = new Date(dateStr);
                if (lastDate === null) {
                    tempStreak = 1;
                } else {
                    const diffTime = Math.abs(curDate - lastDate);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    if (diffDays === 1) {
                        tempStreak++;
                    } else if (diffDays > 1) {
                        tempStreak = 1;
                    }
                }
                longest = Math.max(longest, tempStreak);
                lastDate = curDate;
            });

            if (hasWrittenRecently) {
                let checkDate = new Date(sortedDates[0]);
                current = 1;
                for (let i = 1; i < sortedDates.length; i++) {
                    const prevDate = new Date(sortedDates[i]);
                    const diffTime = Math.abs(checkDate - prevDate);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    if (diffDays === 1) {
                        current++;
                        checkDate = prevDate;
                    } else {
                        break;
                    }
                }
            } else {
                current = 0;
            }

            stats.currentStreak = current;
            stats.longestStreak = longest;
        }

        // Wellness Score Engine
        const last30Days = [];
        for (let i = 0; i < 30; i++) {
            const d = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
            last30Days.push(d);
        }
        let active30DaysCount = 0;
        last30Days.forEach(d => {
            if (activeDates.has(d)) active30DaysCount++;
        });
        const consistencyPct = (active30DaysCount / 30) * 100;
        const moodPct = ((stats.avgMood - 1) / 4) * 100;
        stats.wellnessScore = Math.round((0.4 * consistencyPct) + (0.6 * moodPct));

        return stats;
    }

    /**
     * Draws interactive SVG Mood Trend bezier path.
     */
    function drawMoodTrendChart() {
        const box = document.getElementById('trend-chart-box');
        if (!box) return;

        const limit = analyticsDaysLimit;
        const entries = [...cachedEntries].reverse();
        const slicedEntries = entries.slice(-limit);

        if (slicedEntries.length === 0) {
            box.innerHTML = `<div style="display: flex; height: 100%; align-items: center; justify-content: center; color: var(--text-secondary); font-size: 0.9rem;">No diary entries to display trend</div>`;
            return;
        }

        let svg = `<svg viewBox="0 0 600 220" width="100%" height="100%">
            <defs>
                <linearGradient id="trend-area-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.22"/>
                    <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.0"/>
                </linearGradient>
                <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
                    <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="var(--accent)" flood-opacity="0.15"/>
                </filter>
            </defs>
            
            <line x1="40" y1="20" x2="580" y2="20" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>
            <line x1="40" y1="61.25" x2="580" y2="61.25" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>
            <line x1="40" y1="102.5" x2="580" y2="102.5" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>
            <line x1="40" y1="143.75" x2="580" y2="143.75" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>
            <line x1="40" y1="185" x2="580" y2="185" stroke="rgba(255,255,255,0.08)" stroke-width="1.5"/>
            
            <text x="25" y="23" fill="var(--text-muted)" font-size="8.5" text-anchor="end">Great</text>
            <text x="25" y="64" fill="var(--text-muted)" font-size="8.5" text-anchor="end">Good</text>
            <text x="25" y="105" fill="var(--text-muted)" font-size="8.5" text-anchor="end">Okay</text>
            <text x="25" y="146" fill="var(--text-muted)" font-size="8.5" text-anchor="end">Bad</text>
            <text x="25" y="187" fill="var(--text-muted)" font-size="8.5" text-anchor="end">Awful</text>
        `;

        const points = [];
        slicedEntries.forEach((entry, idx) => {
            let x = 310;
            if (slicedEntries.length > 1) {
                x = 40 + idx * (540 / (slicedEntries.length - 1));
            }
            const mood = Number(entry.mood) || 3;
            const y = 20 + (5 - mood) * 41.25;
            points.push({ x, y, entry });
        });

        if (points.length > 1) {
            let d = `M ${points[0].x} ${points[0].y}`;
            for (let i = 0; i < points.length - 1; i++) {
                const p1 = points[i];
                const p2 = points[i + 1];
                const cp1x = p1.x + (p2.x - p1.x) / 2;
                const cp1y = p1.y;
                const cp2x = p2.x - (p2.x - p1.x) / 2;
                const cp2y = p2.y;
                d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
            }

            const areaD = d + ` L ${points[points.length - 1].x} 185 L ${points[0].x} 185 Z`;

            svg += `<path class="chart-area" d="${areaD}" fill="url(#trend-area-grad)"></path>`;
            svg += `<path class="chart-line" d="${d}" stroke="var(--accent)" filter="url(#shadow)"></path>`;
        }

        points.forEach((pt, idx) => {
            const date = new Date(pt.entry.date);
            const labelStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            
            let showLabel = true;
            if (points.length > 7) {
                showLabel = (idx === 0 || idx === points.length - 1 || idx % Math.ceil(points.length / 5) === 0);
            }

            if (showLabel) {
                svg += `<text x="${pt.x}" y="206" fill="var(--text-muted)" font-size="8.5" text-anchor="middle">${labelStr}</text>`;
                svg += `<line x1="${pt.x}" y1="185" x2="${pt.x}" y2="190" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>`;
            }

            const MOOD_EMOJIS = { 1: '😢', 2: '😕', 3: '😐', 4: '🙂', 5: '😊' };
            const MOOD_NAMES = { 1: 'Awful', 2: 'Bad', 3: 'Okay', 4: 'Good', 5: 'Great' };
            const formattedDate = date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });

            const title = escapeHtml(pt.entry.title || 'Untitled');
            const wordsCount = countWordsInHtml(pt.entry.content || '') + countWordsInHtml(pt.entry.title || '');
            const emoji = MOOD_EMOJIS[pt.entry.mood] || '😐';
            const moodName = MOOD_NAMES[pt.entry.mood] || 'Okay';

            svg += `<circle class="chart-dot" cx="${pt.x}" cy="${pt.y}" r="5.5" 
                data-date="${formattedDate}" 
                data-title="${title}" 
                data-words="${wordsCount}"
                data-mood="${emoji} ${moodName}"
            ></circle>`;
        });

        svg += `</svg>`;
        box.innerHTML = svg;

        bindChartTooltips(box.querySelectorAll('.chart-dot'));
    }

    /**
     * Draws interactive SVG Donut Chart for mood breakdowns.
     */
    function drawMoodDonutChart(stats) {
        const box = document.getElementById('donut-chart-box');
        const legend = document.getElementById('donut-legend');
        if (!box || !legend) return;

        if (stats.totalEntries === 0) {
            box.innerHTML = `<div style="display: flex; height: 100%; align-items: center; justify-content: center; color: var(--text-secondary); font-size: 0.85rem;">No data</div>`;
            legend.innerHTML = '';
            return;
        }

        const MOOD_EMOJIS = { 1: '😢', 2: '😕', 3: '😐', 4: '🙂', 5: '😊' };
        const MOOD_NAMES = { 1: 'Awful', 2: 'Bad', 3: 'Okay', 4: 'Good', 5: 'Great' };
        const MOOD_COLORS = {
            1: 'var(--mood-1, #ef4444)',
            2: 'var(--mood-2, #f59e0b)',
            3: 'var(--mood-3, #eab308)',
            4: 'var(--mood-4, #10b981)',
            5: 'var(--mood-5, #3b82f6)'
        };

        const total = stats.totalEntries;
        const radius = 30;
        const circumference = 2 * Math.PI * radius;
        
        let svg = `<svg viewBox="0 0 140 140" width="100%" height="100%">
            <circle cx="70" cy="70" r="${radius}" fill="transparent" stroke="rgba(255,255,255,0.04)" stroke-width="6.5"></circle>
        `;

        let accumulatedLength = 0;
        let legendHtml = '';

        for (let mood = 5; mood >= 1; mood--) {
            const count = stats.moodCounts[mood] || 0;
            const percentage = (count / total) * 100;

            if (count > 0) {
                const strokeLength = (count / total) * circumference;
                const strokeOffset = circumference - strokeLength + accumulatedLength;
                
                svg += `
                    <circle class="donut-slice" cx="70" cy="70" r="${radius}"
                        fill="transparent"
                        stroke="${MOOD_COLORS[mood]}"
                        stroke-width="6.5"
                        stroke-dasharray="${strokeLength} ${circumference}"
                        stroke-dashoffset="${strokeOffset}"
                        stroke-linecap="round"
                        transform="rotate(-90 70 70)"
                        data-mood="${MOOD_EMOJIS[mood]} ${MOOD_NAMES[mood]}"
                        data-count="${count} entry(ies)"
                        data-pct="${percentage.toFixed(0)}%"
                    ></circle>
                `;
                accumulatedLength += strokeLength;
            }

            const pctStr = count > 0 ? `${percentage.toFixed(0)}%` : '0%';
            legendHtml += `
                <div class="flex align-center justify-between" style="opacity: ${count > 0 ? 1 : 0.35};">
                    <div class="flex align-center" style="gap: 6px;">
                        <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: ${MOOD_COLORS[mood]};"></span>
                        <span>${MOOD_EMOJIS[mood]} ${MOOD_NAMES[mood]}</span>
                    </div>
                    <span style="font-weight: 600;">${pctStr} (${count})</span>
                </div>
            `;
        }

        svg += `</svg>`;
        box.innerHTML = svg;
        legend.innerHTML = legendHtml;

        bindChartTooltips(box.querySelectorAll('.donut-slice'));
    }

    /**
     * Draws interactive SVG Bar Chart for weekday averages.
     */
    function drawWeekdayBarChart(stats) {
        const box = document.getElementById('weekday-chart-box');
        if (!box) return;

        if (stats.totalEntries === 0) {
            box.innerHTML = `<div style="display: flex; height: 100%; align-items: center; justify-content: center; color: var(--text-secondary); font-size: 0.85rem;">No data</div>`;
            return;
        }

        const daysOrder = [1, 2, 3, 4, 5, 6, 0];
        const dayLabels = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 0: 'Sun' };

        let svg = `<svg viewBox="0 0 400 160" width="100%" height="100%">
            <line x1="30" y1="15" x2="390" y2="15" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>
            <line x1="30" y1="45" x2="390" y2="45" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>
            <line x1="30" y1="75" x2="390" y2="75" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>
            <line x1="30" y1="105" x2="390" y2="105" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>
            <line x1="30" y1="135" x2="390" y2="135" stroke="rgba(255,255,255,0.08)" stroke-width="1.5"/>
            
            <text x="20" y="18" fill="var(--text-muted)" font-size="8" text-anchor="end">5</text>
            <text x="20" y="78" fill="var(--text-muted)" font-size="8" text-anchor="end">3</text>
            <text x="20" y="138" fill="var(--text-muted)" font-size="8" text-anchor="end">1</text>
        `;

        daysOrder.forEach((day, idx) => {
            const moodsList = stats.weekdayMoods[day] || [];
            const count = moodsList.length;
            const avg = count > 0 ? moodsList.reduce((a, b) => a + b, 0) / count : 0;

            const x = 30 + idx * 51.4 + 13.7;
            const height = avg * 24; // mapping 5 mood max to 120px height
            const y = 135 - height;

            if (height > 0) {
                svg += `
                    <rect class="bar-column" x="${x}" y="${y}" width="24" height="${height}" rx="4"
                        data-day="${dayLabels[day]}"
                        data-avg="${avg.toFixed(1)}"
                        data-count="${count} entry(ies)"
                    ></rect>
                `;
            } else {
                svg += `
                    <circle cx="${x + 12}" cy="130" r="2.5" fill="rgba(255,255,255,0.12)"></circle>
                `;
            }

            svg += `
                <text x="${x + 12}" y="152" fill="var(--text-muted)" font-size="9" text-anchor="middle">${dayLabels[day]}</text>
            `;
        });

        svg += `</svg>`;
        box.innerHTML = svg;

        bindChartTooltips(box.querySelectorAll('.bar-column'));
    }

    /**
     * Draws a 1-year contribution grid heatmap.
     */
    function drawContributionHeatmap() {
        const box = document.getElementById('heatmap-chart-box');
        if (!box) return;

        const dayWords = {};
        const dayEntriesCount = {};
        cachedEntries.forEach(entry => {
            const dStr = new Date(entry.date).toISOString().split('T')[0];
            const words = countWordsInHtml(entry.title + ' ' + (entry.content || ''));
            dayWords[dStr] = (dayWords[dStr] || 0) + words;
            dayEntriesCount[dStr] = (dayEntriesCount[dStr] || 0) + 1;
        });

        const today = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 364 - startDate.getDay());

        let svg = `<svg viewBox="0 0 720 120" width="100%" height="100%">
            <text x="8" y="30" fill="var(--text-muted)" font-size="8" text-anchor="start">Mon</text>
            <text x="8" y="54" fill="var(--text-muted)" font-size="8" text-anchor="start">Wed</text>
            <text x="8" y="78" fill="var(--text-muted)" font-size="8" text-anchor="start">Fri</text>
        `;

        const monthPositions = {};

        for (let col = 0; col < 53; col++) {
            for (let row = 0; row < 7; row++) {
                const curDate = new Date(startDate);
                curDate.setDate(startDate.getDate() + col * 7 + row);

                const dStr = curDate.toISOString().split('T')[0];
                const isFuture = curDate > today;

                if (isFuture) continue;

                if (row === 0) {
                    const monthName = curDate.toLocaleDateString('en-US', { month: 'short' });
                    if (!monthPositions[monthName] && col > 0 && col < 51) {
                        monthPositions[monthName] = col;
                    }
                }

                const words = dayWords[dStr] || 0;
                const entriesCount = dayEntriesCount[dStr] || 0;

                let fill = 'rgba(255, 255, 255, 0.04)';
                let labelLevel = 'no entries';
                if (words > 0) {
                    if (words <= 100) {
                        fill = 'rgba(107, 127, 215, 0.25)';
                        labelLevel = 'light activity';
                    } else if (words <= 300) {
                        fill = 'rgba(107, 127, 215, 0.5)';
                        labelLevel = 'moderate activity';
                    } else if (words <= 600) {
                        fill = '#6B7FD7';
                        labelLevel = 'active';
                    } else {
                        fill = '#4D5FA7';
                        labelLevel = 'highly active';
                    }
                }

                const x = 32 + col * 12;
                const y = 15 + row * 12;

                const formattedDate = curDate.toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric'
                });

                svg += `
                    <rect class="heatmap-cell" x="${x}" y="${y}" width="10" height="10" 
                        fill="${fill}"
                        data-date="${formattedDate}"
                        data-words="${words}"
                        data-entries="${entriesCount}"
                        data-level="${labelLevel}"
                    ></rect>
                `;
            }
        }

        for (const [monthName, colIdx] of Object.entries(monthPositions)) {
            const x = 32 + colIdx * 12;
            svg += `<text x="${x}" y="10" fill="var(--text-muted)" font-size="8" text-anchor="start">${monthName}</text>`;
        }

        svg += `</svg>`;
        box.innerHTML = svg;

        // Bind custom tooltip listener for heatmap
        const heatmapCells = box.querySelectorAll('.heatmap-cell');
        heatmapCells.forEach(cell => {
            cell.addEventListener('mouseover', (e) => {
                const date = cell.dataset.date;
                const words = cell.dataset.words;
                const entriesCount = cell.dataset.entries;
                const level = cell.dataset.level;
                const tooltip = document.getElementById('chart-tooltip');
                if (tooltip) {
                    tooltip.innerHTML = `
                        <h5>${date}</h5>
                        <p>${entriesCount} entry(ies) · ${words} words (${level})</p>
                    `;
                    tooltip.style.opacity = '1';
                }
            });

            cell.addEventListener('mousemove', (e) => {
                const tooltip = document.getElementById('chart-tooltip');
                if (tooltip) {
                    tooltip.style.left = e.pageX + 'px';
                    tooltip.style.top = (e.pageY - 10) + 'px';
                }
            });

            cell.addEventListener('mouseleave', () => {
                const tooltip = document.getElementById('chart-tooltip');
                if (tooltip) tooltip.style.opacity = '0';
            });
        });
    }

    /**
     * Entrypoint rendering function for the entire Insights Dashboard tab.
     */
    function renderAnalytics() {
        const view = document.getElementById('view-analytics');
        if (!view || view.style.display === 'none') return;

        const stats = getAnalyticsStats();

        // 1. Wellness Progress Circle
        const wellnessRingFill = document.getElementById('wellness-ring-fill');
        const wellnessScoreVal = document.getElementById('wellness-score-value');
        const wellnessScoreLabel = document.getElementById('wellness-score-label');

        if (wellnessRingFill && wellnessScoreVal && wellnessScoreLabel) {
            const score = stats.wellnessScore;
            wellnessRingFill.setAttribute('stroke-dasharray', `${score}, 100`);
            wellnessScoreVal.textContent = `${score}%`;

            let label = 'Reflective';
            if (score >= 80) label = 'Excellent Vibe ✨';
            else if (score >= 60) label = 'Good Consistency 👍';
            else if (score >= 40) label = 'Steady Progress 🌱';
            else if (score > 0) label = 'Needs Focus 🔍';
            else label = 'Write first entry';
            
            wellnessScoreLabel.textContent = label;
        }

        // 2. Writing Streaks Card
        const streakValue = document.getElementById('analytics-streak-value');
        const longestStreak = document.getElementById('analytics-longest-streak');
        if (streakValue && longestStreak) {
            streakValue.textContent = `${stats.currentStreak} day${stats.currentStreak !== 1 ? 's' : ''}`;
            longestStreak.textContent = `Longest: ${stats.longestStreak} day${stats.longestStreak !== 1 ? 's' : ''}`;
        }

        // 3. Total Words & Averages
        const wordsValue = document.getElementById('analytics-words-value');
        const entriesValue = document.getElementById('analytics-entries-value');
        if (wordsValue && entriesValue) {
            wordsValue.textContent = `${stats.totalWords.toLocaleString()} word${stats.totalWords !== 1 ? 's' : ''}`;
            entriesValue.textContent = `${stats.totalEntries} entry${stats.totalEntries !== 1 ? 'ies' : ''} · ${stats.avgWordCount} avg`;
        }

        // 4. Mood Average Card
        const avgMoodValue = document.getElementById('analytics-mood-value');
        const avgMoodLabel = document.getElementById('analytics-mood-label');
        const avgMoodEmoji = document.getElementById('analytics-mood-emoji');

        if (avgMoodValue && avgMoodLabel && avgMoodEmoji) {
            avgMoodValue.textContent = `${stats.avgMood.toFixed(1)} / 5.0`;

            const MOOD_NAMES = { 1: 'Awful 😢', 2: 'Bad 😕', 3: 'Okay 😐', 4: 'Good 🙂', 5: 'Great 😊' };
            const MOOD_EMOJIS = { 1: '😢', 2: '😕', 3: '😐', 4: '🙂', 5: '😊' };
            const roundedMood = Math.round(stats.avgMood);
            avgMoodLabel.textContent = MOOD_NAMES[roundedMood] || 'No entries yet';
            avgMoodEmoji.textContent = MOOD_EMOJIS[roundedMood] || '😐';
        }

        // 5. Draw interactive charts
        drawMoodTrendChart();
        drawMoodDonutChart(stats);
        drawWeekdayBarChart(stats);
        drawContributionHeatmap();

        // 6. Top Tags Correlation rankings
        const tagBox = document.getElementById('tag-correlations-box');
        if (tagBox) {
            const sortedTags = Object.keys(stats.tagStats).sort((a, b) => stats.tagStats[b].count - stats.tagStats[a].count);
            
            if (sortedTags.length === 0) {
                tagBox.innerHTML = `<span style="grid-column: span 2; font-size: 0.85rem; color: var(--text-secondary); text-align: center; padding: var(--space-md) 0;">No tags used yet</span>`;
            } else {
                tagBox.innerHTML = sortedTags.map(tag => {
                    const tagData = stats.tagStats[tag];
                    const tagAvgMood = tagData.moodSum / tagData.count;

                    let fill = 'var(--mood-3)';
                    if (tagAvgMood >= 4.5) fill = 'var(--mood-5)';
                    else if (tagAvgMood >= 3.5) fill = 'var(--mood-4)';
                    else if (tagAvgMood >= 2.5) fill = 'var(--mood-3)';
                    else if (tagAvgMood >= 1.5) fill = 'var(--mood-2)';
                    else fill = 'var(--mood-1)';

                    const pctWidth = (tagAvgMood / 5.0) * 100;
                    
                    return `
                        <div class="tag-correlation-card">
                            <div class="flex justify-between align-center">
                                <span style="font-weight: 600; font-size: 0.9rem; color: var(--accent);">#${tag}</span>
                                <span style="font-size: 0.72rem; color: var(--text-secondary); font-weight: 500;">${tagData.count} entry(ies)</span>
                            </div>
                            <div class="flex align-center justify-between" style="font-size: 0.75rem; margin-top: 4px;">
                                <span style="color: var(--text-secondary);">Avg Mood:</span>
                                <span style="font-weight: 700;">${tagAvgMood.toFixed(1)} / 5.0</span>
                            </div>
                            <div class="correlation-progress-bar" style="margin-top: 4px;">
                                <div class="correlation-progress-fill" style="width: ${pctWidth}%; background-color: ${fill};"></div>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }
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

        // 7 Days / 30 Days Trend Switches
        const btn7d = document.getElementById('btn-trend-7d');
        const btn30d = document.getElementById('btn-trend-30d');
        
        if (btn7d && btn30d) {
            btn7d.addEventListener('click', () => {
                btn7d.classList.add('active');
                btn30d.classList.remove('active');
                analyticsDaysLimit = 7;
                drawMoodTrendChart();
            });
            btn30d.addEventListener('click', () => {
                btn30d.classList.add('active');
                btn7d.classList.remove('active');
                analyticsDaysLimit = 30;
                drawMoodTrendChart();
            });
        }
    }

    /**
     * Binds all editor toolbar, dropdown, and typography controls for Step 5.
     */
    function initEditorControllers() {
        const editorField = document.getElementById('rich-editor-field');
        if (!editorField) return;

        // Prevent toolbar/dropdown clicks from stealing focus/selection from the editor field
        document.querySelectorAll('.editor-toolbar, .editor-dropdown').forEach(container => {
            container.addEventListener('mousedown', (e) => {
                // Do not prevent default for actual input fields (like inputs or textareas)
                if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                    e.preventDefault();
                }
            });
        });

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

        // 5. Dropdowns Toggle Controller (with dynamic positioning to escape horizontal scrollbar clipping)
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
                    
                    const willShow = !menuEl.classList.contains('active');
                    if (willShow) {
                        // Position dynamically relative to trigger button
                        const rect = btnEl.getBoundingClientRect();
                        
                        // We position it above the toolbar button (which is at rect.top)
                        menuEl.style.bottom = (window.innerHeight - rect.top + 6) + 'px';
                        
                        // Keep dropdown on screen (menu width is 200px to 230px)
                        let left = rect.left;
                        const menuWidth = menuEl.classList.contains('grid-layout') ? 230 : 200;
                        if (left + menuWidth > window.innerWidth) {
                            left = window.innerWidth - menuWidth - 16;
                        }
                        menuEl.style.left = Math.max(16, left) + 'px';
                        
                        menuEl.classList.add('active');
                    } else {
                        menuEl.classList.remove('active');
                    }
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

    // -------------------------------------------------------------
    // Ambient Sound & Synthesis Mixer Engine (Web Audio API)
    // -------------------------------------------------------------
    const HelloAudio = (function() {
        let audioCtx = null;
        let masterGain = null;
        let isAmbientEnabled = false;
        let isTypewriterEnabled = true;
        
        // Channel nodes
        const channels = {};

        function initContext() {
            if (audioCtx) return;
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            audioCtx = new AudioCtx();
            masterGain = audioCtx.createGain();
            masterGain.gain.value = 0.5; // Default master vol
            masterGain.connect(audioCtx.destination);
            
            // Build noise buffer once
            const bufferSize = 2 * audioCtx.sampleRate;
            const pinkBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const output = pinkBuffer.getChannelData(0);
            let b0=0, b1=0, b2=0, b3=0, b4=0, b5=0, b6=0;
            for (let i = 0; i < bufferSize; i++) {
                const white = Math.random() * 2 - 1;
                b0 = 0.99886 * b0 + white * 0.0555179;
                b1 = 0.99332 * b1 + white * 0.0750759;
                b2 = 0.96900 * b2 + white * 0.1538520;
                b3 = 0.86650 * b3 + white * 0.3104856;
                b4 = 0.55000 * b4 + white * 0.5329522;
                b5 = -0.7616 * b5 - white * 0.0168980;
                output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
                output[i] *= 0.11;
                b6 = white * 0.115926;
            }
            
            // Setup channels
            setupPinkNoiseChannel('rain', pinkBuffer, 800);      
            setupWindChannel('wind', pinkBuffer);               
            setupOceanChannel('ocean', pinkBuffer);             
            setupFireplaceChannel('fireplace');                  
            setupCricketsChannel('crickets');                    
            setupClockChannel('clock');                          
            setupCafeChannel('cafe', pinkBuffer);               
            setupLofiChannel('lofi');                            
        }
        
        function setupPinkNoiseChannel(name, buffer, lpFreq) {
            const gainNode = audioCtx.createGain();
            gainNode.gain.value = 0.0; 
            gainNode.connect(masterGain);
            
            const filterNode = audioCtx.createBiquadFilter();
            filterNode.type = 'lowpass';
            filterNode.frequency.value = lpFreq;
            filterNode.connect(gainNode);
            
            let source = null;
            
            channels[name] = {
                gain: gainNode,
                play: () => {
                    if (source) return;
                    source = audioCtx.createBufferSource();
                    source.buffer = buffer;
                    source.loop = true;
                    source.connect(filterNode);
                    source.start(0);
                },
                stop: () => {
                    if (!source) return;
                    try { source.stop(); } catch(e){}
                    source = null;
                }
            };
        }

        function setupWindChannel(name, buffer) {
            const gainNode = audioCtx.createGain();
            gainNode.gain.value = 0.0;
            gainNode.connect(masterGain);
            
            const filterNode = audioCtx.createBiquadFilter();
            filterNode.type = 'bandpass';
            filterNode.Q.value = 2.5;
            filterNode.frequency.value = 400;
            filterNode.connect(gainNode);
            
            let source = null;
            let timer = null;
            
            channels[name] = {
                gain: gainNode,
                play: () => {
                    if (source) return;
                    source = audioCtx.createBufferSource();
                    source.buffer = buffer;
                    source.loop = true;
                    source.connect(filterNode);
                    source.start(0);
                    
                    timer = setInterval(() => {
                        if (!audioCtx) return;
                        const t = audioCtx.currentTime;
                        const nextFreq = 300 + Math.random() * 250;
                        filterNode.frequency.exponentialRampToValueAtTime(nextFreq, t + 3);
                    }, 3000);
                },
                stop: () => {
                    if (source) {
                        try { source.stop(); } catch(e){}
                        source = null;
                    }
                    if (timer) {
                        clearInterval(timer);
                        timer = null;
                    }
                }
            };
        }

        function setupOceanChannel(name, buffer) {
            const gainNode = audioCtx.createGain();
            gainNode.gain.value = 0.0;
            gainNode.connect(masterGain);
            
            const filterNode = audioCtx.createBiquadFilter();
            filterNode.type = 'lowpass';
            filterNode.frequency.value = 350;
            filterNode.connect(gainNode);
            
            const waveGain = audioCtx.createGain();
            waveGain.gain.value = 0.5;
            waveGain.connect(filterNode);
            
            let source = null;
            let timer = null;
            
            channels[name] = {
                gain: gainNode,
                play: () => {
                    if (source) return;
                    source = audioCtx.createBufferSource();
                    source.buffer = buffer;
                    source.loop = true;
                    source.connect(waveGain);
                    source.start(0);
                    
                    let swell = true;
                    timer = setInterval(() => {
                        if (!audioCtx) return;
                        const t = audioCtx.currentTime;
                        const nextVol = swell ? 0.9 : 0.15;
                        waveGain.gain.linearRampToValueAtTime(nextVol, t + 4.5);
                        swell = !swell;
                    }, 4500);
                },
                stop: () => {
                    if (source) {
                        try { source.stop(); } catch(e){}
                        source = null;
                    }
                    if (timer) {
                        clearInterval(timer);
                        timer = null;
                    }
                }
            };
        }

        function setupFireplaceChannel(name) {
            const gainNode = audioCtx.createGain();
            gainNode.gain.value = 0.0;
            gainNode.connect(masterGain);
            
            const osc = audioCtx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = 55;
            
            const lowpass = audioCtx.createBiquadFilter();
            lowpass.type = 'lowpass';
            lowpass.frequency.value = 80;
            
            const rumbleGain = audioCtx.createGain();
            rumbleGain.gain.value = 0.08;
            
            osc.connect(lowpass);
            lowpass.connect(rumbleGain);
            rumbleGain.connect(gainNode);
            
            let timer = null;
            let isPlaying = false;
            
            channels[name] = {
                gain: gainNode,
                play: () => {
                    if (isPlaying) return;
                    isPlaying = true;
                    try { osc.start(0); } catch(e){}
                    
                    timer = setInterval(() => {
                        if (!audioCtx || !isAmbientEnabled) return;
                        const t = audioCtx.currentTime;
                        const click = audioCtx.createOscillator();
                        click.type = 'triangle';
                        click.frequency.value = 800 + Math.random() * 1200;
                        
                        const clickFilter = audioCtx.createBiquadFilter();
                        clickFilter.type = 'highpass';
                        clickFilter.frequency.value = 2000;
                        
                        const clickGain = audioCtx.createGain();
                        clickGain.gain.setValueAtTime(0.0, t);
                        clickGain.gain.linearRampToValueAtTime(0.04 + Math.random() * 0.05, t + 0.002);
                        clickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.02 + Math.random() * 0.04);
                        
                        click.connect(clickFilter);
                        clickFilter.connect(clickGain);
                        clickGain.connect(gainNode);
                        
                        click.start(t);
                        click.stop(t + 0.1);
                    }, 180);
                },
                stop: () => {
                    isPlaying = false;
                    if (timer) {
                        clearInterval(timer);
                        timer = null;
                    }
                }
            };
        }

        function setupCricketsChannel(name) {
            const gainNode = audioCtx.createGain();
            gainNode.gain.value = 0.0;
            gainNode.connect(masterGain);
            
            let timer = null;
            let isPlaying = false;
            
            channels[name] = {
                gain: gainNode,
                play: () => {
                    if (isPlaying) return;
                    isPlaying = true;
                    
                    timer = setInterval(() => {
                        if (!audioCtx || !isAmbientEnabled) return;
                        const t = audioCtx.currentTime;
                        
                        for (let j = 0; j < 3; j++) {
                            const delay = j * 0.08;
                            const chirp = audioCtx.createOscillator();
                            chirp.type = 'sine';
                            chirp.frequency.value = 3800 + Math.random() * 150;
                            
                            const chirpGain = audioCtx.createGain();
                            chirpGain.gain.setValueAtTime(0.0001, t + delay);
                            chirpGain.gain.linearRampToValueAtTime(0.03, t + delay + 0.01);
                            chirpGain.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.05);
                            
                            chirp.connect(chirpGain);
                            chirpGain.connect(gainNode);
                            chirp.start(t + delay);
                            chirp.stop(t + delay + 0.06);
                        }
                    }, 1400);
                },
                stop: () => {
                    isPlaying = false;
                    if (timer) {
                        clearInterval(timer);
                        timer = null;
                    }
                }
            };
        }

        function setupClockChannel(name) {
            const gainNode = audioCtx.createGain();
            gainNode.gain.value = 0.0;
            gainNode.connect(masterGain);
            
            let timer = null;
            let isPlaying = false;
            
            channels[name] = {
                gain: gainNode,
                play: () => {
                    if (isPlaying) return;
                    isPlaying = true;
                    
                    timer = setInterval(() => {
                        if (!audioCtx || !isAmbientEnabled) return;
                        const t = audioCtx.currentTime;
                        
                        const tick = audioCtx.createOscillator();
                        tick.type = 'sine';
                        tick.frequency.value = 1600;
                        
                        const tickGain = audioCtx.createGain();
                        tickGain.gain.setValueAtTime(0.0001, t);
                        tickGain.gain.linearRampToValueAtTime(0.012, t + 0.001);
                        tickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.005);
                        
                        tick.connect(tickGain);
                        tickGain.connect(gainNode);
                        tick.start(t);
                        tick.stop(t + 0.01);
                    }, 1000);
                },
                stop: () => {
                    isPlaying = false;
                    if (timer) {
                        clearInterval(timer);
                        timer = null;
                    }
                }
            };
        }

        function setupCafeChannel(name, buffer) {
            const gainNode = audioCtx.createGain();
            gainNode.gain.value = 0.0;
            gainNode.connect(masterGain);
            
            const filterNode = audioCtx.createBiquadFilter();
            filterNode.type = 'bandpass';
            filterNode.frequency.value = 250;
            filterNode.Q.value = 1.0;
            filterNode.connect(gainNode);
            
            let source = null;
            let timer = null;
            
            channels[name] = {
                gain: gainNode,
                play: () => {
                    if (source) return;
                    source = audioCtx.createBufferSource();
                    source.buffer = buffer;
                    source.loop = true;
                    source.connect(filterNode);
                    source.start(0);
                    
                    timer = setInterval(() => {
                        if (!audioCtx || !isAmbientEnabled) return;
                        const t = audioCtx.currentTime;
                        const clink = audioCtx.createOscillator();
                        clink.type = 'sine';
                        clink.frequency.setValueAtTime(2200 + Math.random() * 1000, t);
                        clink.frequency.exponentialRampToValueAtTime(1000, t + 0.05);
                        
                        const clinkGain = audioCtx.createGain();
                        clinkGain.gain.setValueAtTime(0.0, t);
                        clinkGain.gain.linearRampToValueAtTime(0.02, t + 0.002);
                        clinkGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
                        
                        clink.connect(clinkGain);
                        clinkGain.connect(gainNode);
                        
                        clink.start(t);
                        clink.stop(t + 0.1);
                    }, 4000);
                },
                stop: () => {
                    if (source) {
                        try { source.stop(); } catch(e){}
                        source = null;
                    }
                    if (timer) {
                        clearInterval(timer);
                        timer = null;
                    }
                }
            };
        }

        function setupLofiChannel(name) {
            const gainNode = audioCtx.createGain();
            gainNode.gain.value = 0.0;
            gainNode.connect(masterGain);
            
            let timer = null;
            let isPlaying = false;
            
            const chordNotesList = [
                [110.0, 261.63, 329.63, 392.00], 
                [146.83, 174.61, 220.00, 261.63], 
                [98.00, 246.94, 293.66, 349.23],  
                [130.81, 164.81, 196.00, 246.94]  
            ];
            
            let chordIdx = 0;
            
            channels[name] = {
                gain: gainNode,
                play: () => {
                    if (isPlaying) return;
                    isPlaying = true;
                    
                    timer = setInterval(() => {
                        if (!audioCtx || !isAmbientEnabled) return;
                        const t = audioCtx.currentTime;
                        const notes = chordNotesList[chordIdx];
                        
                        notes.forEach((freq, noteIdx) => {
                            const delay = noteIdx * 0.06;
                            const osc = audioCtx.createOscillator();
                            osc.type = 'triangle';
                            osc.frequency.value = freq;
                            
                            const oscFilter = audioCtx.createBiquadFilter();
                            oscFilter.type = 'lowpass';
                            oscFilter.frequency.value = 600;
                            
                            const noteGain = audioCtx.createGain();
                            noteGain.gain.setValueAtTime(0.0, t + delay);
                            noteGain.gain.linearRampToValueAtTime(0.04, t + delay + 0.15);
                            noteGain.gain.exponentialRampToValueAtTime(0.0001, t + delay + 3.8);
                            
                            osc.connect(oscFilter);
                            oscFilter.connect(noteGain);
                            noteGain.connect(gainNode);
                            
                            osc.start(t + delay);
                            osc.stop(t + delay + 4);
                        });
                        
                        chordIdx = (chordIdx + 1) % chordNotesList.length;
                    }, 4000);
                },
                stop: () => {
                    isPlaying = false;
                    if (timer) {
                        clearInterval(timer);
                        timer = null;
                    }
                }
            };
        }
        
        function setMasterVolume(val) {
            if (masterGain) {
                masterGain.gain.value = Number(val);
            }
        }
        
        function setChannelVolume(name, val) {
            initContext();
            if (channels[name]) {
                channels[name].gain.gain.value = Number(val);
                if (isAmbientEnabled && Number(val) > 0) {
                    channels[name].play();
                } else if (Number(val) === 0) {
                    channels[name].stop();
                }
            }
        }
        
        function setAmbientEnabled(enable) {
            initContext();
            isAmbientEnabled = !!enable;
            
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
            
            Object.keys(channels).forEach(name => {
                const vol = channels[name].gain.gain.value;
                if (isAmbientEnabled && vol > 0) {
                    channels[name].play();
                } else {
                    channels[name].stop();
                }
            });
        }
        
        function setTypewriterEnabled(enable) {
            isTypewriterEnabled = !!enable;
        }

        function playTypewriterClick() {
            if (!isTypewriterEnabled) return;
            initContext();
            
            const t = audioCtx.currentTime;
            const click = audioCtx.createOscillator();
            click.type = 'sine';
            click.frequency.setValueAtTime(1200 + Math.random() * 600, t);
            click.frequency.exponentialRampToValueAtTime(600, t + 0.02);
            
            const clickFilter = audioCtx.createBiquadFilter();
            clickFilter.type = 'highpass';
            clickFilter.frequency.value = 1000;
            
            const clickGain = audioCtx.createGain();
            clickGain.gain.setValueAtTime(0.0001, t);
            clickGain.gain.linearRampToValueAtTime(0.05, t + 0.001);
            clickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
            
            click.connect(clickFilter);
            clickFilter.connect(clickGain);
            clickGain.connect(audioCtx.destination); 
            
            click.start(t);
            click.stop(t + 0.03);
        }

        return {
            init: initContext,
            setMasterVolume,
            setChannelVolume,
            setAmbientEnabled,
            setTypewriterEnabled,
            playTypewriterClick,
            isPlaying: () => isAmbientEnabled
        };
    })();

    // -------------------------------------------------------------
    // Canvas Theme-Specific Particle Animation Loop
    // -------------------------------------------------------------
    const HelloParticles = (function() {
        let canvas = null;
        let ctx = null;
        let animationId = null;
        let currentMode = 'stars'; 
        let particles = [];

        function init() {
            canvas = document.getElementById('theme-particles-canvas');
            if (!canvas) return;
            ctx = canvas.getContext('2d');
            
            window.addEventListener('resize', resizeCanvas);
            resizeCanvas();
            
            // Resolve and apply the initial theme particles
            const currentTheme = localStorage.getItem('hello-diary-theme') || 'serene-dawn';
            updateTheme(currentTheme);
            
            startLoop();
        }

        function resizeCanvas() {
            if (canvas) {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
            }
        }

        function updateTheme(themeId) {
            // Mapping all 24 themes explicitly
            const starsThemes = ['midnight-abyss', 'aurora-borealis', 'cosmic-universe', 'arctic-aurora', 'royal-purple', 'futuristic-neon', 'imagination', 'serene-dawn'];
            const petalsThemes = ['sakura-garden', 'cherry-blossom-night', 'lavender-dream', 'love-romance'];
            const rainThemes = ['rainy-day', 'tropical-paradise', 'ocean-depths', 'mountain-peak'];
            const firefliesThemes = ['forest-sanctuary', 'autumn-harvest', 'golden-hour', 'animal-kingdom', 'sports-arena', 'steampunk'];
            const mistThemes = ['minimal-zen', 'vintage-typewriter'];

            if (starsThemes.includes(themeId)) {
                currentMode = 'stars';
            } else if (petalsThemes.includes(themeId)) {
                currentMode = 'petals';
            } else if (rainThemes.includes(themeId)) {
                currentMode = 'rain';
            } else if (firefliesThemes.includes(themeId)) {
                currentMode = 'fireflies';
            } else if (mistThemes.includes(themeId)) {
                currentMode = 'mist';
            } else {
                currentMode = 'stars'; 
            }
            
            particles = []; 
            if (canvas) {
                const maxParticles = 65;
                for (let i = 0; i < maxParticles; i++) {
                    particles.push(new Particle());
                }
            }
        }

        class Particle {
            constructor() {
                this.reset();
            }

            reset() {
                if (!canvas) return;
                this.x = Math.random() * canvas.width;
                this.y = Math.random() * canvas.height;
                this.size = 0.5 + Math.random() * 2.5;
                this.speedX = 0;
                this.speedY = 0;
                this.alpha = 0.1 + Math.random() * 0.8;
                this.fadeSpeed = 0.005 + Math.random() * 0.01;
                this.angle = Math.random() * 360;
                this.angleSpeed = Math.random() * 2 - 1;

                if (currentMode === 'stars') {
                    this.speedX = 0;
                    this.speedY = 0;
                    this.size = 0.8 + Math.random() * 1.5;
                } else if (currentMode === 'petals') {
                    this.y = -10;
                    this.x = Math.random() * canvas.width;
                    this.size = 6 + Math.random() * 6;
                    this.speedY = 0.8 + Math.random() * 1.2;
                    this.speedX = -0.5 + Math.random() * 1.0;
                } else if (currentMode === 'rain') {
                    this.y = -20;
                    this.x = Math.random() * canvas.width;
                    this.size = 1 + Math.random() * 1.5;
                    this.speedY = 6 + Math.random() * 4;
                    this.speedX = -0.8;
                } else if (currentMode === 'fireflies') {
                    this.speedX = -0.3 + Math.random() * 0.6;
                    this.speedY = -0.3 + Math.random() * 0.6;
                    this.size = 2 + Math.random() * 2.5;
                } else if (currentMode === 'mist') {
                    this.size = 30 + Math.random() * 60;
                    this.speedX = 0.05 + Math.random() * 0.1;
                    this.speedY = -0.05 - Math.random() * 0.1;
                    this.alpha = 0.02 + Math.random() * 0.08;
                }
            }

            update() {
                if (!canvas) return;
                if (currentMode === 'stars') {
                    this.alpha += this.fadeSpeed;
                    if (this.alpha > 0.95 || this.alpha < 0.05) {
                        this.fadeSpeed = -this.fadeSpeed;
                    }
                } else if (currentMode === 'petals') {
                    this.y += this.speedY;
                    this.x += this.speedX;
                    this.angle += this.angleSpeed;
                    if (this.y > canvas.height + 10) this.reset();
                } else if (currentMode === 'rain') {
                    this.y += this.speedY;
                    this.x += this.speedX;
                    if (this.y > canvas.height + 10) this.reset();
                } else if (currentMode === 'fireflies') {
                    this.x += this.speedX;
                    this.y += this.speedY;
                    this.alpha += this.fadeSpeed;
                    if (this.alpha > 0.9 || this.alpha < 0.1) {
                        this.fadeSpeed = -this.fadeSpeed;
                    }
                    if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) {
                        this.reset();
                    }
                } else if (currentMode === 'mist') {
                    this.x += this.speedX;
                    this.y += this.speedY;
                    if (this.y < -this.size || this.x > canvas.width + this.size) {
                        this.reset();
                    }
                }
            }

            draw() {
                if (!ctx) return;
                ctx.save();
                ctx.globalAlpha = Math.max(0, Math.min(1, this.alpha));
                
                const themeId = document.documentElement.getAttribute('data-theme') || 'serene-dawn';
                
                if (currentMode === 'stars') {
                    // Twinkling stars: white for dark themes, accent-colored for light themes
                    const lightThemes = ['serene-dawn', 'sakura-garden', 'forest-sanctuary', 'lavender-dream', 'love-romance', 'mountain-peak', 'minimal-zen', 'vintage-typewriter'];
                    if (lightThemes.includes(themeId)) {
                        const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
                        ctx.fillStyle = accentColor || '#6B7FD7';
                    } else {
                        ctx.fillStyle = '#FFFFFF';
                    }
                    ctx.beginPath();
                    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                    ctx.fill();
                } else if (currentMode === 'petals') {
                    ctx.translate(this.x, this.y);
                    ctx.rotate((this.angle * Math.PI) / 180);
                    
                    if (themeId === 'lavender-dream') {
                        ctx.fillStyle = '#C3B1E1'; // Pastel lavender
                    } else if (themeId === 'love-romance') {
                        ctx.fillStyle = '#FF6B8B'; // Rose pink
                    } else {
                        ctx.fillStyle = '#FFC0CB'; // Sakura pink
                    }
                    
                    ctx.beginPath();
                    ctx.ellipse(0, 0, this.size, this.size / 2, 0, 0, Math.PI * 2);
                    ctx.fill();
                } else if (currentMode === 'rain') {
                    if (themeId === 'mountain-peak') {
                        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'; // Snow
                    } else {
                        ctx.strokeStyle = 'rgba(174, 207, 238, 0.4)';
                    }
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(this.x, this.y);
                    ctx.lineTo(this.x + this.speedX * 1.5, this.y + this.speedY * 1.5);
                    ctx.stroke();
                } else if (currentMode === 'fireflies') {
                    let glowColor = 'rgba(235, 255, 120, 1)';
                    let shadowColor = 'rgba(235, 255, 120, 0.8)';
                    
                    if (themeId === 'sports-arena') {
                        glowColor = 'rgba(255, 60, 60, 1)'; 
                        shadowColor = 'rgba(255, 60, 60, 0.8)';
                    } else if (themeId === 'steampunk') {
                        glowColor = 'rgba(212, 175, 55, 1)'; 
                        shadowColor = 'rgba(212, 175, 55, 0.8)';
                    } else if (themeId === 'forest-sanctuary') {
                        glowColor = 'rgba(100, 220, 140, 1)'; 
                        shadowColor = 'rgba(100, 220, 140, 0.8)';
                    }
                    
                    ctx.fillStyle = glowColor;
                    ctx.beginPath();
                    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                    ctx.shadowBlur = 10;
                    ctx.shadowColor = shadowColor;
                    ctx.fill();
                } else if (currentMode === 'mist') {
                    const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size);
                    if (themeId === 'minimal-zen' || themeId === 'vintage-typewriter') {
                        grad.addColorStop(0, 'rgba(0, 0, 0, 0.05)');
                        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
                    } else {
                        grad.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
                        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
                    }
                    ctx.fillStyle = grad;
                    ctx.beginPath();
                    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                    ctx.fill();
                }
                
                ctx.restore();
            }
        }

        function startLoop() {
            if (animationId) return;
            
            if (particles.length === 0) {
                const maxParticles = 65;
                for (let i = 0; i < maxParticles; i++) {
                    particles.push(new Particle());
                }
            }

            function loop() {
                if (!canvas || !ctx) return;
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                particles.forEach(p => {
                    p.update();
                    p.draw();
                });

                animationId = requestAnimationFrame(loop);
            }
            loop();
        }

        function stopLoop() {
            if (animationId) {
                cancelAnimationFrame(animationId);
                animationId = null;
            }
        }

        return {
            init,
            updateTheme,
            start: startLoop,
            stop: stopLoop
        };
    })();
    window.HelloParticles = HelloParticles;

    // Theme Scheduler check loop
    async function checkThemeSchedule() {
        const enabled = await HelloDB.getSetting('theme-schedule-enabled');
        if (!enabled) return;
        
        const dayTheme = await HelloDB.getSetting('theme-schedule-day') || 'serene-dawn';
        const nightTheme = await HelloDB.getSetting('theme-schedule-night') || 'midnight-abyss';
        
        const hour = new Date().getHours();
        const isDay = (hour >= 7 && hour < 19); 
        const targetTheme = isDay ? dayTheme : nightTheme;
        
        const currentTheme = localStorage.getItem('hello-diary-theme') || 'serene-dawn';
        if (currentTheme !== targetTheme) {
            if (window.applyTheme) {
                window.applyTheme(targetTheme);
            }
        }
    }

    // -------------------------------------------------------------
    // Immersive Controls Initializer
    // -------------------------------------------------------------
    async function initImmersiveControllers() {
        // 1. Hook Sound Mixer UI
        const btnMainMixer = document.getElementById('btn-sound-mixer-toggle');
        const btnEditorMixer = document.getElementById('btn-editor-sound-mixer-toggle');
        const popoverMixer = document.getElementById('popover-sound-mixer');
        
        function toggleMixer(btn) {
            const isVisible = popoverMixer.style.display === 'flex';
            popoverMixer.style.display = isVisible ? 'none' : 'flex';
            if (!isVisible) {
                const rect = btn.getBoundingClientRect();
                popoverMixer.style.top = (rect.bottom + window.scrollY + 10) + 'px';
                let left = rect.left + window.scrollX - 150 + (rect.width / 2);
                if (left < 16) left = 16;
                if (left + 300 > window.innerWidth) {
                    left = window.innerWidth - 300 - 16;
                }
                popoverMixer.style.left = left + 'px';
            }
        }
        
        if (btnMainMixer && popoverMixer) {
            btnMainMixer.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleMixer(btnMainMixer);
            });
        }
        if (btnEditorMixer && popoverMixer) {
            btnEditorMixer.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleMixer(btnEditorMixer);
            });
        }
        
        document.addEventListener('click', () => {
            if (popoverMixer) popoverMixer.style.display = 'none';
        });
        if (popoverMixer) {
            popoverMixer.addEventListener('click', (e) => e.stopPropagation());
        }
        
        const toggleAmbient = document.getElementById('toggle-ambient-sound');
        const masterVol = document.getElementById('volume-master');
        const toggleTypewriter = document.getElementById('toggle-typewriter-sound');
        
        if (toggleAmbient) {
            toggleAmbient.addEventListener('change', () => {
                HelloAudio.setAmbientEnabled(toggleAmbient.checked);
            });
        }
        
        if (masterVol) {
            masterVol.addEventListener('input', () => {
                HelloAudio.setMasterVolume(masterVol.value);
            });
        }
        
        if (toggleTypewriter) {
            toggleTypewriter.addEventListener('change', () => {
                HelloAudio.setTypewriterEnabled(toggleTypewriter.checked);
            });
        }
        
        document.querySelectorAll('.volume-channel').forEach(slider => {
            slider.addEventListener('input', () => {
                const channel = slider.dataset.channel;
                HelloAudio.setChannelVolume(channel, slider.value);
            });
        });

        // Typewriter click on editor keydowns
        const editorField = document.getElementById('rich-editor-field');
        if (editorField) {
            editorField.addEventListener('keydown', (e) => {
                const ignoredKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Shift', 'Control', 'Alt', 'Meta', 'Escape', 'CapsLock'];
                if (!ignoredKeys.includes(e.key)) {
                    HelloAudio.playTypewriterClick();
                }
            });
        }

        // 2. Custom Theme Creator
        const btnSaveTheme = document.getElementById('btn-save-custom-theme');
        if (btnSaveTheme) {
            btnSaveTheme.addEventListener('click', async () => {
                const nameInput = document.getElementById('custom-theme-name');
                const name = nameInput ? nameInput.value.trim() : '';
                if (!name) {
                    showToast('Please enter a theme name.');
                    return;
                }
                
                const primary = document.getElementById('theme-color-primary').value;
                const secondary = document.getElementById('theme-color-secondary').value;
                const text = document.getElementById('theme-color-text').value;
                const accent = document.getElementById('theme-color-accent').value;
                
                const themeId = 'custom-' + name.toLowerCase().replace(/[^a-z0-9]/g, '-');
                
                const newTheme = {
                    id: themeId,
                    name: name,
                    emoji: '🎨',
                    category: 'Custom',
                    accent: accent,
                    bg: primary,
                    isImage: false,
                    colors: {
                        primary,
                        secondary,
                        text,
                        accent
                    }
                };
                
                const themesList = window.THEMES || [];
                const index = themesList.findIndex(t => t.id === themeId);
                if (index >= 0) {
                    themesList[index] = newTheme;
                } else {
                    themesList.push(newTheme);
                }
                
                const customThemes = themesList.filter(t => t.id.startsWith('custom-'));
                await HelloDB.setSetting('custom-themes', customThemes);
                
                if (window.populateThemeGallery) {
                    window.populateThemeGallery('theme-picker-setup');
                    window.populateThemeGallery('theme-picker-settings');
                }
                
                if (window.applyTheme) {
                    window.applyTheme(themeId);
                }
                
                nameInput.value = '';
                showToast(`Custom theme "${name}" created successfully!`);
            });
        }

        // 3. Theme Scheduler Settings
        const toggleSchedule = document.getElementById('toggle-theme-schedule');
        const scheduleOptions = document.getElementById('theme-schedule-options');
        const selectDayTheme = document.getElementById('scheduler-day-theme');
        const selectNightTheme = document.getElementById('scheduler-night-theme');
        const themesList = window.THEMES || [];
        
        if (toggleSchedule) {
            const enabled = await HelloDB.getSetting('theme-schedule-enabled');
            toggleSchedule.checked = !!enabled;
            if (scheduleOptions) scheduleOptions.style.display = enabled ? 'flex' : 'none';
            
            if (selectDayTheme && selectNightTheme) {
                const optionsHtml = themesList.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
                selectDayTheme.innerHTML = optionsHtml;
                selectNightTheme.innerHTML = optionsHtml;
                
                const savedDay = await HelloDB.getSetting('theme-schedule-day') || 'serene-dawn';
                const savedNight = await HelloDB.getSetting('theme-schedule-night') || 'midnight-abyss';
                selectDayTheme.value = savedDay;
                selectNightTheme.value = savedNight;
            }
            
            toggleSchedule.addEventListener('change', async () => {
                const checked = toggleSchedule.checked;
                await HelloDB.setSetting('theme-schedule-enabled', checked);
                if (scheduleOptions) scheduleOptions.style.display = checked ? 'flex' : 'none';
                if (checked) {
                    await checkThemeSchedule();
                }
            });
            
            if (selectDayTheme) {
                selectDayTheme.addEventListener('change', async () => {
                    await HelloDB.setSetting('theme-schedule-day', selectDayTheme.value);
                    await checkThemeSchedule();
                });
            }
            
            if (selectNightTheme) {
                selectNightTheme.addEventListener('change', async () => {
                    await HelloDB.setSetting('theme-schedule-night', selectNightTheme.value);
                    await checkThemeSchedule();
                });
            }
        }

        // Run Scheduler immediately and start 60s check interval
        await checkThemeSchedule();
        setInterval(checkThemeSchedule, 60000);

        // 4. Editor Sticker Picker
        const btnSticker = document.getElementById('btn-sticker-picker');
        const dropdownSticker = document.getElementById('dropdown-sticker');
        
        if (btnSticker && dropdownSticker) {
            btnSticker.addEventListener('click', (e) => {
                e.stopPropagation();
                document.querySelectorAll('.editor-dropdown').forEach(d => {
                    if (d !== dropdownSticker) d.classList.remove('active');
                });
                const isHidden = dropdownSticker.style.display === 'none';
                dropdownSticker.style.display = isHidden ? 'block' : 'none';
                
                if (isHidden) {
                    const rect = btnSticker.getBoundingClientRect();
                    dropdownSticker.style.bottom = (window.innerHeight - rect.top + window.scrollY + 6) + 'px';
                    let left = rect.left + window.scrollX;
                    if (left + 280 > window.innerWidth) {
                        left = window.innerWidth - 280 - 16;
                    }
                    dropdownSticker.style.left = left + 'px';
                }
            });
            
            document.addEventListener('click', () => {
                if (dropdownSticker) dropdownSticker.style.display = 'none';
            });
            dropdownSticker.addEventListener('click', (e) => e.stopPropagation());
            
            dropdownSticker.querySelectorAll('.sticker-option').forEach(opt => {
                opt.addEventListener('click', () => {
                    const sticker = opt.dataset.sticker;
                    insertStickerInEditor(sticker);
                    dropdownSticker.style.display = 'none';
                });
            });
        }
        
        function insertStickerInEditor(emoji) {
            const editor = document.getElementById('rich-editor-field');
            if (!editor) return;
            
            const wrapperId = 'sticker-' + Date.now();
            const html = `<span class="diary-sticker-wrapper" contenteditable="false" id="${wrapperId}">${emoji}<button class="sticker-delete-btn" onclick="document.getElementById('${wrapperId}').remove()">&times;</button></span>`;
            
            editor.focus();
            
            const sel = window.getSelection();
            if (sel.getRangeAt && sel.rangeCount) {
                const range = sel.getRangeAt(0);
                if (editor.contains(range.commonAncestorContainer)) {
                    range.deleteContents();
                    const el = document.createElement('div');
                    el.innerHTML = html;
                    const node = el.firstElementChild;
                    range.insertNode(node);
                    
                    range.setStartAfter(node);
                    range.setEndAfter(node);
                    sel.removeAllRanges();
                    sel.addRange(range);
                    
                    editorDirty = true;
                    const saveBadge = document.getElementById('save-indicator-badge');
                    if (saveBadge) {
                        saveBadge.textContent = 'Unsaved Changes';
                        saveBadge.classList.add('show');
                    }
                    return;
                }
            }
            
            editor.innerHTML += html;
            editorDirty = true;
        }
    }

    // -------------------------------------------------------------
    // Step 8: Data Import/Export, PDF Printing & Mobile Gestures
    // -------------------------------------------------------------

    // -------------------------------------------------------------
    // Step 9: Premium Print & Export Book Builder Dashboard
    // -------------------------------------------------------------

    let selectedEntryIds = [];
    let selectedCoverTheme = 'midnight-stars';
    let selectedPageTheme = 'clean-white';
    let activePreviewTab = 'front';

    const SVG_TEMPLATES = {
        'midnight-stars': `
            <svg width="80" height="80" viewBox="0 0 24 24" fill="none" class="cover-logo-svg" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 20px;">
                <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" fill="#F6E27F" fill-opacity="0.15"/>
                <path d="M19 3v4M21 5h-4" stroke="#F6E27F" stroke-width="1"/>
                <path d="M15 1v2M16 2h-2" stroke="#F6E27F" stroke-width="1"/>
            </svg>
        `,
        'sakura-garden': `
            <svg width="80" height="80" viewBox="0 0 24 24" fill="none" class="cover-logo-svg" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 20px;">
                <path d="M12 2a4 4 0 0 0-4 4 4 4 0 0 0 4 4 4 4 0 0 0 4-4 4 4 0 0 0-4-4Z" fill="#D291BC" fill-opacity="0.15" stroke="#D291BC"/>
                <path d="M12 12a4 4 0 0 0-4 4 4 4 0 0 0 4 4 4 4 0 0 0 4-4 4 4 0 0 0-4-4Z" fill="#D291BC" fill-opacity="0.15" stroke="#D291BC"/>
                <path d="M6 12a4 4 0 0 0-4 4 4 4 0 0 0 4 4 4 4 0 0 0 4-4 4 4 0 0 0-4-4Z" fill="#D291BC" fill-opacity="0.15" stroke="#D291BC"/>
                <path d="M18 12a4 4 0 0 0-4 4 4 4 0 0 0 4 4 4 4 0 0 0 4-4 4 4 0 0 0-4-4Z" fill="#D291BC" fill-opacity="0.15" stroke="#D291BC"/>
                <circle cx="12" cy="12" r="3" fill="#D291BC" fill-opacity="0.3"/>
            </svg>
        `,
        'autumn-harvest': `
            <svg width="80" height="80" viewBox="0 0 24 24" fill="none" class="cover-logo-svg" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 20px;">
                <path d="M12 2C11.5 6 8.5 9 5.5 11.5c3 1.5 6 2 6.5 6.5.5-4.5 3.5-5 6.5-6.5-3-2.5-6-5.5-6.5-9.5Z" fill="#FFE5B4" fill-opacity="0.1" stroke="#FFE5B4"/>
                <line x1="12" y1="2" x2="12" y2="22" stroke="#FFE5B4" stroke-width="1.5"/>
            </svg>
        `,
        'minimal-zen': `
            <svg width="80" height="80" viewBox="0 0 24 24" fill="none" class="cover-logo-svg" stroke-width="1.2" style="margin-bottom: 20px;">
                <circle cx="12" cy="12" r="9" stroke="#333" stroke-dasharray="2 2"/>
                <circle cx="12" cy="12" r="6" stroke="#333"/>
                <circle cx="12" cy="12" r="3" fill="#333" fill-opacity="0.2"/>
            </svg>
        `,
        'vintage-typewriter': `
            <svg width="80" height="80" viewBox="0 0 24 24" fill="none" class="cover-logo-svg" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 20px;">
                <circle cx="12" cy="7" r="4" stroke="#5D4037" fill="#5D4037" fill-opacity="0.05"/>
                <line x1="12" y1="11" x2="12" y2="21" stroke="#5D4037" stroke-width="1.5"/>
                <line x1="12" y1="21" x2="15" y2="21" stroke="#5D4037"/>
                <line x1="12" y1="18" x2="14" y2="18" stroke="#5D4037"/>
            </svg>
        `
    };

    async function openBookCreator(preselectedEntryId = null) {
        showScreen('screen-book-creator');
        
        // Initialize options
        selectedCoverTheme = 'midnight-stars';
        selectedPageTheme = 'clean-white';
        activePreviewTab = 'front';
        
        // Reset active classes on controls
        document.querySelectorAll('#screen-book-creator [data-cover]').forEach(card => {
            card.classList.toggle('active', card.getAttribute('data-cover') === selectedCoverTheme);
        });
        document.querySelectorAll('#screen-book-creator [data-page]').forEach(card => {
            card.classList.toggle('active', card.getAttribute('data-page') === selectedPageTheme);
        });
        document.querySelectorAll('#screen-book-creator .preview-tab').forEach(tab => {
            tab.classList.toggle('active', tab.getAttribute('data-view') === activePreviewTab);
        });
        
        // Populate inputs
        document.getElementById('book-title-input').value = 'Hello Diary';
        document.getElementById('book-subtitle-input').value = 'My Sacred Digital Sanctuary';
        document.getElementById('book-volume-input').value = 'Volume 1';
        
        // Build tag list for filter dropdown
        const allTags = new Set();
        cachedEntries.forEach(entry => {
            if (entry.tags && Array.isArray(entry.tags)) {
                entry.tags.forEach(t => allTags.add(t));
            }
        });
        
        const filterTagSelect = document.getElementById('creator-filter-tag');
        filterTagSelect.innerHTML = '<option value="">All Tags</option>';
        allTags.forEach(tag => {
            const opt = document.createElement('option');
            opt.value = tag;
            opt.textContent = '#' + tag;
            filterTagSelect.appendChild(opt);
        });
        
        // Mood and tag filters defaults
        document.getElementById('creator-filter-mood').value = '';
        document.getElementById('creator-filter-tag').value = '';
        
        // Default select all if no preselectedEntryId
        if (preselectedEntryId) {
            selectedEntryIds = [preselectedEntryId];
        } else {
            selectedEntryIds = cachedEntries.map(e => e.id);
        }
        
        renderCreatorEntriesList();
        updateBookPreview();
    }

    function renderCreatorEntriesList() {
        const listContainer = document.getElementById('creator-entries-list');
        listContainer.innerHTML = '';
        
        const moodFilter = document.getElementById('creator-filter-mood').value;
        const tagFilter = document.getElementById('creator-filter-tag').value;
        
        // Filter entries
        const filtered = cachedEntries.filter(entry => {
            if (moodFilter && Number(entry.mood) !== Number(moodFilter)) return false;
            if (tagFilter && (!entry.tags || !entry.tags.includes(tagFilter))) return false;
            return true;
        });
        
        // Sort chronological
        const sorted = [...filtered].sort((a, b) => a.date - b.date);
        
        if (sorted.length === 0) {
            listContainer.innerHTML = '<div style="padding: 15px; font-size: 0.8rem; color: var(--text-secondary); text-align: center;">No matching entries</div>';
            return;
        }
        
        sorted.forEach(entry => {
            const dateStr = new Date(entry.date).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });
            const charCount = entry.content ? entry.content.replace(/<[^>]*>/g, '').length : 0;
            const isChecked = selectedEntryIds.includes(entry.id);
            
            const row = document.createElement('div');
            row.className = 'entry-checkbox-row';
            row.innerHTML = `
                <input type="checkbox" data-id="${entry.id}" ${isChecked ? 'checked' : ''}>
                <div class="row-info">
                    <span class="row-title">${entry.title || 'Untitled Entry'}</span>
                    <span class="row-meta">${dateStr} · ${charCount} chars</span>
                </div>
            `;
            
            // Toggle checkbox when row is clicked
            row.addEventListener('click', (e) => {
                if (e.target.tagName !== 'INPUT') {
                    const cb = row.querySelector('input[type="checkbox"]');
                    cb.checked = !cb.checked;
                    cb.dispatchEvent(new Event('change'));
                }
            });
            
            row.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
                const id = entry.id;
                if (e.target.checked) {
                    if (!selectedEntryIds.includes(id)) {
                        selectedEntryIds.push(id);
                    }
                } else {
                    selectedEntryIds = selectedEntryIds.filter(x => x !== id);
                }
                updateBookPreview();
            });
            
            listContainer.appendChild(row);
        });
    }

    function updateBookPreview() {
        const previewPage = document.getElementById('preview-book-page');
        if (!previewPage) return;
        
        // Reset classes
        previewPage.className = 'preview-book-page';
        
        const title = document.getElementById('book-title-input').value || 'Hello Diary';
        const subtitle = document.getElementById('book-subtitle-input').value || 'My Sacred Digital Sanctuary';
        const volume = document.getElementById('book-volume-input').value || 'Volume 1';
        
        // Date range for back cover
        let firstDateStr = '';
        let lastDateStr = '';
        if (selectedEntryIds.length > 0) {
            const selected = cachedEntries.filter(e => selectedEntryIds.includes(e.id)).sort((a,b) => a.date - b.date);
            if (selected.length > 0) {
                firstDateStr = new Date(selected[0].date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
                lastDateStr = new Date(selected[selected.length - 1].date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            }
        }
        
        const logoSvg = SVG_TEMPLATES[selectedCoverTheme] || '';
        
        if (activePreviewTab === 'front') {
            if (selectedCoverTheme === 'midnight-stars') previewPage.classList.add('preview-cover-stars');
            else if (selectedCoverTheme === 'sakura-garden') previewPage.classList.add('preview-cover-sakura');
            else if (selectedCoverTheme === 'autumn-harvest') previewPage.classList.add('preview-cover-autumn');
            else if (selectedCoverTheme === 'minimal-zen') previewPage.classList.add('preview-cover-zen');
            else if (selectedCoverTheme === 'vintage-typewriter') previewPage.classList.add('preview-cover-typewriter');
            
            previewPage.innerHTML = `
                <div class="pdf-cover-logo">${logoSvg}</div>
                <h1>${title}</h1>
                <p class="cover-subtitle">${subtitle}</p>
                <div style="width: 60px; height: 2px; background: currentColor; margin: 25px auto; opacity: 0.6;"></div>
                <p class="cover-meta">
                    ${volume}<br>
                    ${selectedEntryIds.length} Memor${selectedEntryIds.length === 1 ? 'y' : 'ies'}<br>
                    Created with Hello Diary
                </p>
            `;
        } else if (activePreviewTab === 'back') {
            previewPage.classList.add('back');
            if (selectedCoverTheme === 'midnight-stars') previewPage.classList.add('preview-cover-stars');
            else if (selectedCoverTheme === 'sakura-garden') previewPage.classList.add('preview-cover-sakura');
            else if (selectedCoverTheme === 'autumn-harvest') previewPage.classList.add('preview-cover-autumn');
            else if (selectedCoverTheme === 'minimal-zen') previewPage.classList.add('preview-cover-zen');
            else if (selectedCoverTheme === 'vintage-typewriter') previewPage.classList.add('preview-cover-typewriter');
            
            previewPage.innerHTML = `
                <div class="pdf-cover-logo">${logoSvg}</div>
                <h2 style="font-family: inherit; font-size: 1.8rem; font-weight: normal; margin-bottom: 10px;">${title}</h2>
                <div style="width: 40px; height: 1px; background: currentColor; margin: 15px auto; opacity: 0.4;"></div>
                <p class="cover-meta" style="line-height: 1.8;">
                    This volume compiles ${selectedEntryIds.length} memories recorded between<br>
                    <strong>${firstDateStr || 'N/A'}</strong> and <strong>${lastDateStr || 'N/A'}</strong>.
                    <br><br>
                    <em>Hello Diary Sanctuary Edition</em>
                </p>
            `;
        } else if (activePreviewTab === 'inside') {
            if (selectedPageTheme === 'clean-white') previewPage.classList.add('preview-page-clean');
            else if (selectedPageTheme === 'parchment-journal') previewPage.classList.add('preview-page-parchment');
            else if (selectedPageTheme === 'sakura-blush') previewPage.classList.add('preview-page-sakura');
            else if (selectedPageTheme === 'midnight-sky') previewPage.classList.add('preview-page-midnight');
            else if (selectedPageTheme === 'notebook-lined') previewPage.classList.add('preview-page-lined');
            
            let entry = null;
            if (selectedEntryIds.length > 0) {
                entry = cachedEntries.find(e => selectedEntryIds.includes(e.id));
            }
            
            if (!entry) {
                entry = {
                    title: 'A Beautiful Memory',
                    content: '<p>This is a preview of how your diary entries will be styled inside the book. Select one or more entries from the list on the left to include them in your printed edition.</p><p>The typography, page background wallpapers, margins, and headers will align perfectly to create a stunning high-end printed journal.</p>',
                    date: Date.now(),
                    mood: 5,
                    tags: ['preview', 'premium']
                };
            }
            
            const dateStr = new Date(entry.date).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            const MOODS_MAP = { 1: '😢 Awful', 2: '😕 Bad', 3: '😐 Okay', 4: '🙂 Good', 5: '😊 Great' };
            const tagsStr = (entry.tags || []).map(t => `<span class="preview-entry-tag">#${t}</span>`).join(' ');
            
            previewPage.innerHTML = `
                <div class="preview-entry-header">
                    <span class="preview-entry-date">${dateStr}</span>
                    <span class="preview-entry-mood">${MOODS_MAP[entry.mood] || '😐 Okay'}</span>
                </div>
                <h2 class="preview-entry-title">${entry.title || 'Untitled Entry'}</h2>
                ${tagsStr ? `<div class="preview-entry-tags">${tagsStr}</div>` : ''}
                <div class="preview-entry-body">${entry.content || ''}</div>
            `;
        }
    }

    async function compileAndPrintPDF() {
        if (selectedEntryIds.length === 0) {
            showToast('Please select at least one entry to export.');
            return;
        }
        
        showToast('Compiling print edition...');
        
        // Resolve absolute directory containing index.html without trailing slash
        let basePath = window.location.href.split('#')[0].split('?')[0];
        const appPath = basePath.substring(0, basePath.lastIndexOf('/'));
        
        const title = document.getElementById('book-title-input').value || 'Hello Diary';
        const subtitle = document.getElementById('book-subtitle-input').value || 'My Sacred Digital Sanctuary';
        const volume = document.getElementById('book-volume-input').value || 'Volume 1';
        
        // Fetch preferred typography settings
        const prefFont = await HelloDB.getSetting('preferred-font') || 'font-merriweather';
        const prefSize = await HelloDB.getSetting('preferred-size') || 'size-medium';
        
        // Sort entries
        const selectedEntries = cachedEntries.filter(e => selectedEntryIds.includes(e.id)).sort((a,b) => a.date - b.date);
        
        let firstDateStr = '';
        let lastDateStr = '';
        if (selectedEntries.length > 0) {
            firstDateStr = new Date(selectedEntries[0].date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            lastDateStr = new Date(selectedEntries[selectedEntries.length - 1].date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        }
        
        const logoSvg = SVG_TEMPLATES[selectedCoverTheme] || '';
        
        // Cover classes mapping
        let coverClass = 'print-cover-stars';
        if (selectedCoverTheme === 'sakura-garden') coverClass = 'print-cover-sakura';
        else if (selectedCoverTheme === 'autumn-harvest') coverClass = 'print-cover-autumn';
        else if (selectedCoverTheme === 'minimal-zen') coverClass = 'print-cover-zen';
        else if (selectedCoverTheme === 'vintage-typewriter') coverClass = 'print-cover-typewriter';
        
        // Front Cover HTML
        const frontCoverHtml = `
            <div class="${coverClass} front">
                <div class="pdf-cover-logo">${logoSvg}</div>
                <h1>${title}</h1>
                <p class="cover-subtitle">${subtitle}</p>
                <div class="pdf-cover-divider"></div>
                <p class="cover-meta">
                    ${volume} · ${selectedEntries.length} Memor${selectedEntries.length === 1 ? 'y' : 'ies'}<br>
                    Exported on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
            </div>
        `;
        
        // Back Cover HTML
        const backCoverHtml = `
            <div class="${coverClass} back">
                <div class="pdf-cover-logo">${logoSvg}</div>
                <h1 style="font-size: 2.5rem;">${title}</h1>
                <p class="cover-subtitle">${subtitle}</p>
                <div class="pdf-cover-divider"></div>
                <p class="cover-meta" style="line-height: 1.8;">
                    This volume compiles ${selectedEntries.length} memories recorded between<br>
                    <strong>${firstDateStr || 'N/A'}</strong> and <strong>${lastDateStr || 'N/A'}</strong>.
                    <br><br>
                    <em>Hello Diary Sanctuary Edition</em>
                </p>
            </div>
        `;
        
        // Inside Pages HTML
        let insidePagesHtml = '';
        const MOODS_MAP = { 1: '😢 Awful', 2: '😕 Bad', 3: '😐 Okay', 4: '🙂 Good', 5: '😊 Great' };
        
        selectedEntries.forEach(entry => {
            const dateStr = new Date(entry.date).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            const tagsStr = (entry.tags || []).map(t => `<span class="pdf-tag">#${t}</span>`).join(' ');
            
            // Map selectedPageTheme precisely to the correct print page class
            let pageThemeClass = 'page-clean-white';
            if (selectedPageTheme === 'parchment-journal') pageThemeClass = 'page-parchment-journal';
            else if (selectedPageTheme === 'sakura-blush') pageThemeClass = 'page-sakura-blush';
            else if (selectedPageTheme === 'midnight-sky') pageThemeClass = 'page-midnight-sky';
            else if (selectedPageTheme === 'notebook-lined') pageThemeClass = 'page-notebook-lined';
            
            insidePagesHtml += `
                <div class="print-page ${pageThemeClass}">
                    <div class="pdf-entry-header">
                        <span class="pdf-entry-date">${dateStr}</span>
                        <span class="pdf-entry-mood">${MOODS_MAP[entry.mood] || '😐 Okay'}</span>
                    </div>
                    <h2 class="pdf-entry-title">${entry.title || 'Untitled'}</h2>
                    ${tagsStr ? `<div class="pdf-entry-tags">${tagsStr}</div>` : ''}
                    <div class="pdf-entry-body ${prefFont} ${prefSize}">${entry.content || ''}</div>
                </div>
            `;
        });
        
        const printHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>${title} - Print Edition</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Merriweather:ital,wght@0,300;0,400;0,700;1,300;1,400&family=Outfit:wght@300;400;500;600;700&family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=JetBrains+Mono:wght@400;500&family=Caveat:wght@400;700&family=Dancing+Script:wght@400;700&family=Pacifico&family=Lora:ital,wght@0,400;0,600;1,400&family=Roboto:wght@300;400;500;700&family=Montserrat:wght@300;400;500;700&family=Great+Vibes&family=Cinzel:wght@400;700&family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=Comfortaa:wght@400;700&family=Sacramento&family=Special+Elite&family=Amatic+SC:wght@400;700&family=Architects+Daughter&family=Abril+Fatface&family=Poiret+One&family=Josefin+Sans:wght@300;400;600&family=Satisfy&family=Shadows+Into+Light&display=swap" rel="stylesheet">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        @page {
            size: A4 portrait;
            margin: 0;
        }
        
        html, body {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            background: #FFFFFF;
            color: #111111;
            line-height: 1.8;
            font-family: 'Merriweather', Georgia, serif;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        
        .no-print {
            position: fixed;
            top: 20px;
            right: 20px;
            background: #6B7FD7;
            color: #FFFFFF;
            border: none;
            border-radius: 8px;
            padding: 10px 24px;
            font-size: 0.95rem;
            font-family: 'Outfit', sans-serif;
            font-weight: 600;
            cursor: pointer;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            transition: transform 0.2s;
        }
        .no-print:hover {
            transform: scale(1.05);
        }

        /* Cover Common Styles */
        .print-cover-stars, .print-cover-sakura, .print-cover-autumn, .print-cover-zen, .print-cover-typewriter {
            width: 100%;
            height: 100vh;
            page-break-after: always;
            page-break-inside: avoid;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            text-align: center;
            padding: 60px;
            position: relative;
            overflow: hidden;
            box-sizing: border-box;
        }
        .pdf-cover-logo { margin-bottom: 20px; }
        .pdf-cover-divider { width: 80px; height: 3px; background: currentColor; margin: 25px auto; opacity: 0.8; }
        .cover-meta { font-size: 1rem; line-height: 1.8; }

        /* Typography Options */
        .font-merriweather { font-family: 'Merriweather', Georgia, serif; }
        .font-lora { font-family: 'Lora', serif; }
        .font-inter { font-family: 'Inter', sans-serif; }
        .font-caveat { font-family: 'Caveat', cursive; }
        .font-dancing { font-family: 'Dancing Script', cursive; }
        .font-pacifico { font-family: 'Pacifico', cursive; }
        .font-mono { font-family: 'JetBrains Mono', monospace; }
        .font-roboto { font-family: 'Roboto', sans-serif; }
        .font-montserrat { font-family: 'Montserrat', sans-serif; }
        .font-great-vibes { font-family: 'Great Vibes', cursive; }
        .font-cinzel { font-family: 'Cinzel', serif; }
        .font-cormorant { font-family: 'Cormorant Garamond', serif; }
        .font-comfortaa { font-family: 'Comfortaa', cursive; }
        .font-sacramento { font-family: 'Sacramento', cursive; }
        .font-special-elite { font-family: 'Special Elite', cursive; }
        .font-amatic { font-family: 'Amatic SC', cursive; font-weight: 700; }
        .font-playfair { font-family: 'Playfair Display', serif; }
        .font-outfit { font-family: 'Outfit', sans-serif; }
        .font-architects { font-family: 'Architects Daughter', cursive; }
        .font-abril { font-family: 'Abril Fatface', serif; }
        .font-poiret { font-family: 'Poiret One', cursive; font-weight: 600; }
        .font-josefin { font-family: 'Josefin Sans', sans-serif; }
        .font-satisfy { font-family: 'Satisfy', cursive; }
        .font-shadows { font-family: 'Shadows Into Light', cursive; }

        .size-small { font-size: 0.9rem !important; }
        .size-medium { font-size: 1.15rem !important; }
        .size-large { font-size: 1.4rem !important; }

        /* Cover Presets with separate Front and Back images */
        .print-cover-stars {
            background: linear-gradient(135deg, #0d0e2c 0%, #060714 100%) !important;
            background-size: cover !important;
            background-position: center !important;
            color: #FFFFFF !important;
            border: 24px double #F6E27F;
        }
        .print-cover-stars.front {
            background-image: url('${appPath}/front cover/ChatGPT Image Jun 15, 2026, 12_12_35 PM.png') !important;
        }
        .print-cover-stars.back {
            background-image: url('${appPath}/back cover/ChatGPT Image Jun 15, 2026, 05_30_03 PM.png') !important;
        }
        .print-cover-stars::before {
            content: ''; position: absolute; inset: 0; background: rgba(13, 14, 44, 0.45); z-index: 1;
        }
        .print-cover-stars * { position: relative; z-index: 2; }
        .print-cover-stars h1 { font-family: 'Playfair Display', serif; font-size: 3.5rem; color: #F6E27F !important; }
        .print-cover-stars .cover-subtitle { font-family: 'Outfit', sans-serif; text-transform: uppercase; font-size: 1.1rem; letter-spacing: 2px; color: #E2E2E2 !important; }
        .print-cover-stars .cover-meta { color: #A0A5C0 !important; }

        .print-cover-sakura {
            background: linear-gradient(135deg, #FFF2F4 0%, #F8D3D9 100%) !important;
            background-size: cover !important;
            background-position: center !important;
            color: #4A1525 !important;
            border: 16px solid #F8D3D9;
        }
        .print-cover-sakura.front {
            background-image: url('${appPath}/front cover/ChatGPT Image Jun 15, 2026, 12_12_48 PM.png') !important;
        }
        .print-cover-sakura.back {
            background-image: url('${appPath}/back cover/ChatGPT Image Jun 15, 2026, 05_30_14 PM.png') !important;
        }
        .print-cover-sakura::before {
            content: ''; position: absolute; inset: 0; background: rgba(255, 242, 244, 0.25); z-index: 1;
        }
        .print-cover-sakura * { position: relative; z-index: 2; }
        .print-cover-sakura h1 { font-family: 'Dancing Script', cursive; font-size: 4.5rem; color: #4A1525 !important; }
        .print-cover-sakura .cover-subtitle { font-family: 'Outfit', sans-serif; text-transform: uppercase; font-size: 1rem; letter-spacing: 2px; color: #7B3E4D !important; }

        .print-cover-autumn {
            background: linear-gradient(135deg, #E2725B 0%, #7C3626 100%) !important;
            background-size: cover !important;
            background-position: center !important;
            color: #FFFFFF !important;
            border: 12px solid #FFE5B4;
            outline: 4px solid #FFE5B4;
            outline-offset: -24px;
        }
        .print-cover-autumn.front {
            background-image: url('${appPath}/front cover/ChatGPT Image Jun 15, 2026, 12_13_14 PM.png') !important;
        }
        .print-cover-autumn.back {
            background-image: url('${appPath}/back cover/ChatGPT Image Jun 15, 2026, 05_30_36 PM.png') !important;
        }
        .print-cover-autumn::before {
            content: ''; position: absolute; inset: 0; background: rgba(124, 54, 38, 0.35); z-index: 1;
        }
        .print-cover-autumn * { position: relative; z-index: 2; }
        .print-cover-autumn h1 { font-family: 'Playfair Display', serif; font-size: 3.8rem; color: #FFE5B4 !important; }
        .print-cover-autumn .cover-subtitle { font-family: 'Lora', serif; font-style: italic; font-size: 1.1rem; color: #F8D7B0 !important; }

        .print-cover-zen {
            background: linear-gradient(135deg, #F0F2F5 0%, #D3D6DB 100%) !important;
            background-size: cover !important;
            background-position: center !important;
            color: #333333 !important;
            border: 1px solid #999;
        }
        .print-cover-zen.front {
            background-image: url('${appPath}/front cover/ChatGPT Image Jun 15, 2026, 12_14_55 PM.png') !important;
        }
        .print-cover-zen.back {
            background-image: url('${appPath}/back cover/ChatGPT Image Jun 15, 2026, 05_30_49 PM.png') !important;
        }
        .print-cover-zen::before {
            content: ''; position: absolute; inset: 30px; border: 1px solid #BBB; z-index: 1;
        }
        .print-cover-zen * { position: relative; z-index: 2; }
        .print-cover-zen h1 { font-family: 'Outfit', sans-serif; font-size: 3.2rem; font-weight: 300; letter-spacing: 6px; text-transform: uppercase; }
        .print-cover-zen .cover-subtitle { font-family: 'Inter', sans-serif; font-size: 0.95rem; letter-spacing: 4px; color: #666 !important; margin-top: 10px; }

        .print-cover-typewriter {
            background: linear-gradient(135deg, #F4EED9 0%, #D0C5A9 100%) !important;
            background-size: cover !important;
            background-position: center !important;
            color: #3E2723 !important;
            border: 20px double #5D4037;
        }
        .print-cover-typewriter.front {
            background-image: url('${appPath}/front cover/ChatGPT Image Jun 15, 2026, 12_24_44 PM.png') !important;
        }
        .print-cover-typewriter.back {
            background-image: url('${appPath}/back cover/ChatGPT Image Jun 15, 2026, 05_31_08 PM.png') !important;
        }
        .print-cover-typewriter::before {
            content: ''; position: absolute; inset: 24px; border: 2px solid #5D4037; z-index: 1;
        }
        .print-cover-typewriter * { position: relative; z-index: 2; }
        .print-cover-typewriter h1 { font-family: 'Special Elite', cursive; font-size: 3.5rem; }
        .print-cover-typewriter .cover-subtitle { font-family: 'Courier New', monospace; font-size: 1.1rem; letter-spacing: 1px; margin-top: 10px; }

        /* Inside Page Wallpapers */
        .print-page {
            width: 100%;
            min-height: 100vh;
            page-break-after: always;
            page-break-inside: auto;
            padding: 80px 60px;
            position: relative;
            box-sizing: border-box;
        }

        .page-clean-white {
            background: #FCFCFB !important;
            background-image: url('${appPath}/inside pages/ChatGPT Image Jun 15, 2026, 05_31_38 PM.png') !important;
            background-size: cover !important;
            background-position: center !important;
            color: #222222 !important;
            border: 2px solid #EAE6DF;
        }
        .page-clean-white::before {
            content: ''; position: absolute; inset: 20px; border: 1px solid rgba(0,0,0,0.08); pointer-events: none;
        }

        .page-parchment-journal {
            background: #F4EED9 !important;
            background-image: url('${appPath}/inside pages/ChatGPT Image Jun 15, 2026, 05_31_31 PM.png') !important;
            background-size: cover !important;
            background-position: center !important;
            color: #3E2723 !important;
            border: 6px solid #D0C5A9;
        }
        .page-parchment-journal::before {
            content: ''; position: absolute; inset: 12px; border: 1px double rgba(0,0,0,0.12); pointer-events: none;
        }

        .page-sakura-blush {
            background: #FFF2F4 !important;
            background-image: url('${appPath}/inside pages/ChatGPT Image Jun 15, 2026, 05_31_25 PM.png') !important;
            background-size: cover !important;
            background-position: center !important;
            color: #4A1525 !important;
            border: 4px solid #F8D3D9;
        }
        .page-sakura-blush::before {
            content: ''; position: absolute; inset: 12px; border: 1px solid rgba(0,0,0,0.05); pointer-events: none; z-index: 1;
        }
        .page-sakura-blush * { position: relative; z-index: 2; }

        .page-midnight-sky {
            background: #0B0C16 !important;
            background-image: url('${appPath}/inside pages/ChatGPT Image Jun 15, 2026, 05_31_19 PM.png') !important;
            background-size: cover !important;
            background-position: center !important;
            color: #FFFFFF !important;
            border: 4px solid #1A1D36;
        }
        .page-midnight-sky::before {
            content: ''; position: absolute; inset: 12px; border: 1px solid rgba(255,255,255,0.15); pointer-events: none; z-index: 1;
        }
        .page-midnight-sky * { position: relative; z-index: 2; }

        .page-notebook-lined {
            background: #FCFBF7 !important;
            background-image: url('${appPath}/inside pages/ChatGPT Image Jun 15, 2026, 05_31_44 PM.png') !important;
            background-size: cover !important;
            background-position: center !important;
            padding-left: 80px !important;
            border: 2px solid #EAE6DF;
            color: #222222 !important;
        }
        .page-notebook-lined::before {
            content: ''; position: absolute; left: 60px; top: 0; bottom: 0; width: 1.5px; background: rgba(255,0,0,0.15); pointer-events: none;
        }

        /* Entries layout in print */
        .pdf-entry-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            font-size: 0.9rem;
            font-family: 'Outfit', sans-serif;
            font-weight: 500;
            opacity: 0.8;
            page-break-after: avoid;
        }
        .pdf-entry-title {
            font-family: 'Playfair Display', serif;
            font-size: 2.2rem;
            margin-bottom: 15px;
            line-height: 1.4;
            page-break-after: avoid;
        }
        .pdf-entry-tags {
            margin-bottom: 25px;
        }
        .pdf-tag {
            display: inline-block;
            background: rgba(0,0,0,0.05);
            padding: 3px 12px;
            border-radius: 12px;
            font-size: 0.8rem;
            margin-right: 8px;
            font-family: 'Outfit', sans-serif;
            font-weight: 500;
        }
        .page-midnight-sky .pdf-tag {
            background: rgba(255,255,255,0.1) !important;
        }
        .pdf-entry-body {
            line-height: 1.8;
        }
        .pdf-entry-body p {
            margin-bottom: 16px;
        }
        .pdf-entry-body blockquote {
            border-left: 4px solid #6B7FD7;
            padding-left: 20px;
            font-style: italic;
            margin: 20px 0;
            opacity: 0.85;
        }
        .pdf-entry-body img {
            max-width: 100%;
            border-radius: 10px;
            margin: 20px 0;
            page-break-inside: avoid;
        }

        @media print {
            .no-print { display: none !important; }
            body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
        }
    </style>
</head>
<body>
    <button class="no-print" onclick="window.print()">Print / Save PDF</button>
    ${frontCoverHtml}
    ${insidePagesHtml}
    ${backCoverHtml}
</body>
</html>
        `;
        
        const win = window.open('', '_blank');
        if (win) {
            win.document.write(printHtml);
            win.document.close();
            setTimeout(() => {
                win.focus();
                win.print();
            }, 800);
        } else {
            showToast('Popup blocker active. Please allow popups.');
        }
    }

    function initBookCreator() {
        // Back/Close Button
        const closeBtn = document.getElementById('btn-creator-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                showScreen('screen-dashboard');
                if (window.switchDashboardView) {
                    window.switchDashboardView('timeline');
                }
            });
        }
        
        // Title, Subtitle, Volume changes
        ['book-title-input', 'book-subtitle-input', 'book-volume-input'].forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                input.addEventListener('input', () => {
                    updateBookPreview();
                });
            }
        });
        
        // Cover Preset cards click
        document.querySelectorAll('#screen-book-creator [data-cover]').forEach(card => {
            card.addEventListener('click', () => {
                document.querySelectorAll('#screen-book-creator [data-cover]').forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                selectedCoverTheme = card.getAttribute('data-cover');
                updateBookPreview();
            });
        });
        
        // Inside Page Preset cards click
        document.querySelectorAll('#screen-book-creator [data-page]').forEach(card => {
            card.addEventListener('click', () => {
                document.querySelectorAll('#screen-book-creator [data-page]').forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                selectedPageTheme = card.getAttribute('data-page');
                updateBookPreview();
            });
        });
        
        // Preview tabs click
        document.querySelectorAll('#screen-book-creator .preview-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('#screen-book-creator .preview-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                activePreviewTab = tab.getAttribute('data-view');
                updateBookPreview();
            });
        });
        
        // Filters
        const moodFilter = document.getElementById('creator-filter-mood');
        if (moodFilter) {
            moodFilter.addEventListener('change', () => {
                renderCreatorEntriesList();
            });
        }
        
        const tagFilter = document.getElementById('creator-filter-tag');
        if (tagFilter) {
            tagFilter.addEventListener('change', () => {
                renderCreatorEntriesList();
            });
        }
        
        // Bulk actions
        const selectAllBtn = document.getElementById('btn-creator-select-all');
        if (selectAllBtn) {
            selectAllBtn.addEventListener('click', () => {
                const checkboxes = document.querySelectorAll('#creator-entries-list input[type="checkbox"]');
                checkboxes.forEach(cb => {
                    if (!cb.checked) {
                        cb.checked = true;
                        cb.dispatchEvent(new Event('change'));
                    }
                });
            });
        }
        
        const selectNoneBtn = document.getElementById('btn-creator-select-none');
        if (selectNoneBtn) {
            selectNoneBtn.addEventListener('click', () => {
                const checkboxes = document.querySelectorAll('#creator-entries-list input[type="checkbox"]');
                checkboxes.forEach(cb => {
                    if (cb.checked) {
                        cb.checked = false;
                        cb.dispatchEvent(new Event('change'));
                    }
                });
            });
        }
        
        // Generate Button
        const genBtn = document.getElementById('btn-creator-generate');
        if (genBtn) {
            genBtn.addEventListener('click', () => {
                compileAndPrintPDF();
            });
        }
    }

    function initStep8Features() {
        // Backup JSON Button
        const backupBtn = document.getElementById('btn-backup-json');
        if (backupBtn) {
            backupBtn.addEventListener('click', async () => {
                showToast('Generating backup...');
                try {
                    const entries = await HelloDB.getAllRawEntries();
                    const settings = await HelloDB.getAllSettings();
                    
                    const payload = {
                        app: 'Hello Diary',
                        version: '1.0.0',
                        exportDate: new Date().toISOString(),
                        entries: entries,
                        settings: settings
                    };
                    
                    const json = JSON.stringify(payload, null, 2);
                    const dateStr = new Date().toISOString().slice(0, 10);
                    const blob = new Blob([json], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `hello-diary-backup-${dateStr}.json`;
                    document.body.appendChild(a);
                    a.click();
                    setTimeout(() => {
                        URL.revokeObjectURL(url);
                        a.remove();
                    }, 100);
                    
                    showToast(`Exported ${entries.length} entries. ✓`);
                } catch (err) {
                    console.error('Backup failed:', err);
                    showToast('Backup generation failed.');
                }
            });
        }
        
        // Restore JSON Button
        const restoreBtn = document.getElementById('btn-restore-json');
        const fileInput = document.getElementById('restore-json-input');
        if (restoreBtn && fileInput) {
            restoreBtn.addEventListener('click', () => {
                fileInput.click();
            });
            
            fileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                
                const reader = new FileReader();
                reader.onload = async (event) => {
                    try {
                        const data = JSON.parse(event.target.result);
                        
                        // Verification 1: Check App Header
                        if (!data || data.app !== 'Hello Diary') {
                            showToast('Invalid backup file format.', 'error');
                            return;
                        }
                        
                        // Verification 2: Check active decryption credentials
                        if (data.entries && data.entries.length > 0) {
                            // Find the most recent entry
                            const sorted = [...data.entries].sort((a,b) => b.date - a.date);
                            const testEntry = sorted[0];
                            try {
                                // Try decrypting it with current session key
                                await HelloCrypto.decryptString(testEntry.payload, testEntry.iv, sessionKey);
                            } catch (decErr) {
                                console.error('Backup decryption check failed:', decErr);
                                showToast('Passcode mismatch. Restore aborted.', 'error');
                                return;
                            }
                        }
                        
                        // Proceed to write
                        showToast('Restoring memories...');
                        
                        if (data.entries) {
                            for (const entry of data.entries) {
                                await HelloDB.restoreRawEntry(entry);
                            }
                        }
                        
                        if (data.settings) {
                            for (const setting of data.settings) {
                                // Skip auth_config so we don't lock the user out if they restored a system setting
                                if (setting.key === 'auth_config') continue;
                                await HelloDB.restoreSetting(setting);
                            }
                        }
                        
                        showToast('Sanctuary restored successfully! ✓');
                        await loadAndRenderDashboard();
                    } catch (parseErr) {
                        console.error('Restore failed:', parseErr);
                        showToast('Failed to parse backup JSON.');
                    }
                    fileInput.value = '';
                };
                reader.readAsText(file);
            });
        }
        
        // Export PDF Button
        const exportPdfBtn = document.getElementById('btn-export-pdf');
        if (exportPdfBtn) {
            exportPdfBtn.addEventListener('click', () => {
                openBookCreator();
            });
        }
        
        // Modal PDF Button
        const modalPdfBtn = document.getElementById('btn-view-modal-pdf');
        if (modalPdfBtn) {
            modalPdfBtn.addEventListener('click', () => {
                if (activeEntryId) {
                    openBookCreator(activeEntryId);
                } else {
                    openBookCreator();
                }
            });
        }
        
        // Pull to Refresh Gestures
        const timelineView = document.getElementById('view-timeline');
        const spinner = document.getElementById('pull-to-refresh-spinner');
        if (timelineView && spinner) {
            let startY = 0;
            let currentY = 0;
            let isDragging = false;
            
            timelineView.addEventListener('touchstart', (e) => {
                if (timelineView.scrollTop === 0) {
                    startY = e.touches[0].clientY;
                    currentY = startY;
                    isDragging = true;
                    spinner.style.transition = 'none';
                }
            }, { passive: true });
            
            timelineView.addEventListener('touchmove', (e) => {
                if (!isDragging) return;
                currentY = e.touches[0].clientY;
                const diffY = currentY - startY;
                
                if (diffY > 0 && timelineView.scrollTop === 0) {
                    const heightVal = Math.min(diffY * 0.4, 50);
                    spinner.style.height = `${heightVal}px`;
                    spinner.style.opacity = Math.min(diffY / 100, 1);
                } else {
                    isDragging = false;
                    spinner.style.height = '0px';
                    spinner.style.opacity = '0';
                }
            }, { passive: true });
            
            timelineView.addEventListener('touchend', async (e) => {
                if (!isDragging) return;
                isDragging = false;
                
                spinner.style.transition = 'height 0.25s ease, opacity 0.25s ease';
                const diffY = currentY - startY;
                const heightVal = Math.min(diffY * 0.4, 50);
                
                if (heightVal >= 25) {
                    spinner.style.height = '40px';
                    spinner.style.opacity = '1';
                    
                    try {
                        await loadAndRenderDashboard();
                        showToast('Memories updated! ✓');
                    } catch (err) {
                        console.error('Refresh failed:', err);
                    }
                    
                    setTimeout(() => {
                        spinner.style.height = '0px';
                        spinner.style.opacity = '0';
                    }, 800);
                } else {
                    spinner.style.height = '0px';
                    spinner.style.opacity = '0';
                }
            }, { passive: true });
        }
    }

    // Public controller exports
    return {
        init,
        getSessionKey,
        showScreen,
        checkLockoutState,
        loadAndRenderDashboard,
        renderAnalytics,
        openBookCreator
    };

})();

window.HelloApp = HelloApp;

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    HelloApp.init();
});
