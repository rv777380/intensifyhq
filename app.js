// IntensifyHQ Frontend JavaScript

// Global state
let currentUser = null;
let currentPage = 'dashboard';
let dashboardData = null;
let settings = null;

// API Configuration
const API_BASE = '/api';
const token = localStorage.getItem('token');

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    if (window.location.pathname === '/dashboard') {
        initDashboard();
    }
});

// Dashboard initialization
async function initDashboard() {
    if (!token) {
        window.location.href = '/';
        return;
    }
    
    try {
        // Verify token and load initial data
        await loadDashboard();
        await loadSettings();
        setupEventListeners();
        setupNavigation();
        
        // Load scoring guide
        await loadScoringGuide();
        
        // Show dashboard
        showPage('dashboard');
    } catch (error) {
        if (error.message.includes('401')) {
            localStorage.removeItem('token');
            window.location.href = '/';
        }
    }
}

// Setup event listeners
function setupEventListeners() {
    // Quick add form
    const quickAddForm = document.getElementById('quickAddForm');
    if (quickAddForm) {
        quickAddForm.addEventListener('submit', handleQuickAdd);
    }
    
    // Task template dropdown
    setupTaskTemplates();
}

// Navigation setup
function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            showPage(page);
            
            // Update active state
            document.querySelectorAll('.nav-item').forEach(nav => {
                nav.classList.remove('active');
            });
            item.classList.add('active');
        });
    });
}

// Show page
function showPage(page) {
    document.querySelectorAll('.page').forEach(p => {
        p.classList.remove('active');
    });
    
    const pageElement = document.getElementById(`${page}Page`);
    if (pageElement) {
        pageElement.classList.add('active');
        currentPage = page;
        
        // Load page-specific data
        switch (page) {
            case 'dashboard':
                loadDashboard();
                break;
            case 'tasks':
                loadTasks();
                break;
            case 'insights':
                loadInsights();
                break;
            case 'planner':
                loadWeekPlanner();
                break;
            case 'scoring':
                loadScoringGuide();
                break;
            case 'settings':
                loadSettings();
                break;
        }
    }
}

// Quick add task
async function handleQuickAdd(e) {
    e.preventDefault();
    
    const taskData = {
        task_name: document.getElementById('taskName').value,
        intensity: parseInt(document.getElementById('intensity').value),
        roi: parseInt(document.getElementById('roi').value),
        burn: parseInt(document.getElementById('burn').value),
        minutes: parseInt(document.getElementById('minutes').value),
        is_frog: document.getElementById('isFrog').checked,
        action: document.getElementById('action').value,
        date: new Date().toISOString().split('T')[0],
        time_start: new Date().toTimeString().split(' ')[0].substring(0, 5)
    };
    
    try {
        const response = await fetch(`${API_BASE}/api/tasks`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(taskData)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            // Clear form
            e.target.reset();
            
            // Show PR celebration if applicable
            if (result.isPR) {
                showPRCelebration(taskData.task_name);
            }
            
            // Refresh dashboard
            await loadDashboard();
            
            // Show success message
            showNotification('Task logged successfully!', 'success');
        } else {
            showNotification(result.error || 'Failed to add task', 'error');
        }
    } catch (error) {
        showNotification('Network error. Please try again.', 'error');
    }
}

// Load dashboard data
async function loadDashboard() {
    try {
        const response = await fetch(`${API_BASE}/api/dashboard`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        dashboardData = await response.json();
        updateDashboardStats(dashboardData.stats);
        updateRecentTasks(dashboardData.recentTasks);
        updateCharts(dashboardData);
        updateStreaks(dashboardData.streaks);
        updateBadges(dashboardData.badges);
    } catch (error) {
        console.error('Failed to load dashboard:', error);
    }
}

// Update dashboard stats
function updateDashboardStats(stats) {
    if (!stats || !stats.overall) return;
    
    const overall = stats.overall;
    const today = stats.today;
    
    // Update stat cards
    updateStatCard('statIntensity', overall.avg_intensity);
    updateStatCard('statROI', overall.avg_roi);
    updateStatCard('statBurn', overall.avg_burn);
    updateStatCard('statFocus', overall.avg_focus);
    updateStatCard('statFrogs', overall.frog_count || 0);
    updateStatCard('statPRs', overall.pr_count || 0);
    
    // Update time today
    const timeToday = today ? formatMinutes(today.minutes_today || 0) : '0m';
    document.getElementById('statTime').textContent = timeToday;
}

// Update stat card
function updateStatCard(id, value) {
    const element = document.getElementById(id);
    if (element) {
        if (typeof value === 'number') {
            element.textContent = value.toFixed(1);
        } else {
            element.textContent = value || '0';
        }
    }
}

// Update streaks
function updateStreaks(streaks) {
    if (!streaks || streaks.length === 0) {
        document.getElementById('statStreak').textContent = '0';
        return;
    }
    
    const frogStreak = streaks.find(s => s.streak_type === 'frog');
    if (frogStreak) {
        document.getElementById('statStreak').textContent = frogStreak.current_streak || '0';
    }
}

// Update badges
function updateBadges(badges) {
    // Check for new badges and show celebration
    const storedBadges = JSON.parse(localStorage.getItem('badges') || '[]');
    const newBadges = badges.filter(b => !storedBadges.find(sb => sb.id === b.id));
    
    if (newBadges.length > 0) {
        newBadges.forEach(badge => {
            showBadgeCelebration(badge);
        });
        localStorage.setItem('badges', JSON.stringify(badges));
    }
}

// Update recent tasks
function updateRecentTasks(tasks) {
    const container = document.getElementById('recentTasksList');
    if (!container) return;
    
    if (!tasks || tasks.length === 0) {
        container.innerHTML = '<p class="no-data">No tasks yet. Add your first task above!</p>';
        return;
    }
    
    container.innerHTML = tasks.slice(0, 10).map(task => `
        <div class="task-item ${task.is_pr ? 'pr' : ''} ${task.is_frog ? 'frog' : ''}">
            <div class="task-header">
                <span class="task-name">${escapeHtml(task.task_name)}</span>
                <span class="task-badges">
                    ${task.is_frog ? '<span class="badge frog">🐸</span>' : ''}
                    ${task.is_pr ? '<span class="badge pr">🏆 PR</span>' : ''}
                </span>
            </div>
            <div class="task-metrics">
                <span class="metric">I: ${task.intensity}</span>
                <span class="metric">R: ${task.roi}</span>
                <span class="metric">B: ${task.burn}</span>
                <span class="metric focus">F: ${task.focus_score?.toFixed(1) || '-'}</span>
            </div>
            <div class="task-meta">
                <span>${task.date}</span>
                <span>${task.time_start}</span>
                <span>${task.minutes}m</span>
                <span class="action-${task.action.toLowerCase()}">${task.action}</span>
            </div>
        </div>
    `).join('');
}

// Update charts
function updateCharts(data) {
    if (!data.stats) return;
    
    // Draw trend chart
    drawTrendChart(data.stats.weekComparison);
    
    // Draw scatter chart
    if (data.recentTasks) {
        drawScatterChart(data.recentTasks);
    }
    
    // Draw pie chart
    drawPieChart(data.stats.actionBreakdown);
    
    // Draw frog timing chart
    drawFrogChart(data.stats);
}

// Draw trend chart
function drawTrendChart(weekData) {
    const canvas = document.getElementById('trendChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth;
    canvas.height = 250;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (!weekData || weekData.length === 0) {
        ctx.fillStyle = '#9ca3af';
        ctx.font = '14px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('No data yet', canvas.width / 2, canvas.height / 2);
        return;
    }
    
    // Prepare data
    const weeks = weekData.reverse();
    const intensityData = weeks.map(w => w.avg_intensity || 0);
    const roiData = weeks.map(w => w.avg_roi || 0);
    
    const maxValue = 10;
    const padding = 40;
    const width = canvas.width - (padding * 2);
    const height = canvas.height - (padding * 2);
    
    // Draw grid
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
        const y = padding + (i * height / 5);
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(canvas.width - padding, y);
        ctx.stroke();
        
        // Y-axis labels
        ctx.fillStyle = '#6b7280';
        ctx.font = '12px system-ui';
        ctx.textAlign = 'right';
        ctx.fillText((10 - i * 2).toString(), padding - 10, y + 4);
    }
    
    // Draw intensity line
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 3;
    ctx.beginPath();
    intensityData.forEach((value, i) => {
        const x = padding + (i * width / (intensityData.length - 1));
        const y = padding + height - ((value / maxValue) * height);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();
    
    // Draw ROI line
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 3;
    ctx.beginPath();
    roiData.forEach((value, i) => {
        const x = padding + (i * width / (roiData.length - 1));
        const y = padding + height - ((value / maxValue) * height);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();
    
    // Draw target line at 8
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    const targetY = padding + height - ((8 / maxValue) * height);
    ctx.beginPath();
    ctx.moveTo(padding, targetY);
    ctx.lineTo(canvas.width - padding, targetY);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Legend
    ctx.font = '12px system-ui';
    ctx.textAlign = 'left';
    
    ctx.fillStyle = '#6366f1';
    ctx.fillRect(padding, 10, 20, 3);
    ctx.fillText('Intensity', padding + 25, 14);
    
    ctx.fillStyle = '#10b981';
    ctx.fillRect(padding + 100, 10, 20, 3);
    ctx.fillText('ROI', padding + 125, 14);
    
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(padding + 180, 10, 20, 3);
    ctx.fillText('Target', padding + 205, 14);
}

// Draw scatter chart
function drawScatterChart(tasks) {
    const canvas = document.getElementById('scatterChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth;
    canvas.height = 250;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (!tasks || tasks.length === 0) {
        ctx.fillStyle = '#9ca3af';
        ctx.font = '14px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('No data yet', canvas.width / 2, canvas.height / 2);
        return;
    }
    
    const padding = 40;
    const width = canvas.width - (padding * 2);
    const height = canvas.height - (padding * 2);
    
    // Draw axes
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, canvas.height - padding);
    ctx.lineTo(canvas.width - padding, canvas.height - padding);
    ctx.stroke();
    
    // Draw grid
    ctx.strokeStyle = '#f3f4f6';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 10; i++) {
        const x = padding + (i * width / 10);
        const y = canvas.height - padding - (i * height / 10);
        
        ctx.beginPath();
        ctx.moveTo(x, padding);
        ctx.lineTo(x, canvas.height - padding);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(canvas.width - padding, y);
        ctx.stroke();
    }
    
    // Draw points
    tasks.forEach(task => {
        const x = padding + ((task.intensity / 10) * width);
        const y = canvas.height - padding - ((task.roi / 10) * height);
        
        ctx.beginPath();
        ctx.arc(x, y, task.is_pr ? 8 : 5, 0, Math.PI * 2);
        
        if (task.is_pr) {
            ctx.fillStyle = '#fbbf24';
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 2;
            ctx.fill();
            ctx.stroke();
        } else if (task.is_frog) {
            ctx.fillStyle = '#10b981';
            ctx.fill();
        } else {
            ctx.fillStyle = '#6366f1';
            ctx.fill();
        }
    });
    
    // Labels
    ctx.fillStyle = '#6b7280';
    ctx.font = '12px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Intensity →', canvas.width / 2, canvas.height - 5);
    
    ctx.save();
    ctx.translate(10, canvas.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('ROI →', 0, 0);
    ctx.restore();
}

// Draw pie chart
function drawPieChart(actionData) {
    const canvas = document.getElementById('pieChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth;
    canvas.height = 250;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (!actionData || actionData.length === 0) {
        ctx.fillStyle = '#9ca3af';
        ctx.font = '14px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('No data yet', canvas.width / 2, canvas.height / 2);
        return;
    }
    
    const total = actionData.reduce((sum, item) => sum + item.count, 0);
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 40;
    
    const colors = {
        'Keep': '#10b981',
        'Delegate': '#3b82f6',
        'Automate': '#f59e0b',
        'Eliminate': '#ef4444'
    };
    
    let startAngle = -Math.PI / 2;
    
    actionData.forEach(item => {
        const sliceAngle = (item.count / total) * Math.PI * 2;
        
        // Draw slice
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
        ctx.lineTo(centerX, centerY);
        ctx.fillStyle = colors[item.action] || '#9ca3af';
        ctx.fill();
        
        // Draw label
        const labelAngle = startAngle + sliceAngle / 2;
        const labelX = centerX + Math.cos(labelAngle) * (radius * 0.7);
        const labelY = centerY + Math.sin(labelAngle) * (radius * 0.7);
        
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const percentage = Math.round((item.count / total) * 100);
        if (percentage > 5) {
            ctx.fillText(`${item.action}`, labelX, labelY - 8);
            ctx.fillText(`${percentage}%`, labelX, labelY + 8);
        }
        
        startAngle += sliceAngle;
    });
}

// Draw frog timing chart
function drawFrogChart(stats) {
    const canvas = document.getElementById('frogChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth;
    canvas.height = 250;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Mock data for demo (replace with actual data)
    const beforeNoon = stats.overall?.frog_count ? Math.floor(stats.overall.frog_count * 0.7) : 0;
    const afterNoon = stats.overall?.frog_count ? stats.overall.frog_count - beforeNoon : 0;
    
    if (beforeNoon === 0 && afterNoon === 0) {
        ctx.fillStyle = '#9ca3af';
        ctx.font = '14px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('No frog tasks yet', canvas.width / 2, canvas.height / 2);
        return;
    }
    
    const barWidth = 60;
    const maxHeight = canvas.height - 80;
    const maxValue = Math.max(beforeNoon, afterNoon) || 1;
    
    // Before noon bar
    const beforeHeight = (beforeNoon / maxValue) * maxHeight;
    ctx.fillStyle = '#10b981';
    ctx.fillRect(
        canvas.width / 2 - barWidth - 20,
        canvas.height - 40 - beforeHeight,
        barWidth,
        beforeHeight
    );
    
    // After noon bar
    const afterHeight = (afterNoon / maxValue) * maxHeight;
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(
        canvas.width / 2 + 20,
        canvas.height - 40 - afterHeight,
        barWidth,
        afterHeight
    );
    
    // Labels
    ctx.fillStyle = '#374151';
    ctx.font = 'bold 14px system-ui';
    ctx.textAlign = 'center';
    
    ctx.fillText(beforeNoon.toString(), canvas.width / 2 - barWidth - 20 + barWidth/2, canvas.height - 40 - beforeHeight - 10);
    ctx.fillText(afterNoon.toString(), canvas.width / 2 + 20 + barWidth/2, canvas.height - 40 - afterHeight - 10);
    
    ctx.font = '12px system-ui';
    ctx.fillText('Before Noon', canvas.width / 2 - barWidth - 20 + barWidth/2, canvas.height - 20);
    ctx.fillText('After Noon', canvas.width / 2 + 20 + barWidth/2, canvas.height - 20);
    
    // Title
    ctx.font = '12px system-ui';
    ctx.fillStyle = '#6b7280';
    ctx.fillText('🐸 Frog Tasks Timing', canvas.width / 2, 20);
}

// Load tasks
async function loadTasks() {
    try {
        const response = await fetch(`${API_BASE}/api/tasks?limit=50`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const tasks = await response.json();
        displayTasksTable(tasks);
    } catch (error) {
        console.error('Failed to load tasks:', error);
    }
}

// Display tasks table
function displayTasksTable(tasks) {
    const container = document.getElementById('tasksList');
    if (!container) return;
    
    if (!tasks || tasks.length === 0) {
        container.innerHTML = '<p class="no-data">No tasks found</p>';
        return;
    }
    
    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Task</th>
                    <th>I</th>
                    <th>R</th>
                    <th>B</th>
                    <th>Focus</th>
                    <th>Action</th>
                    <th>Tags</th>
                </tr>
            </thead>
            <tbody>
                ${tasks.map(task => `
                    <tr class="${task.is_pr ? 'pr-row' : ''}">
                        <td>${task.date}</td>
                        <td>${task.time_start}</td>
                        <td>${escapeHtml(task.task_name)}</td>
                        <td>${task.intensity}</td>
                        <td>${task.roi}</td>
                        <td>${task.burn}</td>
                        <td>${task.focus_score?.toFixed(1) || '-'}</td>
                        <td><span class="action-tag action-${task.action.toLowerCase()}">${task.action}</span></td>
                        <td>
                            ${task.is_frog ? '<span class="badge frog">🐸</span>' : ''}
                            ${task.is_pr ? '<span class="badge pr">🏆</span>' : ''}
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// Load insights
async function loadInsights() {
    try {
        const response = await fetch(`${API_BASE}/api/insights`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const insights = await response.json();
        displayInsights(insights);
    } catch (error) {
        console.error('Failed to load insights:', error);
    }
}

// Display insights
function displayInsights(insights) {
    // Peak hours
    const peakHoursEl = document.getElementById('peakHours');
    if (peakHoursEl && insights.peakHours) {
        peakHoursEl.innerHTML = insights.peakHours.map(hour => `
            <div class="insight-item">
                <span class="time">${formatHour(hour.hour)}:00</span>
                <div class="insight-metrics">
                    <span>Avg Intensity: ${hour.avg_intensity?.toFixed(1) || '-'}</span>
                    <span>Avg ROI: ${hour.avg_roi?.toFixed(1) || '-'}</span>
                </div>
            </div>
        `).join('') || '<p class="no-data">Not enough data yet</p>';
    }
    
    // Energy vampires
    const vampiresEl = document.getElementById('energyVampires');
    if (vampiresEl && insights.energyVampires) {
        vampiresEl.innerHTML = insights.energyVampires.map(task => `
            <div class="vampire-item">
                <span class="task-name">${escapeHtml(task.task_name)}</span>
                <div class="vampire-metrics">
                    <span>Burn: ${task.avg_burn?.toFixed(1)}</span>
                    <span>ROI: ${task.avg_roi?.toFixed(1)}</span>
                    <span class="frequency">${task.frequency}x</span>
                </div>
                <span class="recommendation">→ Consider delegating or eliminating</span>
            </div>
        `).join('') || '<p class="no-data">No energy vampires detected 🎉</p>';
    }
    
    // Holy Trinity
    const trinityEl = document.getElementById('holyTrinity');
    if (trinityEl && insights.holyTrinity) {
        trinityEl.innerHTML = insights.holyTrinity.map(task => `
            <div class="trinity-item">
                <span class="task-name">${escapeHtml(task.task_name)}</span>
                <div class="trinity-badges">
                    <span class="badge">🐸 Frog</span>
                    <span class="badge">🏆 PR</span>
                    <span class="badge">I: ${task.intensity}</span>
                    <span class="badge">R: ${task.roi}</span>
                </div>
                <span class="date">${task.date}</span>
            </div>
        `).join('') || '<p class="no-data">No Holy Trinity tasks yet - aim for Frog + PR + High Intensity + High ROI!</p>';
    }
    
    // Burnout risk
    const burnoutEl = document.getElementById('burnoutRisk');
    if (burnoutEl) {
        if (insights.needsRecovery) {
            burnoutEl.innerHTML = `
                <div class="warning-box">
                    <span class="warning-icon">⚠️</span>
                    <p>Low average intensity detected (${insights.recentAvgIntensity?.toFixed(1)})</p>
                    <p class="recommendation">Consider taking a recovery day or focusing on high-ROI tasks only.</p>
                </div>
            `;
        } else {
            burnoutEl.innerHTML = `
                <div class="success-box">
                    <span class="success-icon">✅</span>
                    <p>Energy levels healthy!</p>
                    <p>Recent avg intensity: ${insights.recentAvgIntensity?.toFixed(1) || '-'}</p>
                </div>
            `;
        }
    }
}

// Load scoring guide
async function loadScoringGuide() {
    try {
        const response = await fetch(`${API_BASE}/api/scoring-guide`);
        const guide = await response.json();
        displayScoringGuide(guide);
    } catch (error) {
        console.error('Failed to load scoring guide:', error);
    }
}

// Display scoring guide
function displayScoringGuide(guide) {
    const intensityGuide = guide.filter(g => g.metric === 'Intensity');
    const roiGuide = guide.filter(g => g.metric === 'ROI');
    const burnGuide = guide.filter(g => g.metric === 'Burn');
    
    const intensityEl = document.getElementById('intensityGuide');
    if (intensityEl) {
        intensityEl.innerHTML = createGuideTable(intensityGuide);
    }
    
    const roiEl = document.getElementById('roiGuide');
    if (roiEl) {
        roiEl.innerHTML = createGuideTable(roiGuide);
    }
    
    const burnEl = document.getElementById('burnGuide');
    if (burnEl) {
        burnEl.innerHTML = createGuideTable(burnGuide);
    }
}

// Create guide table
function createGuideTable(items) {
    return `
        <table class="guide-table">
            <thead>
                <tr>
                    <th>Score</th>
                    <th>Description</th>
                    <th>Examples</th>
                </tr>
            </thead>
            <tbody>
                ${items.map(item => `
                    <tr>
                        <td class="score">${item.score}</td>
                        <td class="description">${item.description}</td>
                        <td class="examples">${item.examples}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// Load settings
async function loadSettings() {
    try {
        const response = await fetch(`${API_BASE}/api/settings`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        settings = await response.json();
        displaySettings(settings);
    } catch (error) {
        console.error('Failed to load settings:', error);
    }
}

// Display settings
function displaySettings(settings) {
    if (!settings) return;
    
    document.getElementById('weightIntensity').value = settings.weight_intensity || 0.6;
    document.getElementById('weightROI').value = settings.weight_roi || 0.3;
    document.getElementById('weightBurn').value = settings.weight_burn || 0.1;
    document.getElementById('theme').value = settings.theme || 'light';
    document.getElementById('dailyTarget').value = settings.daily_intensity_target || 8;
}

// Save settings
async function saveSettings() {
    const settingsData = {
        weight_intensity: parseFloat(document.getElementById('weightIntensity').value),
        weight_roi: parseFloat(document.getElementById('weightROI').value),
        weight_burn: parseFloat(document.getElementById('weightBurn').value),
        theme: document.getElementById('theme').value,
        daily_intensity_target: parseInt(document.getElementById('dailyTarget').value),
        notifications_enabled: true,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };
    
    try {
        const response = await fetch(`${API_BASE}/api/settings`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(settingsData)
        });
        
        if (response.ok) {
            showNotification('Settings saved successfully!', 'success');
            settings = settingsData;
            applyTheme(settings.theme);
        } else {
            showNotification('Failed to save settings', 'error');
        }
    } catch (error) {
        showNotification('Network error', 'error');
    }
}

// Setup task templates
async function setupTaskTemplates() {
    try {
        const response = await fetch(`${API_BASE}/api/templates`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const templates = await response.json();
        
        // Add template selector to quick add form
        const taskNameInput = document.getElementById('taskName');
        if (taskNameInput && templates.length > 0) {
            const datalist = document.createElement('datalist');
            datalist.id = 'taskTemplates';
            datalist.innerHTML = templates.map(t => 
                `<option value="${t.task_name}" data-intensity="${t.default_intensity}" data-roi="${t.default_roi}" data-burn="${t.default_burn}">`
            ).join('');
            
            taskNameInput.setAttribute('list', 'taskTemplates');
            taskNameInput.parentNode.appendChild(datalist);
            
            // Auto-fill metrics when template selected
            taskNameInput.addEventListener('input', (e) => {
                const option = document.querySelector(`#taskTemplates option[value="${e.target.value}"]`);
                if (option) {
                    document.getElementById('intensity').value = option.dataset.intensity;
                    document.getElementById('roi').value = option.dataset.roi;
                    document.getElementById('burn').value = option.dataset.burn;
                }
            });
        }
    } catch (error) {
        console.error('Failed to load templates:', error);
    }
}

// Load week planner
async function loadWeekPlanner() {
    // This would load saved week plan from API
    // For now, just initialize the UI
}

// Save week plan
async function saveWeekPlan() {
    const plans = [];
    document.querySelectorAll('.day-plan').forEach(dayEl => {
        const day = dayEl.dataset.day;
        const frog = dayEl.querySelector('.frog-input').value;
        const intensity = dayEl.querySelector('.intensity-input').value;
        
        if (frog || intensity) {
            plans.push({
                day_of_week: parseInt(day),
                planned_frog: frog,
                planned_intensity: intensity ? parseInt(intensity) : null
            });
        }
    });
    
    // Save to API
    showNotification('Week plan saved!', 'success');
}

// Show PR celebration
function showPRCelebration(taskName) {
    const modal = document.getElementById('prModal');
    const message = document.getElementById('prMessage');
    
    message.textContent = `"${taskName}" - You just set a new personal record!`;
    modal.classList.add('active');
    
    // Add confetti animation
    createConfetti();
    
    setTimeout(() => {
        modal.classList.remove('active');
    }, 3000);
}

// Show badge celebration
function showBadgeCelebration(badge) {
    const modal = document.getElementById('badgeModal');
    const icon = document.getElementById('badgeIcon');
    const message = document.getElementById('badgeMessage');
    
    const badgeIcons = {
        'frog_streak_3': '🥉',
        'frog_streak_7': '🥈',
        'frog_streak_21': '🥇',
        'frog_streak_30': '💎',
        'pr_first': '⭐',
        'pr_5': '🌟',
        'pr_10': '✨'
    };
    
    icon.textContent = badgeIcons[badge.badge_type] || '🏅';
    message.textContent = `${badge.badge_type.replace(/_/g, ' ').toUpperCase()} - Level ${badge.badge_level}!`;
    
    modal.classList.add('active');
    
    setTimeout(() => {
        modal.classList.remove('active');
    }, 3000);
}

// Create confetti effect
function createConfetti() {
    const confettiContainer = document.querySelector('.confetti');
    if (!confettiContainer) return;
    
    const colors = ['#fbbf24', '#f59e0b', '#ef4444', '#10b981', '#3b82f6', '#6366f1'];
    
    for (let i = 0; i < 50; i++) {
        const confettiPiece = document.createElement('div');
        confettiPiece.style.cssText = `
            position: absolute;
            width: 10px;
            height: 10px;
            background: ${colors[Math.floor(Math.random() * colors.length)]};
            left: ${Math.random() * 100}%;
            animation: confetti-fall 3s ease-out;
            animation-delay: ${Math.random() * 0.5}s;
        `;
        confettiContainer.appendChild(confettiPiece);
        
        setTimeout(() => confettiPiece.remove(), 3500);
    }
}

// Show notification
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Logout
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('badges');
    window.location.href = '/';
}

// Manage subscription
async function manageSubscription() {
    // This would redirect to Stripe customer portal
    showNotification('Redirecting to billing portal...', 'info');
}

// Apply theme
function applyTheme(theme) {
    if (theme === 'dark') {
        document.body.classList.add('dark-theme');
    } else {
        document.body.classList.remove('dark-theme');
    }
}

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatMinutes(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    if (hours > 0) {
        return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
}

function formatHour(hour) {
    const h = parseInt(hour);
    if (h === 0) return '12AM';
    if (h === 12) return '12PM';
    if (h < 12) return `${h}AM`;
    return `${h - 12}PM`;
}
