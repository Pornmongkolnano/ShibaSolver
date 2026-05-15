const http = require("http");

jest.mock("../lib/prisma", () => ({}));

const createApp = require("../app");

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

function requestJson(server, path) {
  const { port } = server.address();

  return new Promise((resolve, reject) => {
    const req = http.get(
      {
        hostname: "127.0.0.1",
        port,
        path,
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: body ? JSON.parse(body) : null,
          });
        });
      }
    );

    req.on("error", reject);
  });
}

describe("backend app health routes", () => {
  let server;

  afterEach(async () => {
    if (server) {
      await close(server);
      server = null;
    }
  });

  test("root route returns API welcome payload", async () => {
    server = await listen(createApp());

    const response = await requestJson(server, "/");

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: "Welcome to ShibaSolver API",
    });
  });

  test("health route verifies database connectivity", async () => {
    const pool = {
      query: jest.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] }),
    };
    server = await listen(createApp({ pool }));

    const response = await requestJson(server, "/health");

    expect(pool.query).toHaveBeenCalledWith("SELECT 1");
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      success: true,
      status: "ok",
      service: "shibasolver-api",
    });
  });

  test("health route returns 503 when database check fails", async () => {
    const pool = {
      query: jest.fn().mockRejectedValue(new Error("database down")),
    };
    server = await listen(createApp({ pool }));

    const response = await requestJson(server, "/health");

    expect(response.statusCode).toBe(503);
    expect(response.body).toEqual({
      success: false,
      status: "unavailable",
      service: "shibasolver-api",
      error: {
        code: "DATABASE_HEALTH_CHECK_FAILED",
        message: "Database health check failed",
      },
    });
  });
});
