const path = require("path");
const dotenv = require("dotenv");

function loadEnv() {
  dotenv.config({ path: path.resolve(__dirname, "config.env") });
  dotenv.config({ path: path.resolve(__dirname, "..", ".env") });
}

function requiredEnv(keys) {
  const missing = keys.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

module.exports = {
  loadEnv,
  requiredEnv,
};
