const axios = require("axios");

// Server configurations
const servers = {
  fastify: {
    name: "Fastify",
    baseUrl: "http://192.168.100.3:3000",
    port: 3000,
  },
  express: {
    name: "Express",
    baseUrl: "http://192.168.100.3:3002",
    port: 3002,
  },
};

// Test data
const authToken =
  "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJjbWRuM3E3Y3MwMDAwZWNya2dvbmE5ZnZjIiwic2Vzc2lvbklkIjoiY21kc3JwajdhMDAwMWVjaWdlcHU1bHc2biIsImVtYWlsIjoiY2FwdGFpbi5nYXplQGdtYWlsLmNvbSIsImlhdCI6MTc1NDA1MDUyNSwiZXhwIjoxNzU0NjU1MzI1fQ.VubmwvJF6wCKIzWiT-KOBR9vs-N8G2r0UzrpMCtmDc8";

const cartData = {
  cartData: {
    addedAt: "2025-08-05T00:23:28.618Z",
    price: 1299,
    productTitle: "MomDaughts' Double tail Menstrual Cup",
    quantity: 1,
    shopifyProductId: "7970555658532",
    shopifyVariantId: "43736215159076",
    updatedAt: "2025-08-05T00:23:28.619Z",
    userId: "cmdn3q7cs0000ecrkgona9fvc",
  },
};

// Test configurations
const testEndpoints = [
  {
    name: "Add to Cart (POST)",
    path: "/add-to-cart",
    method: "POST",
    data: cartData,
  },
  {
    name: "Cart Items Count (GET)",
    path: "/cart-items-count",
    method: "GET",
    data: null,
  },
];

// Performance testing function
async function testEndpoint(serverConfig, endpoint, iterations = 10) {
  const results = [];
  const headers = {
    Authorization: authToken,
    "Content-Type": "application/json",
  };

  console.log(
    `\nTesting ${serverConfig.name} - ${endpoint.name} (${iterations} iterations)`
  );

  for (let i = 0; i < iterations; i++) {
    const startTime = process.hrtime.bigint();

    try {
      const config = {
        method: endpoint.method,
        url: `${serverConfig.baseUrl}${endpoint.path}`,
        headers: headers,
        timeout: 10000, // 10 second timeout
      };

      if (endpoint.data) {
        config.data = endpoint.data;
      }

      const response = await axios(config);
      const endTime = process.hrtime.bigint();
      const responseTime = Number(endTime - startTime) / 1000000; // Convert to milliseconds

      results.push({
        iteration: i + 1,
        responseTime: responseTime,
        statusCode: response.status,
        success: true,
      });

      process.stdout.write(`✓`);
    } catch (error) {
      const endTime = process.hrtime.bigint();
      const responseTime = Number(endTime - startTime) / 1000000;

      results.push({
        iteration: i + 1,
        responseTime: responseTime,
        statusCode: error.response?.status || 0,
        success: false,
        error: error.message,
      });

      process.stdout.write(`✗`);
    }

    // Small delay between requests to avoid overwhelming the server
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  console.log(); // New line after progress indicators
  return results;
}

// Calculate statistics
function calculateStats(results) {
  const successfulResults = results.filter((r) => r.success);
  const responseTimes = successfulResults.map((r) => r.responseTime);

  if (responseTimes.length === 0) {
    return {
      successRate: 0,
      avgResponseTime: 0,
      minResponseTime: 0,
      maxResponseTime: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
    };
  }

  responseTimes.sort((a, b) => a - b);

  const avg =
    responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
  const min = responseTimes[0];
  const max = responseTimes[responseTimes.length - 1];

  const p95Index = Math.floor(responseTimes.length * 0.95);
  const p99Index = Math.floor(responseTimes.length * 0.99);

  return {
    successRate: (successfulResults.length / results.length) * 100,
    avgResponseTime: avg,
    minResponseTime: min,
    maxResponseTime: max,
    p95ResponseTime: responseTimes[p95Index] || max,
    p99ResponseTime: responseTimes[p99Index] || max,
    totalRequests: results.length,
    successfulRequests: successfulResults.length,
  };
}

// Main comparison function
async function compareServerPerformance(iterations = 20) {
  console.log("🚀 Starting Server Performance Comparison");
  console.log(
    `Testing with ${iterations} iterations per endpoint per server\n`
  );

  const results = {};

  // Test each server for each endpoint
  for (const [serverKey, serverConfig] of Object.entries(servers)) {
    results[serverKey] = {};

    for (const endpoint of testEndpoints) {
      const testResults = await testEndpoint(
        serverConfig,
        endpoint,
        iterations
      );
      results[serverKey][endpoint.name] = {
        rawResults: testResults,
        stats: calculateStats(testResults),
      };
    }
  }

  // Display comparison results
  console.log("\n📊 PERFORMANCE COMPARISON RESULTS");
  console.log("=".repeat(80));

  for (const endpoint of testEndpoints) {
    console.log(`\n🎯 ${endpoint.name}:`);
    console.log("-".repeat(50));

    const fastifyStats = results.fastify[endpoint.name].stats;
    const expressStats = results.express[endpoint.name].stats;

    console.log(`\n${servers.fastify.name} (Port ${servers.fastify.port}):`);
    console.log(
      `  Success Rate: ${fastifyStats.successRate.toFixed(1)}% (${
        fastifyStats.successfulRequests
      }/${fastifyStats.totalRequests})`
    );
    console.log(`  Avg Response: ${fastifyStats.avgResponseTime.toFixed(2)}ms`);
    console.log(`  Min Response: ${fastifyStats.minResponseTime.toFixed(2)}ms`);
    console.log(`  Max Response: ${fastifyStats.maxResponseTime.toFixed(2)}ms`);
    console.log(
      `  95th percentile: ${fastifyStats.p95ResponseTime.toFixed(2)}ms`
    );

    console.log(`\n${servers.express.name} (Port ${servers.express.port}):`);
    console.log(
      `  Success Rate: ${expressStats.successRate.toFixed(1)}% (${
        expressStats.successfulRequests
      }/${expressStats.totalRequests})`
    );
    console.log(`  Avg Response: ${expressStats.avgResponseTime.toFixed(2)}ms`);
    console.log(`  Min Response: ${expressStats.minResponseTime.toFixed(2)}ms`);
    console.log(`  Max Response: ${expressStats.maxResponseTime.toFixed(2)}ms`);
    console.log(
      `  95th percentile: ${expressStats.p95ResponseTime.toFixed(2)}ms`
    );

    // Determine winner
    if (fastifyStats.successRate > 0 && expressStats.successRate > 0) {
      const fastifyFaster =
        fastifyStats.avgResponseTime < expressStats.avgResponseTime;
      const difference = Math.abs(
        fastifyStats.avgResponseTime - expressStats.avgResponseTime
      );
      const percentDiff =
        (difference /
          Math.max(
            fastifyStats.avgResponseTime,
            expressStats.avgResponseTime
          )) *
        100;

      console.log(
        `\n🏆 Winner: ${
          fastifyFaster ? servers.fastify.name : servers.express.name
        }`
      );
      console.log(
        `   ${
          fastifyFaster ? servers.fastify.name : servers.express.name
        } is ${difference.toFixed(2)}ms (${percentDiff.toFixed(
          1
        )}%) faster on average`
      );
    }
  }

  // Overall summary
  console.log("\n📈 OVERALL SUMMARY");
  console.log("=".repeat(80));

  let fastifyWins = 0;
  let expressWins = 0;

  for (const endpoint of testEndpoints) {
    const fastifyAvg = results.fastify[endpoint.name].stats.avgResponseTime;
    const expressAvg = results.express[endpoint.name].stats.avgResponseTime;

    if (fastifyAvg > 0 && expressAvg > 0) {
      if (fastifyAvg < expressAvg) {
        fastifyWins++;
      } else {
        expressWins++;
      }
    }
  }

  console.log(
    `${servers.fastify.name} won ${fastifyWins}/${testEndpoints.length} endpoint tests`
  );
  console.log(
    `${servers.express.name} won ${expressWins}/${testEndpoints.length} endpoint tests`
  );

  if (fastifyWins > expressWins) {
    console.log(`\n🎉 Overall Winner: ${servers.fastify.name}`);
  } else if (expressWins > fastifyWins) {
    console.log(`\n🎉 Overall Winner: ${servers.express.name}`);
  } else {
    console.log("\n🤝 Result: Tie - Both servers performed equally");
  }

  return results;
}

// Additional function for load testing
async function loadTest(iterations = 100, concurrency = 10) {
  console.log(
    `\n🔥 LOAD TEST - ${iterations} requests with ${concurrency} concurrent connections`
  );
  console.log("=".repeat(80));

  const results = {};

  for (const [serverKey, serverConfig] of Object.entries(servers)) {
    console.log(`\nLoad testing ${serverConfig.name}...`);

    const endpoint = testEndpoints[1]; // Use cart-items-count for load test
    const promises = [];
    const startTime = process.hrtime.bigint();

    // Create concurrent requests
    for (let i = 0; i < iterations; i++) {
      const promise = axios({
        method: endpoint.method,
        url: `${serverConfig.baseUrl}${endpoint.path}`,
        headers: {
          Authorization: authToken,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      })
        .then((response) => ({
          success: true,
          responseTime: Date.now(),
          statusCode: response.status,
        }))
        .catch((error) => ({
          success: false,
          responseTime: Date.now(),
          statusCode: error.response?.status || 0,
          error: error.message,
        }));

      promises.push(promise);

      // Control concurrency
      if (promises.length >= concurrency) {
        await Promise.all(promises.splice(0, concurrency));
      }
    }

    // Wait for remaining requests
    const loadResults = await Promise.all(promises);
    const endTime = process.hrtime.bigint();
    const totalTime = Number(endTime - startTime) / 1000000;

    const successful = loadResults.filter((r) => r.success).length;
    const successRate = (successful / iterations) * 100;
    const rps = (successful / totalTime) * 1000; // Requests per second

    results[serverKey] = {
      totalTime,
      successRate,
      requestsPerSecond: rps,
      successful,
      total: iterations,
    };

    console.log(`  Total Time: ${totalTime.toFixed(2)}ms`);
    console.log(
      `  Success Rate: ${successRate.toFixed(1)}% (${successful}/${iterations})`
    );
    console.log(`  Requests/sec: ${rps.toFixed(2)}`);
  }

  console.log("\n🏆 LOAD TEST WINNER:");
  const fastifyRps = results.fastify.requestsPerSecond;
  const expressRps = results.express.requestsPerSecond;

  if (fastifyRps > expressRps) {
    console.log(
      `${servers.fastify.name} - ${fastifyRps.toFixed(
        2
      )} req/sec vs ${expressRps.toFixed(2)} req/sec`
    );
  } else {
    console.log(
      `${servers.express.name} - ${expressRps.toFixed(
        2
      )} req/sec vs ${fastifyRps.toFixed(2)} req/sec`
    );
  }

  return results;
}

// Export functions for use
module.exports = {
  compareServerPerformance,
  loadTest,
  testEndpoint,
  calculateStats,
};

// Run the comparison if this file is executed directly
if (require.main === module) {
  (async () => {
    try {
      // Basic performance comparison
      await compareServerPerformance(25);

      // Load test
      await loadTest(200, 20);
    } catch (error) {
      console.error("Error running performance test:", error.message);
    }
  })();
}
