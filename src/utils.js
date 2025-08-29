// IntensifyHQ - Complete Backend for Cloudflare Pages Functions
// This single file contains all backend logic - no local development needed!

// ============================================
// AUTHENTICATION UTILITIES
// ============================================

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  
  const key = await crypto.subtle.importKey(
    'raw', data, { name: 'PBKDF2' }, false, ['deriveBits']
  );
  
  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    key, 256
  );
  
  const hashArray = new Uint8Array(hashBuffer);
  const saltAndHash = new Uint8Array(salt.length + hashArray.length);
  saltAndHash.set(salt);
  saltAndHash.set(hashArray, salt.length);
  
  return btoa(String.fromCharCode(...saltAndHash));
}

async function verifyPassword(password, hash) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const saltAndHash = Uint8Array.from(atob(hash), c => c.charCodeAt(0));
  const salt = saltAndHash.slice(0, 16);
  const storedHash = saltAndHash.slice(16);
  
  const key = await crypto.subtle.importKey(
    'raw', data, { name: 'PBKDF2' }, false, ['deriveBits']
  );
  
  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    key, 256
  );
  
  const hashArray = new Uint8Array(hashBuffer);
  return hashArray.every((byte, i) => byte === storedHash[i]);
}

async function generateJWT(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, '');
  const encodedPayload = btoa(JSON.stringify({
    ...payload,
    exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60),
    iat: Math.floor(Date.now() / 1000)
  })).replace(/=/g, '');
  
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${encodedHeader}.${encodedPayload}`)
  );
  
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  
  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

async function verifyJWT(token, secret) {
  try {
    const [header, payload, signature] = token.split('.');
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    
    const signatureBuffer = Uint8Array.from(
      atob(signature.replace(/-/g, '+').replace(/_/g, '/')),
      c => c.charCodeAt(0)
    );
    
    const valid = await crypto.subtle.verify(
      'HMAC', key, signatureBuffer,
      encoder.encode(`${header}.${payload}`)
    );
    
    if (!valid) throw new Error('Invalid signature');
    
    const decodedPayload = JSON.parse(atob(payload));
    if (decodedPayload.exp < Math.floor(Date.now() / 1000)) {
      throw new Error('Token expired');
    }
    
    return decodedPayload;
  } catch (error) {
    throw new Error('Invalid token');
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function calculateFocusScore(intensity, roi, burn, settings) {
  const weights = {
    intensity: settings?.weight_intensity || 0.6,
    roi: settings?.weight_roi || 0.3,
    burn: settings?.weight_burn || 0.1
  };
  
  const totalWeight = weights.intensity + weights.roi + weights.burn;
  const focusScore = (
    (weights.intensity * intensity) +
    (weights.roi * roi) +
    (weights.burn * burn)
  ) / totalWeight;
  
  return Math.round(focusScore * 10) / 10;
}

async function detectPR(userId, intensity, roi, db) {
  if (roi < 8) return false;
  
  const maxIntensity = await db.prepare(`
    SELECT MAX(intensity) as max_intensity
    FROM tasks WHERE user_id = ? AND roi >= 8
  `).bind(userId).first();
  
  if (!maxIntensity || !maxIntensity.max_intensity) return true;
  return intensity >= maxIntensity.max_intensity;
}

async function calculateStreaks(userId, db) {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0];
  
  const currentStreak = await db.prepare(
    'SELECT * FROM streaks WHERE user_id = ? AND streak_type = ?'
  ).bind(userId, 'frog').first();
  
  const todaysFrog = await db.prepare(
    'SELECT COUNT(*) as count FROM tasks WHERE user_id = ? AND date = ? AND is_frog = 1'
  ).bind(userId, today).first();
  
  let newCurrentStreak = 0;
  let newBestStreak = currentStreak?.best_streak || 0;
  
  if (todaysFrog && todaysFrog.count > 0) {
    if (currentStreak) {
      if (currentStreak.last_date === yesterday) {
        newCurrentStreak = currentStreak.current_streak + 1;
      } else if (currentStreak.last_date === today) {
        return;
      } else {
        newCurrentStreak = 1;
      }
    } else {
      newCurrentStreak = 1;
    }
    
    if (newCurrentStreak > newBestStreak) {
      newBestStreak = newCurrentStreak;
    }
    
    await db.prepare(`
      INSERT INTO streaks (user_id, streak_type, current_streak, best_streak, last_date)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, streak_type) DO UPDATE SET
        current_streak = excluded.current_streak,
        best_streak = excluded.best_streak,
        last_date = excluded.last_date,
        updated_at = CURRENT_TIMESTAMP
    `).bind(userId, 'frog', newCurrentStreak, newBestStreak, today).run();
  }
}

// ============================================
// CORS HEADERS
// ============================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ============================================
// MAIN HANDLER - Routes all requests
// ============================================

export async function onRequest(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);
  const path = params.route ? `/${params.route.join('/')}` : '/';
  const method = request.method;

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Route handling
  try {
    // ===== AUTHENTICATION ROUTES =====
    if (path === '/auth/register' && method === 'POST') {
      const { email, password } = await request.json();
      
      if (!email || !password) {
        return new Response(JSON.stringify({ error: 'Email and password required' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // Check if user exists
      const existingUser = await env.DB.prepare(
        'SELECT id FROM users WHERE email = ?'
      ).bind(email).first();
      
      if (existingUser) {
        return new Response(JSON.stringify({ error: 'Email already registered' }), {
          status: 409, headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // Create user
      const passwordHash = await hashPassword(password);
      const userId = crypto.randomUUID();
      
      await env.DB.prepare(
        'INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)'
      ).bind(userId, email, passwordHash).run();

      // Create default settings
      await env.DB.prepare(
        'INSERT INTO user_settings (user_id) VALUES (?)'
      ).bind(userId).run();

      const token = await generateJWT({ userId, email }, env.JWT_SECRET);

      return new Response(JSON.stringify({ 
        success: true, token, needsSubscription: true 
      }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    if (path === '/auth/login' && method === 'POST') {
      const { email, password } = await request.json();
      
      const user = await env.DB.prepare(
        'SELECT * FROM users WHERE email = ?'
      ).bind(email).first();
      
      if (!user || !(await verifyPassword(password, user.password_hash))) {
        return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
          status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      const hasActiveSubscription = user.subscription_status === 'active' && 
        new Date(user.subscription_end) > new Date();

      const token = await generateJWT({ 
        userId: user.id, 
        email: user.email,
        subscriptionActive: hasActiveSubscription
      }, env.JWT_SECRET);

      return new Response(JSON.stringify({ 
        success: true, token, subscriptionActive: hasActiveSubscription
      }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // ===== STRIPE CHECKOUT =====
    if (path === '/checkout' && method === 'POST') {
      const authHeader = request.headers.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      const token = authHeader.substring(7);
      const payload = await verifyJWT(token, env.JWT_SECRET);

      // Create Stripe checkout URL
      const baseUrl = 'https://checkout.stripe.com/c/pay/' + env.STRIPE_PRICE_ID;
      const checkoutUrl = `${baseUrl}#clientReferenceId=${payload.userId}&customerEmail=${payload.email}`;

      return new Response(JSON.stringify({ url: checkoutUrl }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // ===== STRIPE WEBHOOK =====
    if (path === '/stripe/webhook' && method === 'POST') {
      const body = await request.text();
      const signature = request.headers.get('stripe-signature');
      
      // For simplicity, we'll process without signature verification in this version
      // In production, you should verify the webhook signature
      const event = JSON.parse(body);

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const userId = session.client_reference_id;
        const customerId = session.customer;
        
        // Update user subscription
        await env.DB.prepare(`
          UPDATE users 
          SET stripe_customer_id = ?,
              subscription_status = 'active',
              subscription_end = datetime('now', '+1 month'),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(customerId, userId).run();
      }

      return new Response(JSON.stringify({ received: true }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // ===== PROTECTED ROUTES - Require Authentication =====
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const token = authHeader.substring(7);
    const user = await verifyJWT(token, env.JWT_SECRET);

    // Check subscription for protected routes
    const userRecord = await env.DB.prepare(
      'SELECT subscription_status, subscription_end FROM users WHERE id = ?'
    ).bind(user.userId).first();
    
    if (!userRecord || userRecord.subscription_status !== 'active' || 
        new Date(userRecord.subscription_end) <= new Date()) {
      return new Response(JSON.stringify({ 
        error: 'Subscription required', requiresPayment: true 
      }), {
        status: 402, headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // ===== TASKS ENDPOINTS =====
    if (path === '/tasks' && method === 'GET') {
      const tasks = await env.DB.prepare(
        'SELECT * FROM tasks WHERE user_id = ? ORDER BY date DESC, time_start DESC LIMIT 100'
      ).bind(user.userId).all();
      
      return new Response(JSON.stringify(tasks.results), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    if (path === '/tasks' && method === 'POST') {
      const taskData = await request.json();
      
      // Get user settings for focus score calculation
      const settings = await env.DB.prepare(
        'SELECT * FROM user_settings WHERE user_id = ?'
      ).bind(user.userId).first();
      
      const focusScore = calculateFocusScore(
        taskData.intensity,
        taskData.roi,
        taskData.burn,
        settings
      );

      const isPR = await detectPR(
        user.userId,
        taskData.intensity,
        taskData.roi,
        env.DB
      );

      const taskId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO tasks (
          id, user_id, date, time_start, task_name, minutes,
          is_frog, is_pr, burn, intensity, roi, action, notes,
          focus_score, fear_rating, satisfaction
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        taskId,
        user.userId,
        taskData.date || new Date().toISOString().split('T')[0],
        taskData.time_start || new Date().toTimeString().split(' ')[0].substring(0, 5),
        taskData.task_name,
        taskData.minutes || 25,
        taskData.is_frog ? 1 : 0,
        isPR ? 1 : 0,
        taskData.burn,
        taskData.intensity,
        taskData.roi,
        taskData.action || 'Keep',
        taskData.notes || '',
        focusScore,
        taskData.fear_rating || null,
        taskData.satisfaction || null
      ).run();

      if (taskData.is_frog) {
        await calculateStreaks(user.userId, env.DB);
      }

      return new Response(JSON.stringify({ 
        success: true, taskId, isPR, focusScore
      }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // ===== DASHBOARD ENDPOINT =====
    if (path === '/dashboard' && method === 'GET') {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString().split('T')[0];
      
      // Overall stats
      const overall = await env.DB.prepare(`
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
      `).bind(user.userId, thirtyDaysAgo).first();
      
      // Today's stats
      const today = new Date().toISOString().split('T')[0];
      const todayStats = await env.DB.prepare(`
        SELECT 
          COUNT(*) as tasks_today,
          AVG(intensity) as avg_intensity_today,
          SUM(CASE WHEN is_frog = 1 THEN 1 ELSE 0 END) as frogs_today,
          SUM(minutes) as minutes_today
        FROM tasks
        WHERE user_id = ? AND date = ?
      `).bind(user.userId, today).first();
      
      // Recent tasks
      const recentTasks = await env.DB.prepare(
        'SELECT * FROM tasks WHERE user_id = ? ORDER BY date DESC, time_start DESC LIMIT 10'
      ).bind(user.userId).all();
      
      // Streaks
      const streaks = await env.DB.prepare(
        'SELECT * FROM streaks WHERE user_id = ?'
      ).bind(user.userId).all();
      
      // Badges
      const badges = await env.DB.prepare(
        'SELECT * FROM badges WHERE user_id = ? ORDER BY earned_at DESC'
      ).bind(user.userId).all();
      
      // Week comparison
      const weekComparison = await env.DB.prepare(`
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
      `).bind(user.userId, thirtyDaysAgo).all();
      
      // Action breakdown
      const actionBreakdown = await env.DB.prepare(`
        SELECT 
          action,
          COUNT(*) as count,
          AVG(roi) as avg_roi
        FROM tasks
        WHERE user_id = ? AND date >= ?
        GROUP BY action
      `).bind(user.userId, thirtyDaysAgo).all();

      return new Response(JSON.stringify({
        stats: {
          overall,
          today: todayStats,
          weekComparison: weekComparison.results,
          actionBreakdown: actionBreakdown.results
        },
        recentTasks: recentTasks.results,
        streaks: streaks.results,
        badges: badges.results
      }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // ===== INSIGHTS ENDPOINT =====
    if (path === '/insights' && method === 'GET') {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString().split('T')[0];
      
      // Peak hours
      const peakHours = await env.DB.prepare(`
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
      `).bind(user.userId, thirtyDaysAgo).all();
      
      // Energy vampires
      const energyVampires = await env.DB.prepare(`
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
      `).bind(user.userId, thirtyDaysAgo).all();
      
      // Holy Trinity
      const holyTrinity = await env.DB.prepare(`
        SELECT *
        FROM tasks
        WHERE user_id = ? AND date >= ?
          AND is_frog = 1 
          AND is_pr = 1
          AND intensity >= 8
          AND roi >= 8
        ORDER BY date DESC
        LIMIT 10
      `).bind(user.userId, thirtyDaysAgo).all();
      
      // Recent intensity for burnout detection
      const recentIntensity = await env.DB.prepare(`
        SELECT AVG(intensity) as avg_intensity
        FROM (
          SELECT intensity 
          FROM tasks 
          WHERE user_id = ?
          ORDER BY date DESC, time_start DESC
          LIMIT 7
        )
      `).bind(user.userId).first();
      
      const needsRecovery = recentIntensity && recentIntensity.avg_intensity < 4;

      return new Response(JSON.stringify({
        peakHours: peakHours.results,
        energyVampires: energyVampires.results,
        holyTrinity: holyTrinity.results,
        needsRecovery,
        recentAvgIntensity: recentIntensity?.avg_intensity
      }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // ===== SETTINGS ENDPOINTS =====
    if (path === '/settings' && method === 'GET') {
      let settings = await env.DB.prepare(
        'SELECT * FROM user_settings WHERE user_id = ?'
      ).bind(user.userId).first();
      
      if (!settings) {
        await env.DB.prepare(
          'INSERT INTO user_settings (user_id) VALUES (?)'
        ).bind(user.userId).run();
        
        settings = await env.DB.prepare(
          'SELECT * FROM user_settings WHERE user_id = ?'
        ).bind(user.userId).first();
      }
      
      return new Response(JSON.stringify(settings), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    if (path === '/settings' && method === 'PUT') {
      const settings = await request.json();
      
      await env.DB.prepare(`
        UPDATE user_settings 
        SET weight_intensity = ?, weight_roi = ?, weight_burn = ?,
            theme = ?, timezone = ?, daily_intensity_target = ?,
            notifications_enabled = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `).bind(
        settings.weight_intensity,
        settings.weight_roi,
        settings.weight_burn,
        settings.theme,
        settings.timezone,
        settings.daily_intensity_target,
        settings.notifications_enabled ? 1 : 0,
        user.userId
      ).run();

      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // ===== TEMPLATES ENDPOINT =====
    if (path === '/templates' && method === 'GET') {
      const templates = await env.DB.prepare(`
        SELECT * FROM task_templates
        WHERE is_global = 1 OR user_id = ?
        ORDER BY category, task_name
      `).bind(user.userId).all();
      
      return new Response(JSON.stringify(templates.results), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // ===== SCORING GUIDE =====
    if (path === '/scoring-guide' && method === 'GET') {
      const results = await env.DB.prepare(
        'SELECT * FROM scoring_guide ORDER BY metric, score'
      ).all();
      
      return new Response(JSON.stringify(results.results), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // 404 for unmatched routes
    return new Response('Not Found', {
      status: 404,
      headers: corsHeaders
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}
