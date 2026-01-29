require('dotenv').config();

const express = require('express');
const cors = require('cors');
const supabase = require('./supabaseClient');

const app = express();

const clientsRouter = require('./routes/clients');
const projectsRouter = require('./routes/projects');
const publicRouter = require('./routes/public');

const corsOptions = {
  origin: true, // Re-enabling permissive CORS to fix your connection issue
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

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Application Error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
