const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const { createClient } = require('@supabase/supabase-js');

// Load dotenv only in development (not on Vercel)
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Supabase (optional) and optionally fall back to a local JSON data store.
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

let supabase = null;
const useLocalDb = !supabaseUrl || !supabaseKey;

if (useLocalDb) {
  console.warn('⚠️ Supabase env vars not set. Using local JSON data store (data.json).');
} else {
  supabase = createClient(supabaseUrl, supabaseKey);
}

const DATA_FILE = path.join(__dirname, 'data.json');

function readData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (err) {
    if (err.code === 'ENOENT') {
      return {};
    }
    throw err;
  }
}

function writeData(data) {
  if (process.env.VERCEL) {
    console.warn('Skipping write to data.json on Vercel (read-only environment). Changes will not persist.');
    return;
  }
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.warn('Could not write to data.json (read-only environment?). Changes will not persist.', err.message);
  }
}

function ensureLocalData() {
  const data = readData();
  let changed = false;

  if (!data.admin) {
    data.admin = {
      username: 'admin',
      // bcrypt hash of "admin" (same as before)
      password: '$2a$10$hT7uKuAq3YdEey5N55Yj4uxvM5tDASog3xpm3XtZ4.uXr5kvKhtVe'
    };
    changed = true;
  }

  if (!Array.isArray(data.products)) {
    data.products = [];
    changed = true;
  }

  if (!Array.isArray(data.customers)) {
    data.customers = [];
    changed = true;
  }

  if (!Array.isArray(data.orders)) {
    data.orders = [];
    changed = true;
  }

  if (!data.contact) {
    data.contact = {
      email: 'info@modernfits.com',
      phone: '+1 (555) 123-4567',
      about: 'Welcome to Modern Fits! We specialize in high-quality furniture and professional fitting services to make your home dreams a reality.',
      socials: {
        facebook: 'https://facebook.com/modernfits',
        instagram: 'https://instagram.com/modernfits',
        twitter: 'https://twitter.com/modernfits'
      }
    };
    changed = true;
  }

  if (changed) {
    writeData(data);
  }

  return data;
}

function requireDataStore(req, res) {
  if (supabase) return true;

  try {
    ensureLocalData();
    return true;
  } catch (err) {
    console.error('Local data store error:', err);
    res.status(500).json({ error: 'Local data store is unavailable' });
    return false;
  }
}

function getNextId(items) {
  const maxId = items.reduce((max, item) => Math.max(max, Number(item?.id) || 0), 0);
  return maxId + 1;
}


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
let transporter;
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
} else {
  console.warn('⚠️ Email not configured - order confirmation emails will not be sent');
  transporter = null;
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

app.get('/api/db-mode', (req, res) => {
  res.json({
    mode: supabase ? 'supabase' : 'local-json',
    vercel: !!process.env.VERCEL,
    writable: !process.env.VERCEL
  });
});

app.post('/api/login', async (req, res) => {
  if (!requireDataStore(req, res)) return;

  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (supabase) {
      const { data: admin, error } = await supabase
        .from('admins')
        .select('*')
        .eq('username', username)
        .single();

      if (error || !admin) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const match = bcrypt.compareSync(password, admin.password);
      if (!match) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      req.session.user = { username: admin.username, id: admin.id };
      res.json({ username: admin.username });
    } else {
      const data = ensureLocalData();
      const admin = data.admin;

      if (!admin || username !== admin.username || !bcrypt.compareSync(password, admin.password)) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      req.session.user = { username: admin.username };
      res.json({ username: admin.username });
    }
  } catch (err) {
    console.error('Login error:', err);
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

app.get('/api/products', async (req, res) => {
  if (!requireDataStore(req, res)) return;

  try {
    if (supabase) {
      const { data: products, error } = await supabase
        .from('products')
        .select('*')
        .order('id');

      if (error) throw error;
      res.json(products || []);
    } else {
      const data = ensureLocalData();
      const products = Array.isArray(data.products) ? data.products : [];
      products.sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
      res.json(products);
    }
  } catch (err) {
    console.error('Products fetch error:', err);
    res.status(500).json({ error: 'Failed to read products' });
  }
});

app.post('/api/products', authRequired, async (req, res) => {
  if (!requireDataStore(req, res)) return;

  try {
    const product = req.body;

    if (!product || !product.title) {
      return res.status(400).json({ error: 'Invalid product payload' });
    }

    if (supabase) {
      const { data, error } = await supabase
        .from('products')
        .insert([product])
        .select()
        .single();

      if (error) throw error;
      res.status(201).json(data);
    } else {
      const data = ensureLocalData();
      const products = data.products || [];
      const nextId = getNextId(products);
      const newProduct = { ...product, id: nextId };

      products.push(newProduct);
      writeData(data);

      res.status(201).json(newProduct);
    }
  } catch (err) {
    console.error('Product creation error:', err);
    res.status(500).json({ error: 'Failed to save product' });
  }
});

app.put('/api/products/:id', authRequired, async (req, res) => {
  if (!requireDataStore(req, res)) return;

  try {
    const id = Number(req.params.id);
    const updated = req.body;

    if (!updated || !updated.title) {
      return res.status(400).json({ error: 'Invalid product payload' });
    }

    if (supabase) {
      const { data, error } = await supabase
        .from('products')
        .update(updated)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      if (!data) {
        return res.status(404).json({ error: 'Product not found' });
      }

      res.json(data);
    } else {
      const data = ensureLocalData();
      const products = data.products || [];
      const idx = products.findIndex(p => Number(p.id) === id);
      if (idx === -1) {
        return res.status(404).json({ error: 'Product not found' });
      }

      products[idx] = { ...products[idx], ...updated, id };
      writeData(data);

      res.json(products[idx]);
    }
  } catch (err) {
    console.error('Product update error:', err);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

app.delete('/api/products/:id', authRequired, async (req, res) => {
  if (!requireDataStore(req, res)) return;

  try {
    const id = Number(req.params.id);

    if (supabase) {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id);

      if (error) throw error;
      res.json({ ok: true });
    } else {
      const data = ensureLocalData();
      const products = data.products || [];
      const filtered = products.filter(p => Number(p.id) !== id);
      if (filtered.length === products.length) {
        return res.status(404).json({ error: 'Product not found' });
      }

      data.products = filtered;
      writeData(data);

      res.json({ ok: true });
    }
  } catch (err) {
    console.error('Product deletion error:', err);
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

app.post('/api/customer/register', async (req, res) => {
  if (!requireDataStore(req, res)) return;

  try {
    const { username, password, email } = req.body || {};

    if (!username || !password || !email) {
      return res.status(400).json({ error: 'Username, password, and email are required' });
    }

    if (supabase) {
      // Check if user already exists
      const { data: existing } = await supabase
        .from('customers')
        .select('id')
        .or(`username.eq.${username},email.eq.${email}`)
        .single();

      if (existing) {
        return res.status(400).json({ error: 'Username or email already exists' });
      }

      const hash = bcrypt.hashSync(password, 10);
      const { data: customer, error } = await supabase
        .from('customers')
        .insert([{ username, email, password: hash }])
        .select()
        .single();

      if (error) throw error;

      req.session.customer = { id: customer.id, username: customer.username, email: customer.email };
      res.json({ username: customer.username, email: customer.email });
    } else {
      const data = ensureLocalData();
      const customers = data.customers || [];

      const exists = customers.find(c => c.username === username || c.email === email);
      if (exists) {
        return res.status(400).json({ error: 'Username or email already exists' });
      }

      const hash = bcrypt.hashSync(password, 10);
      const newCustomer = { id: getNextId(customers), username, email, password: hash };
      customers.push(newCustomer);
      writeData(data);

      req.session.customer = { id: newCustomer.id, username: newCustomer.username, email: newCustomer.email };
      res.json({ username: newCustomer.username, email: newCustomer.email });
    }
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/customer/login', async (req, res) => {
  if (!requireDataStore(req, res)) return;

  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (supabase) {
      const { data: customer, error } = await supabase
        .from('customers')
        .select('*')
        .eq('username', username)
        .single();

      if (error || !customer || !bcrypt.compareSync(password, customer.password)) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      req.session.customer = { id: customer.id, username: customer.username, email: customer.email };
      res.json({ username: customer.username, email: customer.email });
    } else {
      const data = ensureLocalData();
      const customers = data.customers || [];
      const customer = customers.find(c => c.username === username);

      if (!customer || !bcrypt.compareSync(password, customer.password)) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      req.session.customer = { id: customer.id, username: customer.username, email: customer.email };
      res.json({ username: customer.username, email: customer.email });
    }
  } catch (err) {
    console.error('Customer login error:', err);
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
app.post('/api/orders', customerAuthRequired, async (req, res) => {
  if (!requireDataStore(req, res)) return;

  try {
    const { items, shippingInfo } = req.body || {};

    if (!items || !Array.isArray(items) || items.length === 0 || !shippingInfo) {
      return res.status(400).json({ error: 'Invalid order payload' });
    }

    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const order = {
      customer_id: req.session.customer.id,
      items: JSON.stringify(items),
      shipping_info: JSON.stringify(shippingInfo),
      total,
      status: 'pending',
      created_at: new Date().toISOString()
    };

    if (supabase) {
      const { data, error } = await supabase
        .from('orders')
        .insert([order])
        .select()
        .single();

      if (error) throw error;

      // Get contact info for email
      const { data: contact } = await supabase
        .from('contact')
        .select('*')
        .single();

      // Send order confirmation email
      sendOrderConfirmationEmail({ ...data, items: JSON.parse(data.items), shippingInfo: JSON.parse(data.shipping_info) }, contact);

      res.status(201).json(data);
    } else {
      const data = ensureLocalData();
      const orders = data.orders || [];
      const newOrder = { id: getNextId(orders), ...order };

      orders.push(newOrder);
      writeData(data);

      const contact = data.contact;
      sendOrderConfirmationEmail({ ...newOrder, items, shippingInfo }, contact);

      res.status(201).json(newOrder);
    }
  } catch (err) {
    console.error('Order creation error:', err);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

app.get('/api/orders', customerAuthRequired, async (req, res) => {
  if (!requireDataStore(req, res)) return;

  try {
    if (supabase) {
      const { data: orders, error } = await supabase
        .from('orders')
        .select('*')
        .eq('customer_id', req.session.customer.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Parse JSON fields
      const parsedOrders = orders.map(order => ({
        ...order,
        items: JSON.parse(order.items),
        shippingInfo: JSON.parse(order.shipping_info)
      }));

      res.json(parsedOrders);
    } else {
      const data = ensureLocalData();
      const orders = (data.orders || []).filter(o => Number(o.customer_id) === Number(req.session.customer.id));

      const parsedOrders = orders
        .slice()
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .map(order => ({
          ...order,
          items: JSON.parse(order.items),
          shippingInfo: JSON.parse(order.shipping_info)
        }));

      res.json(parsedOrders);
    }
  } catch (err) {
    console.error('Orders fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Contact info
app.get('/api/contact', async (req, res) => {
  if (!requireDataStore(req, res)) return;

  try {
    if (supabase) {
      const { data: contact, error } = await supabase
        .from('contact')
        .select('*')
        .single();

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "not found"
      res.json(contact || {});
    } else {
      const data = ensureLocalData();
      res.json(data.contact || {});
    }
  } catch (err) {
    console.error('Contact fetch error:', err);
    res.status(500).json({ error: 'Failed to read contact info' });
  }
});

app.put('/api/contact', authRequired, async (req, res) => {
  if (!requireDataStore(req, res)) return;

  try {
    if (supabase) {
      const { data, error } = await supabase
        .from('contact')
        .upsert([req.body])
        .select()
        .single();

      if (error) throw error;
      res.json(data);
    } else {
      const data = ensureLocalData();
      data.contact = req.body;
      writeData(data);
      res.json(data.contact);
    }
  } catch (err) {
    console.error('Contact update error:', err);
    res.status(500).json({ error: 'Failed to update contact info' });
  }
});

async function sendOrderConfirmationEmail(order, contact) {
  if (!transporter) {
    console.log('Email not configured, skipping email for order', order.id);
    return;
  }
  
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
      from: process.env.EMAIL_USER,
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
