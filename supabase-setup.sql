-- Create tables for Modern Market

-- Admins table
CREATE TABLE admins (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Products table
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  category VARCHAR(255),
  image TEXT,
  tags JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Customers table
CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Orders table
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id),
  items JSONB NOT NULL,
  shipping_info JSONB NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Contact table
CREATE TABLE contact (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255),
  phone VARCHAR(255),
  about TEXT,
  socials JSONB,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default admin (password: admin123 - hashed)
INSERT INTO admins (username, password) VALUES ('admin', '$2a$10$hT7uKuAq3YdEey5N55Yj4uxvM5tDASog3xpm3XtZ4.uXr5kvKhtVe');

-- Insert default contact info
INSERT INTO contact (email, phone, about, socials) VALUES (
  'info@modernfits.com',
  '+1 (555) 123-4567',
  'Welcome to Modern Fits! We specialize in high-quality furniture and professional fitting services to make your home dreams a reality.',
  '{"facebook": "https://facebook.com/modernfits", "instagram": "https://instagram.com/modernfits", "twitter": "https://twitter.com/modernfits"}'
);

-- Insert sample products
INSERT INTO products (title, description, price, category, image, tags) VALUES
('Modular Kitchen', 'Custom modular kitchen setup, includes cabinets and island.', 3950.00, 'kitchens', 'assets/modular-kitchen.jpg', '["featured", "kitchen"]'),
('Modern Sofa', 'Comfortable modern sofa for your living room.', 1500.00, 'furniture', 'assets/sofa.jpg', '["featured", "living-room"]');