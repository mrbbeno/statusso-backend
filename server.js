require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { supabase } = require('./supabaseClient');

const app = express();

const clientsRouter = require('./routes/clients');
const { router: projectsRouter } = require('./routes/projects');
const publicRouter = require('./routes/public');
const statsRouter = require('./routes/stats');
const teamRouter = require('./routes/team');
const workspaceRouter = require('./routes/workspace');

// SECURITY: Whitelist allowed origins instead of permissive `origin: true`
const ALLOWED_ORIGINS = [
  (process.env.FRONTEND_URL || '').replace(/\/$/, ''), // Production frontend (strip trailing slash)
  'https://statusso-frontend.vercel.app',    // Explicit fallback for production
  'http://localhost:3001',                     // Local development (NO trailing slash!)
  'http://localhost:3000',                     // Alternative local port
].filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`[CORS] Blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

// Logger to see what's happening
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url} - Origin: ${req.headers.origin}`);
  next();
});
app.get('/', (req, res) => {
  res.send('Backend is running');
});

// Csak route-ok
app.use('/clients', clientsRouter);
app.use('/projects', projectsRouter);
app.use('/public', publicRouter);
app.use('/stripe', require('./routes/stripe-connect')); // NEW Stripe Connect routes
app.use('/stats', statsRouter);
app.use('/team', teamRouter);
app.use('/workspace', workspaceRouter);
app.use('/invoices', require('./routes/invoices'));

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Application Error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

const { initCron } = require('./cron/recurringInvoices');
initCron();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
