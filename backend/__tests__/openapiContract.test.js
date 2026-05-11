const spec = require("../docs/openapi");

const ID_KEY_PATTERN = /(^id$|_id$|Id$|ID$|^ids$)/;

function collectInvalidIdSchemas(value, path = []) {
  if (!value || typeof value !== "object") return [];

  const failures = [];
  for (const [key, child] of Object.entries(value)) {
    const childPath = [...path, key];
    if (
      ID_KEY_PATTERN.test(key) &&
      child &&
      typeof child === "object" &&
      Object.prototype.hasOwnProperty.call(child, "type") &&
      child.type !== "string"
    ) {
      failures.push(`${childPath.join(".")} -> ${child.type}`);
    }

    failures.push(...collectInvalidIdSchemas(child, childPath));
  }

  return failures;
}

describe("OpenAPI contract", () => {
  test("documents centralized error response shape", () => {
    const schema = spec.components.schemas.ErrorResponse;

    expect(schema.required).toEqual(["success", "error"]);
    expect(schema.properties).not.toHaveProperty("message");
    expect(schema.properties.error.properties).toEqual(
      expect.objectContaining({
        code: expect.objectContaining({ type: "string" }),
        message: expect.objectContaining({ type: "string" }),
      })
    );
  });

  test("uses string schemas for Prisma cuid-style ids", () => {
    const failures = collectInvalidIdSchemas({
      parameters: spec.components.parameters,
      schemas: spec.components.schemas,
      paths: spec.paths,
    });

    expect(failures).toEqual([]);
    expect(spec.paths["/api/v1/users/{userID}/posts"].get.parameters[0].schema.type).toBe(
      "string"
    );
  });

  test("documents current runtime routes and response contracts", () => {
    expect(spec.info.contact.url).toBe("https://github.com/Pornmongkolnano/ShibaSolver");
    expect(spec.paths).toHaveProperty("/api/v1/ratings/check");
    expect(
      spec.paths["/api/v1/admins/accounts/{reportId}/status"].patch.responses[200].content[
        "application/json"
      ].schema.allOf[1].properties.data.$ref
    ).toBe("#/components/schemas/AdminReportStatusResult");
    expect(
      spec.paths["/api/v1/users/{username}/shibameter"].get.responses[200].content[
        "application/json"
      ].schema.allOf[1].$ref
    ).toBe("#/components/schemas/ShibaMeterResponse");
  });
});
