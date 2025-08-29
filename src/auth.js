// Authentication module for IntensifyHQ

// Hash password using Web Crypto API
export async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  
  const key = await crypto.subtle.importKey(
    'raw',
    data,
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  
  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    key,
    256
  );
  
  const hashArray = new Uint8Array(hashBuffer);
  const saltAndHash = new Uint8Array(salt.length + hashArray.length);
  saltAndHash.set(salt);
  saltAndHash.set(hashArray, salt.length);
  
  return btoa(String.fromCharCode(...saltAndHash));
}

// Verify password
export async function verifyPassword(password, hash) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  
  const saltAndHash = Uint8Array.from(atob(hash), c => c.charCodeAt(0));
  const salt = saltAndHash.slice(0, 16);
  const storedHash = saltAndHash.slice(16);
  
  const key = await crypto.subtle.importKey(
    'raw',
    data,
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  
  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    key,
    256
  );
  
  const hashArray = new Uint8Array(hashBuffer);
  
  return hashArray.every((byte, i) => byte === storedHash[i]);
}

// Generate JWT token
export async function generateJWT(payload, secret) {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };
  
  const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, '');
  const encodedPayload = btoa(JSON.stringify({
    ...payload,
    exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 7 days
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
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  
  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

// Verify JWT token
export async function verifyJWT(token, secret) {
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
      'HMAC',
      key,
      signatureBuffer,
      encoder.encode(`${header}.${payload}`)
    );
    
    if (!valid) {
      throw new Error('Invalid signature');
    }
    
    const decodedPayload = JSON.parse(atob(payload));
    
    if (decodedPayload.exp < Math.floor(Date.now() / 1000)) {
      throw new Error('Token expired');
    }
    
    return decodedPayload;
  } catch (error) {
    throw new Error('Invalid token');
  }
}

// Middleware to require authentication
export async function requireAuth(request, env) {
  try {
    const authorization = request.headers.get('Authorization');
    
    if (!authorization || !authorization.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const token = authorization.substring(7);
    const payload = await verifyJWT(token, env.JWT_SECRET);
    
    // Check subscription status
    if (!payload.subscriptionActive) {
      const user = await env.DB.prepare(
        'SELECT subscription_status, subscription_end FROM users WHERE id = ?'
      ).bind(payload.userId).first();
      
      if (!user || user.subscription_status !== 'active' || 
          new Date(user.subscription_end) <= new Date()) {
        return new Response(JSON.stringify({ 
          error: 'Subscription required',
          requiresPayment: true 
        }), {
          status: 402,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    request.user = payload;
    return;
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Handle auth for routes
export function handleAuth(handler) {
  return async (request, env, ctx) => {
    const authResult = await requireAuth(request, env);
    if (authResult) {
      return authResult;
    }
    return handler(request, env, ctx);
  };
}
