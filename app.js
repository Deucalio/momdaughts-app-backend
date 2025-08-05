require("dotenv").config();
const fastify = require("fastify")({ logger: false });
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");
const prisma = new PrismaClient();
const { getProducts, getProduct } = require("./utils/actions");

// Register plugins
fastify.register(require("@fastify/helmet"));
fastify.register(require("@fastify/cors"), {
  origin: "*", // Or use your frontend origin
});

// Register JWT plugin
fastify.register(require("@fastify/jwt"), {
  secret: process.env.JWT_SECRET,
});

// JWT verification decorator
fastify.decorate("authenticate", async function (request, reply) {
  try {
    await request.jwtVerify();

    // populates request.user
    //     user:  {
    //   userId: 'cmdn3q7cs0000ecrkgona9fvc',
    //   sessionId: 'cmdsrpj7a0001ecigepu5lw6n',
    //   email: 'captain.gaze@gmail.com',
    //   iat: 1754050525,
    //   exp: 1754655325
    // }
  } catch (err) {
    reply.status(401).send({ error: "Unauthorized" });
  }
});

// Routes
fastify.get("/", { schema: { hide: true } }, (_, reply) => {
  reply.send({ status: "running" });
});

// Get current user profile
fastify.get(
  "/profile",
  { preHandler: [fastify.authenticate] },
  async (request, reply) => {
    try {
      const { userId } = request.user;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          createdAt: true,
        },
      });

      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }

      reply.send({ user });
    } catch (error) {
      request.log.error(error);
      reply.status(500).send({ error: "Failed to fetch user profile" });
    }
  }
);

// Session endpoint - generates JWT token (keeping for backward compatibility)
fastify.get("/session/:id", async (request, reply) => {
  try {
    const { id } = request.params;

    if (!id) {
      return reply.status(400).send({ error: "Session ID is required" });
    }

    // Verify the session exists and is not expired
    const session = await prisma.session.findUnique({
      where: { id: id },
      include: { user: true },
    });

    if (!session) {
      return reply.status(404).send({ error: "Session not found" });
    }

    if (session.expiresAt < new Date()) {
      return reply.status(401).send({ error: "Session expired" });
    }

    // Generate JWT token
    const token = fastify.jwt.sign(
      {
        userId: session.user.id,
        sessionId: session.id,
        email: session.user.email,
        iat: Math.floor(Date.now() / 1000),
      },
      {
        expiresIn: "7d",
      }
    );

    reply.send({ token });
  } catch (error) {
    request.log.error(error);
    reply.status(500).send({ error: "Failed to generate token" });
  }
});

// Protected route - requires authentication
fastify.get(
  "/products",
  { preHandler: [fastify.authenticate] },
  async (request, reply) => {
    try {
      const { productId } = request.query;
      console.log("productId", productId);

      if (productId) {
        const product = await getProduct(productId);
        reply.send({ product });
        return;
      }

      const products = await getProducts();
      reply.send({ products: products });
    } catch (error) {
      request.log.error(error);
      reply.status(500).send({ error: "Database error" });
    }
  }
);

// Admin route - get all sessions (you might want to add admin middleware)
fastify.get(
  "/sessions",
  { preHandler: [fastify.authenticate] },
  async (request, reply) => {
    try {
      const sessions = await prisma.session.findMany({
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });
      reply.send({ sessions });
    } catch (error) {
      request.log.error(error);
      reply.status(500).send({ error: "Database error" });
    }
  }
);

// Token verification endpoint
fastify.get(
  "/verify-token",
  { preHandler: [fastify.authenticate] },
  async (request, reply) => {
    try {
      const { userId, sessionId } = request.user;

      // Optional: Verify session still exists and is valid
      const session = await prisma.session.findUnique({
        where: { id: sessionId },
      });

      if (!session || session.expiresAt < new Date()) {
        return reply.status(401).send({ error: "Session expired" });
      }

      reply.send({
        valid: true,
        user: request.user,
      });
    } catch (error) {
      request.log.error(error);
      reply.status(500).send({ error: "Token verification failed" });
    }
  }
);

// Add a get request to fetch Cart
fastify.get(
  "/cart",
  { preHandler: [fastify.authenticate] },
  async (request, reply) => {
    const start = Date.now();
    try {
      const { userId } = request.query;

      const cart = await prisma.cartItem.findMany({
        where: {
          userId: userId,
        },
      });
      reply.send({ cart: cart });
    } catch (error) {
      request.log.error(error);
      reply.status(500).send({ error: "Database error" });
    } finally {
      const duration = Date.now() - start;
      console.log(`GET /cart processed in ${duration}ms`);
    }
  }
);

// Get Cart Items Count
// Add a get request to fetch Cart
fastify.get(
  "/cart-items-count",
  { preHandler: [fastify.authenticate] },
  async (request, reply) => {
    const start = Date.now();
    try {
      const { userId } = request.user;

      const result = await prisma.cartItem.aggregate({
        where: { userId },
        _sum: { quantity: true },
      });

      const count = result._sum.quantity || 0;

      reply.send({ count: count });
    } catch (error) {
      console.log("Error: ", error);
      request.log.error(error);
      reply.status(500).send({ error: "Database error" });
    } finally {
      const duration = Date.now() - start;
      console.log(`GET /cart-items-count processed in ${duration}ms`);
    }
  }
);

// POST Requests




fastify.post("/", (request, reply) => {
  console.log("Data: ", request.body);
  reply.send({ status: "running" });
});

// Add to Cart
fastify.post(
  "/add-to-cart",
  { preHandler: [fastify.authenticate] },
  async (request, reply) => {
    const start = Date.now();
    try {
      const { cartData } = request.body;
      const { userId, shopifyVariantId, quantity = 1 } = cartData;

      // Check if the item already exists
      const existingCartItem = await prisma.cartItem.findUnique({
        where: {
          userId_shopifyVariantId: {
            userId,
            shopifyVariantId,
          },
        },
      });

      let cart;

      if (existingCartItem) {
        // Update quantity if it already exists
        cart = await prisma.cartItem.update({
          where: {
            userId_shopifyVariantId: {
              userId,
              shopifyVariantId,
            },
          },
          data: {
            quantity: existingCartItem.quantity + quantity,
          },
        });
      } else {
        // Create new cart item
        cart = await prisma.cartItem.create({
          data: cartData,
        });
      }

      reply.send({ cart });
    } catch (error) {
      console.log("Error Adding to Cart: ", error);
      request.log.error(error);
      reply.status(500).send({ error: "Database error" });
    } finally {
      const duration = Date.now() - start;
      console.log(`GET /add-to-cart processed in ${duration}ms`);
    }
  }
);

// User Signup
fastify.post("/signup", async (request, reply) => {
  try {
    const { email, password, firstName, lastName } = request.body;

    if (!email || !password || !firstName || !lastName) {
      return reply.status(400).send({
        error: "Email, password, firstName, and lastName are required",
      });
    }
    console.log("body:", request.body);
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return reply.status(409).send({ error: "User already exists" });
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName,
        lastName,
      },
    });

    // Create session for the new user
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    // Generate JWT token
    const token = fastify.jwt.sign(
      {
        userId: user.id,
        sessionId: session.id,
        email: user.email,
        iat: Math.floor(Date.now() / 1000),
      },
      {
        expiresIn: "7d",
      }
    );

    reply.status(201).send({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    });
  } catch (error) {
    request.log.error(error);
    reply.status(500).send({ error: "Failed to create user" });
  }
});

// User Login
fastify.post("/login", async (request, reply) => {
  try {
    const { email, password } = request.body;

    if (!email || !password) {
      return reply.status(400).send({
        error: "Email and password are required",
      });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return reply.status(401).send({ error: "Invalid credentials" });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return reply.status(401).send({ error: "Invalid credentials" });
    }

    // Create new session
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    // Generate JWT token
    const token = fastify.jwt.sign(
      {
        userId: user.id,
        sessionId: session.id,
        email: user.email,
        iat: Math.floor(Date.now() / 1000),
      },
      {
        expiresIn: "7d",
      }
    );

    reply.send({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    });
  } catch (error) {
    request.log.error(error);
    reply.status(500).send({ error: "Login failed" });
  }
});

// User Logout
fastify.post(
  "/logout",
  { preHandler: [fastify.authenticate] },
  async (request, reply) => {
    try {
      const { sessionId } = request.user;

      // Delete the session
      await prisma.session.delete({
        where: { id: sessionId },
      });

      reply.send({ message: "Logged out successfully" });
    } catch (error) {
      request.log.error(error);
      reply.status(500).send({ error: "Logout failed" });
    }
  }
);

// Shutdown hooks
fastify.addHook("onClose", async () => {
  await prisma.$disconnect();
});

// Start server
const start = async () => {
  try {
    await fastify.listen({
      port: process.env.PORT || 3000,
      host: "0.0.0.0",
    });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
