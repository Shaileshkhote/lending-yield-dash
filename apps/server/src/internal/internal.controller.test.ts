import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { InternalController } from "./internal.controller";

describe("InternalController", () => {
  const controller = new InternalController(
    { runOnce: async () => ({ runId: "run_test", snapshots: 0, checks: 0 }) } as never,
    { materialize: async () => ({ runId: "mat_test", files: 0 }) } as never,
    {} as never
  );

  it("rejects internal calls without ADMIN_API_KEY", () => {
    process.env.ADMIN_API_KEY = "secret";

    expect(() => controller.echo(undefined, { ok: true })).toThrow(UnauthorizedException);
  });

  it("allows internal calls with ADMIN_API_KEY", () => {
    process.env.ADMIN_API_KEY = "secret";

    expect(controller.echo("secret", { ok: true })).toEqual({ ok: true });
  });
});
