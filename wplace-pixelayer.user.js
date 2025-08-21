// ==UserScript==
// @name         Wplace Paint - Overlay Helper
// @namespace    http://tampermonkey.net/
// @version      1.3-EN
// @description  Overlays a semi-transparent reference image from a local upload or URL onto the wplace.live canvas, with scaling and collapsing support.
// @author       wplacepaint
// @match        https://wplace.live/*
// @match        https://www.wplace.live/*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function() {
    'use strict';

    // --- 1. Styles (CSS) ---
    GM_addStyle(`
        #wpp-panel {
            position: fixed;
            top: 20px;
            right: 20px;
            width: 300px;
            background-color: #f9f9f9;
            border: 1px solid #ccc;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 9999;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #333;
            transition: height 0.2s ease-in-out;
        }
        #wpp-header {
            padding: 10px;
            cursor: move;
            background-color: #e9e9e9;
            border-bottom: 1px solid #ccc;
            border-top-left-radius: 8px;
            border-top-right-radius: 8px;
            font-weight: bold;
            text-align: center;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        #wpp-toggle-collapse {
            cursor: pointer;
            font-weight: bold;
            padding: 0 8px;
            font-size: 18px;
            user-select: none; /* Prevents selecting text on double-click */
        }
        #wpp-content {
            padding: 15px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            overflow: hidden; /* Works with the collapse animation */
        }
        #wpp-panel.wpp-collapsed #wpp-content {
            display: none;
        }
        #wpp-panel.wpp-collapsed #wpp-header {
            border-bottom: none;
        }
        .wpp-control-group {
            display: flex;
            flex-direction: column;
            gap: 5px;
        }
        .wpp-control-group label {
            font-size: 13px;
            font-weight: 500;
        }
        .wpp-control-group input[type="text"],
        .wpp-control-group input[type="number"] {
            width: 100%;
            padding: 8px;
            border: 1px solid #ccc;
            border-radius: 4px;
            box-sizing: border-box;
        }
        .wpp-control-group input[type="file"] {
            padding: 4px;
        }
        #wpp-apply-btn {
            padding: 10px;
            border: none;
            border-radius: 5px;
            background-color: #4A90E2;
            color: white;
            font-weight: bold;
            cursor: pointer;
            transition: background-color 0.2s;
        }
        #wpp-apply-btn:hover {
            background-color: #357ABD;
        }
        #wpp-overlay-image {
            position: absolute;
            pointer-events: none;
            image-rendering: pixelated;
            transform-origin: top left; /* Key: ensures scaling originates from the top-left corner */
        }
    `);

    // --- 2. Interface (HTML) ---
    const panelHTML = `
        <div id="wpp-panel">
            <div id="wpp-header">
                <span>Wplace Paint Controls</span>
                <span id="wpp-toggle-collapse" title="Collapse/Expand Panel">[-]</span>
            </div>
            <div id="wpp-content">
                <div class="wpp-control-group">
                    <label for="wpp-image-url">Image URL</label>
                    <input type="text" id="wpp-image-url" placeholder="Paste image link...">
                </div>
                <div class="wpp-control-group">
                    <label for="wpp-image-file">Or upload local file</label>
                    <input type="file" id="wpp-image-file" accept="image/*">
                </div>
                <hr style="border: none; border-top: 1px solid #ddd; margin: 0;">
                <div class="wpp-control-group">
                    <label for="wpp-coord-x">X Coordinate</label>
                    <input type="number" id="wpp-coord-x" value="0">
                </div>
                <div class="wpp-control-group">
                    <label for="wpp-coord-y">Y Coordinate</label>
                    <input type="number" id="wpp-coord-y" value="0">
                </div>
                <div class="wpp-control-group">
                    <label for="wpp-scale">Scale: <span id="wpp-scale-value">100</span>%</label>
                    <input type="range" id="wpp-scale" min="50" max="200" value="100">
                </div>
                <div class="wpp-control-group">
                    <label for="wpp-opacity">Opacity: <span id="wpp-opacity-value">50</span>%</label>
                    <input type="range" id="wpp-opacity" min="0" max="100" value="50">
                </div>
                <div class="wpp-control-group" style="flex-direction: row; align-items: center;">
                    <input type="checkbox" id="wpp-visibility" checked>
                    <label for="wpp-visibility" style="margin-left: 5px;">Show Overlay</label>
                </div>
                <button id="wpp-apply-btn">Apply / Update</button>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', panelHTML);

    // --- 3. Logic (JavaScript) ---

    // Get all elements
    const panel = document.getElementById('wpp-panel');
    const header = document.getElementById('wpp-header');
    const collapseBtn = document.getElementById('wpp-toggle-collapse');
    const urlInput = document.getElementById('wpp-image-url');
    const fileInput = document.getElementById('wpp-image-file');
    const xInput = document.getElementById('wpp-coord-x');
    const yInput = document.getElementById('wpp-coord-y');
    const scaleSlider = document.getElementById('wpp-scale');
    const scaleValueSpan = document.getElementById('wpp-scale-value');
    const opacitySlider = document.getElementById('wpp-opacity');
    const opacityValueSpan = document.getElementById('wpp-opacity-value');
    const visibilityCheckbox = document.getElementById('wpp-visibility');
    const applyBtn = document.getElementById('wpp-apply-btn');

    let overlayImage = null;
    let currentImageSource = '';

    // Create or update the overlay element
    function updateOverlay() {
        if (!currentImageSource) {
            if (overlayImage) overlayImage.remove();
            overlayImage = null;
            return;
        }

        if (!overlayImage) {
            overlayImage = document.createElement('img');
            overlayImage.id = 'wpp-overlay-image';
            document.body.appendChild(overlayImage);
        }

        overlayImage.src = currentImageSource;
        overlayImage.style.left = `${xInput.value}px`;
        overlayImage.style.top = `${yInput.value}px`;
        overlayImage.style.opacity = opacitySlider.value / 100;
        overlayImage.style.transform = `scale(${scaleSlider.value / 100})`;
        overlayImage.style.display = visibilityCheckbox.checked ? 'block' : 'none';
    }

    // Save all settings to GM storage
    function saveSettings() {
        const settings = {
            source: currentImageSource,
            isUrl: !currentImageSource.startsWith('data:image'),
            x: xInput.value,
            y: yInput.value,
            opacity: opacitySlider.value,
            scale: scaleSlider.value,
            visible: visibilityCheckbox.checked,
            collapsed: panel.classList.contains('wpp-collapsed')
        };
        GM_setValue('wpp_settings', JSON.stringify(settings));
    }

    // Load all settings from GM storage
    function loadSettings() {
        const savedSettings = GM_getValue('wpp_settings', null);
        if (!savedSettings) return;

        const settings = JSON.parse(savedSettings);
        currentImageSource = settings.source || '';
        if (settings.isUrl) {
             urlInput.value = currentImageSource;
        }
        xInput.value = settings.x || '0';
        yInput.value = settings.y || '0';
        opacitySlider.value = settings.opacity || '50';
        opacityValueSpan.textContent = settings.opacity || '50';
        scaleSlider.value = settings.scale || '100';
        scaleValueSpan.textContent = settings.scale || '100';
        visibilityCheckbox.checked = settings.visible !== false;

        if (settings.collapsed) {
            panel.classList.add('wpp-collapsed');
            collapseBtn.textContent = '[+]';
        }

        if (currentImageSource) {
            updateOverlay();
        }
    }
    
    // ---- Event Listeners ----

    // Handle local file uploads
    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            currentImageSource = e.target.result;
            urlInput.value = ''; // Clear URL input
            fileInput.value = ''; // Clear file input
            updateOverlay();
            saveSettings();
        };
        reader.readAsDataURL(file);
    });

    // Handle the apply/update button
    applyBtn.addEventListener('click', () => {
        currentImageSource = urlInput.value || currentImageSource;
        updateOverlay();
        saveSettings();
    });

    // Handle real-time control changes
    scaleSlider.addEventListener('input', () => {
        scaleValueSpan.textContent = scaleSlider.value;
        if (overlayImage) overlayImage.style.transform = `scale(${scaleSlider.value / 100})`;
        saveSettings();
    });

    opacitySlider.addEventListener('input', () => {
        opacityValueSpan.textContent = opacitySlider.value;
        if (overlayImage) overlayImage.style.opacity = opacitySlider.value / 100;
        saveSettings();
    });

    visibilityCheckbox.addEventListener('change', () => {
        if (overlayImage) overlayImage.style.display = visibilityCheckbox.checked ? 'block' : 'none';
        saveSettings();
    });

    // Handle panel collapse/expand
    collapseBtn.addEventListener('click', () => {
        panel.classList.toggle('wpp-collapsed');
        if (panel.classList.contains('wpp-collapsed')) {
            collapseBtn.textContent = '[+]';
        } else {
            collapseBtn.textContent = '[-]';
        }
        saveSettings();
    });
    
    // Make the panel draggable
    function makeDraggable(element, dragHandle) {
        let offsetX = 0, offsetY = 0, mouseX = 0, mouseY = 0;

        dragHandle.onmousedown = (e) => {
            // Prevent dragging when clicking the collapse button
            if (e.target === collapseBtn) return;
            e.preventDefault();
            mouseX = e.clientX;
            mouseY = e.clientY;
            document.onmouseup = () => {
                document.onmouseup = null;
                document.onmousemove = null;
            };
            document.onmousemove = (e) => {
                e.preventDefault();
                offsetX = mouseX - e.clientX;
                offsetY = mouseY - e.clientY;
                mouseX = e.clientX;
                mouseY = e.clientY;
                element.style.top = (element.offsetTop - offsetY) + "px";
                element.style.left = (element.offsetLeft - offsetX) + "px";
            };
        };
    }

    // Initialize the script
    makeDraggable(panel, header);
    loadSettings();

})();
