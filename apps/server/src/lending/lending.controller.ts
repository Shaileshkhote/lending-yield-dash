import { Controller, Get, Inject, Param, Query } from "@nestjs/common";
import { LendingService } from "./lending.service";

@Controller("/api/lending")
export class LendingController {
  constructor(
    @Inject(LendingService)
    private readonly lending: LendingService
  ) {}

  @Get("manifest")
  manifest() {
    return this.lending.manifest();
  }

  @Get("markets/current")
  current() {
    return this.lending.current();
  }

  @Get("protocols/:protocol")
  protocol(@Param("protocol") protocol: string) {
    return this.lending.protocol(protocol);
  }

  @Get("protocols/:protocol/timeseries")
  protocolTimeseries(
    @Param("protocol") protocol: string,
    @Query("range") range = "30d",
    @Query("year") year?: string
  ) {
    return this.lending.protocolTimeseries(protocol, range, year);
  }

  @Get("protocols/:protocol/pools/:marketId/timeseries")
  poolTimeseries(
    @Param("protocol") protocol: string,
    @Param("marketId") marketId: string,
    @Query("range") range = "30d",
    @Query("year") year?: string
  ) {
    return this.lending.poolTimeseries(protocol, marketId, range, year);
  }

  @Get("protocols/:protocol/pools/:marketId/chart")
  poolChart(
    @Param("protocol") protocol: string,
    @Param("marketId") marketId: string,
    @Query("range") range = "30d",
    @Query("year") year?: string
  ) {
    return this.lending.poolChart(protocol, marketId, range, year);
  }

  @Get("chains/:chain")
  chain(@Param("chain") chain: string) {
    return this.lending.chain(chain);
  }

  @Get("assets/:asset")
  asset(@Param("asset") asset: string) {
    return this.lending.asset(asset);
  }

  @Get("markets/:marketId/history")
  history(@Param("marketId") marketId: string, @Query("range") range = "30d") {
    return this.lending.history(marketId, range);
  }

  @Get("rankings")
  rankings(@Query("asset") asset?: string, @Query("sort") sort?: string) {
    return this.lending.rankings(asset, sort);
  }

  @Get("quality")
  quality() {
    return this.lending.quality();
  }

  @Get("anomalies")
  anomalies() {
    return this.lending.anomalies();
  }

  @Get("sources/:marketId")
  source(@Param("marketId") marketId: string) {
    return this.lending.source(marketId);
  }
}
