import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

console.log("Game Script Loaded - Level Selection Update");

// --- Configuration ---

// Click Timing Levels
const CLICK_LEVELS = [
    { id: 'c1', name: "Static", desc: "Aim for the HEAD!", targets: 30, time: 30, behavior: 'static', size: 1.5, hp: 1 },
    { id: 'c2', name: "Moving", desc: "Horizontal movement.", targets: 45, time: 45, behavior: 'horizontal', speed: 3, size: 1.5, hp: 1 },
    { id: 'c3', name: "Bounce", desc: "Bouncing off walls.", targets: 45, time: 45, behavior: 'bounce', speed: 5, size: 1.4, hp: 1 },
    { id: 'c4', name: "Shrink", desc: "Targets get smaller.", targets: 50, time: 40, behavior: 'shrink', shrinkRate: 0.3, size: 1.8, hp: 1 },
    { id: 'c5', name: "Chaos", desc: "Fast and unpredictable.", targets: 60, time: 50, behavior: 'chaos', speed: 8, size: 1.2, hp: 1 }
];

// Tracking Levels
const TRACKING_LEVELS = [
    { id: 't1', name: "Linear Strafe", desc: "Smooth horizontal tracking.", targets: 3, time: 60, behavior: 'track_linear', speed: 2, size: 1.8, hp: 5.0 },
    { id: 't2', name: "Sine Wave", desc: "Curved movement patterns.", targets: 3, time: 60, behavior: 'track_sine', speed: 2, size: 1.6, hp: 6.0 },
    { id: 't3', name: "Orbit", desc: "Circular motion.", targets: 3, time: 60, behavior: 'track_circle', speed: 2.5, size: 1.6, hp: 6.0 },
    { id: 't4', name: "Stop & Go", desc: "Fast bursts then stops.", targets: 4, time: 60, behavior: 'track_stopgo', speed: 5, size: 1.8, hp: 5.0 },
    { id: 't5', name: "Jitter", desc: "Erratic shaking movement.", targets: 5, time: 70, behavior: 'track_jitter', speed: 3.5, size: 1.5, hp: 5.0 }
];

// Global State
let currentMode = ''; 
let currentLevelConfig = null;
let targetsLeft = 0;
let timeLeft = 0;
let totalTime = 0; 
let isPlaying = false;
let isPaused = false;
let lastTime = 0;
let targets = [];

const SPAWN_AREA_WIDTH = 35;
const SPAWN_AREA_HEIGHT = 16;
const SPAWN_DISTANCE = 25;
const SPAWN_Y_OFFSET = 5;

// --- DOM Elements ---
const getEl = (id) => document.getElementById(id);
const menuEl = getEl('menu');
const subTitleEl = getEl('sub-title');
const hudEl = getEl('hud');
const trackingHud = getEl('tracking-hud');
const trackBarFill = getEl('track-bar-fill');

const modeSelection = getEl('mode-selection');
const levelSelection = getEl('level-selection');
const pauseMenu = getEl('pause-menu');
const settingsPanel = getEl('settings-panel');

const modeDisplayEl = getEl('mode-display');
const timerEl = getEl('timer');
const targetsLeftEl = getEl('targets-left');
const bestTimeEl = getEl('best-time');
const sensSlider = getEl('sens-slider');
const sensValueEl = getEl('sens-value');

const modeClickCampaignBtn = getEl('mode-click-campaign-btn');
const modeTrackCampaignBtn = getEl('mode-track-campaign-btn');
const selectLevelBtn = getEl('select-level-btn');
const tabClickBtn = getEl('tab-click');
const tabTrackBtn = getEl('tab-track');

const settingsBtn = getEl('settings-btn');
const backToMainBtn = getEl('back-to-main-btn');
const resumeBtn = getEl('resume-btn');
const restartBtn = getEl('restart-btn');
const quitBtn = getEl('quit-btn');
const closeSettingsBtn = getEl('close-settings-btn');
const levelBtns = document.querySelectorAll('.level-btn');


// --- Three.js Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);

const gridHelper = new THREE.GridHelper(100, 100, 0x333333, 0x111111);
gridHelper.position.y = -6;
scene.add(gridHelper);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(5, 10, 7);
scene.add(dirLight);

const controls = new PointerLockControls(camera, document.body);
controls.pointerSpeed = 1.0;

const raycaster = new THREE.Raycaster();
const center = new THREE.Vector2(0, 0);

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'hit') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'headshot') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1200, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(2000, audioCtx.currentTime + 0.05);
        gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.2);
    } else if (type === 'tick') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.05);
    } else if (type === 'win') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(400, audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(600, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
    }
}

function getBestScore(levelId) {
    const score = localStorage.getItem(`best_${levelId}`);
    return score ? parseFloat(score) : null;
}

function saveScore(levelId, timeTaken) {
    const currentBest = getBestScore(levelId);
    if (currentBest === null || timeTaken < currentBest) {
        localStorage.setItem(`best_${levelId}`, timeTaken.toFixed(2));
        return true; 
    }
    return false;
}

function showPanel(panel) {
    [modeSelection, levelSelection, pauseMenu, settingsPanel].forEach(p => p.classList.add('hidden'));
    panel.classList.remove('hidden');
}

function initMenu() {
    menuEl.classList.remove('hidden');
    hudEl.classList.add('hidden');
    trackingHud.classList.add('hidden');
    isPlaying = false;
    isPaused = false;
    controls.unlock();
    subTitleEl.innerText = "Select Training Mode";
    showPanel(modeSelection);
    
    targets.forEach(t => scene.remove(t));
    targets = [];
}

function updateLevelButtons(mode) {
    const levels = mode === 'click' ? CLICK_LEVELS : TRACKING_LEVELS;
    
    // Update Tabs UI
    if (mode === 'click') {
        tabClickBtn.classList.add('active');
        tabTrackBtn.classList.remove('active');
    } else {
        tabClickBtn.classList.remove('active');
        tabTrackBtn.classList.add('active');
    }

    levelBtns.forEach((btn, index) => {
        if (levels[index]) {
            const best = getBestScore(levels[index].id);
            const scoreText = best ? `(Best: ${best}s)` : "";
            btn.innerText = `${index + 1}. ${levels[index].name} ${scoreText}`;
            btn.classList.remove('hidden');
        } else {
            btn.classList.add('hidden');
        }
    });
    subTitleEl.innerText = mode === 'click' ? "Click Timing Levels" : "Tracking Levels";
}

// --- Event Listeners ---

modeClickCampaignBtn.addEventListener('click', () => {
    currentMode = 'click';
    startGame(CLICK_LEVELS[0], 'click');
});

modeTrackCampaignBtn.addEventListener('click', () => {
    currentMode = 'track';
    startGame(TRACKING_LEVELS[0], 'track');
});

// Select Level Button logic
selectLevelBtn.addEventListener('click', () => {
    currentMode = 'click'; // Default to click tab
    updateLevelButtons('click');
    showPanel(levelSelection);
});

// Tab Switchers
tabClickBtn.addEventListener('click', () => {
    currentMode = 'click';
    updateLevelButtons('click');
});

tabTrackBtn.addEventListener('click', () => {
    currentMode = 'track';
    updateLevelButtons('track');
});

settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    settingsPanel.classList.remove('hidden');
});

backToMainBtn.addEventListener('click', () => {
    subTitleEl.innerText = "Select Training Mode";
    showPanel(modeSelection);
});

levelBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const index = parseInt(btn.dataset.level);
        const config = currentMode === 'click' ? CLICK_LEVELS[index] : TRACKING_LEVELS[index];
        startGame(config, currentMode);
    });
});

closeSettingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    settingsPanel.classList.add('hidden');
});

sensSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    controls.pointerSpeed = val;
    sensValueEl.innerText = val.toFixed(1);
    localStorage.setItem('aimTrainerSensitivity', val);
});

controls.addEventListener('unlock', () => {
    if (isPlaying && !isPaused) {
        pauseGame();
    }
});

resumeBtn.addEventListener('click', () => {
    if (resumeBtn.innerText.includes("Next Level")) {
        let levels = currentMode === 'click' ? CLICK_LEVELS : TRACKING_LEVELS;
        let currentIndex = levels.indexOf(currentLevelConfig);
        if (currentIndex < levels.length - 1) {
            startGame(levels[currentIndex + 1], currentMode);
        }
    } else {
        isPaused = false;
        menuEl.classList.add('hidden');
        controls.lock();
        lastTime = performance.now();
    }
});

restartBtn.addEventListener('click', () => {
    startGame(currentLevelConfig, currentMode);
});

quitBtn.addEventListener('click', () => {
    initMenu();
});


function pauseGame() {
    isPaused = true;
    document.exitPointerLock();
    menuEl.classList.remove('hidden');
    showPanel(pauseMenu);
    
    const title = pauseMenu.querySelector('h2');
    title.innerText = "PAUSED";
    title.style.color = "gold";
    
    resumeBtn.classList.remove('hidden');
    resumeBtn.innerText = "▶ Resume";
    restartBtn.classList.remove('hidden');
    quitBtn.classList.remove('hidden');

    const scoreDisplay = pauseMenu.querySelector('.score-display');
    if(scoreDisplay) scoreDisplay.remove();
}


function startGame(config, mode) {
    currentLevelConfig = config;
    
    resumeBtn.innerText = "▶ Resume";

    isPlaying = true;
    isPaused = false;
    targetsLeft = config.targets;
    timeLeft = config.time;
    totalTime = config.time;
    
    menuEl.classList.add('hidden');
    hudEl.classList.remove('hidden');
    
    modeDisplayEl.innerText = config.name;
    targetsLeftEl.innerText = targetsLeft;
    timerEl.innerText = timeLeft.toFixed(2);
    
    const best = getBestScore(config.id);
    bestTimeEl.innerText = best ? `${best}s` : "-";

    if (mode === 'track') {
        trackingHud.classList.remove('hidden');
        trackBarFill.style.width = '100%';
    } else {
        trackingHud.classList.add('hidden');
    }
    
    targets.forEach(t => scene.remove(t));
    targets = [];
    
    if (mode === 'track') spawnTarget();
    else for(let i=0; i<4; i++) spawnTarget();

    controls.lock();
    lastTime = performance.now();
    requestAnimationFrame(animate);
}

function spawnTarget() {
    if (targetsLeft <= 0) return;
    const config = currentLevelConfig;
    
    const group = new THREE.Group();

    let color = 0x00ffff;
    if (currentMode === 'track') color = 0x00ff00;
    else if (config.behavior === 'chaos') color = 0xff0000;

    const bodyGeo = new THREE.CapsuleGeometry(config.size * 0.6, config.size * 0.8, 4, 8);
    const bodyMat = new THREE.MeshStandardMaterial({ 
        color: color, roughness: 0.3, metalness: 0.4,
        emissive: color, emissiveIntensity: 0.3
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0;
    body.name = "body";
    group.add(body);

    const headSize = config.size * 0.4;
    const headGeo = new THREE.SphereGeometry(headSize, 16, 16);
    const headMat = new THREE.MeshStandardMaterial({
        color: 0xffaa00, roughness: 0.2, metalness: 0.6, 
        emissive: 0xff4400, emissiveIntensity: 0.5
    });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = (config.size * 0.8) / 2 + headSize * 0.8;
    head.name = "head";
    group.add(head);

    group.position.x = (Math.random() - 0.5) * (SPAWN_AREA_WIDTH * 0.8);
    group.position.y = ((Math.random() - 0.5) * (SPAWN_AREA_HEIGHT * 0.8)) + SPAWN_Y_OFFSET;
    group.position.z = -SPAWN_DISTANCE;

    group.userData = { 
        velocity: new THREE.Vector3(0, 0, 0),
        hp: config.hp,
        maxHp: config.hp,
        timeOffset: Math.random() * 100,
        state: 'move',
        stateTimer: 0
    };

    if (config.behavior === 'horizontal') {
        group.userData.velocity.x = (Math.random() < 0.5 ? 1 : -1) * config.speed;
    } else if (config.behavior === 'bounce' || config.behavior === 'chaos') {
        const angle = Math.random() * Math.PI * 2;
        group.userData.velocity.x = Math.cos(angle) * config.speed;
        group.userData.velocity.y = Math.sin(angle) * config.speed;
    }

    scene.add(group);
    targets.push(group);
    
    if (currentMode === 'track') trackBarFill.style.width = '100%';
}

function checkClickHit() {
    if (!isPlaying || isPaused || currentMode === 'track') return;
    
    raycaster.setFromCamera(center, camera);
    const targetMeshes = [];
    targets.forEach(g => {
        targetMeshes.push(...g.children);
    });

    const intersects = raycaster.intersectObjects(targetMeshes);

    if (intersects.length > 0) {
        const hitMesh = intersects[0].object;
        const hitGroup = hitMesh.parent;
        
        if (hitMesh.name === 'head') {
            playSound('headshot');
            destroyTarget(hitGroup);
        } else {
            destroyTarget(hitGroup);
        }
    }
}

function destroyTarget(targetGroup) {
    scene.remove(targetGroup);
    targets = targets.filter(t => t !== targetGroup);
    targetsLeft--;
    targetsLeftEl.innerText = targetsLeft;
    
    if (currentMode === 'click') {
         // Sound is handled directly in checkClickHit for now.
    }

    if (targetsLeft === 0) {
        endGame(true);
    } else {
        if (currentMode === 'track' || targets.length < 4) {
            spawnTarget();
        }
    }
}

function endGame(win) {
    isPlaying = false;
    controls.unlock();
    menuEl.classList.remove('hidden');
    showPanel(pauseMenu);

    const title = pauseMenu.querySelector('h2');
    
    resumeBtn.classList.add('hidden');
    restartBtn.classList.remove('hidden');
    quitBtn.classList.remove('hidden');

    if (win) {
        playSound('win');
        const timeTaken = totalTime - timeLeft;
        const isNewRecord = saveScore(currentLevelConfig.id, timeTaken);
        
        let msg = `Time: ${timeTaken.toFixed(2)}s`;
        if (isNewRecord) msg += " (NEW RECORD!)";
        
        title.innerText = "VICTORY!";
        title.style.color = "#00ff00";
        
        let scoreDisplay = pauseMenu.querySelector('.score-display');
        if (!scoreDisplay) {
            scoreDisplay = document.createElement('p');
            scoreDisplay.className = 'score-display';
            scoreDisplay.style.fontSize = '24px';
            scoreDisplay.style.color = '#fff';
            pauseMenu.insertBefore(scoreDisplay, resumeBtn);
        }
        scoreDisplay.innerText = msg;
        
        let levels = currentMode === 'click' ? CLICK_LEVELS : TRACKING_LEVELS;
        let currentIndex = levels.indexOf(currentLevelConfig);
        
        if (currentIndex < levels.length - 1) {
            resumeBtn.classList.remove('hidden');
            resumeBtn.innerText = "▶ Next Level";
        } else {
            title.innerText = "CAMPAIGN COMPLETE!";
            title.style.color = "gold";
        }
    } else {
        title.innerText = "FAILED";
        title.style.color = "#ff0000";
        const scoreDisplay = pauseMenu.querySelector('.score-display');
        if(scoreDisplay) scoreDisplay.innerText = "Time ran out!";
    }
}

document.addEventListener('mousedown', () => {
    if (controls.isLocked) {
        checkClickHit();
        camera.position.y += 0.05;
        setTimeout(() => camera.position.y -= 0.05, 50);
    }
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

try {
    const s = localStorage.getItem('aimTrainerSensitivity');
    if(s) { controls.pointerSpeed = parseFloat(s); sensSlider.value = s; sensValueEl.innerText = s; }
} catch(e){}

function animate() {
    requestAnimationFrame(animate);
    if (!isPlaying || isPaused) return;

    const time = performance.now();
    const delta = (time - lastTime) / 1000;
    lastTime = time;

    timeLeft -= delta;
    timerEl.innerText = timeLeft.toFixed(2);
    if (timeLeft <= 0) {
        timeLeft = 0;
        endGame(false);
        return;
    }

    const config = currentLevelConfig;

    if (currentMode === 'track' && targets.length > 0) {
        raycaster.setFromCamera(center, camera);
        
        const targetMeshes = [];
        targets.forEach(g => targetMeshes.push(...g.children));
        
        const intersects = raycaster.intersectObjects(targetMeshes);
        
        if (intersects.length > 0) {
            const hitMesh = intersects[0].object;
            const t = hitMesh.parent; 
            
            let dmg = delta;
            if (hitMesh.name === 'head') {
                dmg *= 3; 
                hitMesh.material.emissive.setHex(0xffffff); 
            } else {
                hitMesh.material.emissive.setHex(0x555555);
            }

            t.userData.hp -= dmg;
            
            const hpPct = t.userData.hp / t.userData.maxHp;
            trackBarFill.style.width = `${Math.max(0, hpPct*100)}%`;
            
            const body = t.children.find(c => c.name === 'body');
            if(body) {
                 const hue = hpPct * 0.33; 
                 body.material.color.setHSL(hue, 1, 0.5);
            }

            if (Math.random() < 0.2) {
                 if (hitMesh.name === 'head') {
                    // Reduce ping frequency for tracking, it can be annoying
                 } else playSound('tick');
            }
            
            if (t.userData.hp <= 0) destroyTarget(t);
        } else {
            targets.forEach(g => {
                g.children.forEach(m => {
                    if (m.name === 'head') m.material.emissive.setHex(0xff4400);
                    else {
                        // Body color updates based on HP directly.
                    }
                });
            });
        }

        targets.forEach(t => {
            const speed = config.speed;
            const timeSec = time / 1000;
            const tOffset = t.userData.timeOffset + timeSec;

            if (config.behavior === 'track_linear') {
                t.position.x = Math.sin(tOffset * speed * 0.5) * (SPAWN_AREA_WIDTH * 0.4);
            } 
            else if (config.behavior === 'track_sine') {
                t.position.x = Math.sin(tOffset * speed * 0.5) * (SPAWN_AREA_WIDTH * 0.4);
                t.position.y = Math.cos(tOffset * speed * 0.7) * (SPAWN_AREA_HEIGHT * 0.25) + SPAWN_Y_OFFSET;
            }
            else if (config.behavior === 'track_circle') {
                t.position.x = Math.cos(tOffset * speed) * 8;
                t.position.y = Math.sin(tOffset * speed) * 8 + SPAWN_Y_OFFSET;
            }
            else if (config.behavior === 'track_stopgo') {
                t.userData.stateTimer -= delta;
                if (t.userData.stateTimer <= 0) {
                    if (t.userData.state === 'stop') {
                        t.userData.state = 'move';
                        t.userData.stateTimer = 0.5 + Math.random(); 
                        const angle = Math.random() * Math.PI * 2;
                        t.userData.velocity.set(Math.cos(angle), Math.sin(angle), 0).multiplyScalar(speed);
                    } else {
                        t.userData.state = 'stop';
                        t.userData.stateTimer = 0.3 + Math.random() * 0.5;
                        t.userData.velocity.set(0,0,0);
                    }
                }
                t.position.addScaledVector(t.userData.velocity, delta);
                const hw = SPAWN_AREA_WIDTH/2; const hh = SPAWN_AREA_HEIGHT/2;
                if (t.position.x > hw || t.position.x < -hw) { t.userData.velocity.x *= -1; t.position.x = THREE.MathUtils.clamp(t.position.x, -hw, hw); }
                if (t.position.y > hh+SPAWN_Y_OFFSET || t.position.y < -hh+SPAWN_Y_OFFSET) { t.userData.velocity.y *= -1; t.position.y = THREE.MathUtils.clamp(t.position.y, -hh+SPAWN_Y_OFFSET, hh+SPAWN_Y_OFFSET); }
            }
            else if (config.behavior === 'track_jitter') {
                t.position.x = Math.sin(tOffset * speed * 0.3) * 10;
                t.position.y = Math.cos(tOffset * speed * 0.2) * 5 + SPAWN_Y_OFFSET;
                t.position.x += (Math.random() - 0.5) * 0.3;
                t.position.y += (Math.random() - 0.5) * 0.3;
            }
            t.rotation.x += delta;
            t.rotation.y += delta;
        });
    } else {
        targets.forEach(t => {
            if (config.behavior !== 'static') {
                 if (config.behavior === 'chaos' && Math.random() < 0.02) {
                    t.userData.velocity.x = (Math.random()-0.5) * config.speed * 2;
                    t.userData.velocity.y = (Math.random()-0.5) * config.speed * 2;
                }
                t.position.addScaledVector(t.userData.velocity, delta);
                const halfW = SPAWN_AREA_WIDTH / 2;
                const halfH = SPAWN_AREA_HEIGHT / 2;
                const topY = halfH + SPAWN_Y_OFFSET;
                const bottomY = -halfH + SPAWN_Y_OFFSET;
                if (t.position.x > halfW || t.position.x < -halfW) t.userData.velocity.x *= -1;
                if (t.position.y > topY || t.position.y < bottomY) {
                    t.userData.velocity.y *= -1;
                    t.position.y = THREE.MathUtils.clamp(t.position.y, bottomY, topY);
                }
            }
            if (config.behavior === 'shrink') {
                 const scale = t.scale.x - (config.shrinkRate * delta);
                 const s = scale > 0.2 ? scale : 0.2;
                 t.scale.set(s,s,s);
            }
            t.rotation.x += delta;
            t.rotation.y += delta;
        });
    }
    renderer.render(scene, camera);
}

initMenu();