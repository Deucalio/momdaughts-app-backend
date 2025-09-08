require("dotenv").config();
const fastify = require("fastify")({ logger: false });
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");
const prisma = new PrismaClient();
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
} = require("./utils/actions");

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

// Routes
// fastify.get("/", { schema: { hide: true } }, (_, reply) => {
//   reply.send({ status: "running" });
// });

fastify.get("/api", async (req, res) => {
  console.log("req.url", req.url);
  return res.status(200).type("text/html").send(html);
});

// GET Total Orders Count
fastify.get(
  "/total-orders",
  { preHandler: [fastify.authenticate] },
  async (request, reply) => {
    try {
      // const totalOrders = await prisma.order.count();
      // reply.send({ totalOrders });
    } catch (error) {
      request.log.error(error);
      reply.status(500).send({ error: "Failed to fetch total orders" });
    }
  }
);

fastify.get("/token", async (request, reply) => {
  const email = request.query.email;
  const token = await prisma.user.findFirst({
    where: {
      email: email,
    },
    orderBy: {
      sessions: {
        _count: "desc",
      },
    },

    select: {
      sessions: true,
    },
  });
  console.log(token);

  const a = await fetch(
    `http://localhost:3000/session/${
      token.sessions[token.sessions.length - 1].id
    }`
  );
  const b = await a.json();

  return reply.send(b);
});

// GET Total Wishlist Items Count
fastify.get(
  "/total-wishlist-items-count",
  { preHandler: [fastify.authenticate] },
  async (request, reply) => {
    const start = Date.now();
    const { userId } = request.user;
    try {
      const totalWishlistItems = await prisma.wishlistItem.count({
        where: {
          userId: userId,
        },
      });
      reply.send({ count: totalWishlistItems });
    } catch (error) {
      request.log.error(error);
      reply.status(500).send({ error: "Failed to fetch total wishlist items" });
    } finally {
      const duration = Date.now() - start;
      console.log(`GET /total-wishlist-items-count processed in ${duration}ms`);
    }
  }
);

// GET ALL DISCOUNTS
fastify.get(
  "/discounts",
  { preHandler: [fastify.authenticate] },
  async (request, reply) => {
    try {
      const discounts = await getShopifyDiscounts();
      const formattedData = formatDiscountData(discounts);
      reply.send({ discounts: discounts });
    } catch (error) {
      request.log.error(error);
      reply.status(500).send({ error: "Failed to fetch discounts" });
    }
  }
);

fastify.get(
  "/verify-discount-code",
  {
    preHandler: [fastify.authenticate],
    schema: {
      querystring: {
        type: "object",
        properties: {
          codes: {
            type: "string",
            description:
              'Comma-separated list of discount codes to verify (e.g., "CODE1,CODE2,CODE3")',
          },
          subtotal: {
            type: "number",
            description: "Order subtotal for minimum requirement validation",
          },
          cartVariants: {
            type: "string",
            description:
              'Comma-separated list of product variant IDs in cart (e.g., "gid://shopify/ProductVariant/123,gid://shopify/ProductVariant/456")',
          },
        },
        required: ["codes"],
      },
    },
  },
  async (request, reply) => {
    try {
      const { codes, subtotal, cartVariants } = request.query;

      if (!codes || typeof codes !== "string") {
        return reply.status(400).send({
          success: false,
          error:
            "Missing or invalid 'codes' parameter. Provide comma-separated discount codes.",
        });
      }

      // Parse and clean discount codes
      const discountCodes = codes
        .split(",")
        .map((code) => code.trim())
        .filter((code) => code.length > 0);

      if (discountCodes.length === 0) {
        return reply.status(400).send({
          success: false,
          error: "No valid discount codes provided",
        });
      }

      if (discountCodes.length > 5) {
        return reply.status(400).send({
          success: false,
          error: "Maximum 5 discount codes allowed per request",
        });
      }

      // Parse cart variants if provided
      const cartVariantIds = cartVariants
        ? cartVariants
            .split(",")
            .map((id) => id.trim())
            .filter((id) => id.length > 0)
        : [];

      request.log.info(
        `Verifying ${discountCodes.length} discount codes: ${discountCodes.join(
          ", "
        )}`
      );

      // Fetch all active discounts from Shopify
      const allDiscounts = await getShopifyDiscounts();

      // Validate each discount code individually with enhanced validation
      const validationResults = discountCodes.map((code) =>
        validateSingleDiscountCodeEnhanced(
          code,
          allDiscounts,
          subtotal,
          cartVariantIds
        )
      );

      // Separate valid and invalid codes
      const validCodes = validationResults.filter((result) => result.valid);
      const invalidCodes = validationResults.filter((result) => !result.valid);

      // Check combinations for valid codes
      const combinationResults = [];

      if (validCodes.length > 1) {
        for (let i = 0; i < validCodes.length; i++) {
          for (let j = i + 1; j < validCodes.length; j++) {
            const combinationResult = canDiscountsCombine(
              validCodes[i],
              validCodes[j]
            );
            combinationResults.push({
              firstCode: validCodes[i].code,
              secondCode: validCodes[j].code,
              ...combinationResult,
            });
          }
        }
      }

      // Calculate total discount value (simplified calculation)
      let totalDiscountValue = 0;
      let totalDiscountDescription = [];

      validCodes.forEach((discount) => {
        if (
          discount.type === "Basic Discount" &&
          discount.value.includes("%")
        ) {
          const percentage = parseFloat(discount.value.replace("%", ""));
          totalDiscountDescription.push(`${discount.code}: ${percentage}% off`);
        } else if (discount.type === "Free Shipping") {
          totalDiscountDescription.push(`${discount.code}: Free Shipping`);
        } else {
          totalDiscountDescription.push(`${discount.code}: ${discount.value}`);
        }
      });

      // Check if any combinations are incompatible
      const hasIncompatibleCombinations = combinationResults.some(
        (result) => !result.canCombine
      );
      const applicableCodes = hasIncompatibleCombinations
        ? [validCodes[0]]
        : validCodes;

      // Build response
      const response = {
        success: true,
        timestamp: new Date().toISOString(),
        summary: {
          totalCodesRequested: discountCodes.length,
          validCodes: validCodes.length,
          invalidCodes: invalidCodes.length,
          applicableCodes: applicableCodes.length,
          canCombineAll: validCodes.length <= 1 || !hasIncompatibleCombinations,
          subtotalProvided: subtotal !== undefined,
          cartVariantsProvided: cartVariantIds.length > 0,
        },
        validDiscounts: validCodes,
        invalidDiscounts: invalidCodes,
        combinationAnalysis: combinationResults,
        applicableDiscounts: applicableCodes.map((discount) => ({
          code: discount.code,
          title: discount.title,
          type: discount.type,
          value: discount.value,
          description: `${discount.code} - ${discount.title} (${discount.value})`,
          requiresSpecificProducts: discount.requiresSpecificProducts || false,
          requiredVariants: discount.requiredVariants || [],
          minimumSubtotal: discount.minimumSubtotal || null,
        })),
        totalDiscount: {
          description: totalDiscountDescription.join(" + "),
          applicableCount: applicableCodes.length,
        },
        warnings: [
          ...(hasIncompatibleCombinations
            ? [
                "Some discount codes cannot be combined. Only the first valid discount will be applied.",
              ]
            : []),
          ...(invalidCodes.length > 0
            ? [
                `${invalidCodes.length} discount code(s) are invalid and will be ignored.`,
              ]
            : []),
        ],
      };

      request.log.info(
        `Discount verification completed: ${applicableCodes.length} applicable out of ${discountCodes.length} requested`
      );

      reply.send(response);
    } catch (error) {
      request.log.error(
        {
          error: error.message,
          stack: error.stack,
          query: request.query,
        },
        "Failed to verify discount codes"
      );

      reply.status(500).send({
        success: false,
        error: "Failed to verify discount codes",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);

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
  console.log("session", request.params);
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
    console.log(error);
    reply.status(500).send({ error: "Failed to generate token" });
  }
});

fastify.get(
  "/ipl/onboarding-status",
  { preHandler: [fastify.authenticate] },
  async (request, reply) => {
    try {
      const { userId } = request.user; // From your auth middleware

      const iplProfiles = await prisma.iplProfile.findMany({
        select: { userId: true }, // Only need to check existence
      });
      const iplProfile = iplProfiles.find(
        (profile) => profile.userId === userId
      );

      return {
        hasCompleted: !!iplProfile,
        profileId: iplProfile?.id || null,
      };
    } catch (error) {
      console.error("Onboarding status check error:", error);
      reply.code(500).send({ error: "Failed to check onboarding status" });
    }
  }
);

fastify.get(
  "/collections/:id",
  { preHandler: [fastify.authenticate] },
  async (request, reply) => {
    const start = Date.now();
    const collectionId = request.params.id;
    try {
      const collection = await getCollection(collectionId);
      console.log("collection", collection);
      reply.send({ collection: collection });
    } catch (error) {
      console.log("Error: ", error);
      request.log.error(error);
      reply.status(500).send({ error: "Database error" });
    } finally {
      const duration = Date.now() - start;
      console.log(
        `GET /collections/:${collectionId} processed in ${duration}ms`
      );
    }
  }
);

fastify.get(
  "/ipl-devices",
  { preHandler: [fastify.authenticate] },
  async (request, reply) => {
    const start = Date.now();
    try {
      const collections = await getCollection();
      reply.send({ collections: collections });
    } catch (error) {
      console.log("Error: ", error);
      request.log.error(error);
      reply.status(500).send({ error: "Database error" });
    } finally {
      const duration = Date.now() - start;
      console.log(`GET /ipl-devices processed in ${duration}ms`);
    }
  }
);

fastify.get(
  "/collections",
  { preHandler: [fastify.authenticate] },
  async (request, reply) => {
    const start = Date.now();
    const { collectionsIds } = request.query;
    console.log("collectionsIds", collectionsIds);

    try {
      const collections = await getCollections(collectionsIds);
      if (!collectionsIds) {
        return reply.send({ collections: collections });
      }
      // return reply.send({ collections: collections.data.nodes });
      const updatedCollections = collections.data.nodes.map((col) => {
        const c = col;
        const activeProductsItemsCount = c.products.nodes.filter(
          (s) => s.status.toLowerCase() !== "draft"
        ).length;
        return {
          activeProductsItemsCount,
          ...c,
        };
      });
      reply.send({ collections: updatedCollections });
    } catch (error) {
      console.log("Error: ", error);
      request.log.error(error);
      reply.status(500).send({ error: "Database error" });
    } finally {
      const duration = Date.now() - start;
      console.log(`GET /collections processed in ${duration}ms`);
    }
  }
);
// Home Page Data

// If you want to use Prisma's raw queries for even better performance
fastify.get(
  "/home-raw",
  { preHandler: [fastify.authenticate] },
  async (request, reply) => {
    const start = Date.now();
    const { userId } = request.user;

    try {
      const [shopifyData, [cartCount, iplStats]] = await Promise.all([
        getShopifyData(),
        prisma.$transaction([
          prisma.$queryRaw`SELECT COALESCE(SUM(quantity), 0) as count FROM "cart_items" WHERE "userId" = ${userId}`,
          prisma.$queryRaw`SELECT count(id) FROM "ipl_sessions" WHERE "userId" = ${userId} `, // Replace with your actual query
        ]),
      ]);

      const data = {
        products: shopifyData.products,
        articles: shopifyData.articles,
        cartItemCount: Number(cartCount[0]?.count || 0),
        iplStats: Number(iplStats[0]?.count || 0),
      };

      reply.send({ data });
    } catch (error) {
      console.log("Error: ", error);
      request.log.error(error);
      reply.status(500).send({ error: "Database error" });
    } finally {
      const duration = Date.now() - start;
      console.log(`GET /home processed in ${duration}ms`);
    }
  }
);

// Protected route - requires authentication
fastify.get(
  "/products",
  { preHandler: [fastify.authenticate] },
  async (request, reply) => {
    const start = Date.now();
    try {
      const { productId } = request.query;
      const { product_ids } = request.query;
      const { numberOfProducts } = request.query;
      console.log("productId", productId);

      if (productId) {
        const product = await getProduct(productId);
        reply.send({ product });
        return;
      }

      const products = await getProducts(product_ids, numberOfProducts);
      reply.send({ products: products });
    } catch (error) {
      console.log(error);
      reply.status(500).send({ error: "Database error" });
    } finally {
      const duration = Date.now() - start;
      console.log(`GET /products processed in ${duration}ms`);
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

fastify.get(
  "/addresses",
  { preHandler: [fastify.authenticate] },
  async (request, reply) => {
    const start = Date.now();
    const { userId } = request.user;
    try {
      const addresses = await prisma.shippingAddress.findMany({
        where: {
          userId,
        },
      });
      reply.send({ addresses });
    } catch (error) {
      request.log.error(error);
      reply.status(500).send({ error: "Database error" });
    } finally {
      const end = Date.now();
      const duration = end - start;
      console.log(`GET /addresses processed in ${duration}ms`);
    }
  }
);

fastify.get(
  "/address/:id",
  { preHandler: [fastify.authenticate] },
  async (request, reply) => {
    const start = Date.now();
    try {
      const addr = await prisma.shippingAddress.findUnique({
        where: {
          id: request.params.id,
        },
      });
      reply.send({ address: addr });
    } catch (error) {
      request.log.error(error);
      reply.status(500).send({ error: "Database error" });
    } finally {
      const end = Date.now();
      const duration = end - start;
      console.log(`GET /address/:id processed in ${duration}ms`);
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

// Get IPL Profile

fastify.get(
  "/ipl/profile",
  { preHandler: [fastify.authenticate] },
  async (request, reply) => {
    const start = Date.now();
    try {
      const { userId } = request.user; // From your auth middleware

      const iplProfile = await prisma.iplProfile.findFirst({
        where: {
          userId: userId,
        },
        select: {
          id: true,
          device: true,
          skinTone: true,
          hairType: true,
          treatmentAreas: true,
          startDate: true,
          currentPhase: true,
          createdAt: true,
          updatedAt: true,
          sessions: {
            select: {
              id: true,
              createdAt: true,
            },
          },
        },
      });
      // gid://shopify/Product/9937795809572
      // const productId = iplProfile.device.split("/").pop();
      //  const product = await getProduct(productId, false);

      reply.send({ iplProfile: iplProfile });
    } catch (error) {
      console.error("Onboarding status check error:", error);
      reply.code(500).send({ error: "Failed to check onboarding status" });
    } finally {
      const duration = Date.now() - start;
      console.log(`GET /ipl/profile processed in ${duration}ms`);
    }
  }
);

fastify.get("/test", async (request, reply) => {
  const variantIds = request.query.variantIds.split(",").map(Number);
  const result3 = await getVariants(variantIds);
  return reply.send(result3);
});

// Add a get request to fetch Cart
fastify.get(
  "/cart",
  { preHandler: [fastify.authenticate] },
  async (request, reply) => {
    const start = Date.now();
    try {
      const { userId } = request.user;

      const cart = await prisma.cartItem.findMany({
        where: {
          userId: userId,
        },
      });
      // shopifyVariantId
      const shopifyVariantIds = cart.map((item) => item.shopifyVariantId);
      const shopifyVariants = await getVariants(shopifyVariantIds);

      const updatedCart = cart.map((item) => {
        const shopifyVariant = shopifyVariants.find((variant) =>
          variant.id.includes(item.shopifyVariantId)
        );

        if (!shopifyVariant) {
          return {
            ...item,
            isUnavailable: true,
            note: "This variant is no longer available on Shopify.",
          };
        }

        const variantInventoryQuantity = shopifyVariant.inventoryQuantity ?? 0;

        // Handle image fallback
        const variantImage =
          shopifyVariant.image?.url ||
          shopifyVariant.product?.media?.edges?.[0]?.node?.preview?.image
            ?.url ||
          null;

        // Parse Shopify price as float for comparison
        const variantPrice = parseFloat(shopifyVariant.price);

        let isOutOfStock = false;
        let isQuantityAdjusted = false;
        let isPriceUpdated = false;
        let adjustedQuantity = item.quantity;
        let updatedPrice = item.price;

        if (variantInventoryQuantity <= 0) {
          isOutOfStock = true;
          adjustedQuantity = 0;
        } else if (item.quantity > variantInventoryQuantity) {
          isQuantityAdjusted = true;
          adjustedQuantity = variantInventoryQuantity;
        }

        if (variantPrice > item.price) {
          isPriceUpdated = true;
          updatedPrice = variantPrice;
        }

        return {
          ...item,
          quantity: adjustedQuantity,
          price: updatedPrice,
          variantImage,
          title: shopifyVariant.title,
          variantInventoryQuantity,
          isOutOfStock,
          isQuantityAdjusted,
          isPriceUpdated,
          weight: shopifyVariant.inventoryItem?.measurement?.weight,
          quantityUserInput: item.quantity,
        };
      });

      reply.send({ cart: updatedCart, shopifyVariants: shopifyVariants });
    } catch (error) {
      reply.status(500).send({ error: "Database error" });
    } finally {
      const duration = Date.now() - start;
      console.log(`GET /cart processed in ${duration}ms`);
    }
  }
);

// GET Request for wishlist
fastify.get(
  "/wishlist",
  { preHandler: [fastify.authenticate] },
  async (request, reply) => {
    const start = Date.now();
    try {
      const { userId } = request.user;

      const wishlist = await prisma.wishlistItem.findMany({
        where: {
          userId: userId,
        },
      });

      const shopifyVariantIds = wishlist.map((item) => item.shopifyVariantId);
      const shopifyVariants = await getVariants(shopifyVariantIds);

      const updatedWishlist = wishlist.map((item) => {
        const shopifyVariant = shopifyVariants.find((variant) =>
          variant.id.includes(item.shopifyVariantId)
        );

        if (!shopifyVariant) {
          return {
            ...item,
            isUnavailable: true,
            note: "This variant is no longer available on Shopify.",
          };
        }

        const variantInventoryQuantity = shopifyVariant.inventoryQuantity ?? 0;

        // Handle image fallback
        const variantImage =
          shopifyVariant.image?.url ||
          shopifyVariant.product?.media?.edges?.[0]?.node?.preview?.image
            ?.url ||
          null;

        // Parse Shopify price as float for comparison
        const variantPrice = parseFloat(shopifyVariant.price);

        let isOutOfStock = false;
        let isQuantityAdjusted = false;
        let isPriceUpdated = false;
        let adjustedQuantity = item.quantity;
        let updatedPrice = item.price;

        if (variantInventoryQuantity <= 0) {
          isOutOfStock = true;
          adjustedQuantity = 0;
        } else if (item.quantity > variantInventoryQuantity) {
          isQuantityAdjusted = true;
          adjustedQuantity = variantInventoryQuantity;
        }

        if (variantPrice > item.price) {
          isPriceUpdated = true;
          updatedPrice = variantPrice;
        }

        return {
          ...item,
          quantity: adjustedQuantity,
          price: updatedPrice,
          variantImage,
          title: shopifyVariant.title,
          variantInventoryQuantity,
          isOutOfStock,
          isQuantityAdjusted,
          isPriceUpdated,
          quantityUserInput: item.quantity,
        };
      });

      reply.send({ wishlist: updatedWishlist });
    } catch (error) {
      reply.status(500).send({ error: "Database error" });
    } finally {
      const duration = Date.now() - start;
      console.log(`GET /wishlist processed in ${duration}ms`);
    }
  }
);

fastify.get(
  "/article",
  { preHandler: [fastify.authenticate] },
  async (request, reply) => {
    const articleId = request.query.articleId;
    const article = await getArticle(articleId);
    const updatedArticle = {
      ...article.data.node,
      cleanText: simpleTextExtract(article.data.node.body),
      readTime: inferReadTime(article.data.node.body),
    };

    reply.send({ article: updatedArticle });
  }
);

fastify.post("/print", async (request, reply) => {
  const { data } = request.body;

  console.log("body:", request.body);

  reply.send({ msg: "ok" });
});

// GET Blogs and Articles
fastify.get(
  "/articles",
  { preHandler: [fastify.authenticate] },
  async (request, reply) => {
    const start = Date.now();
    const numberOfArticles = request.query.numberOfArticles || 3; // Default to 3 if not provided
    try {
      const articles = await getArticles(numberOfArticles);
      const updatedArticles = articles.data.articles.nodes.map((n) => {
        const { body, ...newArticle } = {
          ...n,
          comments: n.comments.edges.map((edge) => edge.node),
          cleanText: simpleTextExtract(n.body).slice(0, 200),
          readTime: inferReadTime(n.body),
        };

        return {
          ...newArticle,
        };
      });

      reply.send({ articles: updatedArticles });
    } catch (error) {
      reply.status(500).send({ error: "Database error" });
    } finally {
      const duration = Date.now() - start;
      console.log(`GET /articles processed in ${duration}ms`);
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
      // const count = await prisma.$executeRaw`SELECT COUNT(*) FROM "cart_items" WHERE "userId" = ${userId}`;

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

// POST REQUESTS

fastify.post("/", (request, reply) => {
  console.log("Data: ", request.body);
  reply.send({ status: "running" });
});

// Route for appending customer shopify shipping address

fastify.post(
  "/append-shipping-addresses",
  { preHandler: [fastify.authenticate] },
  async (request, reply) => {
    const start = Date.now();
    const { userId } = request.user;
    const { email } = request.body;
    try {
      const shopifyResponse = await getAdresses(email);
      const shopifyCustomer = shopifyResponse.data.customers.edges[0].node;

      const addresses = shopifyCustomer.addressesV2.edges.map((edge) => {
        const addr = edge.node;

        return {
          id: undefined, // let Prisma generate cuid()
          firstName: addr.firstName || shopifyCustomer.firstName || "",
          lastName: addr.lastName || shopifyCustomer.lastName || null,
          phone: addr.phone || shopifyCustomer.defaultPhoneNumber || null,
          address1: addr.address1 || "",
          address2: addr.address2 || null,
          city: addr.city || "",
          province: addr.province || "",
          postalCode: addr.zip || null,
          country: addr.country || "Pakistan",
          isDefault: shopifyCustomer.defaultAddress?.id === addr.id, // mark default
          type: "home",
          userId: userId,
        };
      });

      // Example: bulk insert with Prisma
      await prisma.shippingAddress.createMany({
        data: addresses,
        skipDuplicates: true, // in case same address id comes again
      });

      reply.send({ success: true, addresses: addresses });
    } catch (error) {
      console.log("Error: ", error);
      request.log.error(error);
      reply.status(500).send({ error: "Database error" });
    } finally {
      const duration = Date.now() - start;
      console.log(`GET /append-shipping-addresses processed in ${duration}ms`);
    }
  }
);

// Add Shipping Address
fastify.post(
  "/add-shipping-address",
  { preHandler: [fastify.authenticate] },
  async (request, reply) => {
    const start = Date.now();
    try {
      const { userId } = request.user;
      const address  = request.body;
      address.isDefault = address.useCurrentLocation ? true : false;
      address.type = address.addressCategory
      delete address.useCurrentLocation;
      delete address.addressCategory;

      // If this address is being set as default, update all other addresses to not be default
      if (address.isDefault === true) {
        await prisma.shippingAddress.updateMany({
          where: {
            userId: userId,
            isDefault: true,
          },
          data: { isDefault: false },
        });
      }

      const shippingAddress = await prisma.shippingAddress.create({
        data: {
          ...address,
          userId: userId,
        },
      });

      reply.send({ success: true, shippingAddress: shippingAddress });
    } catch (error) {
      console.log("Error: ", error);
      request.log.error(error);
      reply.status(500).send({ error: "Database error" });
    } finally {
      const duration = Date.now() - start;
      console.log(`POST /add-shipping-address processed in ${duration}ms`);
    }
  }
);
fastify.post("/sync/user", async (request, reply) => {
  const start = Date.now();
  try {
    const { userId, metaData } = request.body;
    console.log("Data: ", request.body);

    if (!userId) {
      return reply.status(400).send({ error: "User ID is required" });
    }

    // Fetch user from the database
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        metaData: metaData,
      },
    });

    if (!user) {
      return reply.status(404).send({ error: "User not found" });
    }

    reply.send({ metaData: user.metaData });
  } catch (error) {
    console.error("Error fetching user:", error);
    reply.status(500).send({ error: "Failed to fetch user" });
  } finally {
    const duration = Date.now() - start;
    console.log(`POST /sync/user processed in ${duration}ms`);
  }
});

// Create IPL Profile
fastify.post(
  "/ipl/create-profile",
  { preHandler: [fastify.authenticate] },
  async (request, reply) => {
    const start = Date.now();
    try {
      console.log("Data: ", request.body);
      const { userId } = request.user; // From your auth middleware
      const { device, skinTone, hairType, treatmentAreas, frequency } =
        request.body;

      // Create new IPL profile
      const newProfile = await prisma.iplProfile.create({
        data: {
          device: device.id,
          skinTone: skinTone.toLowerCase(),
          hairType: hairType.toLowerCase(),
          treatmentAreas: Object.fromEntries(
            treatmentAreas.map((key) => [key.toLowerCase(), true])
          ),
          startDate: new Date(),
          currentPhase: frequency.includes("1") ? "weekly" : "biweekly",
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: userId,
        },
      });

      return reply.status(201).send({ profile: newProfile });
    } catch (error) {
      console.error("Error creating IPL profile:", error);
      reply.status(500).send({ error: "Failed to create IPL profile" });
    } finally {
      const duration = Date.now() - start;
      console.log(`POST /ipl/create-profile processed in ${duration}ms`);
    }
  }
);

// Create IPL Session
fastify.post(
  "/ipl/create-session",
  { preHandler: [fastify.authenticate] },
  async (request, reply) => {
    const start = Date.now();
    try {
      console.log("Data: ", request.body);
      const { userId } = request.user; // From your auth middleware

      // Create new IPL profile
      const session = await prisma.iplSession.create({
        data: {
          userId: userId,
          profileId: request.body.profileId,
          date: request.body.date,
          bodyArea: request.body.bodyArea,
          intensityLevel: request.body.intensityLevel,
          notes: request.body.notes,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      return reply.status(201).send({ session: session });
    } catch (error) {
      console.error("Error creating IPL profile:", error);
      reply.status(500).send({ error: "Failed to create IPL profile" });
    } finally {
      const duration = Date.now() - start;
      console.log(`POST /ipl/create-profile processed in ${duration}ms`);
    }
  }
);

// Create Order
fastify.post(
  "/create-order",
  { preHandler: [fastify.authenticate] },
  async (request, reply) => {
    const start = Date.now();

    try {
      const { orderData } = request.body;

      // Validate required fields
      if (!orderData) {
        return reply.status(400).send({
          success: false,
          error: "Order data is required",
        });
      }

      console.log(
        "Processing order creation for:",
        orderData.shippingAddress?.email
      );

      const shopifyOrderRes = await createOrder(orderData);

      if (!shopifyOrderRes.success) {
        const statusCode = shopifyOrderRes.statusCode || 500;
        return reply.status(statusCode).send({
          success: false,
          error:
            shopifyOrderRes.error ||
            shopifyOrderRes.message ||
            "Failed to create order",
          details: shopifyOrderRes.details,
        });
      }

      const duration = Date.now() - start;
      console.log(`POST /create-order processed successfully in ${duration}ms`);

      return reply.send({
        success: true,
        order: shopifyOrderRes.order,
        processingTime: duration,
      });
    } catch (error) {
      const duration = Date.now() - start;
      console.error(`POST /create-order failed after ${duration}ms:`, error);

      return reply.status(500).send({
        success: false,
        error: "Internal server error",
        requestId: request.id, // If you have request IDs
      });
    }
  }
);

// Add to Cart
fastify.post(
  "/add-to-cart",
  { preHandler: [fastify.authenticate] },
  async (request, reply) => {
    const start = Date.now();
    try {
      const userId = request.user.userId;
      const { cartData } = request.body;
      const { shopifyVariantId, quantity = 1 } = cartData;
      cartData.userId = userId;

      const cart = await prisma.cartItem.upsert({
        where: {
          userId_shopifyVariantId: {
            userId,
            shopifyVariantId,
          },
        },
        update: {
          quantity: {
            increment: quantity,
          },
        },
        create: cartData,
      });

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

//  Add to wishlist
fastify.post(
  "/add-to-wishlist",
  { preHandler: [fastify.authenticate] },
  async (request, reply) => {
    const start = Date.now();
    try {
      const { userId } = request.user;
      const { shopifyProductId, shopifyVariantId } = request.body;

      const w = await prisma.wishlistItem.create({
        data: {
          userId,
          shopifyProductId,
          shopifyVariantId,
          addedAt: new Date(),
        },
        select: {
          id: true,
        },
      });

      reply.send({ wishlistItem: w });
    } catch (error) {
      console.log("Error: ", error);
      request.log.error(error);
      reply.status(500).send({ error: "Database error" });
    } finally {
      const duration = Date.now() - start;
      console.log(`GET /add-to-wishlist processed in ${duration}ms`);
    }
  }
);

// User Signup
fastify.post("/signup", async (request, reply) => {
  try {
    const { email, password, firstName, lastName, authMethod } = request.body;
    console.log("Signup request body:", request.body);

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
        metaData: {
          ipl_onboarding_completed: false,
          authMethod: authMethod ? authMethod : "custom",
        },
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
        metaData: user.metaData, // Ensure metaData is always present
      },
    });
  } catch (error) {
    console.error("Signup error:", error);
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
        metaData: user.metaData, // Ensure metaData is always present
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

// Delete REQUESTS
fastify.delete(
  "/cart/:itemId",
  { preHandler: [fastify.authenticate] },
  async (request, reply) => {
    const start = Date.now();
    const { itemId } = request.params;
    try {
      await prisma.cartItem.delete({
        where: { id: itemId },
      });
      reply.send({ message: "Cart deleted successfully" });
    } catch (error) {
      request.log.error(error);
      reply.status(500).send({ error: "Failed to delete cart" });
    } finally {
      const duration = Date.now() - start;
      console.log(`DELETE /cart/${itemId} processed in ${duration}ms`);
    }
  }
);

// Delete Address
fastify.delete(
  "/address/:addressId",
  { preHandler: [fastify.authenticate] },
  async (request, reply) => {
    const start = Date.now();
    const { addressId } = request.params;
    try {
      await prisma.shippingAddress.delete({
        where: { id: addressId },
      });
      reply.send({ message: "Address deleted successfully" });
    } catch (error) {
      console.log("Error: ", error);
      request.log.error(error);
      reply.status(500).send({ error: "Failed to delete address" });
    } finally {
      const duration = Date.now() - start;
      console.log(`DELETE /address/${addressId} processed in ${duration}ms`);
    }
  }
);

fastify.delete(
  "/remove-from-wishlist",
  { preHandler: [fastify.authenticate] },
  async (request, reply) => {
    const start = Date.now();
    try {
      const { userId } = request.user;
      const { shopifyVariantId } = request.body; // Only need productId to remove

      const itemToRemove = await prisma.wishlistItem.deleteMany({
        where: {
          userId,
          shopifyVariantId,
        },
      });

      if (itemToRemove.count === 0) {
        reply.send({ message: "Item Already Removed" });
      } else {
        reply.send({ message: "Item removed from wishlist" });
      }
    } catch (error) {
      console.log("Error: ", error);
      request.log.error(error);
      reply.status(500).send({ error: "Database error" });
    } finally {
      const duration = Date.now() - start;
      console.log(`DELETE /remove-from-wishlist processed in ${duration}ms`);
    }
  }
);

// PUT REQUESTS

fastify.put(
  "/cart/:itemId",
  { preHandler: [fastify.authenticate] },
  async (request, reply) => {
    const start = Date.now();
    const { itemId } = request.params;
    const { quantity } = request.body;
    try {
      await prisma.cartItem.update({
        where: { id: itemId },
        data: { quantity },
        select: {
          id: true,
        },
      });
      reply.send({ message: "Cart updated successfully" });
    } catch (error) {
      request.log.error(error);
      reply.status(500).send({ error: "Failed to update cart" });
    } finally {
      const duration = Date.now() - start;
      console.log(`PUT /cart/${itemId} processed in ${duration}ms`);
    }
  }
);

// Update Address
fastify.put(
  "/address/:addressId",
  { preHandler: [fastify.authenticate] },
  async (request, reply) => {
    const start = Date.now();
    const { addressId } = request.params;
    const address = request.body;
    const { userId } = request.user;

    address.isDefault = address.useCurrentLocation;
    console.log(address);
    try {
      // If this address is being set as default, update all other addresses to not be default
      if (address.isDefault === true) {
        await prisma.shippingAddress.updateMany({
          where: {
            userId: userId,
            isDefault: true,
            id: { not: addressId }, // Exclude the current address being updated
          },
          data: { isDefault: false },
        });
      }

      await prisma.shippingAddress.update({
        where: { id: addressId },
        data: {
          firstName: address.firstName,
          lastName: address.lastName,
          phone: address.phone,
          address1: address.address1,
          address2: address.address2,
          city: address.city,
          province: address.province,
          postalCode: address.postalCode,
          country: address.country,
          isDefault: address.useCurrentLocation, // Include isDefault in the update
          type: address.type, // Include type in the update
        },
      });

      reply.send({ message: "Address updated successfully" });
    } catch (error) {
      request.log.error(error);
      reply.status(500).send({ error: "Failed to update address" });
    } finally {
      const duration = Date.now() - start;
      console.log(`PUT /address/${addressId} processed in ${duration}ms`);
    }
  }
);

// Shutdown hooks
fastify.addHook("onClose", async () => {
  await prisma.$disconnect();
});

// module.exports = async function handler(req, res) {
//   await fastify.ready();
//   fastify.server.emit("request", req, res);
// };
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

const query = `
  query {
    codeDiscountNodes(first: 250) {
      nodes {
        id
        codeDiscount {
          ... on DiscountCodeBasic {
            createdAt
            title
            summary
            status
            endsAt
            customerGets {
              appliesOnOneTimePurchase
            }
            codes(first: 10) {
              nodes {
                code
                asyncUsageCount
              }
            }
            minimumRequirement {
              ... on DiscountMinimumSubtotal {
                greaterThanOrEqualToSubtotal {
                  amount
                }
              }
            }
          }
          ... on DiscountCodeBxgy {
            title
            codesCount {
              count
              precision
            }
          }
        }
      }
    }
  }
`;
