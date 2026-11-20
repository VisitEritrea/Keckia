import React, { useState, useMemo } from 'react';
import {
  X,
  TrendingUp,
  CheckCircle2,
  ShieldCheck,
  Coins,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  TourCostCategory,
  TourCostLine,
  Employee,
  FinancialTransaction,
  SupportedCurrencyCode,
  getEmployeeFieldRoleBadge,
} from '../../types';
import { TouristExpedition } from './AddTouristExpeditionModal';
import {
  CURRENCY_META,
  TOUR_ALLOWED_CURRENCIES,
  ERN_LOGISTICS_SUBITEMS,
  getHotelCurrency,
  isAsmaraPalaceHotel,
  toUSD,
  toERN,
  formatCurrencyAmount,
} from '../../lib/currencyRules';

export const TOUR_COST_CATEGORIES: Array<{
  category: TourCostCategory;
  label: string;
  isStaffAllowance: boolean;
  fixedCurrency: 'ERN' | 'USD' | 'HOTEL_DEPENDENT';
  ruleNote: string;
}> = [
  {
    category: 'hotel',
    label: 'Hotel & Guest Lodging (Asmara Palace = USD; Other Hotels = ERN)',
    isStaffAllowance: false,
    fixedCurrency: 'HOTEL_DEPENDENT',
    ruleNote: 'Asmara Palace in USD; all other Eritrean hotels in ERN (Nakfa)',
  },
  {
    category: 'vehicle_rental',
    label: 'Car Rental & 4WD Hire',
    isStaffAllowance: false,
    fixedCurrency: 'ERN',
    ruleNote: 'Mandatory ERN (Nakfa)',
  },
  {
    category: 'boat_rent',
    label: 'Boat Rent & Marine Charter',
    isStaffAllowance: false,
    fixedCurrency: 'ERN',
    ruleNote: 'Mandatory ERN (Nakfa)',
  },
  {
    category: 'fuel',
    label: 'Fuel & Convoy Diesel',
    isStaffAllowance: false,
    fixedCurrency: 'ERN',
    ruleNote: 'Mandatory ERN (Nakfa)',
  },
  {
    category: 'meals',
    label: 'Meals & Restaurant Catering',
    isStaffAllowance: false,
    fixedCurrency: 'ERN',
    ruleNote: 'Mandatory ERN (Nakfa)',
  },
  {
    category: 'logistics',
    label: 'Logistics (Island Grocery, Oil, Tents, Bottled Water, Fruit, Ice Cream, Coffee & Macchiato)',
    isStaffAllowance: false,
    fixedCurrency: 'ERN',
    ruleNote: 'Mandatory ERN (Nakfa) — click Breakdown to itemize',
  },
  {
    category: 'accommodation',
    label: 'Accommodation for Crew, Driver & Guide',
    isStaffAllowance: false,
    fixedCurrency: 'ERN',
    ruleNote: 'Mandatory ERN (Nakfa)',
  },
  {
    category: 'guide_allowance',
    label: 'Guide Salary / Daily Allowance',
    isStaffAllowance: true,
    fixedCurrency: 'ERN',
    ruleNote: 'Salaries & Allowances in ERN (Nakfa)',
  },
  {
    category: 'driver_allowance',
    label: 'Driver Salary / Daily Allowance',
    isStaffAllowance: true,
    fixedCurrency: 'ERN',
    ruleNote: 'Salaries & Allowances in ERN (Nakfa)',
  },
  {
    category: 'overtime',
    label: 'Staff Field Overtime Salary',
    isStaffAllowance: true,
    fixedCurrency: 'ERN',
    ruleNote: 'Salaries & Overtime in ERN (Nakfa)',
  },
  {
    category: 'travel_permits',
    label: 'Travel Permits (MOT Regional Permits)',
    isStaffAllowance: false,
    fixedCurrency: 'ERN',
    ruleNote: 'Mandatory ERN (Nakfa)',
  },
  {
    category: 'entrance_fees',
    label: 'Entrance & Site Entrance Fees (Museums / Archaeological Sites)',
    isStaffAllowance: false,
    fixedCurrency: 'ERN',
    ruleNote: 'Mandatory ERN (Nakfa)',
  },
  {
    category: 'tips_waitstaff',
    label: 'Tips for Waitress & Waiter',
    isStaffAllowance: false,
    fixedCurrency: 'ERN',
    ruleNote: 'Mandatory ERN (Nakfa)',
  },
  {
    category: 'experts',
    label: 'Local & Archaeological / Marine Experts',
    isStaffAllowance: false,
    fixedCurrency: 'ERN',
    ruleNote: 'Mandatory ERN (Nakfa)',
  },
  {
    category: 'boat_crew',
    label: 'Boat Crew Allowance & Gratuities',
    isStaffAllowance: false,
    fixedCurrency: 'ERN',
    ruleNote: 'Mandatory ERN (Nakfa)',
  },
  {
    category: 'family_visit',
    label: 'Family Visit & Cultural Coffee Hospitality',
    isStaffAllowance: false,
    fixedCurrency: 'ERN',
    ruleNote: 'Mandatory ERN (Nakfa)',
  },
  {
    category: 'community_assistance',
    label: 'Assistance of the Community (Village Support)',
    isStaffAllowance: false,
    fixedCurrency: 'ERN',
    ruleNote: 'Mandatory ERN (Nakfa)',
  },
  {
    category: 'sea_tax',
    label: 'Sea Tax (Red Sea & Dahlak Marine Port Tax)',
    isStaffAllowance: false,
    fixedCurrency: 'USD',
    ruleNote: 'Sea Tax is strictly in USD',
  },
  {
    category: 'visa_fee',
    label: 'Visa Fee (Official Visa on Arrival / Consular Fee)',
    isStaffAllowance: false,
    fixedCurrency: 'USD',
    ruleNote: 'Visa Fee is strictly in USD',
  },
];

export function resolveLineMandatoryCurrency(
  category: TourCostCategory,
  exp: Pick<TouristExpedition, 'hotelId' | 'hotelName'>
): 'ERN' | 'USD' {
  if (category === 'sea_tax' || category === 'visa_fee') return 'USD';
  if (category === 'hotel') {
    return getHotelCurrency(exp.hotelId || exp.hotelName);
  }
  return 'ERN';
}

export function buildDefaultCostLines(
  exp: TouristExpedition,
  employees: Employee[] = []
): TourCostLine[] {
  const existing = exp.costLines || [];
  const days = Math.max(1, Number(exp.daysPlanned) || 1);
  const pax = Math.max(1, Number(exp.paxCount) || 1);
  const isDualRoleSamePerson =
    Boolean(exp.guideId && exp.driverId && exp.guideId === exp.driverId) ||
    Boolean(
      exp.guideName &&
        exp.driverName &&
        exp.guideName !== 'Unassigned' &&
        exp.guideName.trim().toLowerCase() === exp.driverName.trim().toLowerCase()
    );

  const guideEmp = employees.find(
    (e) => e.id === exp.guideId || e.fullName === exp.guideName
  );
  const driverEmp = employees.find(
    (e) => e.id === exp.driverId || e.fullName === exp.driverName
  );

  const defaultGuideRateUSD = guideEmp?.perDiemRateUSD || 35;
  const defaultDriverRateUSD = driverEmp?.perDiemRateUSD || 30;
  const defaultGuideRateERN = defaultGuideRateUSD * 15;
  const defaultDriverRateERN = defaultDriverRateUSD * 15;

  const isCoastalOrIsland =
    (exp.routeSummary || '').toLowerCase().includes('dahlak') ||
    (exp.routeSummary || '').toLowerCase().includes('massawa') ||
    (exp.routeSummary || '').toLowerCase().includes('dissei') ||
    (exp.hotelName || '').toLowerCase().includes('dahlak');

  return TOUR_COST_CATEGORIES.map((meta) => {
    const mandatoryCurrency = resolveLineMandatoryCurrency(meta.category, exp);
    const found = existing.find((l) => l.category === meta.category);
    if (found) {
      const expUSD = Number(found.expectedUSD) || 0;
      const actUSD = Number(found.actualUSD) || 0;
      const expNative =
        found.expectedNative !== undefined
          ? Number(found.expectedNative)
          : mandatoryCurrency === 'ERN'
          ? Math.round(expUSD * 15)
          : expUSD;
      const actNative =
        found.actualNative !== undefined
          ? Number(found.actualNative)
          : mandatoryCurrency === 'ERN'
          ? Math.round(actUSD * 15)
          : actUSD;
      return {
        ...found,
        label: meta.label,
        currency: mandatoryCurrency,
        expectedNative: expNative,
        actualNative: actNative,
        expectedERN: mandatoryCurrency === 'ERN' ? expNative : Math.round(expUSD * 15),
        actualERN: mandatoryCurrency === 'ERN' ? actNative : Math.round(actUSD * 15),
      };
    }

    let expectedNative = 0;
    let notes = '';
    let subItems: Record<string, number> | undefined;

    if (meta.category === 'hotel') {
      const baseHotelUSD = Number(exp.totalHotelUSD) || 0;
      expectedNative = mandatoryCurrency === 'USD' ? baseHotelUSD : Math.round(baseHotelUSD * 15);
      notes = isAsmaraPalaceHotel(exp.hotelId || exp.hotelName)
        ? `${exp.hotelName || 'Hotel Asmara Palace'} (USD settlement required)`
        : `${exp.hotelName || 'Local partner hotel'} (Settled in ERN Nakfa)`;
    } else if (meta.category === 'vehicle_rental') {
      expectedNative = days * 1500; // 1,500 ERN/day
      notes = `${days}d 4WD car rental in ERN`;
    } else if (meta.category === 'boat_rent') {
      expectedNative = isCoastalOrIsland ? 4200 : 0;
      notes = isCoastalOrIsland ? 'Red Sea / Dahlak boat charter (ERN)' : 'No marine charter required';
    } else if (meta.category === 'fuel') {
      expectedNative = days * 525; // 525 ERN/day (~$35)
      notes = `${days} days convoy diesel allocation (ERN)`;
    } else if (meta.category === 'meals') {
      expectedNative = days * pax * 270; // 270 ERN/pax/day
      notes = `Guest & field meals in ERN`;
    } else if (meta.category === 'logistics') {
      subItems = {
        island_grocery: isCoastalOrIsland ? 1800 : 0,
        cooking_oil: isCoastalOrIsland ? 650 : 0,
        tents_camping: isCoastalOrIsland ? 1200 : 0,
        bottled_water: days * 150,
        fresh_fruit: days * 120,
        ice_cream: pax * 150,
        coffee_macchiato: days * 150,
        crew_accommodation: 0,
      };
      expectedNative = Object.values(subItems).reduce((s, v) => s + v, 0);
      notes = 'Island grocery, oil, tents, water, fruit, ice cream, coffee & macchiato (ERN)';
    } else if (meta.category === 'accommodation') {
      expectedNative = Math.max(0, days - 1) * 600;
      notes = 'Accommodation for crew, driver & guide (ERN)';
    } else if (meta.category === 'guide_allowance') {
      expectedNative =
        exp.guideName && exp.guideName !== 'Unassigned' ? days * defaultGuideRateERN : 0;
      notes = isDualRoleSamePerson
        ? `Dual-Role (Guide & Driver) single base salary (${days}d × ${defaultGuideRateERN} ERN)`
        : `${days}d × ${defaultGuideRateERN} ERN/day`;
    } else if (meta.category === 'driver_allowance') {
      expectedNative = isDualRoleSamePerson
        ? 0
        : exp.driverName && exp.driverName !== 'Unassigned'
        ? days * defaultDriverRateERN
        : 0;
      notes = isDualRoleSamePerson
        ? 'Dual-Role same person as Guide — 0 ERN duplicate pay'
        : `${days}d × ${defaultDriverRateERN} ERN/day`;
    } else if (meta.category === 'travel_permits') {
      expectedNative = pax * 300;
      notes = 'Ministry of Tourism regional travel permits (ERN)';
    } else if (meta.category === 'entrance_fees') {
      expectedNative = pax * 600;
      notes = 'Site entrance & museum fees (ERN)';
    } else if (meta.category === 'tips_waitstaff') {
      expectedNative = days * 90;
      notes = 'Tips for waitress & waiter (ERN)';
    } else if (meta.category === 'experts') {
      expectedNative = 450;
      notes = 'Local heritage / site expert honorarium (ERN)';
    } else if (meta.category === 'boat_crew') {
      expectedNative = isCoastalOrIsland ? 750 : 0;
      notes = 'Boat crew allowance & tips (ERN)';
    } else if (meta.category === 'family_visit') {
      expectedNative = 450;
      notes = 'Traditional family visit hospitality (ERN)';
    } else if (meta.category === 'community_assistance') {
      expectedNative = 600;
      notes = 'Assistance of the local community (ERN)';
    } else if (meta.category === 'sea_tax') {
      expectedNative = isCoastalOrIsland ? pax * 25 : 0; // USD
      notes = 'Marine & Island Sea Tax (Mandatory USD)';
    } else if (meta.category === 'visa_fee') {
      expectedNative = pax * 70; // $70 USD per traveler VoA
      notes = `Official Visa on Arrival Fee ($70 USD × ${pax} pax)`;
    }

    const expectedUSD = toUSD(expectedNative, mandatoryCurrency);
    const expectedERN = toERN(expectedNative, mandatoryCurrency);

    return {
      id: `cost-${exp.id}-${meta.category}`,
      category: meta.category,
      label: meta.label,
      currency: mandatoryCurrency,
      expectedNative,
      actualNative: expectedNative,
      expectedERN,
      actualERN: expectedERN,
      expectedUSD,
      actualUSD: expectedUSD,
      subItems,
      isPayrollAccrued: meta.isStaffAllowance,
      notes,
    };
  });
}

export function computeExpeditionProfitability(
  exp: TouristExpedition,
  employees: Employee[] = []
) {
  const lines = buildDefaultCostLines(exp, employees);
  const paxCount = Math.max(1, Number(exp.paxCount) || 1);
  const packageCurrency: 'USD' | 'EUR' | 'GBP' | 'CHF' = exp.packageCurrency || 'USD';
  const defaultPkgPriceUSD =
    exp.packagePriceUSD !== undefined
      ? Number(exp.packagePriceUSD)
      : Math.max(
          (Number(exp.totalHotelUSD) || 400) + (Number(exp.daysPlanned) || 3) * 240 * paxCount,
          650
        );
  const packagePriceNative =
    exp.packagePriceNative !== undefined
      ? Number(exp.packagePriceNative)
      : Number((defaultPkgPriceUSD / CURRENCY_META[packageCurrency].toUSD).toFixed(2));
  const pricePerPersonUSD =
    exp.pricePerPersonUSD !== undefined
      ? Number(exp.pricePerPersonUSD)
      : Number((defaultPkgPriceUSD / paxCount).toFixed(2));
  const amountCollectedUSD =
    exp.amountCollectedUSD !== undefined ? Number(exp.amountCollectedUSD) : 0;

  const expectedCostUSD = Number(
    lines.reduce((sum, l) => sum + (Number(l.expectedUSD) || 0), 0).toFixed(2)
  );
  const actualCostUSD = Number(
    lines.reduce((sum, l) => sum + (Number(l.actualUSD) || 0), 0).toFixed(2)
  );
  const expectedMarginUSD = Number((defaultPkgPriceUSD - expectedCostUSD).toFixed(2));
  const realizedMarginUSD = Number((defaultPkgPriceUSD - actualCostUSD).toFixed(2));
  const expectedMarginPct =
    defaultPkgPriceUSD > 0
      ? Number(((expectedMarginUSD / defaultPkgPriceUSD) * 100).toFixed(1))
      : 0;
  const realizedMarginPct =
    defaultPkgPriceUSD > 0
      ? Number(((realizedMarginUSD / defaultPkgPriceUSD) * 100).toFixed(1))
      : 0;

  return {
    lines,
    paxCount,
    packageCurrency,
    packagePriceNative,
    packagePriceUSD: defaultPkgPriceUSD,
    pricePerPersonUSD,
    amountCollectedUSD,
    expectedCostUSD,
    actualCostUSD,
    expectedMarginUSD,
    realizedMarginUSD,
    expectedMarginPct,
    realizedMarginPct,
  };
}

interface TourCostingModalProps {
  expedition: TouristExpedition;
  employees?: Employee[];
  transactions?: FinancialTransaction[];
  onClose: () => void;
  onSaveExpedition: (updated: TouristExpedition) => void;
  onPostCostLineToLedger?: (
    expedition: TouristExpedition,
    line: TourCostLine
  ) => string | undefined;
}

export const TourCostingModal: React.FC<TourCostingModalProps> = ({
  expedition,
  employees = [],
  onClose,
  onSaveExpedition,
  onPostCostLineToLedger,
}) => {
  const initialSummary = useMemo(
    () => computeExpeditionProfitability(expedition, employees),
    [expedition, employees]
  );

  const [packageCurrency, setPackageCurrency] = useState<'USD' | 'EUR' | 'GBP' | 'CHF'>(
    initialSummary.packageCurrency
  );
  const [packagePriceNative, setPackagePriceNative] = useState<number>(
    initialSummary.packagePriceNative
  );
  const [amountCollectedUSD, setAmountCollectedUSD] = useState<number>(
    initialSummary.amountCollectedUSD
  );
  const [costLines, setCostLines] = useState<TourCostLine[]>(initialSummary.lines);
  const [showLogisticsBreakdown, setShowLogisticsBreakdown] = useState<boolean>(false);

  const packagePriceUSD = useMemo(
    () => toUSD(packagePriceNative, packageCurrency),
    [packagePriceNative, packageCurrency]
  );

  const paxCount = Math.max(1, Number(expedition.paxCount) || 1);
  const pricePerPersonUSD = Number((packagePriceUSD / paxCount).toFixed(2));
  const pricePerPersonNative = Number((packagePriceNative / paxCount).toFixed(2));

  const isDualRoleSamePerson =
    Boolean(
      expedition.guideId &&
        expedition.driverId &&
        expedition.guideId === expedition.driverId
    ) ||
    Boolean(
      expedition.guideName &&
        expedition.driverName &&
        expedition.guideName !== 'Unassigned' &&
        expedition.guideName.trim().toLowerCase() ===
          expedition.driverName.trim().toLowerCase()
    );

  const guideEmp = employees.find(
    (e) => e.id === expedition.guideId || e.fullName === expedition.guideName
  );
  const driverEmp = employees.find(
    (e) => e.id === expedition.driverId || e.fullName === expedition.driverName
  );

  const expectedCostUSD = Number(
    costLines.reduce((sum, l) => sum + (Number(l.expectedUSD) || 0), 0).toFixed(2)
  );
  const actualCostUSD = Number(
    costLines.reduce((sum, l) => sum + (Number(l.actualUSD) || 0), 0).toFixed(2)
  );
  const totalActualERNPortion = costLines
    .filter((l) => (l.currency || 'ERN') === 'ERN')
    .reduce((sum, l) => sum + (Number(l.actualNative ?? (l.actualUSD * 15)) || 0), 0);
  const totalActualUSDPortion = costLines
    .filter((l) => l.currency === 'USD')
    .reduce((sum, l) => sum + (Number(l.actualNative ?? l.actualUSD) || 0), 0);

  const expectedMarginUSD = Number((packagePriceUSD - expectedCostUSD).toFixed(2));
  const realizedMarginUSD = Number((packagePriceUSD - actualCostUSD).toFixed(2));
  const expectedMarginPct =
    packagePriceUSD > 0
      ? Number(((expectedMarginUSD / packagePriceUSD) * 100).toFixed(1))
      : 0;
  const realizedMarginPct =
    packagePriceUSD > 0
      ? Number(((realizedMarginUSD / packagePriceUSD) * 100).toFixed(1))
      : 0;

  const handleNativeAmountChange = (
    category: TourCostCategory,
    field: 'expectedNative' | 'actualNative',
    value: number
  ) => {
    setCostLines((prev) =>
      prev.map((l) => {
        if (l.category !== category) return l;
        const curr: SupportedCurrencyCode = l.currency || resolveLineMandatoryCurrency(category, expedition);
        const nextExpectedNative = field === 'expectedNative' ? value : (l.expectedNative ?? 0);
        const nextActualNative = field === 'actualNative' ? value : (l.actualNative ?? 0);
        return {
          ...l,
          currency: curr,
          expectedNative: nextExpectedNative,
          actualNative: nextActualNative,
          expectedERN: toERN(nextExpectedNative, curr),
          actualERN: toERN(nextActualNative, curr),
          expectedUSD: toUSD(nextExpectedNative, curr),
          actualUSD: toUSD(nextActualNative, curr),
        };
      })
    );
  };

  const handleLogisticsSubItemChange = (subItemId: string, valERN: number) => {
    setCostLines((prev) =>
      prev.map((l) => {
        if (l.category !== 'logistics') return l;
        const nextSub = { ...(l.subItems || {}), [subItemId]: valERN };
        const sumERN = Object.values(nextSub).reduce((s, v) => s + (Number(v) || 0), 0);
        return {
          ...l,
          currency: 'ERN',
          subItems: nextSub,
          expectedNative: sumERN,
          actualNative: sumERN,
          expectedERN: sumERN,
          actualERN: sumERN,
          expectedUSD: toUSD(sumERN, 'ERN'),
          actualUSD: toUSD(sumERN, 'ERN'),
        };
      })
    );
  };

  const handleLineChange = (
    category: TourCostCategory,
    patch: Partial<TourCostLine>
  ) => {
    setCostLines((prev) =>
      prev.map((l) => (l.category === category ? { ...l, ...patch } : l))
    );
  };

  const handlePostLine = (line: TourCostLine) => {
    if (!onPostCostLineToLedger || line.isPayrollAccrued) return;
    if ((Number(line.actualUSD) || 0) <= 0) return;

    const updatedExpeditionDraft: TouristExpedition = {
      ...expedition,
      packageCurrency,
      packagePriceNative,
      packagePriceUSD,
      pricePerPersonUSD,
      amountCollectedUSD,
      paymentStatus:
        amountCollectedUSD >= packagePriceUSD && packagePriceUSD > 0
          ? 'Paid'
          : amountCollectedUSD > 0
          ? 'Deposit Paid'
          : 'Unpaid',
      costLines,
      dualRoleSinglePayApplied: isDualRoleSamePerson,
    };

    const ledgerId = onPostCostLineToLedger(updatedExpeditionDraft, line);
    if (ledgerId) {
      const nextLines = costLines.map((l) =>
        l.category === line.category ? { ...l, linkedLedgerEntryId: ledgerId } : l
      );
      setCostLines(nextLines);
      onSaveExpedition({
        ...updatedExpeditionDraft,
        costLines: nextLines,
      });
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: TouristExpedition = {
      ...expedition,
      packageCurrency,
      packagePriceNative,
      packagePriceUSD,
      pricePerPersonUSD,
      amountCollectedUSD,
      paymentStatus:
        amountCollectedUSD >= packagePriceUSD && packagePriceUSD > 0
          ? 'Paid'
          : amountCollectedUSD > 0
          ? 'Deposit Paid'
          : 'Unpaid',
      costLines,
      dualRoleSinglePayApplied: isDualRoleSamePerson,
    };
    onSaveExpedition(updated);
    onClose();
  };

  const logisticsLine = costLines.find((l) => l.category === 'logistics');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white w-full max-w-6xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-400/30 text-amber-400">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-serif italic font-bold">
                Tour Costing, Multi-Currency Rules (ERN / USD / EUR / GBP / CHF) &amp; Profitability Panel
              </h3>
              <p className="text-xs text-slate-300">
                {expedition.leadName} ({expedition.situation} · {paxCount} Pax · {expedition.daysPlanned} Days) — {expedition.routeSummary}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-5 text-xs text-slate-900 max-h-[84vh] overflow-y-auto">
          {/* Official Currency Policy Banner */}
          <div className="p-3.5 rounded-2xl bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Coins className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-[11px] leading-relaxed">
                <strong className="text-amber-300">Currency Policy Enforced:</strong> Tours in{' '}
                <strong>USD, EUR, GBP, CHF</strong> · Air Tickets in <strong>USD, EUR</strong> ·{' '}
                <strong>Asmara Palace Hotel, Sea Tax &amp; Visa Fee in USD</strong> · Salaries, Car/Boat Rent, Fuel, Meals, Logistics (Island Grocery, Oil, Tents, Water, Fruit, Ice Cream, Coffee/Macchiato), Crew Accommodation, Local Hotels, Travel Permits, Entrance, Waitstaff Tips, Experts, Boat Crew, Family Visit &amp; Community Assistance in{' '}
                <strong className="text-emerald-300">ERN (Nakfa)</strong>.
              </span>
            </div>
            <div className="flex items-center gap-2 font-mono text-[10px] shrink-0">
              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/30 text-emerald-300">
                ERN Costs: {totalActualERNPortion.toLocaleString()} ERN
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-blue-500/20 border border-blue-400/30 text-blue-300">
                USD Costs: ${totalActualUSDPortion.toLocaleString()} USD
              </span>
            </div>
          </div>

          {/* Top Pricing, Expected vs Realized Margin, and Cash Collected */}
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
              <div className="flex items-center justify-between gap-1">
                <label className="text-[10px] font-mono uppercase text-slate-500 font-bold">
                  Tour Price ({packageCurrency})
                </label>
                <select
                  value={packageCurrency}
                  onChange={(e) => {
                    const nextCurr = e.target.value as 'USD' | 'EUR' | 'GBP' | 'CHF';
                    const inUSD = toUSD(packagePriceNative, packageCurrency);
                    const nextNative = Number((inUSD / CURRENCY_META[nextCurr].toUSD).toFixed(2));
                    setPackageCurrency(nextCurr);
                    setPackagePriceNative(nextNative);
                  }}
                  className="px-1.5 py-0.5 rounded bg-slate-900 text-amber-300 font-mono text-[10px] font-bold"
                >
                  {TOUR_ALLOWED_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <input
                type="number"
                min="0"
                step="0.01"
                value={packagePriceNative}
                onChange={(e) => setPackagePriceNative(Number(e.target.value) || 0)}
                className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 font-mono font-bold text-sm text-slate-900"
              />
              <span className="text-[10px] font-mono text-slate-500 mt-1 block">
                {formatCurrencyAmount(pricePerPersonNative, packageCurrency)}/pax (≈ ${packagePriceUSD.toLocaleString()} USD)
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-blue-50/60 border border-blue-200">
              <label className="text-[10px] font-mono uppercase text-blue-800 font-bold block">
                Cash Collected (USD Equiv.)
              </label>
              <input
                type="number"
                min="0"
                value={amountCollectedUSD}
                onChange={(e) => setAmountCollectedUSD(Number(e.target.value) || 0)}
                className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-white border border-blue-300 font-mono font-bold text-sm text-blue-950"
              />
              <span className="text-[10px] font-mono text-blue-700 mt-1 block">
                Due: ${Math.max(0, Number((packagePriceUSD - amountCollectedUSD).toFixed(2))).toLocaleString()} USD
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] font-mono uppercase text-slate-500 font-bold block">
                Expected vs Actual Cost
              </span>
              <div className="mt-1.5 font-mono font-bold text-sm text-slate-900">
                Act: ${actualCostUSD.toLocaleString()} USD
              </div>
              <span className="text-[10px] font-mono text-slate-500 mt-1 block">
                Exp: ${expectedCostUSD.toLocaleString()} USD ({Math.round(actualCostUSD * 15).toLocaleString()} ERN)
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200">
              <span className="text-[10px] font-mono uppercase text-amber-800 font-bold block">
                Expected Margin
              </span>
              <div
                className={`mt-1.5 font-mono font-bold text-sm ${
                  expectedMarginUSD >= 0 ? 'text-amber-900' : 'text-rose-700'
                }`}
              >
                ${expectedMarginUSD.toLocaleString()} ({expectedMarginPct}%)
              </div>
              <span className="text-[10px] text-amber-800 mt-1 block">
                Budgeted before departure
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200">
              <span className="text-[10px] font-mono uppercase text-emerald-800 font-bold block">
                Realized Margin
              </span>
              <div
                className={`mt-1.5 font-mono font-bold text-sm ${
                  realizedMarginUSD >= 0 ? 'text-emerald-800' : 'text-rose-700'
                }`}
              >
                ${realizedMarginUSD.toLocaleString()} ({realizedMarginPct}%)
              </div>
              <span className="text-[10px] text-emerald-700 mt-1 block">
                Actual P&amp;L vs Package Price
              </span>
            </div>
          </div>

          {/* Staff Role Distinction & Dual-Role Single-Pay Safeguard */}
          <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="font-bold text-amber-950 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-700" />
                <span>Assigned Field Staff (Salaries in ERN) &amp; Anti-Duplication Control</span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-700">
                <span>
                  Guide: <strong>{expedition.guideName || 'Unassigned'}</strong>{' '}
                  {guideEmp && (
                    <span className="px-2 py-0.5 rounded-full bg-white border border-amber-200 font-mono text-[10px]">
                      {getEmployeeFieldRoleBadge(guideEmp)}
                    </span>
                  )}
                </span>
                <span>·</span>
                <span>
                  Driver: <strong>{expedition.driverName || 'Unassigned'}</strong>{' '}
                  {driverEmp && (
                    <span className="px-2 py-0.5 rounded-full bg-white border border-amber-200 font-mono text-[10px]">
                      {getEmployeeFieldRoleBadge(driverEmp)}
                    </span>
                  )}
                </span>
              </div>
            </div>

            {isDualRoleSamePerson ? (
              <span className="px-3 py-1.5 rounded-xl bg-purple-100 border border-purple-300 text-purple-900 font-bold text-[11px]">
                Dual-Role (Guide &amp; Driver): Single Base Salary in ERN Enforced
              </span>
            ) : (
              <span className="px-3 py-1.5 rounded-xl bg-white border border-amber-200 text-amber-900 font-mono text-[10px] font-bold">
                Separate Guide Only &amp; Driver Only Assignments (ERN)
              </span>
            )}
          </div>

          {/* Expandable Logistics ERN Sub-Items Drawer (Island Grocery, Oil, Tents, Bottled Water, Fruit, Ice Cream, Coffee & Macchiato, Crew Accommodation) */}
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between">
              <div>
                <span className="font-bold text-emerald-950 text-xs">
                  Field Logistics &amp; Island Provisions Breakdown (Mandatory ERN — Eritrean Nakfa)
                </span>
                <p className="text-[11px] text-emerald-800">
                  Island grocery, cooking oil, tents, bottled water, fruit, ice cream, coffee &amp; macchiato, and crew/driver/guide accommodation
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowLogisticsBreakdown((v) => !v)}
                className="px-3 py-1.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-[11px] font-bold flex items-center gap-1.5 cursor-pointer"
              >
                {showLogisticsBreakdown ? (
                  <>
                    Hide ERN Logistics Items <ChevronUp className="w-3.5 h-3.5" />
                  </>
                ) : (
                  <>
                    Itemize ERN Logistics ({(logisticsLine?.actualNative ?? 0).toLocaleString()} ERN){' '}
                    <ChevronDown className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>

            {showLogisticsBreakdown && (
              <div className="p-4 pt-2 border-t border-emerald-200/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-white">
                {ERN_LOGISTICS_SUBITEMS.map((sub) => {
                  const currentVal = Number(logisticsLine?.subItems?.[sub.id] ?? 0);
                  return (
                    <div key={sub.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                      <label className="text-[11px] font-bold text-slate-800 block">{sub.label}</label>
                      <span className="text-[10px] text-slate-500 block mb-1.5">
                        Suggested: {sub.defaultUnitERN.toLocaleString()} ERN ({sub.unitLabel})
                      </span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min="0"
                          value={currentVal}
                          onChange={(e) =>
                            handleLogisticsSubItemChange(sub.id, Number(e.target.value) || 0)
                          }
                          className="w-full px-2.5 py-1 rounded-lg bg-white border border-slate-300 font-mono font-bold text-xs text-right"
                        />
                        <span className="px-2 py-1 rounded bg-emerald-100 text-emerald-900 font-mono font-bold text-[10px]">
                          ERN
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Comprehensive Costing Table */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white font-mono text-[11px]">
                  <th className="py-3 px-3">Cost Category</th>
                  <th className="py-3 px-2.5 text-center">Mandatory Currency</th>
                  <th className="py-3 px-3 text-right">Expected (Native)</th>
                  <th className="py-3 px-3 text-right">Actual (Native)</th>
                  <th className="py-3 px-3 text-right">USD Equiv.</th>
                  <th className="py-3 px-3">Accounting Channel</th>
                  <th className="py-3 px-3">Notes / Supplier</th>
                  <th className="py-3 px-3 text-right">Ledger Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {costLines.map((line) => {
                  const meta = TOUR_COST_CATEGORIES.find((c) => c.category === line.category);
                  const lineCurr = line.currency || resolveLineMandatoryCurrency(line.category, expedition);
                  const expNative =
                    line.expectedNative !== undefined
                      ? line.expectedNative
                      : lineCurr === 'ERN'
                      ? Math.round((Number(line.expectedUSD) || 0) * 15)
                      : Number(line.expectedUSD) || 0;
                  const actNative =
                    line.actualNative !== undefined
                      ? line.actualNative
                      : lineCurr === 'ERN'
                      ? Math.round((Number(line.actualUSD) || 0) * 15)
                      : Number(line.actualUSD) || 0;

                  return (
                    <tr key={line.category} className="hover:bg-slate-50 transition">
                      <td className="py-2.5 px-3 font-bold text-slate-900">
                        {line.label}
                        <span className="block text-[10px] font-mono text-slate-500 font-normal">
                          {meta?.ruleNote}
                        </span>
                      </td>

                      <td className="py-2.5 px-2.5 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full font-mono text-[10px] font-bold border ${
                            lineCurr === 'ERN'
                              ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                              : 'bg-blue-100 text-blue-900 border-blue-300'
                          }`}
                        >
                          {lineCurr}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            value={expNative}
                            onChange={(e) =>
                              handleNativeAmountChange(
                                line.category,
                                'expectedNative',
                                Number(e.target.value) || 0
                              )
                            }
                            className="w-24 px-2 py-1 rounded-lg bg-slate-50 border border-slate-200 font-mono text-right font-semibold"
                          />
                          <span className="text-[10px] font-mono text-slate-500">{lineCurr}</span>
                        </div>
                      </td>

                      <td className="py-2.5 px-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            value={actNative}
                            onChange={(e) =>
                              handleNativeAmountChange(
                                line.category,
                                'actualNative',
                                Number(e.target.value) || 0
                              )
                            }
                            className="w-24 px-2 py-1 rounded-lg bg-white border border-slate-300 font-mono text-right font-bold text-slate-900"
                          />
                          <span className="text-[10px] font-mono text-slate-700 font-bold">
                            {lineCurr}
                          </span>
                        </div>
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800">
                        ${(Number(line.actualUSD) || 0).toLocaleString()}
                      </td>

                      <td className="py-2.5 px-3">
                        <select
                          value={line.isPayrollAccrued ? 'payroll' : 'ledger'}
                          onChange={(e) =>
                            handleLineChange(line.category, {
                              isPayrollAccrued: e.target.value === 'payroll',
                            })
                          }
                          className="px-2 py-1 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-semibold text-slate-800"
                        >
                          <option value="ledger">Direct Tour Expense (Ledger)</option>
                          <option value="payroll">Accrued to Monthly Payroll (ERN)</option>
                        </select>
                      </td>

                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          value={line.notes || ''}
                          onChange={(e) =>
                            handleLineChange(line.category, { notes: e.target.value })
                          }
                          placeholder="Supplier / memo"
                          className="w-full px-2 py-1 rounded-lg bg-slate-50 border border-slate-200 text-[11px]"
                        />
                      </td>

                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        {line.isPayrollAccrued ? (
                          <span
                            className="px-2 py-1 rounded-lg bg-purple-50 border border-purple-200 text-purple-800 font-mono text-[10px] font-bold"
                            title="Included in monthly ERN payroll accrual; blocked from direct expense ledger to prevent double counting"
                          >
                            In ERN Payroll
                          </span>
                        ) : line.linkedLedgerEntryId ? (
                          <button
                            type="button"
                            onClick={() => handlePostLine(line)}
                            className="px-2.5 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 text-emerald-900 font-mono text-[10px] font-bold cursor-pointer"
                            title="Sync updated actual amount to existing ledger entry without creating a duplicate"
                          >
                            Synced ({line.linkedLedgerEntryId})
                          </button>
                        ) : (
                          onPostCostLineToLedger && (
                            <button
                              type="button"
                              disabled={(Number(line.actualUSD) || 0) <= 0}
                              onClick={() => handlePostLine(line)}
                              className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-[10px] font-bold cursor-pointer"
                            >
                              Post ({lineCurr})
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-mono font-bold text-xs border-t-2 border-slate-300">
                  <td colSpan={2} className="py-3 px-3 uppercase">
                    Total Tour Costing
                  </td>
                  <td className="py-3 px-3 text-right">
                    Exp: ${expectedCostUSD.toLocaleString()} USD
                  </td>
                  <td className="py-3 px-3 text-right">
                    {totalActualERNPortion.toLocaleString()} ERN + ${totalActualUSDPortion.toLocaleString()} USD
                  </td>
                  <td className="py-3 px-3 text-right">${actualCostUSD.toLocaleString()} USD</td>
                  <td colSpan={3} className="py-3 px-3 text-right text-emerald-900">
                    Realized Profit Margin: ${realizedMarginUSD.toLocaleString()} USD ({realizedMarginPct}%)
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer"
            >
              Close
            </button>
            <button
              type="submit"
              className="px-6 py-2 rounded-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black uppercase tracking-wider shadow-xs cursor-pointer flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" /> Save Costing &amp; Margin
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
