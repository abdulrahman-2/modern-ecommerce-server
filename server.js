const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { connectDB } = require("./config/db");

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 4242;

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Import routes
const authRoutes = require("./routes/authRoutes");

// Connect to database
connectDB();

// Mount routes
app.use("/api/auth", authRoutes);

// Health check endpoint
app.get("/", (req, res) => {
  res.json({
    message: "Modern E-commerce Stripe Payment Server is running!",
    timestamp: new Date().toISOString(),
    endpoints: {
      health: "GET /",
      createPayment: "POST /create-payment-intent",
      auth: {
        signup: "POST /api/auth/signup",
        signin: "POST /api/auth/signin",
        getMe: "GET /api/auth/me",
      },
    },
  });
});

// Create payment intent endpoint
app.post("/create-payment-intent", async (req, res) => {
  try {
    const { amount, currency = "usd", metadata = {} } = req.body;

    // Validate request
    if (!amount) {
      return res.status(400).json({
        error: "Amount is required",
      });
    }

    // Validate minimum amount (Stripe requires at least $0.50)
    if (amount < 50) {
      return res.status(400).json({
        error: "Amount must be at least $0.50 (50 cents)",
      });
    }

    console.log(
      `Creating payment intent for amount: $${(amount / 100).toFixed(2)}`
    );

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount), // Ensure integer value
      currency: currency.toLowerCase(),
      payment_method_types: ["card"],
      metadata: {
        ...metadata,
        source: "modern-ecommerce",
        created_at: new Date().toISOString(),
      },
      description: "Modern E-commerce Purchase",
    });

    // Log successful creation
    console.log(`Payment intent created: ${paymentIntent.id}`);

    // Return client secret
    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    console.error("Stripe Error:", error);

    // Handle specific Stripe errors
    if (error.type === "StripeCardError") {
      res.status(400).json({ error: error.message });
    } else if (error.type === "StripeRateLimitError") {
      res
        .status(429)
        .json({ error: "Too many requests. Please try again later." });
    } else if (error.type === "StripeInvalidRequestError") {
      res.status(400).json({ error: "Invalid request parameters." });
    } else if (error.type === "StripeAPIError") {
      res.status(500).json({ error: "Stripe API error. Please try again." });
    } else if (error.type === "StripeConnectionError") {
      res
        .status(500)
        .json({ error: "Network error. Please check your connection." });
    } else if (error.type === "StripeAuthenticationError") {
      res
        .status(401)
        .json({ error: "Authentication error. Please check your API keys." });
    } else {
      res.status(500).json({
        error: "An unexpected error occurred. Please try again.",
      });
    }
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("Server Error:", error);
  res.status(500).json({
    error: "Internal server error",
    message: process.env.NODE_ENV === "development" ? error.message : undefined,
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    error: "Endpoint not found",
    availableEndpoints: [
      "GET /",
      "POST /create-payment-intent",
      "POST /webhook",
      "POST /api/auth/signup",
      "POST /api/auth/signin",
      "GET /api/auth/me",
    ],
  });
});

app.listen(PORT, () => {
  console.log("🚀 Modern E-commerce Stripe Server Started!");
  console.log(`Listening on port ${PORT}`);
});
