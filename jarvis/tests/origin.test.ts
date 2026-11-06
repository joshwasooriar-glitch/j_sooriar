import { describe, expect, it } from "vitest";
import { requestOrigin } from "@/lib/http/origin";

const h = (o: Record<string, string>) => new Headers(o);

describe("requestOrigin", () => {
  it("uses the host the browser sent, not the server's idea of it", () => {
    expect(requestOrigin(h({ host: "127.0.0.1:3100" }), "http://localhost:3100")).toBe("http://127.0.0.1:3100");
  });
  it("prefers forwarded host and protocol behind a proxy", () => {
    expect(
      requestOrigin(h({ host: "internal:3000", "x-forwarded-host": "jarvis.example.com", "x-forwarded-proto": "https" }), "http://internal:3000"),
    ).toBe("https://jarvis.example.com");
  });
  it("falls back when the host header is missing or malformed", () => {
    expect(requestOrigin(h({}), "http://localhost:3100")).toBe("http://localhost:3100");
    expect(requestOrigin(h({ host: "evil.com/path?x" }), "http://localhost:3100")).toBe("http://localhost:3100");
  });
});
