const axios = require("axios");

require("dotenv").config();

const getProductsDirectly = (productIds, query = null) => {
  // Format IDs as proper Shopify GIDs
  const formattedIds = productIds.map((id) =>
    id.startsWith("gid://") ? id : `gid://shopify/Product/${id}`
  );

  return JSON.stringify({
    query: query
      ? query
      : `
      query getProducts($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Product {
            id
            title
            handle
            description
            images(first: 5) {
              edges {
                node {
                  id
                  altText
                  originalSrc
                }
              }
            }
            variants(first: 1) {
              edges {
                node {
                  id
                  title
                  price
                }
              }
            }
          }
        }
      }
    `,
    variables: {
      ids: formattedIds,
    },
  });
};
const getProducts = async (product_ids = null, numberOfProducts = 20) => {
  const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

  try {
    const myHeaders = new Headers();
    myHeaders.append("Content-Type", "application/json");
    myHeaders.append("X-Shopify-Access-Token", ACCESS_TOKEN);
    let graphql;
    if (product_ids) {
      graphql = getProductsDirectly(product_ids.split(","));
    } else {
      graphql = JSON.stringify({
        query: `
    {
      products(first: ${numberOfProducts}) {
        edges {
          node {
            id
            title
            handle
            description
            images(first: 5) {
              edges {
                node {
                  id
                  altText
                  originalSrc
                }
              }
            }
            variants(first: 1) {
              edges {
                node {
                  id
                  title
                  price
                }
              }
            }
          }
        }
      }
    }
  `,
        variables: {},
      });
    }

    const requestOptions = {
      method: "POST",
      headers: myHeaders,
      body: graphql,
      redirect: "follow",
    };

    // fetch(
    //   "https://momdaughts.myshopify.com/admin/api/2024-04/graphql.json",
    //   requestOptions
    // )
    //   .then((response) => response.text())
    //   .then((result) => console.log(result))
    //   .catch((error) => console.error(error));

    const response = await fetch(
      `https://momdaughts.myshopify.com/admin/api/2024-04/graphql.json`,
      requestOptions
    );

    // Check if response is OK
    if (!response.ok) {
      console.log("hqhq", response);
      throw new Error("Network response was not ok");
    }

    const data = await response.json();

    if (product_ids) {
      const products = data.data.nodes.map((node) => {
        return {
          id: node.id,
          title: node.title,
          handle: node.handle,
          description: node.description,
          images: node.images.edges.map((imageEdge) => ({
            id: imageEdge.node.id,
            altText: imageEdge.node.altText,
            originalSrc: imageEdge.node.originalSrc,
          })),
          variants: node.variants.edges.map((variantEdge) => ({
            id: variantEdge.node.id,
            title: variantEdge.node.title,
            price: variantEdge.node.price,
          })),
        };
      });
      return products;
    }

    // Extract products data from response
    // const products = data.data.products.edges.map((edge) => edge.node);

    const products = data.data.products.edges.map((edge) => {
      const product = edge.node;

      return {
        id: product.id,
        title: product.title,
        handle: product.handle,
        description: product.description,
        images: product.images.edges.map((imageEdge) => ({
          id: imageEdge.node.id,
          altText: imageEdge.node.altText,
          originalSrc: imageEdge.node.originalSrc,
        })),
        variants: product.variants.edges.map((variantEdge) => ({
          id: variantEdge.node.id,
          title: variantEdge.node.title,
          price: variantEdge.node.price,
        })),
      };
    });

    // Return the products
    return products;
  } catch (error) {
    console.error("Error fetching products:", error);
    return { error: "Failed to fetch products" };
  }
};

const getProduct = async (id, fetchVariants = true) => {
  const globalId = `gid://shopify/Product/${id}`;

  const query = `
    {
      product(id: "${globalId}") {
        id
        title
        description
        options {
          id
          name
          values
        }
        images(first: 10) {
          edges {
            node {
              id
              url
              altText
            }
          }
        }
        ${
          fetchVariants
            ? `
            variants(first: 10) {
          edges {
            node {
              id
              title
              displayName  
              price
              compareAtPrice
              availableForSale
              inventoryQuantity
              sku
              image {
                id
                url
                altText
              }
            }
          }
        }
          `
            : ""
        } 
      }
    }
  `;

  try {
    const response = await fetch(
      "https://momdaughts.myshopify.com/admin/api/2024-04/graphql.json",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN,
        },
        body: JSON.stringify({ query }),
      }
    );

    if (!response.ok) {
      throw new Error(`Shopify API request failed: ${response.statusText}`);
    }

    const { data, errors } = await response.json();

    if (errors) {
      console.error("GraphQL errors:", errors);
      throw new Error("GraphQL query failed");
    }

    console.log("data:", data);

    const product = data?.product;
    if (!product) return null;

    const variants = fetchVariants
      ? product.variants.edges.map(({ node }) => ({
          id: node.id.replace("gid://shopify/ProductVariant/", ""),
          title: node.title,
          displayName: node.displayName,
          sku: node.sku,
          price: node.price,
          compareAtPrice: node.compareAtPrice,
          availableForSale: node.availableForSale,
          inventoryQuantity: node.inventoryQuantity,
          image: node.image
            ? {
                id: node.image.id,
                url: node.image.url,
                altText: node.image.altText,
              }
            : null,
        }))
      : [];

    return {
      id,
      title: product.title,
      description: product.description,
      options: product.options.map((opt) => ({
        id: opt.id,
        name: opt.name,
        values: opt.values,
      })),
      images: product.images.edges.map((img) => ({
        id: img.node.id,
        url: img.node.url,
        altText: img.node.altText,
      })),
      variants,
      metafields: [
        {
          key: "rating",
          value: JSON.stringify({ value: 4.8 }),
        },
        {
          key: "rating_count",
          value: "124",
        },
      ],
    };
  } catch (error) {
    console.error("Error fetching product:", error);
    throw error;
  }
};

const getVariant = async (variantId) => {
  const myHeaders = new Headers();
  myHeaders.append("Content-Type", "application/json");
  myHeaders.append("X-Shopify-Access-Token", process.env.SHOPIFY_ACCESS_TOKEN);

  const raw = JSON.stringify({
    query:
      "query getVariant($id: ID!) { productVariant(id: $id) { id title price availableForSale sku selectedOptions { name value } image { id url altText } product { id title handle } } }",
    variables: {
      id: `gid://shopify/ProductVariant/${variantId}`,
    },
  });

  const requestOptions = {
    method: "POST",
    headers: myHeaders,
    body: raw,
    redirect: "follow",
  };

  const res = await fetch(
    "https://momdaughts.myshopify.com/admin/api/2024-07/graphql.json",
    requestOptions
  );
  const { data } = await res.json();
  return data;
};

const getVariants = async (variantIds) => {
  const endpoint =
    "https://momdaughts.myshopify.com/admin/api/2024-07/graphql.json";
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

  const fetchVariant = async (variantId) => {
    const headers = {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    };

    const body = JSON.stringify({
      query: `
        query getVariant($id: ID!) {
          productVariant(id: $id) {
            id
            title
            price
            inventoryQuantity
            inventoryItem {measurement {weight {unit value}}}
            availableForSale
            sku
            selectedOptions {
              name
              value
            }
            image {
              id
              url
              altText
            }
            product {
              id
              title
              handle

              media(first: 1) {edges {node { preview {image {url}} }  } }

            }
          }
        }
      `,
      variables: {
        id: `gid://shopify/ProductVariant/${variantId}`,
      },
    });

    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body,
    });

    const json = await res.json();

    // Optionally handle individual errors
    if (json.errors) {
      console.error(`Error fetching variant ${variantId}:`, json.errors);
      return null;
    }

    return json.data?.productVariant || null;
  };

  // Run all fetches in parallel
  const variantPromises = variantIds.map(fetchVariant);
  const results = await Promise.all(variantPromises);

  // Filter out any nulls (failed requests)
  return results.filter(Boolean);
};

// Improved createOrder function
const createOrder = async (orderData) => {
  try {
    // Input validation
    const validationError = validateOrderData(orderData);
    if (validationError) {
      return {
        success: false,
        error: "Invalid order data",
        details: validationError,
        statusCode: 400,
      };
    }

    const SHOPIFY_URL =
      "https://raksons.myshopify.com/admin/api/2025-07/graphql.json";
    const SHOPIFY_ACCESS_TOKEN = process.env.TEST_ACCESS_TOKEN;

    if (!SHOPIFY_ACCESS_TOKEN) {
      console.error("Missing Shopify access token");
      return {
        success: false,
        error: "Configuration error",
        statusCode: 500,
      };
    }

    const {
      shippingAddress,
      billingAddress,
      items,
      subtotal,
      shipping,
      tax,
      total,
    } = orderData;

    // Validate that we have items to order
    const validItems = items.filter((item) => item.quantity > 0);
    if (validItems.length === 0) {
      return {
        success: false,
        error: "No valid items in order",
        statusCode: 400,
      };
    }

    // Check for out of stock items
    const outOfStockItems = validItems.filter((item) => item.isOutOfStock);
    if (outOfStockItems.length > 0) {
      return {
        success: false,
        error: "Some items are out of stock",
        details: outOfStockItems.map((item) => item.productTitle),
        statusCode: 400,
      };
    }

    // Format phone number properly
    const formattedShippingAddress = {
      ...shippingAddress,
      phone: formatPhoneNumber(shippingAddress.phone),
    };

    // Build the order
    const lineItems = validItems.map((item) => {
      const itemTax = +(item.price * item.quantity * 0.17).toFixed(2);
      return {
        title: item.productTitle,
        priceSet: {
          shopMoney: {
            amount: item.price,
            currencyCode: "PKR",
          },
        },
        quantity: item.quantity,
        taxLines: [
          {
            title: "GST",
            rate: 0.17,
            priceSet: {
              shopMoney: {
                amount: itemTax,
                currencyCode: "PKR",
              },
            },
          },
        ],
      };
    });

    const variables = {
      order: {
        currency: "PKR",
        email: formattedShippingAddress.email,
        phone: formattedShippingAddress.phone,
        shippingAddress: formatAddress(formattedShippingAddress),
        billingAddress: formatAddress(billingAddress),
        lineItems,
        shippingLines:
          shipping > 0
            ? [
                {
                  title: "Standard Shipping",
                  priceSet: {
                    shopMoney: {
                      amount: shipping,
                      currencyCode: "PKR",
                    },
                  },
                },
              ]
            : [],
        transactions: [
          {
            kind: "SALE",
            status: "SUCCESS",
            amountSet: {
              shopMoney: {
                amount: total,
                currencyCode: "PKR",
              },
            },
            gateway: "Cash on Delivery",
          },
        ],
        tags: ["skincare", "online-order"],
        note: "Customer requested delivery between 2-5 PM",
        financialStatus: "PENDING",
      },
    };

    const data = {
      query: `
        mutation orderCreate($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
          orderCreate(order: $order, options: $options) {
            userErrors {
              field
              message
            }
            order {
              id
              name
              totalTaxSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              lineItems(first: 10) {
                nodes {
                  variant {
                    id
                  }
                  id
                  title
                  quantity
                  taxLines {
                    title
                    rate
                    priceSet {
                      shopMoney {
                        amount
                        currencyCode
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `,
      variables,
    };

    const response = await axios.post(SHOPIFY_URL, data, {
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
      },
      timeout: 30000, // 30 second timeout
    });

    const result = response.data;

    // Handle GraphQL errors
    if (result?.errors) {
      console.error("GraphQL errors:", result.errors);
      return {
        success: false,
        error: "Shopify API error",
        details: result.errors,
        statusCode: 400,
      };
    }

    // Handle user errors from Shopify
    if (result?.data?.orderCreate?.userErrors?.length) {
      console.error(
        "Shopify validation errors:",
        result.data.orderCreate.userErrors
      );
      return {
        success: false,
        error: "Order validation failed",
        details: result.data.orderCreate.userErrors,
        statusCode: 400,
      };
    }

    // Check if order was actually created
    if (!result?.data?.orderCreate?.order) {
      console.error("No order returned from Shopify:", result);
      return {
        success: false,
        error: "Order creation failed",
        statusCode: 500,
      };
    }

    console.log(
      "Order created successfully:",
      result.data.orderCreate.order.name
    );

    return {
      success: true,
      message: "Order created successfully",
      order: result.data.orderCreate.order,
    };
  } catch (error) {
    console.error("Order creation error:", {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      code: error.code,
    });

    // Handle different types of errors
    if (error.code === "ECONNABORTED") {
      return {
        success: false,
        error: "Request timeout - please try again",
        statusCode: 504,
      };
    }

    if (error.response?.status === 401) {
      return {
        success: false,
        error: "Authentication failed",
        statusCode: 401,
      };
    }

    if (error.response?.status >= 400 && error.response?.status < 500) {
      return {
        success: false,
        error: "Invalid request to Shopify",
        statusCode: 400,
      };
    }

    return {
      success: false,
      error: "Failed to create order",
      statusCode: 500,
    };
  }
};

// Helper functions
const validateOrderData = (orderData) => {
  const required = ["shippingAddress", "billingAddress", "items", "total"];
  const missing = required.filter((field) => !orderData[field]);

  if (missing.length > 0) {
    return `Missing required fields: ${missing.join(", ")}`;
  }

  if (!orderData.shippingAddress.email) {
    return "Email is required";
  }

  if (!Array.isArray(orderData.items) || orderData.items.length === 0) {
    return "Items array is required and must not be empty";
  }

  return null;
};

const formatPhoneNumber = (phone) => {
  // Clean and format phone number
  if (!phone) return "+923001234567"; // default fallback

  // Remove all non-digits
  const cleaned = phone.replace(/\D/g, "");

  // If it starts with 92, add +
  if (cleaned.startsWith("92")) {
    return "+" + cleaned;
  }

  // If it starts with 3, assume Pakistani mobile
  if (cleaned.startsWith("3")) {
    return "+92" + cleaned;
  }

  // Default fallback
  return "+923001234567";
};

const splitName = (fullName) => {
  if (!fullName) return { firstName: "-", lastName: "-" };

  const [firstName, ...rest] = fullName.trim().split(" ");
  return {
    firstName: firstName || "-",
    lastName: rest.join(" ") || "-",
  };
};

const formatAddress = (addr) => {
  const nameParts = splitName(addr.fullName);
  return {
    firstName: nameParts.firstName,
    lastName: nameParts.lastName,
    company: "",
    address1: addr.address || "",
    address2: "",
    city: addr.city || "",
    province: addr.state || "",
    country: addr.country || "Pakistan",
    zip: addr.postalCode || "",
    phone: addr.phone || "",
  };
};

const inferReadTime = (text) => {
  const words = text.split(" ");
  const readingTime = Math.ceil(words.length / 200); // assuming 200 words per minute
  return `${readingTime} min read`;
};
function simpleTextExtract(htmlString) {
  if (!htmlString) return "";

  return (
    htmlString
      // Remove script and style elements entirely
      .replace(/<(script|style)[^>]*>.*?<\/\1>/gis, "")
      // Remove HTML comments
      .replace(/<!--[\s\S]*?-->/g, "")
      // Remove HTML tags
      .replace(/<[^>]*>/g, "")
      // Decode common HTML entities
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/&copy;/g, "©")
      .replace(/&reg;/g, "®")
      .replace(/&trade;/g, "™")
      // Handle line breaks and multiple spaces
      .replace(/\n/g, " ")
      .replace(/\r/g, " ")
      .replace(/\t/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

const getArticles = async (numberOfArticles = 3) => {
  try {
    const myHeaders = new Headers();
    myHeaders.append("Content-Type", "application/json");
    myHeaders.append(
      "X-Shopify-Access-Token",
      process.env.SHOPIFY_ACCESS_TOKEN
    );

    const graphqlQuery = JSON.stringify({
      query: `
    {
          articles(first: ${numberOfArticles}, reverse: true) {
            nodes {
              id
              title
              summary
              author {name}
              body
              comments (first: 50){
               edges {
               node {
               body
               status
               ip
               author {email name}
               }}
              }

              handle
              createdAt
              image {
                id
                url
              }
            }
          }
    }
  `,
      variables: {},
    });

    const requestOptions = {
      method: "POST",
      headers: myHeaders,
      body: graphqlQuery,
      redirect: "follow",
    };

    const response = await fetch(
      "https://momdaughts.myshopify.com/admin/api/2025-07/graphql.json",
      requestOptions
    );
    const result = await response.json();
    return result;
  } catch (e) {
    console.error("Error fetching blogs:", e);
    return { success: false, error: "Failed to fetch blogs" };
  }
};

const getArticle = async (articleId) => {
  const myHeaders = new Headers();
  myHeaders.append("Content-Type", "application/json");
  myHeaders.append("X-Shopify-Access-Token", process.env.SHOPIFY_ACCESS_TOKEN);

  const raw = JSON.stringify({
    query: `query GetArticleById($id: ID!) { node(id: $id) { ... on Article { id title summary  
      
      author {name}
              body
              comments (first: 50){
               edges {
               node {
               body
               status
               ip
               author {email name}
               }}
              }
      handle createdAt image {id url}  } } }`,
    variables: {
      id: articleId,
    },
  });

  const requestOptions = {
    method: "POST",
    headers: myHeaders,
    body: raw,
    redirect: "follow",
  };

  const response = await fetch(
    "https://momdaughts.myshopify.com/admin/api/2025-07/graphql.json",
    requestOptions
  );
  const result = await response.json();
  return result;
};

const getCollection = async (collectionId = null) => {
  const myHeaders = new Headers();
  myHeaders.append("Content-Type", "application/json");
  myHeaders.append("X-Shopify-Access-Token", process.env.SHOPIFY_ACCESS_TOKEN);

  let graphqlQuery;
  if (!collectionId) {
    graphqlQuery = JSON.stringify({
      query: `
      query GetProducts {
        products(first: 40, query: "tag:ipl-device") {
          nodes {
            id
            title
            description
            tags
            images(first: 5) {
              edges {
                node {
                  id
                  originalSrc
                }
              }
            }
          }
        }
      }
    `,
    });
  } else {
    graphqlQuery = JSON.stringify({
      query: `
    query GetCollectionProducts($id: ID!) {
      collection(id: $id) {
        id
        title
        description
        image {url}
        productsCount {count}
        products(first: 40) {
          edges {
            node {
              id
              status
              title
              description
              tags
              images(first: 5) {
                edges {
                  node {
                    id
                    originalSrc
                  }
                }
              }
            }
          }
        }
      }
    }
  `,
      variables: {
        id: `gid://shopify/Collection/${collectionId}`,
      },
    });
  }

  const requestOptions = {
    method: "POST",
    headers: myHeaders,
    body: graphqlQuery,
    redirect: "follow",
  };

  const response = await fetch(
    "https://momdaughts.myshopify.com/admin/api/2025-07/graphql.json",
    requestOptions
  );

  const data = await response.json();
  if (collectionId) {
    // Fetch their products along with variants
    const query_ = `
      query getProducts($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Product {
            id
            variants(first: 1) {
              edges {
                node {
                  id
                  title
                  price
                }
              }
            }
          }
        }
      }
    `;
    let products = data.data.collection.products.edges.filter(
      (p) => p.node.status !== "DRAFT"
    );
    const collections = {
      id: data.data.collection.id,
      title: data.data.collection.title,
      imageUrl: data.data.collection.image?.url,
      description: data.data.collection.description,
    };
    products = { edges: products };
    const productVariantsQuery = getProductsDirectly(
      products.edges.map((product) => product.node.id, query_)
    );
    const requestOptions = {
      method: "POST",
      headers: myHeaders,
      body: productVariantsQuery,
      redirect: "follow",
    };
    const response = await fetch(
      "https://momdaughts.myshopify.com/admin/api/2025-07/graphql.json",
      requestOptions
    );
    const data_ = await response.json();
    const variants = data_.data.nodes;

    // const products = data.data.collection.products;
    const formattedData = products.edges.map((product) => ({
      id: product.node.id,
      title: product.node.title,
      description: product.node.description,
      status: product.node.status,
      tags: product.node.tags,
      images: product.node.images.edges.map((image) => ({
        id: image.node.id,
        originalSrc: image.node.originalSrc,
      })),
      variants: variants.filter((variant) => variant.id === product.node.id)[0]
        ?.variants.edges[0]?.node,
      collection: collections,
    }));
    return formattedData;
  }
  const productsData = data.data.products.nodes;

  const formattedData = productsData.map((product) => ({
    id: product.id,
    title: product.title,
    description: product.description,
    tags: product.tags,
    images: product.images.edges.map((image) => ({
      id: image.node.id,
      originalSrc: image.node.originalSrc,
    })),
  }));

  return formattedData;
};

const getCollections = async (collectionIds = null) => {
  const myHeaders = new Headers();
  myHeaders.append("Content-Type", "application/json");
  myHeaders.append("X-Shopify-Access-Token", process.env.SHOPIFY_ACCESS_TOKEN);

  let graphqlQuery;
  if (!collectionIds) {
    graphqlQuery = JSON.stringify({
      query: `
    query {
      collections(first: 10) {
        edges {
          node {
            id
            title
            handle
            updatedAt
            image{
            id
            url
            }
            productsCount {
              count
            }
          
          }
        }
      }
    }
  `,
    });
  } else {
    graphqlQuery = JSON.stringify({
      query: `
    query getCollectionNodes($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on Collection {
          id
          title
          handle
          description
          updatedAt
          image {
            id
            url
          }
          productsCount {
            count
          }
          products(first: 100) {
            nodes {
              status
            }
          }
        }
      }
    }
  `,
      variables: {
        ids: collectionIds
          .split(",")
          .map((id) => `gid://shopify/Collection/${id}`),
      },
    });
  }

  const requestOptions = {
    method: "POST",
    headers: myHeaders,
    body: graphqlQuery,
    redirect: "follow",
  };

  const response = await fetch(
    "https://momdaughts.myshopify.com/admin/api/2025-07/graphql.json",
    requestOptions
  );

  const data = await response.json();
  console.log(data);
  return data;
};
// Combined Shopify API call for both products and articles
const getShopifyData = async () => {
  const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

  const myHeaders = new Headers();
  myHeaders.append("Content-Type", "application/json");
  myHeaders.append("X-Shopify-Access-Token", ACCESS_TOKEN);

  const graphql = JSON.stringify({
    query: `{
      products(first: 20) {
        edges {
          node {
            id
            title
            handle
            description
            images(first: 5) {
              edges {
                node {
                  id
                  altText
                  originalSrc
                }
              }
            }
            variants(first: 1) {
              edges {
                node {
                  id
                  title
                  price
                }
              }
            }
          }
        }
      }
      articles(first: 3, reverse: true) {
        nodes {
          id
          title
          summary
          author { name }
          body
          comments(first: 50) {
            edges {
              node {
                body
                status
                ip
                author { email name }
              }
            }
          }
          handle
          createdAt
          image {
            id
            url
          }
        }
      }
    }`,
    variables: {},
  });

  // Use the latest API version (2025-07) since that's what you used for articles
  const response = await fetch(
    "https://momdaughts.myshopify.com/admin/api/2025-07/graphql.json",
    {
      method: "POST",
      headers: myHeaders,
      body: graphql,
      redirect: "follow",
    }
  );

  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.status}`);
  }

  const data = await response.json();

  // Process products
  const products = data.data.products.edges.map((edge) => {
    const product = edge.node;
    return {
      id: product.id,
      title: product.title,
      handle: product.handle,
      description: product.description,
      images: product.images.edges.map((imageEdge) => ({
        id: imageEdge.node.id,
        altText: imageEdge.node.altText,
        originalSrc: imageEdge.node.originalSrc,
      })),
      variants: product.variants.edges.map((variantEdge) => ({
        id: variantEdge.node.id,
        title: variantEdge.node.title,
        price: variantEdge.node.price,
      })),
    };
  });

  // Articles are already in the correct format from nodes
  const articles = data.data.articles;

  return { products, articles };
};

const getAdresses = async (userEmail) => {
  const url = "https://momdaughts.myshopify.com/admin/api/2025-04/graphql.json";

  const headers = {
    "Content-Type": "application/json",
    "X-Shopify-Access-Token": process.env.SHOPIFY_LIMITED_ACCESS_TOKEN,
  };

  const body = {
    query: `
      query getCustomerByEmail($query: String!) {
        customers(first: 1, query: $query) {
          edges {
            node {
              id
              email
              firstName
              lastName
              phone
              createdAt
              updatedAt
              defaultAddress {
                id
                address1
                address2
                city
                province
                country
                zip
              }
              defaultPhoneNumber {
                phoneNumber
              }
              image {
                url
              }
              amountSpent {
                amount
              }
              addressesV2(first: 250) {
                edges {
                  node {
                    id
                    address1
                    address2
                    city
                    company
                    country
                    countryCodeV2
                    firstName
                    lastName
                    phone
                    province
                    provinceCode
                    zip
                  }
                }
              }
            }
          }
        }
      }
    `,
    variables: {
      query: `email:${userEmail}`,
    },
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching customer:", error);
  }
};

async function getShopifyDiscounts() {
  const url = "https://momdaughts.myshopify.com/admin/api/2025-07/graphql.json";

  const headers = {
    "Content-Type": "application/json",
    "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN,
  };

  const query = `
    query {
      codeDiscountNodes(first: 250, query: "status:active") {
        nodes {
          id
          codeDiscount {
            ... on DiscountCodeBxgy {
              title
              usesPerOrderLimit
              customerGets {
                value {
                  ... on DiscountOnQuantity {
                    quantity {
                      quantity
                    }
                    effect {
                      ... on DiscountPercentage {
                        percentage
                      }
                      ... on DiscountAmount {
                        amount {
                          amount
                          currencyCode
                        }
                      }
                    }
                  }
                }
              }
              combinesWith {
                orderDiscounts
                productDiscounts
                shippingDiscounts
              }
            }
            ... on DiscountCodeBasic {
              createdAt
              title
              summary
              status
              endsAt
              usageLimit
              customerGets {
                appliesOnOneTimePurchase
                value {
                  ... on DiscountPercentage {
                    percentage
                  }
                  ... on DiscountAmount {
                    amount {
                      amount
                      currencyCode
                    }
                  }
                }
                items {
                  ... on DiscountProducts {
                    productVariants(first: 50) {
                      edges {
                        node {
                          id
                          title
                          displayName
                        }
                      }
                    }
                  }
                  ... on AllDiscountItems {
                    allItems
                  }
                }
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
              combinesWith {
                orderDiscounts
                productDiscounts
                shippingDiscounts
              }
            }
            ... on DiscountCodeFreeShipping {
              title
              usageLimit
              combinesWith {
                orderDiscounts
                productDiscounts
                shippingDiscounts
              }
            }
          }
        }
      }
    }
  `;

  const body = JSON.stringify({ query });

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: headers,
      body: body,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.data?.codeDiscountNodes?.nodes || [];
  } catch (error) {
    console.error("Error fetching Shopify discounts:", error);
    throw error;
  }
}
function formatDiscountData(rawData) {
  const discounts = rawData;
  const formattedDiscounts = [];
  const summary = {
    total: discounts.length,
    active: 0,
    expired: 0,
    limitReached: 0,
    unlimited: 0,
    nearingLimit: 0,
  };

  discounts.forEach((discountNode, index) => {
    const discount = discountNode.codeDiscount;

    if (!discount) return;

    const codes = discount.codes?.nodes || [];
    const primaryCode = codes[0];

    if (!primaryCode) return;

    const usageCount = primaryCode.asyncUsageCount || 0;
    const usageLimit = discount.usageLimit;
    const isExpired = discount.endsAt && new Date(discount.endsAt) < new Date();
    const isLimitReached = usageLimit && usageCount >= usageLimit;
    const isNearingLimit =
      usageLimit && usageCount / usageLimit >= 0.8 && !isLimitReached;

    // Update summary counts
    if (isExpired) summary.expired++;
    else summary.active++;

    if (isLimitReached) summary.limitReached++;
    if (!usageLimit) summary.unlimited++;
    if (isNearingLimit) summary.nearingLimit++;

    // Determine discount value
    let discountValue = "N/A";
    let discountType = "Unknown";

    if (discount.customerGets?.value?.percentage) {
      discountValue = `${discount.customerGets.value.percentage}%`;
      discountType = "Percentage";
    } else if (discount.customerGets?.value?.amount) {
      const amount = discount.customerGets.value.amount;
      discountValue = `${amount.amount} ${amount.currencyCode}`;
      discountType = "Fixed Amount";
    } else if (discount.__typename === "DiscountCodeFreeShipping") {
      discountValue = "Free Shipping";
      discountType = "Free Shipping";
    } else if (discount.__typename === "DiscountCodeBxgy") {
      discountType = "Buy X Get Y";
      // For BXGY, extract the discount from the effect
      const effect = discount.customerGets?.value?.effect;
      if (effect?.percentage) {
        discountValue = `${effect.percentage}% off`;
      } else if (effect?.amount) {
        discountValue = `${effect.amount.amount} ${effect.amount.currencyCode} off`;
      }
    }

    // Generate status messages
    const statusMessages = [];

    if (isExpired) {
      statusMessages.push("⚠️ EXPIRED");
    } else if (isLimitReached) {
      statusMessages.push("🚫 USAGE LIMIT REACHED");
    } else if (isNearingLimit) {
      statusMessages.push("⚡ NEARING USAGE LIMIT");
    } else {
      statusMessages.push("✅ AVAILABLE");
    }

    if (usageLimit) {
      const remainingUses = usageLimit - usageCount;
      statusMessages.push(`${remainingUses} uses remaining`);
    } else {
      statusMessages.push("Unlimited uses");
    }

    // Check for minimum requirements
    let minimumRequirement = "None";
    if (discount.minimumRequirement?.greaterThanOrEqualToSubtotal) {
      const minAmount =
        discount.minimumRequirement.greaterThanOrEqualToSubtotal.amount;
      minimumRequirement = `Minimum order: ${minAmount}`;
    }

    formattedDiscounts.push({
      index: index + 1,
      id: discountNode.id,
      title: discount.title || "Untitled Discount",
      code: primaryCode.code,
      type: discountType,
      value: discountValue,
      status: discount.status || "active",
      usageCount: usageCount,
      usageLimit: usageLimit || "Unlimited",
      usagePercentage: usageLimit
        ? Math.round((usageCount / usageLimit) * 100)
        : 0,
      createdAt: discount.createdAt
        ? new Date(discount.createdAt).toLocaleDateString()
        : "Unknown",
      endsAt: discount.endsAt
        ? new Date(discount.endsAt).toLocaleDateString()
        : "No expiry",
      minimumRequirement: minimumRequirement,
      combinesWith: {
        orders: discount.combinesWith?.orderDiscounts || false,
        products: discount.combinesWith?.productDiscounts || false,
        shipping: discount.combinesWith?.shippingDiscounts || false,
      },
      statusMessages: statusMessages,
      isExpired: isExpired,
      isLimitReached: isLimitReached,
      isNearingLimit: isNearingLimit,
    });
  });

  return {
    summary: summary,
    discounts: formattedDiscounts.sort((a, b) => {
      // Sort by: expired last, then by usage percentage (highest first), then by creation date
      if (a.isExpired && !b.isExpired) return 1;
      if (!a.isExpired && b.isExpired) return -1;
      if (a.usagePercentage !== b.usagePercentage)
        return b.usagePercentage - a.usagePercentage;
      return new Date(b.createdAt) - new Date(a.createdAt);
    }),
    timestamp: new Date().toISOString(),
  };
}

function validateSingleDiscountCode(code, allDiscounts) {
  const normalizedInputCode = code.trim().toLowerCase();
  
  for (const discountNode of allDiscounts) {
    const discount = discountNode.codeDiscount;
    if (!discount || !discount.codes?.nodes) continue;

    const matchingCode = discount.codes.nodes.find(
      codeNode => codeNode.code.toLowerCase() === normalizedInputCode
    );

    if (matchingCode) {
      const usageCount = matchingCode.asyncUsageCount || 0;
      const usageLimit = discount.usageLimit;
      const isExpired = discount.endsAt && new Date(discount.endsAt) < new Date();
      const isLimitReached = usageLimit && usageCount >= usageLimit;
      const isActive = discount.status === 'ACTIVE' || discount.status === 'active';

      // Determine discount type and value
      let discountType = 'Unknown';
      let discountValue = 'N/A';
      
      if (discount.__typename === 'DiscountCodeBasic') {
        discountType = 'Basic Discount';
        if (discount.customerGets?.value?.percentage) {
          discountValue = `${discount.customerGets.value.percentage}%`;
        } else if (discount.customerGets?.value?.amount) {
          const amount = discount.customerGets.value.amount;
          discountValue = `${amount.amount} ${amount.currencyCode}`;
        }
      } else if (discount.__typename === 'DiscountCodeFreeShipping') {
        discountType = 'Free Shipping';
        discountValue = 'Free Shipping';
      } else if (discount.__typename === 'DiscountCodeBxgy') {
        discountType = 'Buy X Get Y';
        const effect = discount.customerGets?.value?.effect;
        if (effect?.percentage) {
          discountValue = `${effect.percentage}% off`;
        } else if (effect?.amount) {
          discountValue = `${effect.amount.amount} ${effect.amount.currencyCode} off`;
        }
      }

      return {
        found: true,
        valid: isActive && !isExpired && !isLimitReached,
        code: matchingCode.code,
        discountId: discountNode.id,
        title: discount.title || 'Untitled Discount',
        type: discountType,
        value: discountValue,
        usageCount: usageCount,
        usageLimit: usageLimit || null,
        isActive: isActive,
        isExpired: isExpired,
        isLimitReached: isLimitReached,
        expiresAt: discount.endsAt,
        combinesWith: discount.combinesWith || {
          orderDiscounts: false,
          productDiscounts: false,
          shippingDiscounts: false
        },
        invalidReasons: [
          ...(!isActive ? ['Discount is not active'] : []),
          ...(isExpired ? ['Discount has expired'] : []),
          ...(isLimitReached ? ['Usage limit reached'] : [])
        ]
      };
    }
  }

  return {
    found: false,
    valid: false,
    code: code,
    invalidReasons: ['Discount code not found']
  };
}

/**
 * Determines if two discount codes can be combined
 * @param {Object} firstDiscount - First discount validation result
 * @param {Object} secondDiscount - Second discount validation result
 * @returns {Object} Combination compatibility result
 */
function canDiscountsCombine(firstDiscount, secondDiscount) {
  if (!firstDiscount.valid || !secondDiscount.valid) {
    return {
      canCombine: false,
      reason: 'One or both discount codes are invalid'
    };
  }

  // Same discount code cannot be used twice
  if (firstDiscount.code.toLowerCase() === secondDiscount.code.toLowerCase()) {
    return {
      canCombine: false,
      reason: 'Cannot use the same discount code multiple times'
    };
  }

  const first = firstDiscount.combinesWith;
  const second = secondDiscount.combinesWith;

  // Check combination compatibility based on discount types
  const firstType = firstDiscount.type;
  const secondType = secondDiscount.type;

  // Basic business rules for discount combination
  const combinations = {
    'Basic Discount': {
      'Basic Discount': first.orderDiscounts && second.orderDiscounts,
      'Free Shipping': first.shippingDiscounts && second.orderDiscounts,
      'Buy X Get Y': first.productDiscounts && second.orderDiscounts
    },
    'Free Shipping': {
      'Basic Discount': first.orderDiscounts && second.shippingDiscounts,
      'Free Shipping': first.shippingDiscounts && second.shippingDiscounts,
      'Buy X Get Y': first.productDiscounts && second.shippingDiscounts
    },
    'Buy X Get Y': {
      'Basic Discount': first.orderDiscounts && second.productDiscounts,
      'Free Shipping': first.shippingDiscounts && second.productDiscounts,
      'Buy X Get Y': first.productDiscounts && second.productDiscounts
    }
  };

  const canCombine = combinations[firstType]?.[secondType] || false;

  if (!canCombine) {
    return {
      canCombine: false,
      reason: `${firstType} and ${secondType} discounts cannot be combined based on their combination settings`,
      details: {
        firstCombinesWith: first,
        secondCombinesWith: second
      }
    };
  }

  return {
    canCombine: true,
    reason: 'Discount codes can be successfully combined'
  };
}


module.exports = {
  getProducts,
  getProduct,
  getVariant,
  getVariants,
  createOrder,
  getArticles,
  simpleTextExtract,
  inferReadTime,
  getCollection,
  getArticle,
  getCollections,
  getShopifyData,
  getAdresses,
  getShopifyDiscounts,
  formatDiscountData,
  validateSingleDiscountCode,
  canDiscountsCombine,
};
