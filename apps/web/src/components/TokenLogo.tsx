type TokenLogoProps = {
  symbol: string;
  size?: "ticker" | "market" | "hero";
};

export function TokenLogo({ symbol, size = "market" }: TokenLogoProps) {
  const slug = symbol.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return <span aria-label={`${symbol} logo`} className={`token-logo token-${slug} token-${size}`} role="img" />;
}
