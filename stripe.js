// Stripe integration for IntensifyHQ

// Create Stripe checkout session
export async function createCheckoutSession(email, userId, stripeKey, priceId) {
  const stripe = require('stripe')(stripeKey);
  
  // Create or retrieve customer
  const customers = await stripe.customers.list({
    email: email,
    limit: 1
  });
  
  let customer;
  if (customers.data.length > 0) {
    customer = customers.data[0];
  } else {
    customer = await stripe.customers.create({
      email: email,
      metadata: {
        userId: userId
      }
    });
  }
  
  // Create checkout session
  const session = await stripe.checkout.sessions.create({
    customer: customer.id,
    payment_method_types: ['card'],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    mode: 'subscription',
    success_url: `${process.env.APP_URL}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.APP_URL}/`,
    metadata: {
      userId: userId
    }
  });
  
  return session.url;
}

// Handle Stripe webhook events
export async function handleStripeWebhook(body, signature, env) {
  const stripe = require('stripe')(env.STRIPE_SECRET_KEY);
  
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    throw new Error(`Webhook signature verification failed: ${err.message}`);
  }
  
  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutComplete(event.data.object, env);
      break;
      
    case 'customer.subscription.updated':
      await handleSubscriptionUpdate(event.data.object, env);
      break;
      
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object, env);
      break;
      
    case 'invoice.payment_succeeded':
      await handlePaymentSucceeded(event.data.object, env);
      break;
      
    case 'invoice.payment_failed':
      await handlePaymentFailed(event.data.object, env);
      break;
      
    default:
      console.log(`Unhandled event type ${event.type}`);
  }
}

// Handle successful checkout
async function handleCheckoutComplete(session, env) {
  const userId = session.metadata.userId;
  const customerId = session.customer;
  const subscriptionId = session.subscription;
  
  // Get subscription details from Stripe
  const stripe = require('stripe')(env.STRIPE_SECRET_KEY);
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  
  // Update user record
  await env.DB.prepare(`
    UPDATE users 
    SET stripe_customer_id = ?,
        subscription_status = 'active',
        subscription_end = datetime(?, 'unixepoch'),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    customerId,
    subscription.current_period_end,
    userId
  ).run();
  
  // Create welcome badge
  await env.DB.prepare(`
    INSERT OR IGNORE INTO badges (user_id, badge_type, badge_level)
    VALUES (?, 'subscriber', 'bronze')
  `).bind(userId).run();
}

// Handle subscription update
async function handleSubscriptionUpdate(subscription, env) {
  const customerId = subscription.customer;
  
  // Find user by customer ID
  const user = await env.DB.prepare(
    'SELECT id FROM users WHERE stripe_customer_id = ?'
  ).bind(customerId).first();
  
  if (!user) {
    console.error(`User not found for customer ${customerId}`);
    return;
  }
  
  // Update subscription status
  const status = subscription.status === 'active' ? 'active' : 'inactive';
  
  await env.DB.prepare(`
    UPDATE users 
    SET subscription_status = ?,
        subscription_end = datetime(?, 'unixepoch'),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    status,
    subscription.current_period_end,
    user.id
  ).run();
}

// Handle subscription cancellation
async function handleSubscriptionDeleted(subscription, env) {
  const customerId = subscription.customer;
  
  // Find user by customer ID
  const user = await env.DB.prepare(
    'SELECT id FROM users WHERE stripe_customer_id = ?'
  ).bind(customerId).first();
  
  if (!user) {
    console.error(`User not found for customer ${customerId}`);
    return;
  }
  
  // Update subscription status
  await env.DB.prepare(`
    UPDATE users 
    SET subscription_status = 'cancelled',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(user.id).run();
}

// Handle successful payment
async function handlePaymentSucceeded(invoice, env) {
  const customerId = invoice.customer;
  
  // Find user by customer ID
  const user = await env.DB.prepare(
    'SELECT id FROM users WHERE stripe_customer_id = ?'
  ).bind(customerId).first();
  
  if (!user) {
    console.error(`User not found for customer ${customerId}`);
    return;
  }
  
  // Update subscription end date
  const stripe = require('stripe')(env.STRIPE_SECRET_KEY);
  const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
  
  await env.DB.prepare(`
    UPDATE users 
    SET subscription_status = 'active',
        subscription_end = datetime(?, 'unixepoch'),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    subscription.current_period_end,
    user.id
  ).run();
}

// Handle failed payment
async function handlePaymentFailed(invoice, env) {
  const customerId = invoice.customer;
  
  // Find user by customer ID
  const user = await env.DB.prepare(
    'SELECT id, email FROM users WHERE stripe_customer_id = ?'
  ).bind(customerId).first();
  
  if (!user) {
    console.error(`User not found for customer ${customerId}`);
    return;
  }
  
  // Update subscription status
  await env.DB.prepare(`
    UPDATE users 
    SET subscription_status = 'past_due',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(user.id).run();
  
  // TODO: Send email notification about failed payment
  console.log(`Payment failed for user ${user.email}`);
}

// Check if user has active subscription
export async function hasActiveSubscription(userId, env) {
  const user = await env.DB.prepare(
    'SELECT subscription_status, subscription_end FROM users WHERE id = ?'
  ).bind(userId).first();
  
  if (!user) {
    return false;
  }
  
  return user.subscription_status === 'active' && 
         new Date(user.subscription_end) > new Date();
}

// Create portal session for managing subscription
export async function createPortalSession(customerId, stripeKey) {
  const stripe = require('stripe')(stripeKey);
  
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${process.env.APP_URL}/dashboard`,
  });
  
  return session.url;
}
