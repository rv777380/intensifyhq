// IntensifyHQ - Main Cloudflare Worker
import { Router } from 'itty-router';
import { handleAuth, requireAuth, hashPassword, verifyPassword, generateJWT, verifyJWT } from './auth';
import { createCheckoutSession, handleStripeWebhook } from './stripe';
import { Database } from './database';
import { calculateFocusScore, detectPR, calculateStreaks } from './utils';

const router = Router();

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Handle CORS preflight
router.options('*', () => {
  return new Response(null, { headers: corsHeaders });
});

// Serve static files
router.get('/', async (request, env) => {
  const html = await env.ASSETS.get('index.html');
  return new Response(html, {
    headers: { 'Content-Type': 'text/html', ...corsHeaders }
  });
});

router.get('/dashboard', requireAuth, async (request, env) => {
  const html = await env.ASSETS.get('dashboard.html');
  return new Response(html, {
    headers: { 'Content-Type': 'text/html', ...corsHeaders }
  });
});

router.get('/app.js', async (request, env) => {
  const js = await env.ASSETS.get('app.js');
  return new Response(js, {
    headers: { 'Content-Type': 'application/javascript', ...corsHeaders }
  });
});

router.get('/styles.css', async (request, env) => {
  const css = await env.ASSETS.get('styles.css');
  return new Response(css, {
    headers: { 'Content-Type': 'text/css', ...corsHeaders }
  });
});

// Auth endpoints
router.post('/api/auth/register', async (request, env) => {
  try {
    const { email, password } = await request.json();
    
    if (!email || !password) {
      return new Response(JSON.stringify({ error: 'Email and password required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const db = new Database(env.DB);
    
    // Check if user exists
    const existingUser = await db.getUserByEmail(email);
    if (existingUser) {
      return new Response(JSON.stringify({ error: 'Email already registered' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
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

    // Generate JWT
    const token = await generateJWT({ userId, email }, env.JWT_SECRET);

    return new Response(JSON.stringify({ 
      success: true, 
      token,
      needsSubscription: true 
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});

router.post('/api/auth/login', async (request, env) => {
  try {
    const { email, password } = await request.json();
    
    const db = new Database(env.DB);
    const user = await db.getUserByEmail(email);
    
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Check subscription status
    const hasActiveSubscription = user.subscription_status === 'active' && 
      new Date(user.subscription_end) > new Date();

    const token = await generateJWT({ 
      userId: user.id, 
      email: user.email,
      subscriptionActive: hasActiveSubscription
    }, env.JWT_SECRET);

    return new Response(JSON.stringify({ 
      success: true, 
      token,
      subscriptionActive: hasActiveSubscription
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});

// Stripe checkout
router.post('/api/checkout', requireAuth, async (request, env) => {
  try {
    const user = request.user;
    const sessionUrl = await createCheckoutSession(
      user.email,
      user.userId,
      env.STRIPE_SECRET_KEY,
      env.STRIPE_PRICE_ID
    );

    return new Response(JSON.stringify({ url: sessionUrl }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});

// Stripe webhook
router.post('/api/stripe/webhook', async (request, env) => {
  try {
    const signature = request.headers.get('stripe-signature');
    const body = await request.text();
    
    await handleStripeWebhook(body, signature, env);
    
    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});

// Tasks endpoints
router.get('/api/tasks', requireAuth, async (request, env) => {
  try {
    const user = request.user;
    const db = new Database(env.DB);
    
    const url = new URL(request.url);
    const date = url.searchParams.get('date');
    const limit = parseInt(url.searchParams.get('limit') || '100');
    
    const tasks = await db.getTasks(user.userId, date, limit);
    
    return new Response(JSON.stringify(tasks), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});

router.post('/api/tasks', requireAuth, async (request, env) => {
  try {
    const user = request.user;
    const taskData = await request.json();
    
    // Calculate focus score
    const db = new Database(env.DB);
    const settings = await db.getUserSettings(user.userId);
    
    const focusScore = calculateFocusScore(
      taskData.intensity,
      taskData.roi,
      taskData.burn,
      settings
    );

    // Check for PR
    const isPR = await detectPR(
      user.userId,
      taskData.intensity,
      taskData.roi,
      env.DB
    );

    // Insert task
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
      taskData.time_start,
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

    // Update streaks if it's a frog
    if (taskData.is_frog) {
      await calculateStreaks(user.userId, env.DB);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      taskId,
      isPR,
      focusScore
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});

// Dashboard endpoint
router.get('/api/dashboard', requireAuth, async (request, env) => {
  try {
    const user = request.user;
    const db = new Database(env.DB);
    
    // Get dashboard stats
    const stats = await db.getDashboardStats(user.userId);
    const recentTasks = await db.getTasks(user.userId, null, 50);
    const streaks = await db.getStreaks(user.userId);
    const badges = await db.getBadges(user.userId);
    
    return new Response(JSON.stringify({
      stats,
      recentTasks,
      streaks,
      badges
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});

// Insights endpoint
router.get('/api/insights', requireAuth, async (request, env) => {
  try {
    const user = request.user;
    const db = new Database(env.DB);
    
    const insights = await db.getInsights(user.userId);
    
    return new Response(JSON.stringify(insights), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});

// Settings endpoints
router.get('/api/settings', requireAuth, async (request, env) => {
  try {
    const user = request.user;
    const db = new Database(env.DB);
    
    const settings = await db.getUserSettings(user.userId);
    
    return new Response(JSON.stringify(settings), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});

router.put('/api/settings', requireAuth, async (request, env) => {
  try {
    const user = request.user;
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
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});

// Task templates
router.get('/api/templates', requireAuth, async (request, env) => {
  try {
    const user = request.user;
    const db = new Database(env.DB);
    
    const templates = await db.getTaskTemplates(user.userId);
    
    return new Response(JSON.stringify(templates), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});

// Scoring guide
router.get('/api/scoring-guide', async (request, env) => {
  try {
    const results = await env.DB.prepare(
      'SELECT * FROM scoring_guide ORDER BY metric, score'
    ).all();
    
    return new Response(JSON.stringify(results.results), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});

// 404 handler
router.all('*', () => {
  return new Response('Not Found', {
    status: 404,
    headers: corsHeaders
  });
});

// Export worker
export default {
  async fetch(request, env, ctx) {
    return router.handle(request, env, ctx);
  }
};
