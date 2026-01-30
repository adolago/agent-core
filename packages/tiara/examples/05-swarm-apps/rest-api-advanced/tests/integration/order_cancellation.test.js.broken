const mongoose = require('mongoose');
const Order = require('../../src/models/order.model');
const Product = require('../../src/models/product.model');
const User = require('../../src/models/User');

describe('Order Model Cancellation', () => {
  let user;
  let product;
  let order;

  beforeEach(async () => {
    // Create User
    user = await User.create({
      email: 'test@example.com',
      password: 'Password123!',
      name: 'Test User',
      role: 'user',
      isEmailVerified: true,
    });

    // Create Product
    product = await Product.create({
      name: 'Test Product',
      description: 'A test product',
      price: 100,
      category: 'Test',
      inventory: {
        quantity: 10,
        trackInventory: true
      },
      images: [{ url: 'http://example.com/image.jpg' }]
    });

    // Create Order
    order = await Order.create({
      user: user._id,
      orderNumber: 'ORD-TEST-1',
      items: [{
        product: product._id,
        name: 'Test Product',
        price: 100,
        quantity: 2,
        subtotal: 200
      }],
      totalAmount: 200,
      subtotal: 200,
      shippingAddress: {
        fullName: 'Test User',
        street: '123 Test St',
        city: 'Test City',
        state: 'TS',
        zipCode: '12345',
        country: 'Test Country',
        phone: '1234567890',
        email: 'test@example.com'
      },
      payment: {
        method: 'credit_card',
        amount: 200
      },
      status: 'pending'
    });
  });

  it('should restore inventory when order is cancelled', async () => {
    // Initial check
    let p = await Product.findById(product._id);
    expect(p.inventory.quantity).toBe(10);

    // Cancel order
    await order.cancel('Customer changed mind', user._id);

    // Verify status
    expect(order.status).toBe('cancelled');

    // Verify inventory restored
    p = await Product.findById(product._id);
    expect(p.inventory.quantity).toBe(12); // 10 + 2
  });
});
