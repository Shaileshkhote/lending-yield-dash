import { getAddress, isAddress } from "viem";
import { TRUST_WALLET_CHAIN_SLUGS } from "./chains";

const DEFILLAMA_GECKO_IDS: Record<string, string> = {
  "1inch": "1inch",
  aave: "aave",
  apxusd: "apxusd",
  ausd: "agora-dollar",
  bal: "balancer",
  btcb: "bitcoin-avalanche-bridged-btc-b",
  cbbtc: "coinbase-wrapped-btc",
  cbeth: "coinbase-wrapped-staked-eth",
  crv: "curve-dao-token",
  crvusd: "crvusd",
  dai: "dai",
  dusd: "standx-dusd",
  ebtc: "ebtc-2",
  ens: "ethereum-name-service",
  ethx: "stader-ethx",
  eurc: "euro-coin",
  eurcv: "societe-generale-forge-eurcv",
  eusde: "ethena-usde",
  eusd: "electronic-usd",
  ezeth: "renzo-restaked-eth",
  fbtc: "ignition-fbtc",
  frax: "frax",
  frxusd: "frax-usd",
  fxusd: "f-x-protocol-fxusd",
  gho: "gho",
  jpyc: "jpycoin",
  knc: "kyber-network-crystal",
  lbtc: "lombard-staked-btc",
  ldo: "lido-dao",
  link: "chainlink",
  lusd: "liquity-usd",
  mkr: "maker",
  mseth: "metronome-synth-eth",
  msusd: "metronome-synth-usd",
  musd: "metamask-usd",
  oseth: "stakewise-v3-oseth",
  pyusd: "paypal-usd",
  ptsrusde25jun2026: "pendle",
  ptsusde5feb2026: "pendle",
  ptsusde7may2026: "pendle",
  ptusde25sep2025: "pendle",
  reth: "rocket-pool-eth",
  rlusd: "ripple-usd",
  rpl: "rocket-pool",
  rseth: "kelp-dao-restaked-eth",
  rusd: "royal-dollar",
  sdai: "savings-dai",
  snx: "havven",
  susde: "ethena-staked-usde",
  susds: "susds",
  syrupusdc: "syrupusdc",
  syrupusdt: "syrupusdt",
  tbtc: "tbtc",
  teth: "treehouse-eth",
  ueth: "unit-ethereum",
  uni: "uniswap",
  usd1: "usd1-wlfi",
  usdbc: "bridged-usd-coin-base",
  usdc: "usd-coin",
  usde: "ethena-usde",
  usdf: "falcon-finance",
  usdg: "global-dollar",
  usdh: "usdh-2",
  usdhl: "hyper-usd",
  usds: "usds",
  usdt: "tether",
  usdt0: "usdt0",
  usdtb: "usdtb",
  vbeth: "vaultbridge-bridged-eth-katana",
  vbusdc: "vaultbridge-bridged-usdc-katana",
  vbusdt: "vaultbridge-bridged-usdt-katana",
  vbwbtc: "vaultbridge-bridged-wbtc-katana",
  vchf: "vnx-swiss-franc",
  wbtc: "wrapped-bitcoin",
  weeth: "wrapped-eeth",
  weth: "weth",
  whype: "wrapped-hype",
  wpol: "wmatic",
  wrseth: "wrapped-rseth",
  wsteth: "wrapped-steth",
  xaut: "tether-gold",
  xsgd: "xsgd",
};

const SYMBOL_DEFAULTS: Record<string, { chain: string; address: string }> = {
  usdc: {
    chain: "ethereum",
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  },
  usdt: {
    chain: "ethereum",
    address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  },
  dai: {
    chain: "ethereum",
    address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
  },
  sdai: {
    chain: "ethereum",
    address: "0x83F20F44975D03b1b09e64809B757c47f942BEeA",
  },
  weth: {
    chain: "ethereum",
    address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  },
};

export function tokenLogoUrls(args: { symbol: string; chain?: string; address?: string }): string[] {
  return unique([trustWalletLogoUrl(args), defillamaTokenLogoUrl(args.symbol)]);
}

export function normalizeTokenSymbol(symbol: string): string {
  return symbol.toLowerCase().replace(/₮/g, "t").replace(/[^a-z0-9]+/g, "");
}

function trustWalletLogoUrl(args: { symbol: string; chain?: string; address?: string }): string | null {
  const fallback = SYMBOL_DEFAULTS[normalizeTokenSymbol(args.symbol)];
  const chain = args.chain ?? fallback?.chain;
  const address = args.address ?? fallback?.address;
  if (!chain || !address || !isAddress(address)) return null;

  const trustWalletChain = TRUST_WALLET_CHAIN_SLUGS[chain.toLowerCase()];
  if (!trustWalletChain) return null;

  return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${trustWalletChain}/assets/${getAddress(address)}/logo.png`;
}

function defillamaTokenLogoUrl(symbol: string): string | null {
  const geckoId = DEFILLAMA_GECKO_IDS[normalizeTokenSymbol(symbol)];
  if (!geckoId) return null;
  return `https://token-icons.llamao.fi/icons/tokens/gecko/${geckoId}?w=48&h=48`;
}

function unique(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
