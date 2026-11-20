export type CurrencyCode = 'ERN' | 'USD' | 'EUR' | 'GBP' | 'CHF';

export interface CurrencyMeta {
  code: CurrencyCode;
  label: string;
  symbol: string;
  /** How many USD 1 unit of this currency equals (e.g. 1 EUR = 1.08 USD, 1 ERN = 1/15 USD) */
  toUSD: number;
  /** How many ERN (Nakfa) 1 unit of this currency equals (Official rate: 1 USD = 15 ERN) */
  toERN: number;
}

export const CURRENCY_META: Record<CurrencyCode, CurrencyMeta> = {
  ERN: {
    code: 'ERN',
    label: 'Eritrean Nakfa (ERN)',
    symbol: 'ERN ',
    toUSD: 1 / 15,
    toERN: 1,
  },
  USD: {
    code: 'USD',
    label: 'US Dollar (USD)',
    symbol: '$',
    toUSD: 1,
    toERN: 15,
  },
  EUR: {
    code: 'EUR',
    label: 'Euro (EUR)',
    symbol: '€',
    toUSD: 1.08,
    toERN: 16.2,
  },
  GBP: {
    code: 'GBP',
    label: 'British Pound (GBP)',
    symbol: '£',
    toUSD: 1.27,
    toERN: 19.05,
  },
  CHF: {
    code: 'CHF',
    label: 'Swiss Franc (CHF)',
    symbol: 'CHF ',
    toUSD: 1.13,
    toERN: 16.95,
  },
};

/**
 * Allowed currencies by operational service domain:
 * - Tours & International Packages: USD, EUR, GBP, CHF
 * - Air Tickets: USD, EUR
 * - Hotel Asmara Palace, Sea Tax, Visa Fee: USD only
 * - Salaries, Car Rental, Boat Rent, Fuel, Meals, Logistics (island grocery, oil, tents,
 *   bottled water, fruit, ice cream, coffee & macchiato), Accommodation for crew/driver/guide,
 *   Most Hotels, Travel Permits, Entrance/Site Entrance, Tips for waitress/waiter, Experts,
 *   Boat Crew, Family Visit, Community Assistance: ERN (Nakfa) only.
 */
export const TOUR_ALLOWED_CURRENCIES: CurrencyCode[] = ['USD', 'EUR', 'GBP', 'CHF'];
export const AIR_TICKET_ALLOWED_CURRENCIES: CurrencyCode[] = ['USD', 'EUR'];
export const ERN_ONLY_CURRENCY: CurrencyCode[] = ['ERN'];
export const USD_ONLY_CURRENCY: CurrencyCode[] = ['USD'];

export interface LogisticsSubItem {
  id: string;
  label: string;
  defaultUnitERN: number;
  unitLabel: string;
}

export const ERN_LOGISTICS_SUBITEMS: LogisticsSubItem[] = [
  { id: 'island_grocery', label: 'Island Grocery & Dry Provisions', defaultUnitERN: 1800, unitLabel: 'per trip' },
  { id: 'cooking_oil', label: 'Cooking Oil & Expedition Kitchen Supplies', defaultUnitERN: 650, unitLabel: 'per trip' },
  { id: 'tents_camping', label: 'Tents, Mattresses & Island Camping Gear', defaultUnitERN: 1200, unitLabel: 'per trip' },
  { id: 'bottled_water', label: 'Bottled Mineral Water Crates', defaultUnitERN: 450, unitLabel: 'per day' },
  { id: 'fresh_fruit', label: 'Fresh Fruit (Bananas, Papaya, Oranges, Mangoes)', defaultUnitERN: 350, unitLabel: 'per day' },
  { id: 'ice_cream', label: 'Ice Cream & Gelato Refreshments', defaultUnitERN: 300, unitLabel: 'per group' },
  { id: 'coffee_macchiato', label: 'Traditional Coffee Ceremony & Asmara Macchiato', defaultUnitERN: 250, unitLabel: 'per day' },
  { id: 'crew_accommodation', label: 'Accommodation for Crew, Driver & Guide', defaultUnitERN: 900, unitLabel: 'per night' },
];

export function isAsmaraPalaceHotel(hotelIdOrName?: string | null): boolean {
  if (!hotelIdOrName) return false;
  const norm = hotelIdOrName.toLowerCase();
  return norm === 'htl-001' || norm.includes('asmara palace');
}

/**
 * Returns the mandatory currency for a hotel:
 * - Hotel Asmara Palace MUST be in USD ('USD')
 * - All other hotels in Eritrea MUST use Nakfa ('ERN')
 */
export function getHotelCurrency(hotelIdOrName?: string | null): 'ERN' | 'USD' {
  return isAsmaraPalaceHotel(hotelIdOrName) ? 'USD' : 'ERN';
}

export function getHotelAllowedCurrencies(hotelIdOrName?: string | null): CurrencyCode[] {
  return isAsmaraPalaceHotel(hotelIdOrName) ? ['USD'] : ['ERN'];
}

export function convertCurrency(amount: number, from: CurrencyCode, to: CurrencyCode): number {
  const numeric = Number(amount) || 0;
  if (from === to) return Number(numeric.toFixed(2));
  const inUSD = numeric * (CURRENCY_META[from]?.toUSD ?? 1);
  if (to === 'USD') return Number(inUSD.toFixed(2));
  if (to === 'ERN') return Number((inUSD * 15).toFixed(2));
  const targetRate = CURRENCY_META[to]?.toUSD ?? 1;
  return Number((inUSD / targetRate).toFixed(2));
}

export function toUSD(amount: number, currency: CurrencyCode = 'USD'): number {
  return convertCurrency(amount, currency, 'USD');
}

export function toERN(amount: number, currency: CurrencyCode = 'ERN'): number {
  return convertCurrency(amount, currency, 'ERN');
}

export function formatCurrencyAmount(amount: number, currency: CurrencyCode = 'USD'): string {
  const num = Number(amount) || 0;
  if (currency === 'ERN') {
    return `${num.toLocaleString(undefined, { maximumFractionDigits: 2 })} ERN`;
  }
  if (currency === 'CHF') {
    return `CHF ${num.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  }
  const meta = CURRENCY_META[currency] || CURRENCY_META.USD;
  return `${meta.symbol}${num.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`;
}

export interface LedgerCategoryCurrencyRule {
  allowedCurrencies: CurrencyCode[];
  defaultCurrency: CurrencyCode;
  ruleExplanation: string;
}

/**
 * Enforces currency options for General Ledger categories & sub-categories
 */
export function getLedgerCurrencyRule(
  category: string,
  subCategoryOrDescription: string = '',
  hotelName: string = ''
): LedgerCategoryCurrencyRule {
  const combined = `${category} ${subCategoryOrDescription} ${hotelName}`.toLowerCase();

  // 1. Sea Tax -> USD Only
  if (combined.includes('sea tax') || combined.includes('marine tax')) {
    return {
      allowedCurrencies: ['USD'],
      defaultCurrency: 'USD',
      ruleExplanation: 'Sea Tax is strictly payable in USD.',
    };
  }

  // 2. Visa Fee -> USD Only
  if (combined.includes('visa') || combined.includes('voa')) {
    return {
      allowedCurrencies: ['USD'],
      defaultCurrency: 'USD',
      ruleExplanation: 'Visa on Arrival (VoA) & Consular Visa Fees are strictly payable in USD.',
    };
  }

  // 3. Hotel Asmara Palace -> USD Only
  if (combined.includes('asmara palace') || hotelName === 'htl-001') {
    return {
      allowedCurrencies: ['USD'],
      defaultCurrency: 'USD',
      ruleExplanation: 'Hotel Asmara Palace requires settlement in USD.',
    };
  }

  // 4. Air Tickets / Flight Tickets -> USD or EUR
  if (category === 'Flight Tickets' || combined.includes('air ticket') || combined.includes('flight')) {
    return {
      allowedCurrencies: ['USD', 'EUR'],
      defaultCurrency: 'USD',
      ruleExplanation: 'Air tickets must be issued in USD or EUR.',
    };
  }

  // 5. Tour Packages / International Tour Bookings -> USD, EUR, GBP, CHF
  if (category === 'Tour Packages') {
    return {
      allowedCurrencies: ['USD', 'EUR', 'GBP', 'CHF'],
      defaultCurrency: 'USD',
      ruleExplanation: 'Tour packages support USD, Euro (EUR), British Pound (GBP), and Swiss Francs (CHF).',
    };
  }

  // 6. All local operational categories must use Eritrean Nakfa (ERN):
  // Salaries, Car Rental, Boat Rent, Fuel, Meals, Logistics (island grocery, oil, tents,
  // bottled water, fruit, ice cream, coffee & macchiato), Accommodation for crew/driver/guide,
  // Most Hotels, Travel Permits, Entrance/Site Entrance, Tips for waitress/waiter, Experts,
  // Boat Crew, Family Visit, Community Assistance
  return {
    allowedCurrencies: ['ERN'],
    defaultCurrency: 'ERN',
    ruleExplanation:
      'Local operations (Salaries, Car/Boat Rent, Fuel, Meals, Logistics, Crew Accommodation, Local Hotels, Travel Permits, Site Entrance, Waitstaff Tips, Experts, Boat Crew, Family Visit & Community Assistance) must use Eritrean Nakfa (ERN).',
  };
}
