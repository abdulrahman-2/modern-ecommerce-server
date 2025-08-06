const express = require("express");
const cors = require("cors");

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get("/", (req, res) => {
  res.json({
    message: "Modern E-commerce Stripe Payment Server is running!",
    timestamp: new Date().toISOString(),
    endpoints: {
      health: "GET /",
      createPayment: "POST /create-payment-intent",
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

// Webhook endpoint for Stripe events (optional but recommended for production)
app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];

    // Replace with your actual webhook endpoint secret
    const endpointSecret =
      process.env.STRIPE_WEBHOOK_SECRET || "whsec_test_...";

    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
      console.log(`Webhook received: ${event.type}`);
    } catch (err) {
      console.error(`Webhook signature verification failed:`, err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    switch (event.type) {
      case "payment_intent.succeeded":
        const paymentIntent = event.data.object;
        console.log(
          `Payment succeeded: ${paymentIntent.id} for $${(
            paymentIntent.amount / 100
          ).toFixed(2)}`
        );
        // Here you can update your database, send confirmation emails, etc.
        break;

      case "payment_intent.payment_failed":
        const failedPayment = event.data.object;
        console.log(`Payment failed: ${failedPayment.id}`);
        break;

      case "payment_method.attached":
        const paymentMethod = event.data.object;
        console.log(`Payment method attached: ${paymentMethod.id}`);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  }
);

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
    ],
  });
});

const PORT = process.env.PORT || 4242;

app.listen(PORT, () => {
  console.log("🚀 Modern E-commerce Stripe Server Started!");
  console.log(`Listening on port ${PORT}`);
});
