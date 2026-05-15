const { loadEnv, requiredEnv } = require("./config/env");
const connectDB = require("./config/db");
const createApp = require("./app");

loadEnv();
requiredEnv(["DATABASE_URL"]);

async function start() {
  const pool = await connectDB();
  const app = createApp({ pool });
  const PORT = process.env.PORT || 5000;

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

start();

process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
  process.exit(1);
});
