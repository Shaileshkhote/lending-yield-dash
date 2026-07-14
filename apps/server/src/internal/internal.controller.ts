import { Body, Controller, Get, Headers, Inject, Param, Post, UnauthorizedException } from "@nestjs/common";
import { AdapterRunnerService } from "../ingestion/adapter-runner.service";
import { MaterializerService } from "../materializer/materializer.service";
import { PrismaService } from "../db/prisma.service";

@Controller("/api/internal")
export class InternalController {
  constructor(
    @Inject(AdapterRunnerService)
    private readonly adapterRunner: AdapterRunnerService,
    @Inject(MaterializerService)
    private readonly materializer: MaterializerService,
    @Inject(PrismaService)
    private readonly prisma: PrismaService
  ) {}

  @Post("ingest-now")
  async ingest(@Headers("x-admin-api-key") apiKey?: string) {
    this.assertAdmin(apiKey);
    return this.adapterRunner.runOnce();
  }

  @Post("materialize-now")
  async materialize(@Headers("x-admin-api-key") apiKey?: string) {
    this.assertAdmin(apiKey);
    return this.materializer.materialize();
  }

  @Get("ingestion-runs")
  async runs(@Headers("x-admin-api-key") apiKey?: string) {
    this.assertAdmin(apiKey);
    return this.prisma.ingestionRun.findMany({ orderBy: { startedAt: "desc" }, take: 50 });
  }

  @Get("raw-payload/:id")
  async raw(@Headers("x-admin-api-key") apiKey: string | undefined, @Param("id") id: string) {
    this.assertAdmin(apiKey);
    return this.prisma.rawMarketSnapshot.findUniqueOrThrow({ where: { id } });
  }

  @Post("echo")
  echo(@Headers("x-admin-api-key") apiKey: string | undefined, @Body() body: unknown) {
    this.assertAdmin(apiKey);
    return body;
  }

  private assertAdmin(apiKey?: string) {
    const expected = process.env.ADMIN_API_KEY ?? "dev-admin-key";
    if (apiKey !== expected) {
      throw new UnauthorizedException("Missing or invalid admin API key");
    }
  }
}
