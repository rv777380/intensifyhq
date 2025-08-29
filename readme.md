# IntensifyHQ - Work Like You Train

A powerful productivity web application that applies gym training principles to work. Track intensity, burn, and ROI for every task while following proven methodologies like "Eat That Frog" and the 80/20 principle.

## Features

- **Quick Task Logging**: Log tasks with intensity, ROI, and burn metrics
- **Personal Records (PR)**: Celebrate breakthrough achievements
- **Frog Tracking**: Tackle your hardest tasks first
- **Visual Dashboard**: Charts and insights to optimize performance
- **Streak Tracking**: Build consistent habits
- **Smart Insights**: Identify peak hours and energy vampires
- **Week Planning**: Plan your frogs and intensity targets
- **Gamification**: Badges, celebrations, and progress tracking

## Tech Stack

- **Backend**: Cloudflare Workers (Edge computing)
- **Database**: Cloudflare D1 (SQLite)
- **Payments**: Stripe ($0.99/month subscription)
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Authentication**: JWT tokens
- **Hosting**: Cloudflare Pages

## Quick Start

### Prerequisites

- Node.js 16+ and npm
- Cloudflare account (free)
- Stripe account
- Git

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/intensifyhq.git
cd intensifyhq
```

2. **Install dependencies**
```bash
npm install
```

3. **Login to Cloudflare**
```bash
npx wrangler login
```

4. **Create D1 Database**
```bash
npx wrangler d1 create intensifyhq-db
```
Copy the database_id from the output.

5. **Update wrangler.toml**
Replace the following placeholders:
- `YOUR_ACCOUNT_ID`: Your Cloudflare account ID
- `YOUR_DATABASE_ID`: The database_id from step 4
- `pk_live_YOUR_PUBLISHABLE_KEY`: Your Stripe publishable key

6. **Run database migrations**
```bash
npm run migrate:local  # For local development
npm run migrate:remote # For production
```

7. **Set up Stripe**

Create a product in Stripe Dashboard:
- Product name: "IntensifyHQ Pro"
- Price: $0.99/month recurring
- Copy the price_id

8. **Configure secrets**
```bash
# Stripe secret key
npx wrangler secret put STRIPE_SECRET_KEY
# Enter your Stripe secret key when prompted

# Stripe price ID
npx wrangler secret put STRIPE_PRICE_ID
# Enter your price_id when prompted

# JWT secret (generate a random string)
npx wrangler secret put JWT_SECRET
# Enter a random 32+ character string

# Stripe webhook secret (get after setting up webhook)
npx wrangler secret put STRIPE_WEBHOOK_SECRET
```

9. **Deploy to Cloudflare**
```bash
npm run deploy
```

Your app will be available at: `https://intensifyhq.YOUR-SUBDOMAIN.workers.dev`

10. **Set up Stripe webhook**

In Stripe Dashboard:
- Go to Webhooks
- Add endpoint: `https://intensifyhq.YOUR-SUBDOMAIN.workers.dev/api/stripe/webhook`
- Select events:
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`
- Copy the signing secret to STRIPE_WEBHOOK_SECRET

## Project Structure

```
intensifyhq/
├── src/
│   ├── index.js          # Main worker entry point
│   ├── auth.js           # Authentication logic
│   ├── stripe.js         # Stripe integration
│   ├── database.js       # Database queries
│   └── utils.js          # Utility functions
├── public/
│   ├── index.html        # Landing page
│   ├── dashboard.html    # Main app
│   ├── app.js           # Frontend JavaScript
│   ├── styles.css       # Styles
│   └── manifest.json    # PWA manifest
├── migrations/
│   └── 0001_initial.sql # Database schema
├── wrangler.toml        # Cloudflare config
├── package.json         # Dependencies
└── README.md           # Documentation
```

## Development

### Local Development
```bash
npm run dev
```
Visit http://localhost:8787

### View Logs
```bash
npm run tail
```

### Database Management

Execute SQL directly:
```bash
npx wrangler d1 execute intensifyhq-db --command "SELECT * FROM users"
```

### Testing

Run tests:
```bash
npm test
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Login
- `GET /api/auth/logout` - Logout

### Tasks
- `GET /api/tasks` - Get user's tasks
- `POST /api/tasks` - Create task
- `PUT /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task

### Dashboard
- `GET /api/dashboard` - Dashboard stats
- `GET /api/insights` - Analytics data
- `GET /api/scoring-guide` - Scoring guidelines

### Settings
- `GET /api/settings` - User settings
- `PUT /api/settings` - Update settings

### Payments
- `POST /api/checkout` - Create Stripe checkout
- `POST /api/stripe/webhook` - Handle Stripe webhooks

## Deployment Checklist

- [ ] Database created and migrated
- [ ] All secrets configured
- [ ] Stripe product and webhook set up
- [ ] Custom domain configured (optional)
- [ ] SSL certificate active
- [ ] Environment variables set
- [ ] Initial deploy successful
- [ ] Webhook endpoint verified
- [ ] Test payment flow
- [ ] Mobile responsive verified

## Custom Domain (Optional)

1. Add domain to Cloudflare
2. Update wrangler.toml:
```toml
route = "intensifyhq.com/*"
zone_id = "YOUR_ZONE_ID"
```
3. Deploy again

## Monitoring

- **Cloudflare Analytics**: Built-in analytics in Cloudflare dashboard
- **Worker Metrics**: CPU time, requests, errors
- **D1 Metrics**: Database performance
- **Stripe Dashboard**: Payment metrics

## Cost Analysis

### Infrastructure (within free tiers)
- Cloudflare Workers: 100,000 requests/day free
- Cloudflare D1: 5GB storage free
- Total: $0/month for most users

### Payment Processing
- Stripe: 2.9% + $0.30 per transaction
- For $0.99 subscription: ~$0.33 fee
- Net per user: ~$0.66/month

## Support

For issues or questions:
1. Check the [documentation](#features)
2. Open a GitHub issue
3. Email support@intensifyhq.com

## Philosophy

IntensifyHQ combines three proven methodologies:

1. **Work Burn Training Plan (WBTP)**: Treat work like athletic training with progressive overload
2. **4-Hour Work Week**: Focus on high-value tasks (80/20 principle)
3. **Eat That Frog**: Do the hardest task first when energy is highest

## Scoring Guide

### Intensity (1-10)
- 1-3: Trivial to easy tasks
- 4-6: Average difficulty
- 7-8: Very challenging
- 9-10: Maximum effort, career-defining

### ROI (1-10)
- 1-3: Low value, busywork
- 4-6: Standard value
- 7-8: High value, strategic
- 9-10: Mission-critical

### Burn (1-10)
- 1-3: Energizing to light
- 4-6: Average energy use
- 7-8: Taxing, need recovery
- 9-10: Total exhaustion

## License

MIT License - See LICENSE file for details

## Contributing

Contributions welcome! Please read CONTRIBUTING.md first.

## Roadmap

- [ ] Team features
- [ ] Mobile app
- [ ] AI insights
- [ ] Calendar integration
- [ ] Slack/Discord bots
- [ ] Advanced analytics
- [ ] Export functionality
- [ ] API for third-party apps

---

Built with 💪 by the IntensifyHQ team
