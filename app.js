// ============================================
// BSI ROADMAP — APP MODULE
// Blackforge Space Industries
// ============================================

// GitHub Configuration
// REPLACE THESE WITH YOUR ACTUAL VALUES
const GITHUB_CONFIG = {
    owner: 'DeviousWings',
    repo: 'bsi-roadmap',
    file: 'data.json',
    branch: 'main',
    // Token stored in localStorage for security
    // Never hardcode your token here
    getToken: () => localStorage.getItem('bsi_github_token')
};

// App State
let roadmapData = null;
let fileSHA = null;

// ============================================
// INITIALIZE APP
// ============================================
async function initApp() {
    await loadData();
    renderRoadmap();
    setupAddProductButton();
}

// ============================================
// GITHUB API — LOAD DATA
// ============================================
async function loadData() {
    try {
        const response = await fetch(
            `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.file}`,
            {
                headers: {
                    'Accept': 'application/vnd.github.v3+json'
                }
            }
        );

        if (!response.ok) throw new Error('Failed to load data');

        const result = await response.json();
        fileSHA = result.sha;
        const decoded = atob(result.content.replace(/\n/g, ''));
        roadmapData = JSON.parse(decoded);

    } catch (error) {
        console.error('Load error:', error);
        // Fall back to localStorage if GitHub fails
        const local = localStorage.getItem('bsi_roadmap_data');
        if (local) {
            roadmapData = JSON.parse(local);
        } else {
            roadmapData = { lastUpdated: '', products: [] };
        }
    }
}

// ============================================
// GITHUB API — SAVE DATA
// ============================================
async function saveData() {
    if (!currentSession.isAdmin) return;

    const token = GITHUB_CONFIG.getToken();
    if (!token) {
        promptForToken();
        return;
    }

    roadmapData.lastUpdated = new Date().toISOString();

    // Save to localStorage as backup
    localStorage.setItem('bsi_roadmap_data', JSON.stringify(roadmapData));

    try {
        const content = btoa(JSON.stringify(roadmapData, null, 2));

        const body = {
            message: `BSI Roadmap update — ${new Date().toLocaleString()}`,
            content: content,
            branch: GITHUB_CONFIG.branch
        };

        if (fileSHA) body.sha = fileSHA;

        const response = await fetch(
            `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.file}`,
            {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/vnd.github.v3+json'
                },
                body: JSON.stringify(body)
            }
        );

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message);
        }

        const result = await response.json();
        fileSHA = result.content.sha;
        showSaveIndicator('SAVED TO BSI DATABASE');

    } catch (error) {
        console.error('Save error:', error);
        showSaveIndicator('SAVED LOCALLY — SYNC FAILED', true);
    }
}

// ============================================
// TOKEN PROMPT — FIRST TIME SETUP
// ============================================
function promptForToken() {
    const token = prompt(
        'BSI GITHUB TOKEN REQUIRED\n\nEnter your GitHub Personal Access Token to enable live saves:'
    );
    if (token && token.startsWith('ghp_')) {
        localStorage.setItem('bsi_github_token', token);
        saveData();
    } else {
        alert('INVALID TOKEN — Local save only');
    }
}

// ============================================
// SAVE INDICATOR
// ============================================
function showSaveIndicator(message, isError = false) {
    let indicator = document.getElementById('save-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'save-indicator';
        indicator.style.cssText = `
            position: fixed;
            bottom: 24px;
            right: 24px;
            background: #222;
            border: 1px solid #333;
            border-left: 3px solid #ff6600;
            padding: 10px 16px;
            font-family: 'Courier New', monospace;
            font-size: 0.7rem;
            letter-spacing: 0.15em;
            color: #e0e0e0;
            z-index: 9999;
            transition: opacity 0.3s;
        `;
        document.body.appendChild(indicator);
    }
    indicator.textContent = message;
    indicator.style.borderLeftColor = isError ? '#cc3333' : '#ff6600';
    indicator.style.opacity = '1';
    setTimeout(() => { indicator.style.opacity = '0'; }, 3000);
}

// ============================================
// RENDER ROADMAP
// ============================================
function renderRoadmap() {
    const container = document.getElementById('product-list');
    container.innerHTML = '';

    if (!roadmapData || !roadmapData.products.length) {
        container.innerHTML = `
            <div style="
                text-align:center;
                padding:60px;
                color:#444;
                font-size:0.8rem;
                letter-spacing:0.2em;
            ">
                NO PRODUCTS FOUND — ADD YOUR FIRST PRODUCT
            </div>
        `;
        return;
    }

    roadmapData.products.forEach(product => {
        container.appendChild(renderProduct(product));
    });

    updateLastUpdated();
}

// ============================================
// RENDER PRODUCT
// ============================================
function renderProduct(product) {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.id = `product-${product.id}`;

    const progress = calculateProgress(product);

    card.innerHTML = `
        <div class="product-header" onclick="toggleProduct('${product.id}')">
            <div class="product-title">
                <span class="product-id">${product.id}</span>
                <span class="product-name">${product.name}</span>
            </div>
            <div class="product-controls">
                <div class="progress-bar-container">
                    <div class="progress-label">
                        <span>PROGRESS</span>
                        <span>${progress}%</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width:${progress}%"></div>
                    </div>
                </div>
                ${currentSession.isAdmin ? `
                <button class="btn-add admin-only"
                    onclick="event.stopPropagation();showAddPhaseModal('${product.id}')">
                    + PHASE
                </button>
                <button class="btn-small admin-only"
                    onclick="event.stopPropagation();showEditProductModal('${product.id}')">
                    EDIT
                </button>
                <button class="btn-danger admin-only"
                    onclick="event.stopPropagation();deleteProduct('${product.id}')">
                    DELETE
                </button>
                ` : ''}
            </div>
        </div>
        <div class="product-body" id="body-${product.id}">
            ${renderPhases(product)}
        </div>
    `;

    return card;
}

// ============================================
// RENDER PHASES
// ============================================
function renderPhases(product) {
    if (!product.phases || !product.phases.length) {
        return `<p style="color:#444;font-size:0.75rem;
            letter-spacing:0.15em;padding:12px">
            NO PHASES — ADD A PHASE TO GET STARTED
        </p>`;
    }

    return product.phases.map(phase => `
        <div class="phase-section" id="phase-${product.id}-${phase.id}">
            <div class="phase-header" 
                onclick="togglePhase('${product.id}','${phase.id}')">
                <span class="phase-name">${phase.name}</span>
                <div class="phase-controls">
                    ${currentSession.isAdmin ? `
                    <button class="btn-add"
                        onclick="event.stopPropagation();
                        showAddTaskModal('${product.id}','${phase.id}')">
                        + TASK
                    </button>
                    <button class="btn-small"
                        onclick="event.stopPropagation();
                        showEditPhaseModal('${product.id}','${phase.id}')">
                        EDIT
                    </button>
                    <button class="btn-danger"
                        onclick="event.stopPropagation();
                        deletePhase('${product.id}','${phase.id}')">
                        DELETE
                    </button>
                    ` : ''}
                </div>
            </div>
            <div class="phase-body" id="phasebody-${product.id}-${phase.id}">
                ${renderTasks(product.id, phase)}
            </div>
        </div>
    `).join('');
}

// ============================================
// RENDER TASKS
// ============================================
function renderTasks(productId, phase) {
    if (!phase.tasks || !phase.tasks.length) {
        return `<p style="color:#444;font-size:0.75rem;
            letter-spacing:0.15em;padding:8px 12px">
            NO TASKS — ADD A TASK
        </p>`;
    }

    return phase.tasks.map(task => `
        <div class="task-item" id="task-${productId}-${phase.id}-${task.id}">
            <div class="task-header">
                <input type="checkbox" 
                    class="task-checkbox"
                    ${task.completed ? 'checked' : ''}
                    onchange="toggleTask('${productId}','${phase.id}','${task.id}',this.checked)"
                    ${!currentSession.isAdmin ? 'disabled' : ''}
                />
                <span class="task-name ${task.completed ? 'completed' : ''}">
                    ${task.name}
                </span>
                <div class="task-actions">
                    <button class="btn-small" 
                        onclick="toggleTaskBody('${productId}','${phase.id}','${task.id}')">
                        ${task.notes ? 'NOTES ▼' : 'EXPAND ▼'}
                    </button>
                    ${currentSession.isAdmin ? `
                    <button class="btn-small"
                        onclick="showEditTaskModal('${productId}','${phase.id}','${task.id}')">
                        EDIT
                    </button>
                    <button class="btn-danger"
                        onclick="deleteTask('${productId}','${phase.id}','${task.id}')">
                        DEL
                    </button>
                    ` : ''}
                </div>
            </div>
            <div class="task-body" id="taskbody-${productId}-${phase.id}-${task.id}">
                ${currentSession.isAdmin ? `
                <textarea class="task-notes" 
                    placeholder="ADD NOTES — WHERE YOU LEFT OFF..."
                    onchange="updateNotes('${productId}','${phase.id}','${task.id}',this.value)"
                >${task.notes || ''}</textarea>
                ` : task.notes ? `
                <p style="color:#888;font-size:0.75rem;
                    padding:8px;border-left:2px solid #333">
                    ${task.notes}
                </p>
                ` : ''}
                <div class="subtask-list" 
                    id="subtasks-${productId}-${phase.id}-${task.id}">
                    ${renderSubtasks(productId, phase.id, task)}
                </div>
                ${currentSession.isAdmin ? `
                <button class="btn-add" style="margin-top:8px"
                    onclick="showAddSubtaskModal(
                        '${productId}','${phase.id}','${task.id}')">
                    + ADD SUBTASK
                </button>
                ` : ''}
            </div>
        </div>
    `).join('');
}

// ============================================
// RENDER SUBTASKS
// ============================================
function renderSubtasks(productId, phaseId, task) {
    if (!task.subtasks || !task.subtasks.length) return '';

    return task.subtasks.map(subtask => `
        <div class="subtask-item" 
            id="subtask-${productId}-${phaseId}-${task.id}-${subtask.id}">
            <input type="checkbox"
                class="subtask-checkbox"
                ${subtask.completed ? 'checked' : ''}
                onchange="toggleSubtask(
                    '${productId}','${phaseId}',
                    '${task.id}','${subtask.id}',this.checked)"
                ${!currentSession.isAdmin ? 'disabled' : ''}
            />
            <span class="subtask-name ${subtask.completed ? 'completed' : ''}">
                ${subtask.name}
            </span>
            ${currentSession.isAdmin ? `
            <button class="btn-small"
                onclick="showEditSubtaskModal(
                    '${productId}','${phaseId}',
                    '${task.id}','${subtask.id}')">
                EDIT
            </button>
            <button class="btn-danger"
                onclick="deleteSubtask(
                    '${productId}','${phaseId}',
                    '${task.id}','${subtask.id}')">
                DEL
            </button>
            ` : ''}
        </div>
    `).join('');
}

// ============================================
// TOGGLE FUNCTIONS
// ============================================
function toggleProduct(productId) {
    const body = document.getElementById(`body-${productId}`);
    body.classList.toggle('open');
}

function togglePhase(productId, phaseId) {
    const body = document.getElementById(`phasebody-${productId}-${phaseId}`);
    body.classList.toggle('open');
}

function toggleTaskBody(productId, phaseId, taskId) {
    const body = document.getElementById(
        `taskbody-${productId}-${phaseId}-${taskId}`
    );
    body.classList.toggle('open');
}

// ============================================
// CALCULATE PROGRESS
// ============================================
function calculateProgress(product) {
    let total = 0;
    let completed = 0;

    product.phases.forEach(phase => {
        phase.tasks.forEach(task => {
            total++;
            if (task.completed) completed++;
            task.subtasks.forEach(subtask => {
                total++;
                if (subtask.completed) completed++;
            });
        });
    });

    if (total === 0) return 0;
    return Math.round((completed / total) * 100);
}

// ============================================
// DATA MUTATIONS
// ============================================
function toggleTask(productId, phaseId, taskId, checked) {
    const product = roadmapData.products.find(p => p.id === productId);
    const phase = product.phases.find(p => p.id === phaseId);
    const task = phase.tasks.find(t => t.id === taskId);
    task.completed = checked;

    // Update visual
    const nameEl = document.querySelector(
        `#task-${productId}-${phaseId}-${taskId} .task-name`
    );
    if (nameEl) {
        nameEl.classList.toggle('completed', checked);
    }

    updateProgressBar(productId);
    saveData();
}

function toggleSubtask(productId, phaseId, taskId, subtaskId, checked) {
    const product = roadmapData.products.find(p => p.id === productId);
    const phase = product.phases.find(p => p.id === phaseId);
    const task = phase.tasks.find(t => t.id === taskId);
    const subtask = task.subtasks.find(s => s.id === subtaskId);
    subtask.completed = checked;

    const nameEl = document.querySelector(
        `#subtask-${productId}-${phaseId}-${taskId}-${subtaskId} .subtask-name`
    );
    if (nameEl) {
        nameEl.classList.toggle('completed', checked);
    }

    updateProgressBar(productId);
    saveData();
}

function updateNotes(productId, phaseId, taskId, notes) {
    const product = roadmapData.products.find(p => p.id === productId);
    const phase = product.phases.find(p => p.id === phaseId);
    const task = phase.tasks.find(t => t.id === taskId);
    task.notes = notes;
    saveData();
}

function updateProgressBar(productId) {
    const product = roadmapData.products.find(p => p.id === productId);
    const progress = calculateProgress(product);
    const fill = document.querySelector(
        `#product-${productId} .progress-fill`
    );
    const label = document.querySelector(
        `#product-${productId} .progress-label span:last-child`
    );
    if (fill) fill.style.width = `${progress}%`;
    if (label) label.textContent = `${progress}%`;
}

// ============================================
// DELETE FUNCTIONS
// ============================================
function deleteProduct(productId) {
    if (!confirm('DELETE THIS PRODUCT? THIS CANNOT BE UNDONE.')) return;
    roadmapData.products = roadmapData.products.filter(
        p => p.id !== productId
    );
    renderRoadmap();
    saveData();
}

function deletePhase(productId, phaseId) {
    if (!confirm('DELETE THIS PHASE? THIS CANNOT BE UNDONE.')) return;
    const product = roadmapData.products.find(p => p.id === productId);
    product.phases = product.phases.filter(p => p.id !== phaseId);
    renderRoadmap();
    saveData();
}

function deleteTask(productId, phaseId, taskId) {
    if (!confirm('DELETE THIS TASK?')) return;
    const product = roadmapData.products.find(p => p.id === productId);
    const phase = product.phases.find(p => p.id === phaseId);
    phase.tasks = phase.tasks.filter(t => t.id !== taskId);
    renderRoadmap();
    saveData();
}

function deleteSubtask(productId, phaseId, taskId, subtaskId) {
    if (!confirm('DELETE THIS SUBTASK?')) return;
    const product = roadmapData.products.find(p => p.id === productId);
    const phase = product.phases.find(p => p.id === phaseId);
    const task = phase.tasks.find(t => t.id === taskId);
    task.subtasks = task.subtasks.filter(s => s.id !== subtaskId);
    renderRoadmap();
    saveData();
}

// ============================================
// MODAL SYSTEM
// ============================================
function createModal(title, fields, onConfirm, defaultValues = {}) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';

    const fieldHTML = fields.map(f => `
        <input type="text"
            id="modal-${f.id}"
            placeholder="${f.placeholder}"
            value="${defaultValues[f.id] || ''}"
        />
    `).join('');

    overlay.innerHTML = `
        <div class="modal">
            <h3>${title}</h3>
            ${fieldHTML}
            <div class="modal-actions">
                <button class="btn-primary" id="modal-confirm">
                    CONFIRM
                </button>
                <button class="btn-secondary" id="modal-cancel">
                    CANCEL
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('modal-confirm').addEventListener('click', () => {
        const values = fields.reduce((acc, f) => {
            acc[f.id] = document.getElementById(`modal-${f.id}`).value.trim();
            return acc;
        }, {});

        if (Object.values(values).some(v => !v)) {
            alert('ALL FIELDS REQUIRED');
            return;
        }

        onConfirm(values);
        document.body.removeChild(overlay);
    });

    document.getElementById('modal-cancel').addEventListener('click', () => {
        document.body.removeChild(overlay);
    });

    // Focus first input
    setTimeout(() => {
        document.getElementById(`modal-${fields[0].id}`).focus();
    }, 100);
}

// ============================================
// ADD FUNCTIONS
// ============================================
function setupAddProductButton() {
    document.getElementById('add-product-btn')
        .addEventListener('click', showAddProductModal);
}

function showAddProductModal() {
    createModal(
        'ADD NEW PRODUCT',
        [
            { id: 'pid', placeholder: 'PRODUCT ID (e.g. BF-DATA-01)' },
            { id: 'pname', placeholder: 'PRODUCT NAME (e.g. Command Data Core)' }
        ],
        (values) => {
            roadmapData.products.push({
                id: values.pid.toUpperCase(),
                name: values.pname.toUpperCase(),
                phases: []
            });
            renderRoadmap();
            saveData();
        }
    );
}

function showAddPhaseModal(productId) {
    createModal(
        'ADD PHASE',
        [
            { id: 'pname', placeholder: 'PHASE NAME (e.g. Phase 1 — Prototype)' }
        ],
        (values) => {
            const product = roadmapData.products.find(p => p.id === productId);
            const phaseId = `phase${Date.now()}`;
            product.phases.push({
                id: phaseId,
                name: values.pname.toUpperCase(),
                tasks: []
            });
            renderRoadmap();
            saveData();
        }
    );
}

function showAddTaskModal(productId, phaseId) {
    createModal(
        'ADD TASK',
        [
            { id: 'tname', placeholder: 'TASK NAME' }
        ],
        (values) => {
            const product = roadmapData.products.find(p => p.id === productId);
            const phase = product.phases.find(p => p.id === phaseId);
            const taskId = `task${Date.now()}`;
            phase.tasks.push({
                id: taskId,
                name: values.tname.toUpperCase(),
                completed: false,
                notes: '',
                subtasks: []
            });
            renderRoadmap();
            saveData();
        }
    );
}

function showAddSubtaskModal(productId, phaseId, taskId) {
    createModal(
        'ADD SUBTASK',
        [
            { id: 'sname', placeholder: 'SUBTASK NAME' }
        ],
        (values) => {
            const product = roadmapData.products.find(p => p.id === productId);
            const phase = product.phases.find(p => p.id === phaseId);
            const task = phase.tasks.find(t => t.id === taskId);
            const subtaskId = `subtask${Date.now()}`;
            task.subtasks.push({
                id: subtaskId,
                name: values.sname.toUpperCase(),
                completed: false
            });
            renderRoadmap();
            saveData();
        }
    );
}

// ============================================
// EDIT FUNCTIONS
// ============================================
function showEditProductModal(productId) {
    const product = roadmapData.products.find(p => p.id === productId);
    createModal(
        'EDIT PRODUCT',
        [
            { id: 'pid', placeholder: 'PRODUCT ID' },
            { id: 'pname', placeholder: 'PRODUCT NAME' }
        ],
        (values) => {
            const newId = values.pid.toUpperCase();
            // Update any references if ID changed
            if (newId !== product.id) {
                product.id = newId;
            }
            product.name = values.pname.toUpperCase();
            renderRoadmap();
            saveData();
        },
        { pid: product.id, pname: product.name }
    );
}

function showEditPhaseModal(productId, phaseId) {
    const product = roadmapData.products.find(p => p.id === productId);
    const phase = product.phases.find(p => p.id === phaseId);
    createModal(
        'EDIT PHASE',
        [{ id: 'pname', placeholder: 'PHASE NAME' }],
        (values) => {
            phase.name = values.pname.toUpperCase();
            renderRoadmap();
            saveData();
        },
        { pname: phase.name }
    );
}

function showEditTaskModal(productId, phaseId, taskId) {
    const product = roadmapData.products.find(p => p.id === productId);
    const phase = product.phases.find(p => p.id === phaseId);
    const task = phase.tasks.find(t => t.id === taskId);
    createModal(
        'EDIT TASK',
        [{ id: 'tname', placeholder: 'TASK NAME' }],
        (values) => {
            task.name = values.tname.toUpperCase();
            renderRoadmap();
            saveData();
        },
        { tname: task.name }
    );
}

function showEditSubtaskModal(productId, phaseId, taskId, subtaskId) {
    const product = roadmapData.products.find(p => p.id === productId);
    const phase = product.phases.find(p => p.id === phaseId);
    const task = phase.tasks.find(t => t.id === taskId);
    const subtask = task.subtasks.find(s => s.id === subtaskId);
    createModal(
        'EDIT SUBTASK',
        [{ id: 'sname', placeholder: 'SUBTASK NAME' }],
        (values) => {
            subtask.name = values.sname.toUpperCase();
            renderRoadmap();
            saveData();
        },
        { sname: subtask.name }
    );
}

// ============================================
// LAST UPDATED
// ============================================
function updateLastUpdated() {
    let el = document.getElementById('last-updated');
    if (!el) {
        el = document.createElement('p');
        el.id = 'last-updated';
        el.className = 'last-updated';
        document.querySelector('main').appendChild(el);
    }
    if (roadmapData.lastUpdated) {
        el.textContent = `LAST UPDATED: ${new Date(
            roadmapData.lastUpdated
        ).toLocaleString().toUpperCase()}`;
    }
}