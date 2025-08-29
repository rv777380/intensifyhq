// Database module for IntensifyHQ

export class Database {
  constructor(db) {
    this.db = db;
  }

  // User operations
  async getUserByEmail(email) {
    return await this.db.prepare(
      'SELECT * FROM users WHERE email = ?'
    ).bind(email).first();
  }

  async getUserById(userId) {
    return await this.db.prepare(
      'SELECT * FROM users WHERE id = ?'
    ).bind(userId).first();
  }

  // Task operations
  async getTasks(userId, date = null, limit = 100) {
    let query = `
      SELECT * FROM tasks 
      WHERE user_id = ?
    `;
    const params = [userId];
    
    if (date) {
      query += ' AND date = ?';
      params.push(date);
    }
    
    query += ' ORDER BY date DESC, time_start DESC LIMIT ?';
    params.push(limit);
    
    const result = await this.db.prepare(query).bind(...params).all();
    return result.results;
  }

  async getTaskById(taskId, userId) {
    return await this.db.prepare(
      'SELECT * FROM tasks WHERE id = ? AND user_id = ?'
    ).bind(taskId, userId).first();
  }

  async deleteTask(taskId, userId) {
    await this.db.prepare(
      'DELETE FROM tasks WHERE id = ? AND user_id = ?'
    ).bind(taskId, userId).run();
  }

  // Dashboard statistics
  async getDashboardStats(userId) {
    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];
    
    // Overall stats
    const overall = await this.db.prepare(`
      SELECT 
        COUNT(*) as total_tasks,
        AVG(burn) as avg_burn,
        AVG(intensity) as avg_intensity,
        AVG(roi) as avg_roi,
        AVG(focus_score) as avg_focus,
        SUM(CASE WHEN is_frog = 1 THEN 1 ELSE 0 END) as frog_count,
        SUM(CASE WHEN is_pr = 1 THEN 1 ELSE 0 END) as pr_count,
        SUM(minutes) as total_minutes
      FROM tasks
      WHERE user_id = ? AND date >= ?
    `).bind(userId, thirtyDaysAgo).first();
    
    // Today's stats
    const todayStats = await this.db.prepare(`
      SELECT 
        COUNT(*) as tasks_today,
        AVG(intensity) as avg_intensity_today,
        SUM(CASE WHEN is_frog = 1 THEN 1 ELSE 0 END) as frogs_today,
        SUM(minutes) as minutes_today
      FROM tasks
      WHERE user_id = ? AND date = ?
    `).bind(userId, today).first();
    
    // Weekly comparison
    const weekComparison = await this.db.prepare(`
      SELECT 
        strftime('%W', date) as week,
        AVG(intensity) as avg_intensity,
        AVG(roi) as avg_roi,
        COUNT(*) as task_count
      FROM tasks
      WHERE user_id = ? AND date >= ?
      GROUP BY week
      ORDER BY week DESC
      LIMIT 4
    `).bind(userId, thirtyDaysAgo).all();
    
    // Best performing hours
    const bestHours = await this.db.prepare(`
      SELECT 
        strftime('%H', time_start) as hour,
        AVG(intensity) as avg_intensity,
        AVG(roi) as avg_roi,
        COUNT(*) as task_count
      FROM tasks
      WHERE user_id = ? AND date >= ?
      GROUP BY hour
      ORDER BY avg_intensity DESC
      LIMIT 3
    `).bind(userId, thirtyDaysAgo).all();
    
    // Action breakdown
    const actionBreakdown = await this.db.prepare(`
      SELECT 
        action,
        COUNT(*) as count,
        AVG(roi) as avg_roi
      FROM tasks
      WHERE user_id = ? AND date >= ?
      GROUP BY action
    `).bind(userId, thirtyDaysAgo).all();
    
    return {
      overall,
      today: todayStats,
      weekComparison: weekComparison.results,
      bestHours: bestHours.results,
      actionBreakdown: actionBreakdown.results
    };
  }

  // Get insights
  async getInsights(userId) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];
    
    // Peak performance hours
    const peakHours = await this.db.prepare(`
      SELECT 
        strftime('%H', time_start) as hour,
        AVG(intensity) as avg_intensity,
        AVG(roi) as avg_roi,
        AVG(focus_score) as avg_focus,
        COUNT(*) as count
      FROM tasks
      WHERE user_id = ? AND date >= ? AND is_frog = 1
      GROUP BY hour
      ORDER BY avg_intensity DESC
      LIMIT 3
    `).bind(userId, thirtyDaysAgo).all();
    
    // Energy vampires (low ROI, high burn tasks)
    const energyVampires = await this.db.prepare(`
      SELECT 
        task_name,
        AVG(burn) as avg_burn,
        AVG(roi) as avg_roi,
        COUNT(*) as frequency
      FROM tasks
      WHERE user_id = ? AND date >= ? 
        AND roi <= 4 AND burn >= 6
      GROUP BY task_name
      ORDER BY frequency DESC
      LIMIT 5
    `).bind(userId, thirtyDaysAgo).all();
    
    // Procrastination patterns
    const procrastination = await this.db.prepare(`
      SELECT 
        CASE 
          WHEN time_start < '12:00' THEN 'morning'
          ELSE 'afternoon'
        END as period,
        COUNT(*) as frog_count,
        AVG(intensity) as avg_intensity
      FROM tasks
      WHERE user_id = ? AND date >= ? AND is_frog = 1
      GROUP BY period
    `).bind(userId, thirtyDaysAgo).all();
    
    // Holy Trinity tasks (Frog + PR + High Intensity + High ROI)
    const holyTrinity = await this.db.prepare(`
      SELECT *
      FROM tasks
      WHERE user_id = ? AND date >= ?
        AND is_frog = 1 
        AND is_pr = 1
        AND intensity >= 8
        AND roi >= 8
      ORDER BY date DESC
      LIMIT 10
    `).bind(userId, thirtyDaysAgo).all();
    
    // Burnout detection
    const recentIntensity = await this.db.prepare(`
      SELECT AVG(intensity) as avg_intensity
      FROM (
        SELECT intensity 
        FROM tasks 
        WHERE user_id = ?
        ORDER BY date DESC, time_start DESC
        LIMIT 7
      )
    `).bind(userId).first();
    
    const needsRecovery = recentIntensity && recentIntensity.avg_intensity < 4;
    
    return {
      peakHours: peakHours.results,
      energyVampires: energyVampires.results,
      procrastination: procrastination.results,
      holyTrinity: holyTrinity.results,
      needsRecovery,
      recentAvgIntensity: recentIntensity?.avg_intensity
    };
  }

  // Streaks
  async getStreaks(userId) {
    const streaks = await this.db.prepare(
      'SELECT * FROM streaks WHERE user_id = ?'
    ).bind(userId).all();
    return streaks.results;
  }

  async updateStreak(userId, streakType, currentStreak, bestStreak, lastDate) {
    await this.db.prepare(`
      INSERT INTO streaks (user_id, streak_type, current_streak, best_streak, last_date)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, streak_type) DO UPDATE SET
        current_streak = excluded.current_streak,
        best_streak = excluded.best_streak,
        last_date = excluded.last_date,
        updated_at = CURRENT_TIMESTAMP
    `).bind(userId, streakType, currentStreak, bestStreak, lastDate).run();
  }

  // Badges
  async getBadges(userId) {
    const badges = await this.db.prepare(
      'SELECT * FROM badges WHERE user_id = ? ORDER BY earned_at DESC'
    ).bind(userId).all();
    return badges.results;
  }

  async awardBadge(userId, badgeType, badgeLevel) {
    await this.db.prepare(`
      INSERT OR IGNORE INTO badges (user_id, badge_type, badge_level)
      VALUES (?, ?, ?)
    `).bind(userId, badgeType, badgeLevel).run();
  }

  // Settings
  async getUserSettings(userId) {
    let settings = await this.db.prepare(
      'SELECT * FROM user_settings WHERE user_id = ?'
    ).bind(userId).first();
    
    // Create default settings if not exists
    if (!settings) {
      await this.db.prepare(
        'INSERT INTO user_settings (user_id) VALUES (?)'
      ).bind(userId).run();
      
      settings = await this.db.prepare(
        'SELECT * FROM user_settings WHERE user_id = ?'
      ).bind(userId).first();
    }
    
    return settings;
  }

  // Task templates
  async getTaskTemplates(userId) {
    const templates = await this.db.prepare(`
      SELECT * FROM task_templates
      WHERE is_global = 1 OR user_id = ?
      ORDER BY category, task_name
    `).bind(userId).all();
    return templates.results;
  }

  // Week planner
  async getWeekPlan(userId, weekStart) {
    const plan = await this.db.prepare(`
      SELECT * FROM week_planner
      WHERE user_id = ? AND week_start = ?
      ORDER BY day_of_week
    `).bind(userId, weekStart).all();
    return plan.results;
  }

  async updateWeekPlan(userId, weekStart, dayOfWeek, plannedFrog, plannedIntensity) {
    await this.db.prepare(`
      INSERT INTO week_planner (user_id, week_start, day_of_week, planned_frog, planned_intensity)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, week_start, day_of_week) DO UPDATE SET
        planned_frog = excluded.planned_frog,
        planned_intensity = excluded.planned_intensity
    `).bind(userId, weekStart, dayOfWeek, plannedFrog, plannedIntensity).run();
  }

  // Charts data
  async getChartData(userId, chartType) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];
    
    switch (chartType) {
      case 'burnIntensityHeatmap':
        return await this.db.prepare(`
          SELECT 
            burn, 
            intensity, 
            COUNT(*) as count
          FROM tasks
          WHERE user_id = ? AND date >= ?
          GROUP BY burn, intensity
        `).bind(userId, thirtyDaysAgo).all();
      
      case 'intensityRoiScatter':
        return await this.db.prepare(`
          SELECT 
            intensity, 
            roi, 
            task_name,
            is_frog,
            is_pr
          FROM tasks
          WHERE user_id = ? AND date >= ?
        `).bind(userId, thirtyDaysAgo).all();
      
      case 'weeklyTrend':
        return await this.db.prepare(`
          SELECT 
            date,
            AVG(intensity) as avg_intensity,
            AVG(roi) as avg_roi,
            AVG(focus_score) as avg_focus
          FROM tasks
          WHERE user_id = ? AND date >= ?
          GROUP BY date
          ORDER BY date
        `).bind(userId, thirtyDaysAgo).all();
      
      case 'frogTiming':
        return await this.db.prepare(`
          SELECT 
            CASE 
              WHEN time_start < '12:00' THEN 'Before Noon'
              ELSE 'After Noon'
            END as timing,
            COUNT(*) as count,
            AVG(intensity) as avg_intensity
          FROM tasks
          WHERE user_id = ? AND date >= ? AND is_frog = 1
          GROUP BY timing
        `).bind(userId, thirtyDaysAgo).all();
      
      default:
        return { results: [] };
    }
  }
}
