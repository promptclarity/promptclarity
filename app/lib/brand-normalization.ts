/**
 * Brand Normalization Utility
 *
 * Maps brand name variations to their canonical names.
 * Used for:
 * - Detecting brand mentions in execution results
 * - Filtering suggested competitors (avoiding duplicates of tracked brands)
 * - Aggregating metrics for brand variations
 */

// Map of canonical brand names to their known variations/aliases
// The key is the canonical name, the values are patterns that should map to it
const BRAND_ALIASES: Record<string, string[]> = {
  // Network Security / Zero Trust
  'Zscaler': [
    'Zscaler Private Access',
    'Zscaler Internet Access',
    'Zscaler ZPA',
    'Zscaler ZIA',
    'ZPA',
    'ZIA',
  ],
  'Palo Alto Networks': [
    'Palo Alto',
    'Palo Alto Prism Access',
    'Palo Alto Prisma Access',
    'Prisma Access',
    'Prisma Cloud',
    'PAN-OS',
    'PANW',
    'Palo Alto NGFW',
    'Palo Alto Firewall',
  ],
  'Cloudflare': [
    'Cloudflare Access',
    'Cloudflare Zero Trust',
    'Cloudflare WARP',
    'Cloudflare One',
    'CF Access',
  ],
  'Tailscale': [
    'Tailscale VPN',
  ],
  'Netbird': [
    'NetBird',
    'Net Bird',
  ],
  'ZeroTier': [
    'Zero Tier',
    'ZeroTier One',
  ],
  'Twingate': [
    'Twin Gate',
  ],
  'Perimeter 81': [
    'Perimeter81',
    'P81',
  ],

  // Cloud Providers
  'Amazon Web Services': [
    'AWS',
    'Amazon AWS',
    'Amazon Cloud',
  ],
  'Microsoft Azure': [
    'Azure',
    'MS Azure',
  ],
  'Google Cloud': [
    'GCP',
    'Google Cloud Platform',
    'Google Cloud Services',
  ],

  // Identity Providers
  'Okta': [
    'Okta Identity',
    'Okta SSO',
  ],
  'Microsoft': [
    'Microsoft Entra',
    'Azure AD',
    'Azure Active Directory',
    'Microsoft 365',
    'MS365',
    'Office 365',
    'O365',
  ],

  // Security Vendors
  'CrowdStrike': [
    'Crowd Strike',
    'CrowdStrike Falcon',
    'Falcon',
  ],
  'SentinelOne': [
    'Sentinel One',
    'S1',
  ],
  'Fortinet': [
    'FortiGate',
    'FortiNet',
    'Forti Gate',
  ],
  'Cisco': [
    'Cisco AnyConnect',
    'AnyConnect',
    'Cisco Umbrella',
    'Umbrella',
    'Cisco Duo',
    'Duo Security',
  ],
  'Check Point': [
    'CheckPoint',
    'Check Point Software',
    'CHKP',
  ],
  'Juniper': [
    'Juniper Networks',
    'Juniper SRX',
    'Mist AI',
  ],
};

// Build a reverse lookup map for quick alias -> canonical lookups
const ALIAS_TO_CANONICAL: Map<string, string> = new Map();

// Initialize the reverse lookup map
function initializeAliasMap() {
  if (ALIAS_TO_CANONICAL.size > 0) return; // Already initialized

  for (const [canonical, aliases] of Object.entries(BRAND_ALIASES)) {
    // Add the canonical name itself (lowercase)
    ALIAS_TO_CANONICAL.set(canonical.toLowerCase(), canonical);

    // Add all aliases
    for (const alias of aliases) {
      ALIAS_TO_CANONICAL.set(alias.toLowerCase(), canonical);
    }
  }
}

/**
 * Normalize a brand name to its canonical form
 * @param brandName - The brand name to normalize
 * @returns The canonical brand name, or the original if no mapping exists
 */
export function normalizeBrandName(brandName: string): string {
  initializeAliasMap();

  const lowerName = brandName.toLowerCase().trim();

  // Check exact match first
  if (ALIAS_TO_CANONICAL.has(lowerName)) {
    return ALIAS_TO_CANONICAL.get(lowerName)!;
  }

  // Check if any alias is contained in the brand name
  // This handles cases like "Palo Alto Networks Prisma Access"
  for (const [alias, canonical] of ALIAS_TO_CANONICAL.entries()) {
    // Skip very short aliases to avoid false positives
    if (alias.length < 4) continue;

    if (lowerName.includes(alias)) {
      return canonical;
    }
  }

  // No match found, return original (with proper casing preserved)
  return brandName.trim();
}

/**
 * Check if two brand names refer to the same company
 * @param name1 - First brand name
 * @param name2 - Second brand name
 * @returns true if they refer to the same canonical brand
 */
export function isSameBrand(name1: string, name2: string): boolean {
  const canonical1 = normalizeBrandName(name1);
  const canonical2 = normalizeBrandName(name2);
  return canonical1.toLowerCase() === canonical2.toLowerCase();
}

/**
 * Check if a brand name is a variation of any tracked competitor
 * @param brandName - The brand name to check
 * @param trackedCompetitors - Array of currently tracked competitor names
 * @returns The matching tracked competitor name, or null if no match
 */
export function findMatchingTrackedCompetitor(
  brandName: string,
  trackedCompetitors: string[]
): string | null {
  const normalizedBrand = normalizeBrandName(brandName);

  for (const tracked of trackedCompetitors) {
    const normalizedTracked = normalizeBrandName(tracked);
    if (normalizedBrand.toLowerCase() === normalizedTracked.toLowerCase()) {
      return tracked;
    }
  }

  return null;
}

/**
 * Get all known variations/aliases for a brand
 * @param brandName - The brand name (can be canonical or alias)
 * @returns Array of all known names for this brand, including the canonical name
 */
export function getBrandVariations(brandName: string): string[] {
  initializeAliasMap();

  const canonical = normalizeBrandName(brandName);
  const variations = [canonical];

  // Add all aliases for this canonical name
  const aliases = BRAND_ALIASES[canonical];
  if (aliases) {
    variations.push(...aliases);
  }

  return variations;
}

/**
 * Check if text contains a mention of a brand (checking all variations)
 * @param text - The text to search
 * @param brandName - The brand name to look for
 * @returns true if any variation of the brand is mentioned
 */
export function textContainsBrand(text: string, brandName: string): boolean {
  const lowerText = text.toLowerCase();
  const variations = getBrandVariations(brandName);

  for (const variation of variations) {
    // Use word boundary matching to avoid false positives
    const escaped = variation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(text)) {
      return true;
    }
  }

  return false;
}

/**
 * Add a custom brand alias at runtime
 * Useful for business-specific variations discovered during analysis
 * @param canonicalName - The canonical brand name
 * @param alias - The alias to add
 */
export function addBrandAlias(canonicalName: string, alias: string): void {
  initializeAliasMap();

  // Add to the aliases map
  if (!BRAND_ALIASES[canonicalName]) {
    BRAND_ALIASES[canonicalName] = [];
  }
  if (!BRAND_ALIASES[canonicalName].includes(alias)) {
    BRAND_ALIASES[canonicalName].push(alias);
  }

  // Update the reverse lookup
  ALIAS_TO_CANONICAL.set(alias.toLowerCase(), canonicalName);
}

export { BRAND_ALIASES };
