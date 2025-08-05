require("dotenv").config();
const getProducts = async () => {
  const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

  try {
    const myHeaders = new Headers();
    myHeaders.append("Content-Type", "application/json");
    myHeaders.append("X-Shopify-Access-Token", ACCESS_TOKEN);
    const graphql = JSON.stringify({
      query:
        "{\r\n      products(first: 5) {\r\n        edges {\r\n          node {\r\n            id\r\n            title\r\n            handle\r\n            description\r\n            images(first: 5) {\r\n              edges {\r\n                node {\r\n                  id\r\n                  altText\r\n                  originalSrc\r\n                }\r\n              }\r\n            }\r\n            variants(first: 3) {\r\n              edges {\r\n                node {\r\n                  id\r\n                  title\r\n                  price\r\n                }\r\n              }\r\n            }\r\n          }\r\n        }\r\n      }\r\n    }\r\n  ",
      variables: {},
    });
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

const getProduct = async (id) => {
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

    const variants = product.variants.edges.map(({ node }) => ({
      id: node.id,
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
    }));

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



module.exports = { getProducts, getProduct };
