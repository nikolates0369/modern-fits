const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_PATH = path.join(__dirname, 'data.json');

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'modernfits-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname)));

// Email transporter (configure with your email service)
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER || 'your-email@gmail.com',
    pass: process.env.EMAIL_PASS || 'your-app-password'
  }
});

function readData() {
  const raw = fs.readFileSync(DATA_PATH, 'utf8');
  return JSON.parse(raw);
}

function writeData(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function ensurePasswordHashed(data) {
  const password = data?.admin?.password;
  if (!password) return;
  if (typeof password === 'string' && password.startsWith('$2')) return;

  const hash = bcrypt.hashSync(password, 10);
  data.admin.password = hash;
  writeData(data);
}

function authRequired(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized' });
}

app.get('/api/data', (req, res) => {
  try {
    const data = readData();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read data.json' });
  }
});

app.post('/api/login', (req, res) => {
  try {
    const data = readData();
    ensurePasswordHashed(data);

    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (username !== data.admin.username) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const match = bcrypt.compareSync(password, data.admin.password);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    req.session.user = { username };
    res.json({ username });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.get('/api/me', (req, res) => {
  if (req.session && req.session.user) {
    return res.json({ user: req.session.user });
  }
  res.status(401).json({ error: 'Not logged in' });
});

app.get('/api/products', (req, res) => {
  try {
    const data = readData();
    res.json(data.products || []);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read products' });
  }
});

app.post('/api/products', authRequired, (req, res) => {
  try {
    const data = readData();
    const product = req.body;

    if (!product || !product.title) {
      return res.status(400).json({ error: 'Invalid product payload' });
    }

    data.products = data.products || [];

    const highestId = data.products.reduce((max, p) => Math.max(max, p.id || 0), 0);
    product.id = product.id || highestId + 1;

    data.products.push(product);
    writeData(data);

    res.status(201).json(product);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save product' });
  }
});

app.put('/api/products/:id', authRequired, (req, res) => {
  try {
    const data = readData();
    const id = Number(req.params.id);
    const updated = req.body;

    if (!updated || !updated.title) {
      return res.status(400).json({ error: 'Invalid product payload' });
    }

    data.products = data.products || [];
    const idx = data.products.findIndex((p) => p.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Product not found' });
    }

    data.products[idx] = { ...data.products[idx], ...updated, id };
    writeData(data);

    res.json(data.products[idx]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update product' });
  }
});

app.delete('/api/products/:id', authRequired, (req, res) => {
  try {
    const data = readData();
    const id = Number(req.params.id);

    data.products = data.products || [];
    const idx = data.products.findIndex((p) => p.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Product not found' });
    }

    data.products.splice(idx, 1);
    writeData(data);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// Customer authentication
function customerAuthRequired(req, res, next) {
  if (req.session && req.session.customer) {
    return next();
  }
  res.status(401).json({ error: 'Customer not logged in' });
}

app.post('/api/customer/register', (req, res) => {
  try {
    const data = readData();
    const { username, password, email } = req.body || {};

    if (!username || !password || !email) {
      return res.status(400).json({ error: 'Username, password, and email are required' });
    }

    data.customers = data.customers || [];
    if (data.customers.find(c => c.username === username || c.email === email)) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    const hash = bcrypt.hashSync(password, 10);
    const customer = { id: Date.now(), username, email, password: hash };
    data.customers.push(customer);
    writeData(data);

    req.session.customer = { id: customer.id, username: customer.username, email: customer.email };
    res.json({ username: customer.username, email: customer.email });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/customer/login', (req, res) => {
  try {
    const data = readData();
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    data.customers = data.customers || [];
    const customer = data.customers.find(c => c.username === username);
    if (!customer || !bcrypt.compareSync(password, customer.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    req.session.customer = { id: customer.id, username: customer.username, email: customer.email };
    res.json({ username: customer.username, email: customer.email });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/customer/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.get('/api/customer/me', (req, res) => {
  if (req.session && req.session.customer) {
    return res.json({ customer: req.session.customer });
  }
  res.status(401).json({ error: 'Not logged in' });
});

// Orders
app.post('/api/orders', customerAuthRequired, (req, res) => {
  try {
    const data = readData();
    const { items, shippingInfo } = req.body || {};

    if (!items || !Array.isArray(items) || items.length === 0 || !shippingInfo) {
      return res.status(400).json({ error: 'Invalid order payload' });
    }

    data.orders = data.orders || [];
    const order = {
      id: Date.now(),
      customerId: req.session.customer.id,
      items,
      shippingInfo,
      total: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    data.orders.push(order);
    writeData(data);

    // Send order confirmation email
    sendOrderConfirmationEmail(order, data.contact);

    res.status(201).json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create order' });
  }
});

app.get('/api/orders', customerAuthRequired, (req, res) => {
  try {
    const data = readData();
    const customerOrders = (data.orders || []).filter(o => o.customerId === req.session.customer.id);
    res.json(customerOrders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Contact info
app.get('/api/contact', (req, res) => {
  try {
    const data = readData();
    data.contact = data.contact || {
      email: 'info@modernfits.com',
      phone: '+1 (555) 123-4567',
      about: 'Welcome to Modern Fits! We specialize in high-quality furniture and professional fitting services to make your home dreams a reality.',
      socials: {
        facebook: 'https://facebook.com/modernfits',
        instagram: 'https://instagram.com/modernfits',
        twitter: 'https://twitter.com/modernfits'
      }
    };
    res.json(data.contact);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read contact info' });
  }
});

app.put('/api/contact', authRequired, (req, res) => {
  try {
    const data = readData();
    data.contact = { ...data.contact, ...req.body };
    writeData(data);
    res.json(data.contact);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update contact info' });
  }
});

async function sendOrderConfirmationEmail(order, contact) {
  const customerEmail = order.shippingInfo.email;
  const subject = `Order Confirmation - Order #${order.id}`;
  const itemsHtml = order.items.map(item => `<li>${item.title} x${item.quantity} - $${(item.price * item.quantity).toFixed(2)}</li>`).join('');
  const html = `
    <h1>Thank you for your order!</h1>
    <p>Order ID: ${order.id}</p>
    <p>Total: $${order.total.toFixed(2)}</p>
    <h2>Items:</h2>
    <ul>${itemsHtml}</ul>
    <h2>Shipping Info:</h2>
    <p>${order.shippingInfo.firstName} ${order.shippingInfo.lastName}</p>
    <p>${order.shippingInfo.address}</p>
    <p>${order.shippingInfo.city}, ${order.shippingInfo.zipCode}</p>
    <p>${order.shippingInfo.phone}</p>
    <p>Contact us at ${contact?.email || 'info@modernfits.com'} if you have any questions.</p>
  `;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER || 'your-email@gmail.com',
      to: customerEmail,
      subject,
      html
    });
    console.log('Order confirmation email sent to', customerEmail);
  } catch (error) {
    console.error('Failed to send email:', error);
  }
}

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log('Serving static site and simple API endpoints.');
});
