import React, { useState } from 'react';
import { X, User, MapPin, Building, Compass, Truck, Coins, CheckCircle2, Info } from 'lucide-react';
import {
  TouristProfile,
  Hotel,
  Employee,
  Vehicle,
  TourBooking,
  TourBookingType,
  TouristActivityStatus,
  canActAsGuide,
  canActAsDriver,
  isDualGuideDriver,
  getStaffCapacityInfo,
} from '../../types';
import { useOptions } from '../../lib/settings';
import {
  TOUR_ALLOWED_CURRENCIES,
  getHotelCurrency,
  toUSD,
  formatCurrencyAmount,
} from '../../lib/currencyRules';

interface NewTourBookingModalProps {
  tourists: TouristProfile[];
  hotels: Hotel[];
  employees: Employee[];
  vehicles: Vehicle[];
  onClose: () => void;
  onSave: (booking: TourBooking) => void;
}

const TOUR_TYPES: TourBookingType[] = ['Group Tour', 'Private Tour', 'Custom Tour', 'Corporate Tour'];
const NONE = '';

export const NewTourBookingModal: React.FC<NewTourBookingModalProps> = ({
  tourists = [],
  hotels = [],
  employees = [],
  vehicles = [],
  onClose,
  onSave,
}) => {
  const regions = useOptions('packages', 'regions');

  const [touristId, setTouristId] = useState(tourists[0]?.id || '');
  const [region, setRegion] = useState(regions[0] || '');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [hotelId, setHotelId] = useState(NONE);
  const [guideId, setGuideId] = useState(NONE);
  const [driverId, setDriverId] = useState(NONE);
  const [vehicleId, setVehicleId] = useState(NONE);

  // All local field costs in ERN (Nakfa)
  const [guideAllowanceERN, setGuideAllowanceERN] = useState(525);
  const [driverAllowanceERN, setDriverAllowanceERN] = useState(450);
  const [mealsERN, setMealsERN] = useState(1200);
  const [entranceFeesERN, setEntranceFeesERN] = useState(600);
  const [logisticsERN, setLogisticsERN] = useState(1500);
  const [travelPermitsERN, setTravelPermitsERN] = useState(300);
  const [boatRentERN, setBoatRentERN] = useState(0);
  const [tipsAndCommunityERN, setTipsAndCommunityERN] = useState(450);

  // USD-mandatory statutory fees
  const [seaTaxUSD, setSeaTaxUSD] = useState(0);
  const [visaFeeUSD, setVisaFeeUSD] = useState(70);

  // Tour Package Pricing in USD, EUR, GBP, or CHF
  const [tourType, setTourType] = useState<TourBookingType>('Group Tour');
  const [travelersCount, setTravelersCount] = useState(1);
  const [packageCurrency, setPackageCurrency] = useState<'USD' | 'EUR' | 'GBP' | 'CHF'>('USD');
  const [pricePerPersonNative, setPricePerPersonNative] = useState(1200);
  const [status] = useState<TouristActivityStatus>('Planned');

  // Separate pools: Guides Only + Dual Role for guiding; Drivers Only + Dual Role for driving.
  const guidePool = employees.filter((e) => e && canActAsGuide(e.role));
  const driverPool = employees.filter((e) => e && canActAsDriver(e.role));
  const selectedGuideObj = employees.find((e) => e.id === guideId);
  const selectedDriverObj = employees.find((e) => e.id === driverId);
  const selectedHotelObj = hotels.find((h) => h.id === hotelId);
  const hotelCurrency = selectedHotelObj ? getHotelCurrency(selectedHotelObj.id || selectedHotelObj.name) : 'ERN';

  const totalPackageNative = travelersCount * pricePerPersonNative;
  const pricePerPersonUSD = toUSD(pricePerPersonNative, packageCurrency);
  const totalPackageUSD = toUSD(totalPackageNative, packageCurrency);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const tourist = tourists.find((t) => t.id === touristId);
    if (!tourist || !region || !startDate || !endDate) return;

    const hotel = hotels.find((h) => h.id === hotelId);
    const guide = employees.find((e) => e.id === guideId);
    const driver = employees.find((e) => e.id === driverId);
    const vehicle = vehicles.find((v) => v.id === vehicleId);

    const newBooking: TourBooking = {
      id: `tbk-${Date.now().toString().slice(-6)}`,
      touristId: tourist.id,
      touristName: tourist.fullName,
      region,
      startDate,
      endDate,
      hotelId: hotel?.id,
      hotelName: hotel?.name,
      guideId: guide?.id,
      guideName: guide?.name,
      driverId: driver?.id,
      driverName: driver?.name,
      vehicleId: vehicle?.id,
      vehicleName: vehicle ? `${vehicle.name} (${vehicle.plateNumber})` : undefined,
      guideAllowanceERN,
      driverAllowanceERN: guideId && guideId === driverId ? 0 : driverAllowanceERN,
      mealsERN,
      entranceFeesERN,
      logisticsERN,
      travelPermitsERN,
      boatRentERN,
      tipsAndCommunityERN,
      seaTaxUSD,
      visaFeeUSD,
      guideAllowanceUSD: toUSD(guideAllowanceERN, 'ERN'),
      driverAllowanceUSD: guideId && guideId === driverId ? 0 : toUSD(driverAllowanceERN, 'ERN'),
      mealsUSD: toUSD(mealsERN, 'ERN'),
      entranceFeesUSD: toUSD(entranceFeesERN, 'ERN'),
      packageCurrency,
      pricePerPersonNative,
      totalPackageNative,
      tourType,
      travelersCount,
      pricePerPersonUSD,
      totalPackageUSD,
      status,
      createdAt: new Date().toISOString(),
    };

    onSave(newBooking);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-400/30 text-amber-400">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-serif italic font-bold">New Tour Booking &amp; Multi-Currency Cost Sheet</h2>
              <p className="text-xs text-slate-300">
                Tours in USD / EUR / GBP / CHF · Local Operations in ERN (Nakfa) · Asmara Palace, Sea Tax &amp; Visa in USD
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-5 text-slate-900 text-xs max-h-[82vh] overflow-y-auto">
          {/* Client & Region */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-blue-600" /> Client
              </label>
              <select
                value={touristId}
                onChange={(e) => setTouristId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-medium text-slate-900 focus:bg-white focus:ring-1 focus:ring-blue-500"
              >
                {tourists.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName} ({t.passportNumber})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-emerald-600" /> Region
              </label>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-medium text-slate-900 focus:bg-white"
              >
                {regions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Start Date</label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-medium text-slate-900 focus:bg-white"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">End Date</label>
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-medium text-slate-900 focus:bg-white"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Building className="w-3.5 h-3.5 text-amber-600" /> Hotel
                </span>
                {selectedHotelObj && (
                  <span
                    className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold ${
                      hotelCurrency === 'USD'
                        ? 'bg-blue-100 text-blue-900 border border-blue-300'
                        : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                    }`}
                  >
                    Hotel Settlement: {hotelCurrency} ({hotelCurrency === 'USD' ? 'Asmara Palace USD Rule' : 'Local Hotel ERN Rule'})
                  </span>
                )}
              </label>
              <select
                value={hotelId}
                onChange={(e) => setHotelId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-medium text-slate-900 focus:bg-white"
              >
                <option value={NONE}>None</option>
                {hotels.map((h) => {
                  const hCurr = getHotelCurrency(h.id || h.name);
                  return (
                    <option key={h.id} value={h.id}>
                      {h.name} ({h.city}) — [{hCurr}]
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {/* Staffing & Fleet */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5 text-emerald-600" /> Assigned Tour Guide
                  </span>
                  <span className="text-[10px] font-mono text-emerald-700">Guide Only / Dual</span>
                </label>
                <select
                  value={guideId}
                  onChange={(e) => setGuideId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 font-medium text-slate-900"
                >
                  <option value={NONE}>— None —</option>
                  {guidePool.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {getStaffCapacityInfo(s.role).shortTag}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-sky-600" /> Assigned Fleet Driver
                  </span>
                  <span className="text-[10px] font-mono text-sky-700">Driver Only / Dual</span>
                </label>
                <select
                  value={driverId}
                  onChange={(e) => setDriverId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 font-medium text-slate-900"
                >
                  <option value={NONE}>— None —</option>
                  {driverPool.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {getStaffCapacityInfo(s.role).shortTag}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {selectedGuideObj && isDualGuideDriver(selectedGuideObj.role) && driverId !== selectedGuideObj.id && (
              <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-between gap-2">
                <span className="text-[11px] text-purple-900 font-medium">
                  <strong>{selectedGuideObj.name}</strong> is certified as a <strong>Dual-Capacity (Guide &amp; Driver)</strong> specialist.
                </span>
                <button
                  type="button"
                  onClick={() => setDriverId(selectedGuideObj.id)}
                  className="px-3 py-1 rounded-lg bg-purple-700 hover:bg-purple-800 text-white text-[10px] font-bold transition cursor-pointer shrink-0"
                >
                  Assign as Both Guide &amp; Driver
                </button>
              </div>
            )}

            {selectedDriverObj && isDualGuideDriver(selectedDriverObj.role) && guideId !== selectedDriverObj.id && (
              <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-between gap-2">
                <span className="text-[11px] text-purple-900 font-medium">
                  <strong>{selectedDriverObj.name}</strong> is certified as a <strong>Dual-Capacity (Guide &amp; Driver)</strong> specialist.
                </span>
                <button
                  type="button"
                  onClick={() => setGuideId(selectedDriverObj.id)}
                  className="px-3 py-1 rounded-lg bg-purple-700 hover:bg-purple-800 text-white text-[10px] font-bold transition cursor-pointer shrink-0"
                >
                  Assign as Both Guide &amp; Driver
                </button>
              </div>
            )}

            {guideId && guideId === driverId && (
              <div className="p-2.5 rounded-xl bg-purple-100/80 border border-purple-300 text-[11px] text-purple-950 font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-purple-700 shrink-0" />
                Dual-Role Assignment Active: {selectedGuideObj?.name} is serving as both Tour Guide and Fleet Driver (Single Base ERN Salary Enforced).
              </div>
            )}

            <div>
              <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5 text-slate-600" /> Vehicle / Boat (Rental in ERN)
              </label>
              <select
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 font-medium text-slate-900"
              >
                <option value={NONE}>— None —</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.plateNumber})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Local Cost breakdown in ERN (Nakfa) + Statutory USD Fees */}
          <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-emerald-950 flex items-center gap-1.5 text-xs">
                <Coins className="w-4 h-4 text-emerald-700" /> Local Operational Costs (Mandatory ERN — Eritrean Nakfa)
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-200/80 text-emerald-950 font-mono text-[10px] font-bold">
                Code: ERN
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Guide Salary / Allowance (ERN)</label>
                <input
                  type="number"
                  min={0}
                  value={guideAllowanceERN}
                  onChange={(e) => setGuideAllowanceERN(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-emerald-300 font-mono font-bold text-slate-900"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Driver Salary / Allowance (ERN)</label>
                <input
                  type="number"
                  min={0}
                  disabled={Boolean(guideId && guideId === driverId)}
                  value={guideId && guideId === driverId ? 0 : driverAllowanceERN}
                  onChange={(e) => setDriverAllowanceERN(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-emerald-300 font-mono font-bold text-slate-900 disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Meals &amp; Catering (ERN)</label>
                <input
                  type="number"
                  min={0}
                  value={mealsERN}
                  onChange={(e) => setMealsERN(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-emerald-300 font-mono font-bold text-slate-900"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Site Entrance Fees (ERN)</label>
                <input
                  type="number"
                  min={0}
                  value={entranceFeesERN}
                  onChange={(e) => setEntranceFeesERN(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-emerald-300 font-mono font-bold text-slate-900"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1" title="Island grocery, oil, tents, bottled water, fruit, ice cream, coffee & macchiato, crew accommodation">
                  Logistics &amp; Island Grocery (ERN)
                </label>
                <input
                  type="number"
                  min={0}
                  value={logisticsERN}
                  onChange={(e) => setLogisticsERN(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-emerald-300 font-mono font-bold text-slate-900"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Travel Permits (ERN)</label>
                <input
                  type="number"
                  min={0}
                  value={travelPermitsERN}
                  onChange={(e) => setTravelPermitsERN(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-emerald-300 font-mono font-bold text-slate-900"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Boat Rent / Car Rent (ERN)</label>
                <input
                  type="number"
                  min={0}
                  value={boatRentERN}
                  onChange={(e) => setBoatRentERN(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-emerald-300 font-mono font-bold text-slate-900"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1" title="Tips for waitress/waiter, experts, boat crew, family visit, community assistance">
                  Tips, Experts, Family &amp; Community (ERN)
                </label>
                <input
                  type="number"
                  min={0}
                  value={tipsAndCommunityERN}
                  onChange={(e) => setTipsAndCommunityERN(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-emerald-300 font-mono font-bold text-slate-900"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-emerald-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-blue-900 mb-1">Sea Tax (Mandatory USD)</label>
                <input
                  type="number"
                  min={0}
                  value={seaTaxUSD}
                  onChange={(e) => setSeaTaxUSD(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-blue-300 font-mono font-bold text-blue-950"
                />
              </div>
              <div>
                <label className="block font-semibold text-blue-900 mb-1">Visa Fee / VoA (Mandatory USD)</label>
                <input
                  type="number"
                  min={0}
                  value={visaFeeUSD}
                  onChange={(e) => setVisaFeeUSD(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-blue-300 font-mono font-bold text-blue-950"
                />
              </div>
            </div>
          </div>

          {/* Tour Pricing (USD, EUR, GBP, CHF) */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tour Type</label>
              <select
                value={tourType}
                onChange={(e) => setTourType(e.target.value as TourBookingType)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-medium text-slate-900"
              >
                {TOUR_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Travelers (pax)</label>
              <input
                type="number"
                min={1}
                value={travelersCount}
                onChange={(e) => setTravelersCount(Math.max(1, Number(e.target.value)))}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-medium text-slate-900"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tour Currency</label>
              <select
                value={packageCurrency}
                onChange={(e) => setPackageCurrency(e.target.value as 'USD' | 'EUR' | 'GBP' | 'CHF')}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 text-amber-300 font-mono font-bold"
              >
                {TOUR_ALLOWED_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Price per Person ({packageCurrency})
              </label>
              <input
                type="number"
                min={0}
                value={pricePerPersonNative}
                onChange={(e) => setPricePerPersonNative(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-mono font-bold text-slate-900"
              />
            </div>
          </div>

          <p className="text-slate-700 font-medium">
            {travelersCount} × {formatCurrencyAmount(pricePerPersonNative, packageCurrency)} ={' '}
            <span className="font-bold text-slate-900">
              {formatCurrencyAmount(totalPackageNative, packageCurrency)}
            </span>{' '}
            (≈ ${totalPackageUSD.toLocaleString()} USD)
          </p>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!touristId}
              className="px-6 py-2.5 rounded-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 text-xs font-black uppercase tracking-wider shadow-md hover:shadow-lg transition flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" /> Save Tour
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
