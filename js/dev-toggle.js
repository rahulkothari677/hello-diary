/* ==========================================================================
   Hello Diary — Developer Toggle & Theme Setup (Step 1 Preview)
   Manages dynamic rendering of the 24 themes and floating screen switcher.
   ========================================================================== */

'use strict';

// 24 Theme Definitions
const THEMES = [
    { id: 'serene-dawn', name: 'Serene Dawn', emoji: '🌅', category: 'Nature', accent: '#6B7FD7', bg: '#FAFAF8', isImage: true },
    { id: 'midnight-abyss', name: 'Midnight Abyss', emoji: '🌑', category: 'Cosmos', accent: '#9D7CFC', bg: '#0B0D17', isImage: true },
    { id: 'aurora-borealis', name: 'Aurora Borealis', emoji: '🌌', category: 'Cosmos', accent: '#52FFD3', bg: '#0F0F23', isImage: true },
    { id: 'sakura-garden', name: 'Sakura Garden', emoji: '🌸', category: 'Nature', accent: '#FA6082', bg: '#FFF5F5', isImage: true },
    { id: 'forest-sanctuary', name: 'Forest Sanctuary', emoji: '🌿', category: 'Nature', accent: '#438A5E', bg: '#F4F6F0', isImage: true },
    { id: 'ocean-depths', name: 'Ocean Depths', emoji: '🌊', category: 'Nature', accent: '#3EC5EC', bg: '#050E1A', isImage: true },
    { id: 'golden-hour', name: 'Golden Hour', emoji: '🌇', category: 'Nature', accent: '#E58C3D', bg: '#150F0B', isImage: true },
    { id: 'lavender-dream', name: 'Lavender Dream', emoji: '💜', category: 'Nature', accent: '#8E65DC', bg: '#F6F4FB', isImage: true },
    { id: 'cosmic-universe', name: 'Cosmic Universe', emoji: '🪐', category: 'Cosmos', accent: '#765CFE', bg: '#050410', isImage: true },
    { id: 'sports-arena', name: 'Sports Arena', emoji: '🏟️', category: 'Lifestyle', accent: '#E53E3E', bg: '#120505', isImage: true },
    { id: 'animal-kingdom', name: 'Animal Kingdom', emoji: '🦁', category: 'Nature', accent: '#CE9C4B', bg: '#140E05', isImage: true },
    { id: 'love-romance', name: 'Love & Romance', emoji: '❤️', category: 'Mood', accent: '#E52F5A', bg: '#FFF0F2', isImage: true },
    { id: 'futuristic-neon', name: 'Futuristic Neon', emoji: '🤖', category: 'Sci-Fi', accent: '#00E5FF', bg: '#03040C', isImage: true },
    { id: 'imagination', name: 'Imagination', emoji: '🦋', category: 'Creative', accent: '#2FC3B2', bg: '#080D16', isImage: true },
    { id: 'mountain-peak', name: 'Mountain Peak', emoji: '🏔️', category: 'Nature', accent: '#4A90D9', bg: '#EFF4F8', isImage: true },
    { id: 'rainy-day', name: 'Rainy Day', emoji: '🌧️', category: 'Mood', accent: '#6E9EBA', bg: '#13171F', isImage: true },
    
    // 8 New Premium Themes
    { id: 'vintage-typewriter', name: 'Vintage Typewriter', emoji: '📜', category: 'Retro', accent: '#8A5A36', bg: '#F4EFE6', isImage: true },
    { id: 'cherry-blossom-night', name: 'Plum Sakura', emoji: '🌙', category: 'Nature', accent: '#FF85C8', bg: '#1C0A15', isImage: true },
    { id: 'arctic-aurora', name: 'Arctic Ice', emoji: '❄️', category: 'Cosmos', accent: '#00FF9D', bg: '#040E1B', isImage: true },
    { id: 'tropical-paradise', name: 'Tropical Surf', emoji: '🌴', category: 'Nature', accent: '#FF6F59', bg: '#091B24', isImage: true },
    { id: 'steampunk', name: 'Steampunk Gears', emoji: '⚙️', category: 'Retro', accent: '#D4AF37', bg: '#191410', isImage: true },
    { id: 'minimal-zen', name: 'Minimal Zen', emoji: '🧘', category: 'Minimal', accent: '#222222', bg: '#FFFFFF', isImage: true },
    { id: 'royal-purple', name: 'Royal Velvet', emoji: '👑', category: 'Luxury', accent: '#D4AF37', bg: '#12041C', isImage: true },
    { id: 'autumn-harvest', name: 'Cozy Autumn', emoji: '🍁', category: 'Nature', accent: '#E05A1F', bg: '#1C0C04', isImage: true }
];

function hexToRgba(hex, alpha) {
    let r = 0, g = 0, b = 0;
    if (!hex) return `rgba(0, 0, 0, ${alpha})`;
    if (hex.length === 4) {
        r = parseInt(hex[1] + hex[1], 16);
        g = parseInt(hex[2] + hex[2], 16);
        b = parseInt(hex[3] + hex[3], 16);
    } else if (hex.length === 7) {
        r = parseInt(hex.substring(1, 3), 16);
        g = parseInt(hex.substring(3, 5), 16);
        b = parseInt(hex.substring(5, 7), 16);
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
window.hexToRgba = hexToRgba;
window.THEMES = THEMES;

// Switch Theme functionality
function applyTheme(themeId) {
    const theme = THEMES.find(t => t.id === themeId);
    if (!theme) return;
    
    document.documentElement.setAttribute('data-theme', themeId);
    localStorage.setItem('hello-diary-theme', themeId);
    
    // Custom theme variables support
    const root = document.documentElement;
    if (theme.colors) {
        root.style.setProperty('--bg-primary', theme.colors.primary);
        root.style.setProperty('--bg-secondary', theme.colors.secondary);
        root.style.setProperty('--text-primary', theme.colors.text);
        root.style.setProperty('--accent', theme.colors.accent);
        root.style.setProperty('--bg-card', hexToRgba(theme.colors.primary, 0.82));
        root.style.setProperty('--bg-card-hover', hexToRgba(theme.colors.primary, 0.95));
        root.style.setProperty('--accent-soft', hexToRgba(theme.colors.accent, 0.12));
        root.style.setProperty('--accent-glow', hexToRgba(theme.colors.accent, 0.3));
        root.style.setProperty('--glass-bg', hexToRgba(theme.colors.primary, 0.65));
        root.style.setProperty('--text-secondary', hexToRgba(theme.colors.text, 0.7));
        root.style.setProperty('--text-muted', hexToRgba(theme.colors.text, 0.5));
    } else {
        root.style.removeProperty('--bg-primary');
        root.style.removeProperty('--bg-secondary');
        root.style.removeProperty('--text-primary');
        root.style.removeProperty('--accent');
        root.style.removeProperty('--bg-card');
        root.style.removeProperty('--bg-card-hover');
        root.style.removeProperty('--accent-soft');
        root.style.removeProperty('--accent-glow');
        root.style.removeProperty('--glass-bg');
        root.style.removeProperty('--text-secondary');
        root.style.removeProperty('--text-muted');
    }
    
    // Update theme-color metadata
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme.accent);
    
    // Toggle active state in pickers
    document.querySelectorAll('.theme-swatch-card').forEach(card => {
        card.classList.toggle('active', card.dataset.themeId === themeId);
    });
    
    console.log(`Switched to Theme: ${theme.name}`);

    // Update particle layers
    if (window.HelloParticles) {
        window.HelloParticles.updateTheme(themeId);
    }
}

// Populate Theme Gallery
function populateThemeGallery(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const currentTheme = localStorage.getItem('hello-diary-theme') || 'serene-dawn';
    
    // Generate markup for all 24 themes
    const html = THEMES.map(theme => {
        const isActive = theme.id === currentTheme;
        const bgStyle = theme.isImage 
            ? `background-image: url('images/themes/${theme.id}.png'); background-color: ${theme.bg};`
            : `background: ${theme.bg}; filter: brightness(0.95);`;
            
        return `
            <div class="theme-swatch-card ${isActive ? 'active' : ''}" data-theme-id="${theme.id}" style="--theme-accent: ${theme.accent}">
                <div class="theme-swatch-thumbnail" style="${bgStyle}">
                    <div class="theme-swatch-dot" style="background: ${theme.accent};"></div>
                </div>
                <div class="theme-swatch-info">
                    <span class="theme-swatch-icon">${theme.emoji}</span>
                    <span class="theme-swatch-label">${theme.name}</span>
                </div>
            </div>
        `;
    }).join('');
    
    // Add layout grid css styles dynamically if not existing
    if (!document.getElementById('theme-gallery-internal-styles')) {
        const style = document.createElement('style');
        style.id = 'theme-gallery-internal-styles';
        style.textContent = `
            .theme-swatch-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
                gap: var(--space-md);
                padding: var(--space-sm) 0;
            }
            .theme-swatch-card {
                background: rgba(128, 128, 128, 0.04);
                border: 1.5px solid var(--border);
                border-radius: var(--radius-md);
                overflow: hidden;
                cursor: pointer;
                transition: all var(--transition-fast) var(--spring-transition);
                position: relative;
            }
            .theme-swatch-card:hover {
                transform: translateY(-4px);
                border-color: var(--theme-accent);
                box-shadow: 0 4px 12px rgba(128,128,128,0.1);
            }
            .theme-swatch-card.active {
                border-color: var(--theme-accent);
                box-shadow: 0 0 0 2px var(--theme-accent);
            }
            .theme-swatch-thumbnail {
                width: 100%;
                height: 70px;
                background-size: cover;
                background-position: center;
                position: relative;
            }
            .theme-swatch-dot {
                position: absolute;
                bottom: 8px;
                left: 8px;
                width: 14px;
                height: 14px;
                border-radius: 50%;
                border: 2px solid #FFFFFF;
                box-shadow: 0 2px 6px rgba(0,0,0,0.15);
            }
            .theme-swatch-info {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 10px 8px;
            }
            .theme-swatch-icon {
                font-size: 1.15rem;
            }
            .theme-swatch-label {
                font-size: 0.76rem;
                font-weight: 600;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                color: var(--text-primary);
            }
        `;
        document.head.appendChild(style);
    }
    
    container.innerHTML = `<div class="theme-swatch-grid">${html}</div>`;
    
    // Add Click Listeners
    container.querySelectorAll('.theme-swatch-card').forEach(card => {
        card.addEventListener('click', () => {
            applyTheme(card.dataset.themeId);
        });
    });
}

// Set up UI Screen Toggles
function setupScreenSwitcher() {
    // Create Developer Switches Panel
    const devPanel = document.createElement('div');
    devPanel.id = 'dev-screens-toggle-panel';
    devPanel.style.cssText = `
        position: fixed;
        bottom: 16px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(15, 15, 25, 0.85);
        backdrop-filter: blur(16px);
        border: 1px solid rgba(255,255,255,0.15);
        border-radius: var(--radius-full);
        padding: 8px 16px;
        display: flex;
        align-items: center;
        gap: 12px;
        z-index: 9999;
        box-shadow: 0 10px 32px rgba(0,0,0,0.5);
    `;
    
    const label = document.createElement('span');
    label.textContent = '🛠️ Dev Switcher:';
    label.style.cssText = `
        font-size: 0.72rem;
        font-weight: 700;
        color: #FFFFFF;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        opacity: 0.75;
    `;
    devPanel.appendChild(label);
    
    const select = document.createElement('select');
    select.style.cssText = `
        background: transparent;
        border: none;
        color: #FFFFFF;
        font-family: inherit;
        font-size: 0.82rem;
        font-weight: 600;
        outline: none;
        cursor: pointer;
    `;
    
    const screens = [
        { id: 'screen-lock', label: '1. Lock Screen' },
        { id: 'screen-setup', label: '2. Setup Screen' },
        { id: 'screen-dashboard', label: '3. Dashboard (Timeline)' },
        { id: 'screen-dashboard:calendar', label: '3b. Dashboard (Calendar)' },
        { id: 'screen-dashboard:analytics', label: '3c. Dashboard (Insights)' },
        { id: 'screen-dashboard:settings', label: '3d. Dashboard (Settings)' },
        { id: 'screen-editor', label: '4. Entry Editor' }
    ];
    
    screens.forEach(scr => {
        const opt = document.createElement('option');
        opt.value = scr.id;
        opt.textContent = scr.label;
        opt.style.color = '#000000';
        select.appendChild(opt);
    });
    
    devPanel.appendChild(select);
    document.body.appendChild(devPanel);
    
    // Handle switching
    select.addEventListener('change', (e) => {
        const value = e.target.value;
        const [screenId, viewId] = value.split(':');
        
        // Hide all screens
        document.querySelectorAll('.screen').forEach(scr => {
            scr.classList.remove('active');
        });
        
        // Show target screen
        const targetScreen = document.getElementById(screenId);
        if (targetScreen) {
            targetScreen.classList.add('active');
        }
        
        // If we switched to dashboard view
        if (screenId === 'screen-dashboard' && viewId) {
            switchDashboardView(viewId);
        }
    });
}

function switchDashboardView(viewId) {
    // Hide all view containers
    document.querySelectorAll('#screen-dashboard .view-container').forEach(view => {
        view.style.display = 'none';
    });
    
    // Show target view container
    const targetView = document.getElementById(`view-${viewId}`);
    if (targetView) {
        targetView.style.display = 'block';
    }
    
    // Update headers and active state triggers in side navigation
    const titleHeader = document.getElementById('dashboard-title');
    if (titleHeader) {
        titleHeader.textContent = viewId.charAt(0).toUpperCase() + viewId.slice(1);
    }
    
    // Sync active sidebar item
    document.querySelectorAll('#sidebar-panel .nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.view === viewId);
    });
    
    // Sync active mobile navigation bottom item
    document.querySelectorAll('#screen-dashboard .bottom-nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.view === viewId);
    });

    // Redraw SVG charts if switching to analytics tab
    if (viewId === 'analytics' && window.HelloApp && window.HelloApp.renderAnalytics) {
        window.HelloApp.renderAnalytics();
    }

    if (viewId === 'gallery' && window.HelloApp && window.HelloApp.renderGallery) {
        window.HelloApp.renderGallery();
    }



    // Refresh intruder logs if switching to settings tab
    if (viewId === 'settings' && window.HelloApp && window.HelloApp.refreshIntruderLogsUI) {
        window.HelloApp.refreshIntruderLogsUI();
    }
}

// On Loaded Initialization
document.addEventListener('DOMContentLoaded', () => {
    // Apply current theme
    const currentTheme = localStorage.getItem('hello-diary-theme') || 'serene-dawn';
    applyTheme(currentTheme);
    
    // Populate both pickers
    populateThemeGallery('theme-picker-setup');
    populateThemeGallery('theme-picker-settings');
    
    // Setup Switcher Panel
    setupScreenSwitcher();
    
    // Add basic UI listeners for click events
    
    // Dashboard sidebar navigation tab switches
    document.querySelectorAll('#sidebar-panel .nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const view = item.dataset.view;
            if (view) {
                switchDashboardView(view);
                // Update select element in dev panel if visible
                const devSelect = document.querySelector('#dev-screens-toggle-panel select');
                if (devSelect) {
                    devSelect.value = `screen-dashboard:${view}`;
                }
            }
        });
    });
    
    // Bottom mobile navigation item switches
    document.querySelectorAll('#screen-dashboard .bottom-nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            // Check if it's the fab button click
            if (item.classList.contains('bottom-nav-item--fab')) return;
            
            const view = item.dataset.view;
            if (view) {
                switchDashboardView(view);
                // Update select element in dev panel
                const devSelect = document.querySelector('#dev-screens-toggle-panel select');
                if (devSelect) {
                    devSelect.value = `screen-dashboard:${view}`;
                }
            }
        });
    });

    // Handle Hamburger Open/Close drawer drawer
    const hamburger = document.getElementById('btn-hamburger');
    const sidebar = document.getElementById('sidebar-panel');
    const overlay = document.getElementById('sidebar-overlay');
    
    if (hamburger && sidebar && overlay) {
        hamburger.addEventListener('click', () => {
            sidebar.classList.add('open');
            overlay.classList.add('active');
        });
        
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('open');
            overlay.classList.remove('active');
        });
        
        // Hide sidebar drawer when clicking sidebar navigation links
        sidebar.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                sidebar.classList.remove('open');
                overlay.classList.remove('active');
            });
        });
    }

    if (!window.HelloApp) {
        // Modal view entry details mock bindings (for all entry cards)
        const viewModal = document.getElementById('modal-view-entry');
        const viewClose = document.getElementById('btn-view-modal-close');
        const viewDone = document.getElementById('btn-view-modal-done');
        const viewEdit = document.getElementById('btn-view-modal-edit');
        
        document.querySelectorAll('.entries-grid > div').forEach(card => {
            card.addEventListener('click', () => {
                if (viewModal) {
                    // Populate modal content from card if needed
                    const title = card.querySelector('h3').textContent;
                    const date = card.querySelector('span').textContent;
                    const mood = card.querySelector('span:last-child').textContent;
                    const body = card.querySelector('p').textContent;
                    
                    document.getElementById('view-modal-title').textContent = title;
                    document.getElementById('view-modal-subtitle').textContent = `${date} · ${mood}`;
                    document.getElementById('view-modal-body').textContent = body;
                    
                    viewModal.classList.add('active');
                }
            });
        });
        
        if (viewClose && viewDone && viewModal) {
            [viewClose, viewDone].forEach(btn => {
                btn.addEventListener('click', () => {
                    viewModal.classList.remove('active');
                });
            });
        }

        // Modal Edit Entry button triggers screen transition to Editor
        if (viewEdit && viewModal) {
            viewEdit.addEventListener('click', () => {
                viewModal.classList.remove('active');
                document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
                document.getElementById('screen-editor').classList.add('active');
                
                // Populate editor fields as mock
                document.getElementById('rich-editor-field').innerHTML = `<h1>${document.getElementById('view-modal-title').textContent}</h1><p>${document.getElementById('view-modal-body').textContent}</p>`;
                
                const devSelect = document.querySelector('#dev-screens-toggle-panel select');
                if (devSelect) devSelect.value = 'screen-editor';
            });
        }

        // Editor Back button triggers transition to Dashboard Timeline
        const editorBack = document.getElementById('btn-editor-back');
        if (editorBack) {
            editorBack.addEventListener('click', () => {
                document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
                document.getElementById('screen-dashboard').classList.add('active');
                switchDashboardView('timeline');
                
                const devSelect = document.querySelector('#dev-screens-toggle-panel select');
                if (devSelect) devSelect.value = 'screen-dashboard';
                showToast('Entry auto-saved successfully! ✓');
            });
        }

        // New Entry FAB buttons trigger transition to Editor
        const fabBtn = document.getElementById('btn-fab-new-entry');
        const mobFabBtn = document.getElementById('btn-mobile-fab');
        const openEditor = () => {
            document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
            document.getElementById('screen-editor').classList.add('active');
            
            // Reset editor fields
            document.getElementById('rich-editor-field').innerHTML = '';
            
            const devSelect = document.querySelector('#dev-screens-toggle-panel select');
            if (devSelect) devSelect.value = 'screen-editor';
        };
        if (fabBtn) fabBtn.addEventListener('click', openEditor);
        if (mobFabBtn) mobFabBtn.addEventListener('click', openEditor);

        // Add Tag Modal behavior
        const addTagBtn = document.getElementById('btn-editor-add-tag');
        const tagModal = document.getElementById('modal-add-tag');
        const tagCancel = document.getElementById('btn-tag-modal-cancel');
        const tagAddConfirm = document.getElementById('btn-tag-modal-add');
        const tagInput = document.getElementById('tag-modal-input');
        const tagsList = document.getElementById('editor-tags-list');
        
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
        
        const appendTagPill = (tagName) => {
            if (!tagName) return;
            const formatted = tagName.trim().toLowerCase().replace('#', '');
            if (!formatted) return;
            
            const pill = document.createElement('span');
            pill.className = 'tag-pill';
            pill.innerHTML = `#${formatted} <button class="tag-remove">&times;</button>`;
            
            // delete tag behavior
            pill.querySelector('.tag-remove').addEventListener('click', () => {
                pill.remove();
            });
            
            tagsList.appendChild(pill);
        };

        if (tagAddConfirm && tagModal && tagInput) {
            tagAddConfirm.addEventListener('click', () => {
                appendTagPill(tagInput.value);
                tagModal.classList.remove('active');
            });
            tagInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    appendTagPill(tagInput.value);
                    tagModal.classList.remove('active');
                }
            });
        }

        // Preset tag suggestions
        document.querySelectorAll('.tag-suggestion').forEach(btn => {
            btn.addEventListener('click', () => {
                appendTagPill(btn.dataset.tag);
                if (tagModal) tagModal.classList.remove('active');
            });
        });

        // Delete Entry confirm dialog mock behavior
        const deleteBtn = document.getElementById('btn-editor-delete');
        const confirmModal = document.getElementById('modal-confirm');
        const confirmCancel = document.getElementById('btn-confirm-cancel');
        const confirmOk = document.getElementById('btn-confirm-ok');
        
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
            confirmOk.addEventListener('click', () => {
                confirmModal.classList.remove('active');
                document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
                document.getElementById('screen-dashboard').classList.add('active');
                switchDashboardView('timeline');
                
                const devSelect = document.querySelector('#dev-screens-toggle-panel select');
                if (devSelect) devSelect.value = 'screen-dashboard';
                showToast('Entry deleted successfully.');
            });
        }
    }

    // Setup screen navigation buttons flow (only if production HelloApp is not active)
    if (!window.HelloApp) {
        const next1 = document.getElementById('btn-setup-next-1');
        const next2 = document.getElementById('btn-setup-next-2');
        const back2 = document.getElementById('btn-setup-back-2');
        const back3 = document.getElementById('btn-setup-back-3');
        const finishSetup = document.getElementById('btn-setup-finish');
        
        const setupStep1 = document.getElementById('setup-step-1');
        const setupStep2 = document.getElementById('setup-step-2');
        const setupStep3 = document.getElementById('setup-step-3');
        const progressFill = document.getElementById('setup-progress-fill');
        
        if (next1 && setupStep1 && setupStep2 && progressFill) {
            next1.addEventListener('click', () => {
                setupStep1.classList.remove('active');
                setupStep2.classList.add('active');
                progressFill.style.width = '66.6%';
                
                // Sync step 2 title based on selected method
                const selectedMethod = document.querySelector('.security-option.selected').dataset.method;
                const titleEl = document.getElementById('setup-step-2-title');
                const descEl = document.getElementById('setup-step-2-desc');
                const pinArea = document.getElementById('setup-pin-container');
                const patArea = document.getElementById('setup-pattern-container');
                
                if (selectedMethod === 'pin') {
                    titleEl.textContent = 'Step 2: Create a PIN';
                    descEl.textContent = 'Input a secure 6-digit PIN code.';
                    pinArea.style.display = 'flex';
                    patArea.style.display = 'none';
                } else {
                    titleEl.textContent = 'Step 2: Draw a Pattern';
                    descEl.textContent = 'Draw a pattern connecting at least 4 nodes.';
                    pinArea.style.display = 'none';
                    patArea.style.display = 'flex';
                }
            });
        }
        
        if (back2 && setupStep1 && setupStep2 && progressFill) {
            back2.addEventListener('click', () => {
                setupStep2.classList.remove('active');
                setupStep1.classList.add('active');
                progressFill.style.width = '33.3%';
            });
        }
        
        if (next2 && setupStep2 && setupStep3 && progressFill) {
            next2.addEventListener('click', () => {
                setupStep2.classList.remove('active');
                setupStep3.classList.add('active');
                progressFill.style.width = '100%';
            });
        }
        
        if (back3 && setupStep2 && setupStep3 && progressFill) {
            back3.addEventListener('click', () => {
                setupStep3.classList.remove('active');
                setupStep2.classList.add('active');
                progressFill.style.width = '66.6%';
            });
        }
        
        if (finishSetup) {
            finishSetup.addEventListener('click', () => {
                document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
                document.getElementById('screen-dashboard').classList.add('active');
                switchDashboardView('timeline');
                
                const devSelect = document.querySelector('#dev-screens-toggle-panel select');
                if (devSelect) devSelect.value = 'screen-dashboard';
                showToast('Setup complete! Welcome to Hello Diary ✨');
            });
        }

        // Toggle card selection in Setup Step 1
        document.querySelectorAll('.security-option').forEach(card => {
            card.addEventListener('click', () => {
                document.querySelectorAll('.security-option').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
            });
        });
        
        // Auth Lock Pin Dots mock display behavior
        let enteredPin = '';
        const pinDots = document.querySelectorAll('#screen-lock .pin-dot');
        document.querySelectorAll('#screen-lock .pin-key').forEach(key => {
            key.addEventListener('click', () => {
                const val = key.dataset.value;
                if (val === 'back') {
                    enteredPin = enteredPin.slice(0, -1);
                } else if (enteredPin.length < 6) {
                    enteredPin += val;
                }
                
                // Render dot active states
                pinDots.forEach((dot, idx) => {
                    dot.classList.toggle('filled', idx < enteredPin.length);
                });
                
                // Clear message
                document.getElementById('pin-error-msg').textContent = '';
                
                // Check if entered pin matches mock passcode
                if (enteredPin.length === 6) {
                    if (enteredPin === '111111') {
                        // Correct passcode
                        enteredPin = '';
                        pinDots.forEach(dot => dot.classList.remove('filled'));
                        
                        // Trigger unlock success toast
                        showToast('Welcome back to your Sanctuary! 🌙');
                        
                        // Switch screen to dashboard timeline
                        document.querySelector('#dev-screens-toggle-panel select').value = 'screen-dashboard';
                        document.getElementById('screen-lock').classList.remove('active');
                        document.getElementById('screen-dashboard').classList.add('active');
                        switchDashboardView('timeline');
                    } else {
                        // Wrong passcode
                        enteredPin = '';
                        pinDots.forEach(dot => {
                            dot.classList.remove('filled');
                            // Trigger shake animation
                            dot.style.animation = 'none';
                            void dot.offsetWidth; // trigger reflow
                            dot.style.animation = 'shake 0.3s ease';
                        });
                        document.getElementById('pin-error-msg').textContent = 'Invalid PIN code. Try "111111" for dev testing.';
                    }
                }
            });
        });
    }


    // Auth screen sub-tabs toggles
    document.querySelectorAll('#screen-lock .auth-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            // active class on tab
            document.querySelectorAll('#screen-lock .auth-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // active section
            document.querySelectorAll('#screen-lock .auth-section').forEach(s => s.classList.remove('active'));
            const sec = document.getElementById(`lock-${tab.dataset.method}-section`);
            if (sec) sec.classList.add('active');
        });
    });
});

// Toast function helper
function showToast(text) {
    const toast = document.getElementById('toast-message');
    const toastText = document.getElementById('toast-text');
    if (!toast || !toastText) return;
    
    toastText.textContent = text;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Add CSS shaking keyframes dynamically
const style = document.createElement('style');
style.textContent = `
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-4px); }
        75% { transform: translateX(4px); }
    }
`;
document.head.appendChild(style);
