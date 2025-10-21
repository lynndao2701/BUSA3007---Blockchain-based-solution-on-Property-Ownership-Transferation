require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./connect');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// CORS – allow CRA on 3007
app.use(cors({ origin: 'http://localhost:3007', credentials: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.json());

// DB
connectDB();

// Routes
const authRoutes = require('./routes/auth');
const propertyRoutes = require('./routes/property'); 
const web3Routes =  require('./routes/web3');
const userRoutes =  require('./routes/user');
const uploadRoutes =  require('./routes/upload');
const onchainRoutes =  require('./routes/onchain');

app.use('/property', authRoutes);
app.use('/property', propertyRoutes);
app.use('/web3', web3Routes);
app.use('/user', userRoutes);
app.use('/upload', uploadRoutes);
app.use("/onchain", onchainRoutes);

app.get('/property/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
