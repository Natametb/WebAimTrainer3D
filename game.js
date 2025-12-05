import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

console.log("Game Script Loaded - Stable Version");

// --- CONFIG ---
const CLICK_LEVELS = [
    { id: 'c1', name: "Level 1: Static", targets: 30, time: 30, behavior: 'static', size: 1.5, hp: 1 },
    { id: 'c2', name: "Level 2: Moving", targets: 45, time: 45, behavior: 'horizontal', speed: 3, size: 1.5, hp: 1 },
    { id: 'c3', name: "Level 3: Bounce", targets: 45, time: 45, behavior: 'bounce', speed: 5, size: 1.4, hp: 1 },
    { id: 'c4', name: "Level 4: Shrink", targets: 50, time: 40, behavior: 'shrink', shrinkRate: 0.3, size: 1.8, hp: 1 },
    { id: 'c5', name: "Level 5: Chaos", targets: 60, time: 50, behavior: 'chaos', speed: 8, size: 1.2, hp: 1 }
];

const TRACKING_LEVELS = [
    { id: 't1', name: "Level 1: Linear", targets: 3, time: 60, behavior: 'track_linear', speed: 2, size: 1.8, hp: 5.0 },
    { id: 't2', name: "Level 2: Sine", targets: 3, time: 60, behavior: 'track_sine', speed: 2, size: 1.6, hp: 6.0 },
    { id: 't3', name: "Level 3: Orbit", targets: 3, time: 60, behavior: 'track_circle', speed: 2.5, size: 1.6, hp: 6.0 },
    { id: 't4', name: "Level 4: Stop/Go", targets: 4, time: 60, behavior: 'track_stopgo', speed: 5, size: 1.8, hp: 5.0 },
    { id: 't5', name: "Level 5: Jitter", targets: 5, time: 70, behavior: 'track_jitter', speed: 3.5, size: 1.5, hp: 5.0 }
];

// --- GLOBAL VARS ---
let currentMode = 'menu';
let currentConfig = null;
let targetsLeft = 0;
let timeLeft = 0;
let targets = [];
let animationId = null;
let lastTime = 0;
let isWaitingForClick = false;

const getEl = (id) => document.getElementById(id);

// --- UI ELEMENTS ---
const ui = {
    menu: getEl('menu'),
    hud: getEl('hud'),
    modeSel: getEl('mode-selection'),
    levelSel: getEl('level-selection'),
    pauseMenu: getEl('pause-menu'),
    settingsPanel: getEl('settings-panel'),
    trackingHud: getEl('tracking-hud'),
    trackBar: getEl('track-bar-fill'),
    overlay: null // Click to start
};

// Create Click Overlay
const overlay = document.createElement('div');
overlay.innerText = "CLICK TO START";
overlay.style.cssText = "position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:white;font-size:40px;font-weight:bold;display:none;pointer-events:none;z-index:999;text-shadow:0 0 10px black;";
document.body.appendChild(overlay);
ui.overlay = overlay;

// --- THREE JS ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const grid = new THREE.GridHelper(100, 100, 0x333333, 0x111111);
grid.position.y = -6;
scene.add(grid);
scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const dl = new THREE.DirectionalLight(0xffffff, 0.8);
dl.position.set(5,10,7);
scene.add(dl);

const controls = new PointerLockControls(camera, document.body);
const raycaster = new THREE.Raycaster();
const center = new THREE.Vector2(0,0);

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    
    if (type === 'hit') { osc.frequency.setValueAtTime(800, now); gain.gain.setTargetAtTime(0, now, 0.1); }
    else if (type === 'head') { osc.type='triangle'; osc.frequency.setValueAtTime(1200, now); gain.gain.setTargetAtTime(0, now, 0.2); }
    else if (type === 'win') { osc.type='triangle'; osc.frequency.setValueAtTime(400, now); gain.gain.setTargetAtTime(0, now, 0.3); }
    
    osc.start(); osc.stop(now + 0.3);
}

// --- CORE GAMEPLAY ---

function prepareLevel(config) {
    console.log("Preparing Level:", config.name);
    if (animationId) cancelAnimationFrame(animationId);
    
    // Reset Vars
    targets.forEach(t => scene.remove(t));
    targets = [];
    currentConfig = config;
    targetsLeft = config.targets;
    timeLeft = config.time;
    
    // UI
    ui.menu.classList.add('hidden');
    ui.hud.classList.remove('hidden');
    
    getEl('mode-display').innerText = config.name;
    getEl('targets-left').innerText = targetsLeft;
    getEl('timer').innerText = timeLeft.toFixed(2);
    
    const best = localStorage.getItem(`best_${config.id}`);
    getEl('best-time').innerText = best ? `${best}s` : '-';

    if (config.behavior.startsWith('track')) {
        ui.trackingHud.classList.remove('hidden');
        ui.trackBar.style.width = '100%';
        spawnTarget();
    } else {
        ui.trackingHud.classList.add('hidden');
        for(let i=0; i<4; i++) spawnTarget();
    }

    // Wait for click
    isWaitingForClick = true;
    ui.overlay.style.display = 'block';
    currentMode = 'waiting';
    
    lastTime = performance.now();
    animate();
}

function spawnTarget() {
    const config = currentConfig;
    const group = new THREE.Group();
    
    const mat = new THREE.MeshStandardMaterial({ color: config.behavior.startsWith('track') ? 0x00ff00 : 0x00ffff });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(config.size*0.6, config.size, 4, 8), mat);
    body.name = 'body';
    group.add(body);
    
    const head = new THREE.Mesh(new THREE.SphereGeometry(config.size*0.4), new THREE.MeshStandardMaterial({color: 0xffaa00}));
    head.position.y = config.size * 0.8;
    head.name = 'head';
    group.add(head);
    
    group.position.set((Math.random()-0.5)*25, (Math.random()-0.5)*10+5, -25);
    group.userData = { 
        hp: config.hp, maxHp: config.hp, 
        velocity: new THREE.Vector3(config.speed * (Math.random()<0.5?1:-1), 0, 0),
        timeOffset: Math.random()*100 
    };
    
    if (config.behavior === 'bounce') {
        const a = Math.random()*Math.PI*2;
        group.userData.velocity.set(Math.cos(a), Math.sin(a), 0).multiplyScalar(config.speed);
    }
    
    scene.add(group);
    targets.push(group);
    if (config.behavior.startsWith('track')) ui.trackBar.style.width = '100%';
}

function destroyTarget(group) {
    scene.remove(group);
    targets = targets.filter(t => t !== group);
    targetsLeft--;
    getEl('targets-left').innerText = targetsLeft;
    
    if (!currentConfig.behavior.startsWith('track')) playSound('hit');
    
    if (targetsLeft <= 0) {
        endGame(true);
    } else {
        if (currentConfig.behavior.startsWith('track')) spawnTarget();
        else if (targets.length < 4) spawnTarget();
    }
}

function update(delta, time) {
    const config = currentConfig;
    
    // Tracking Damage
    if (config.behavior.startsWith('track') && targets.length > 0) {
        raycaster.setFromCamera(center, camera);
        let meshes = [];
        targets.forEach(g => meshes.push(...g.children));
        const hits = raycaster.intersectObjects(meshes);
        if (hits.length > 0) {
            const hit = hits[0];
            const t = hit.object.parent;
            let dmg = delta;
            if (hit.object.name === 'head') { dmg *= 3; hit.object.material.emissive.setHex(0xffffff); }
            else hit.object.material.emissive.setHex(0x555555);
            
            t.userData.hp -= dmg;
            ui.trackBar.style.width = `${Math.max(0, (t.userData.hp/t.userData.maxHp)*100)}%`;
            if (t.userData.hp <= 0) destroyTarget(t);
        } else {
            meshes.forEach(m => m.material.emissive.setHex(0));
        }
    }
    
    // Movement
    targets.forEach(g => {
        const tOffset = g.userData.timeOffset + time/1000;
        const speed = config.speed;
        
        if (config.behavior === 'track_linear') g.position.x = Math.sin(tOffset*speed)*10;
        else if (config.behavior === 'track_sine') { g.position.x = Math.sin(tOffset*speed)*10; g.position.y = Math.cos(tOffset*speed*0.7)*5+5; }
        else if (config.behavior === 'track_circle') { g.position.x = Math.cos(tOffset*speed)*8; g.position.y = Math.sin(tOffset*speed)*8+5; }
        else if (config.behavior === 'track_stopgo') { if(Math.sin(tOffset*speed)>0) g.position.x += Math.sin(tOffset*speed*2)*delta*5; }
        else if (config.behavior === 'track_jitter') { g.position.x = Math.sin(tOffset*speed)*8 + (Math.random()-0.5); g.position.y = Math.cos(tOffset*speed*0.5)*4+5+(Math.random()-0.5); }
        else if (config.behavior === 'horizontal') {
            g.position.x += g.userData.velocity.x * delta;
            if (Math.abs(g.position.x)>15) g.userData.velocity.x *= -1;
        }
        else if (config.behavior === 'bounce') {
            g.position.addScaledVector(g.userData.velocity, delta);
            if (Math.abs(g.position.x)>15) g.userData.velocity.x *= -1;
            if (g.position.y>13 || g.position.y<-3) g.userData.velocity.y *= -1;
        }
        else if (config.behavior === 'shrink') {
            const s = Math.max(0.2, g.scale.x - delta*config.shrinkRate);
            g.scale.set(s,s,s);
        }
    });
}

function animate() {
    animationId = requestAnimationFrame(animate);
    if (currentMode === 'waiting') { renderer.render(scene, camera); return; }
    if (currentMode !== 'playing') return;
    
    const time = performance.now();
    const delta = (time - lastTime) / 1000;
    lastTime = time;
    
    timeLeft -= delta;
    getEl('timer').innerText = Math.max(0, timeLeft).toFixed(2);
    
    if (timeLeft <= 0) endGame(false);
    else update(delta, time);
    
    renderer.render(scene, camera);
}

// --- MENUS ---

function showMenu(panelId) {
    ui.menu.classList.remove('hidden');
    [ui.modeSel, ui.levelSel, ui.pauseMenu, ui.settingsPanel].forEach(p => p.classList.add('hidden'));
    getEl(panelId).classList.remove('hidden');
}

function endGame(win) {
    currentMode = 'end';
    controls.unlock();
    showMenu('pause-menu');
    
    const h2 = ui.pauseMenu.querySelector('h2');
    h2.innerText = win ? "VICTORY!" : "FAILED";
    h2.style.color = win ? "#00ff00" : "#ff0000";
    
    const btnResume = getEl('resume-btn');
    btnResume.classList.add('hidden');
    
    if (win) {
        playSound('win');
        const taken = currentConfig.time - timeLeft;
        const old = localStorage.getItem(`best_${currentConfig.id}`);
        if (!old || taken < parseFloat(old)) localStorage.setItem(`best_${currentConfig.id}`, taken.toFixed(2));
        
        // Next Level Logic
        const levels = CLICK_LEVELS.includes(currentConfig) ? CLICK_LEVELS : TRACKING_LEVELS;
        const idx = levels.indexOf(currentConfig);
        if (idx < levels.length - 1) {
            btnResume.classList.remove('hidden');
            btnResume.innerText = "▶ Next Level";
            btnResume.onclick = () => prepareLevel(levels[idx + 1]);
        } else {
            h2.innerText = "CAMPAIGN COMPLETE!";
        }
    }
}

// --- EVENTS ---

document.addEventListener('mousedown', () => {
    if (currentMode === 'waiting') {
        currentMode = 'playing';
        ui.overlay.style.display = 'none';
        controls.lock();
        lastTime = performance.now();
    } else if (currentMode === 'playing' && !currentConfig.behavior.startsWith('track')) {
        raycaster.setFromCamera(center, camera);
        let meshes = [];
        targets.forEach(g => meshes.push(...g.children));
        const hits = raycaster.intersectObjects(meshes);
        if (hits.length > 0) {
            const hit = hits[0];
            const isHead = hit.object.name === 'head';
            playSound(isHead ? 'head' : 'hit');
            destroyTarget(hit.object.parent);
        }
    }
});

controls.addEventListener('unlock', () => {
    if (currentMode === 'playing') {
        currentMode = 'paused';
        showMenu('pause-menu');
        getEl('pause-menu').querySelector('h2').innerText = "PAUSED";
        getEl('pause-menu').querySelector('h2').style.color = "gold";
        
        const btnResume = getEl('resume-btn');
        btnResume.classList.remove('hidden');
        btnResume.innerText = "▶ Resume";
        btnResume.onclick = () => {
            ui.menu.classList.add('hidden');
            isWaitingForClick = true;
            ui.overlay.style.display = 'block';
            currentMode = 'waiting'; // Go to waiting first to let user click
        };
    }
});

// Main Menu
getEl('mode-click-campaign-btn').onclick = () => prepareLevel(CLICK_LEVELS[0]);
getEl('mode-track-campaign-btn').onclick = () => prepareLevel(TRACKING_LEVELS[0]);
getEl('select-level-btn').onclick = () => {
    showMenu('level-selection');
    updateLevelGrid('click');
};
getEl('settings-btn').onclick = (e) => { e.stopPropagation(); showMenu('settings-panel'); };

// Level Select
getEl('tab-click').onclick = () => updateLevelGrid('click');
getEl('tab-track').onclick = () => updateLevelGrid('track');
getEl('back-to-main-btn').onclick = () => showMenu('mode-selection');

function updateLevelGrid(mode) {
    if (mode === 'click') { getEl('tab-click').classList.add('active'); getEl('tab-track').classList.remove('active'); }
    else { getEl('tab-click').classList.remove('active'); getEl('tab-track').classList.add('active'); }
    
    const grid = ui.levelSel.querySelector('.level-grid');
    grid.innerHTML = '';
    const levels = mode === 'click' ? CLICK_LEVELS : TRACKING_LEVELS;
    levels.forEach((lvl, i) => {
        const btn = document.createElement('button');
        btn.className = 'level-btn';
        const best = localStorage.getItem(`best_${lvl.id}`);
        btn.innerText = `${i+1}. ${lvl.name} ${best ? `(${best}s)` : ''}`;
        btn.onclick = () => prepareLevel(lvl);
        grid.appendChild(btn);
    });
}

// Pause / End
getEl('restart-btn').onclick = () => prepareLevel(currentConfig);
getEl('quit-btn').onclick = () => {
    currentMode = 'menu';
    ui.hud.classList.add('hidden');
    showMenu('mode-selection');
    if (animationId) cancelAnimationFrame(animationId);
    targets.forEach(t => scene.remove(t));
    targets = [];
};

// Settings inside game
getEl('close-settings-btn').onclick = (e) => {
    e.stopPropagation();
    if (currentMode === 'menu') showMenu('mode-selection');
    else showMenu('pause-menu');
};
getEl('sens-slider').oninput = (e) => {
    controls.pointerSpeed = parseFloat(e.target.value);
    getEl('sens-value').innerText = controls.pointerSpeed;
    localStorage.setItem('aimTrainerSensitivity', controls.pointerSpeed);
};

// Add settings button to pause menu if missing
if (!document.getElementById('pause-settings-btn')) {
    const btn = document.createElement('button');
    btn.id = 'pause-settings-btn';
    btn.className = 'secondary-btn';
    btn.innerText = '⚙️ Settings';
    btn.style.marginTop = '10px';
    btn.onclick = () => showMenu('settings-panel');
    ui.pauseMenu.insertBefore(btn, getEl('quit-btn'));
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start
showMenu('mode-selection');