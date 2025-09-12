require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");
const prisma = new PrismaClient();
const { Resend } = require("resend");
import Fastify from 'fastify'

const fastify = Fastify({
  logger: true,
})
const resend = new Resend(process.env.RESEND_API_KEY);
const {
  getProducts,
  getProduct,
  getProductsAndVariants,
  getVariant,
  getVariants,
  createOrder,
  getArticles,
  getCollections,
  simpleTextExtract,
  getShopifyData,
  getCollection,
  getArticle,
  inferReadTime,
  getAdresses,
  getShopifyDiscounts,
  formatDiscountData,
  canDiscountsCombine,
  validateSingleDiscountCodeEnhanced,
  fetchRecentOrders,
  fetchAllOrders,
} = require("../utils/actions");

// Register plugins
fastify.register(require("@fastify/helmet"));
fastify.register(require("@fastify/cors"), {
  origin: "*", // Or use your frontend origin
  methods: ["GET", "POST", "PUT", "DELETE"],
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


app.get('/', async (req, res) => {
  return res.send('Hello World!')
})
// Register routes with /api prefix
fastify.register(routes, { prefix: '/api' });



// Shutdown hooks
fastify.addHook("onClose", async () => {
  await prisma.$disconnect();
});
// Export handler for Vercel
export default async function handler(req, res) {
  await fastify.ready();
  fastify.server.emit("request", req, res);
};

