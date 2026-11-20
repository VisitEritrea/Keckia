import React, { useState } from 'react';
import { X, CalendarPlus, Compass, Shield, Truck, Layers } from 'lucide-react';
import {
  Employee,
  TourPackage,
  TourSchedule,
  canActAsGuide,
  canActAsDriver,
  isDualGuideDriver,
  getStaffCapacityInfo,
} from '../../types';

interface NewDepartureModalProps {
  packages: TourPackage[];
  employees: Employee[];
  onClose: () => void;
  onAddSchedule: (schedule: TourSchedule) => void;
}

export const NewDepartureModal: React.FC<NewDepartureModalProps> = ({
  packages = [],
  employees = [],
  onClose,
  onAddSchedule,
}) => {
  const guides = (employees || []).filter((e) => e && canActAsGuide(e.role));
  const drivers = (employees || []).filter((e) => e && canActAsDriver(e.role));

  const [selectedPkgId, setSelectedPkgId] = useState(packages[0]?.id || '');
  const [startDate, setStartDate] = useState('2026-09-01');
  const [leadGuideId, setLeadGuideId] = useState(
    guides[0]?.id || (employees || [])[0]?.id || ''
  );
  const [assignedDriverId, setAssignedDriverId] = useState(
    drivers[0]?.id || ''
  );
  const [totalSeats, setTotalSeats] = useState(14);
  const [vipPrice, setVipPrice] = useState(2400);
  const [stdPrice, setStdPrice] = useState(1850);
  const [grpPrice, setGrpPrice] = useState(1600);
  const [notes, setNotes] = useState('');

  const selectedPkg = (packages || []).find((p) => p && p.id === selectedPkgId) || packages[0];
  const leadGuide = employees.find((e) => e.id === leadGuideId);
  const assignedDriver = employees.find((e) => e.id === assignedDriverId);
  const isSameDualPerson = Boolean(leadGuideId && leadGuideId === assignedDriverId);

  // Compute end date based on duration
  const start = new Date(startDate || '2026-09-01');
  const duration = selectedPkg?.durationDays || 5;
  const end = new Date(start);
  end.setDate(start.getDate() + duration);
  const endDateFormatted = end.toISOString().split('T')[0];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const newSch: TourSchedule = {
      id: `sch-${Date.now().toString().slice(-4)}`,
      tourPackageId: selectedPkgId,
      tourTitle: selectedPkg.title,
      destination: selectedPkg.destination,
      startDate,
      endDate: endDateFormatted,
      status: 'Upcoming',
      leadGuideId,
      leadGuideName: leadGuide
        ? `${leadGuide.name} ${isSameDualPerson ? '(Dual: Guide & Driver)' : ''}`.trim()
        : 'Assigned Lead Guide',
      supportStaffIds: assignedDriver ? [assignedDriver.id] : [],
      supportStaffNames: assignedDriver
        ? [`${assignedDriver.name} (${isSameDualPerson ? 'Dual Guide & Driver' : 'Fleet Driver'})`]
        : [],
      totalSeats: Number(totalSeats) || 12,
      bookedSeats: 0,
      ticketClasses: {
        vip: { price: Number(vipPrice), totalSeats: 4, bookedSeats: 0 },
        standard: { price: Number(stdPrice), totalSeats: Math.max(Number(totalSeats) - 6, 4), bookedSeats: 0 },
        group: { price: Number(grpPrice), totalSeats: 2, bookedSeats: 0 },
      },
      permitReference: `PERMIT-${selectedPkg.region.slice(0, 3).toUpperCase()}-2026-${Math.floor(100 + Math.random() * 900)}`,
      weatherForecast: 'Fair / Escarpment Moderate',
      notes: notes || 'Standard high-altitude logistics protocol enabled.',
    };

    onAddSchedule(newSch);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-[2rem] shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] text-slate-900">
        {/* Header */}
        <div className="p-6 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-700">
              <CalendarPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xl font-serif italic text-slate-900 font-bold">Schedule New Tour Departure</h3>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">
                Set departure dates, seat allocations, lead guide &amp; fleet driver
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition cursor-pointer border border-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Select Tour Package *</label>
            <select
              value={selectedPkgId}
              onChange={(e) => {
                setSelectedPkgId(e.target.value);
                const pkg = packages.find((p) => p.id === e.target.value);
                if (pkg) {
                  setTotalSeats(pkg.maxCapacity);
                  setStdPrice(pkg.basePrice);
                  setVipPrice(Math.round(pkg.basePrice * 1.3));
                  setGrpPrice(Math.round(pkg.basePrice * 0.85));
                }
              }}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-medium text-slate-900 focus:bg-white focus:ring-1 focus:ring-amber-500"
            >
              {packages.map((pkg) => (
                <option key={pkg.id} value={pkg.id}>
                  {pkg.title} ({pkg.durationDays} Days - {pkg.region})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Departure Start Date *</label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 focus:bg-white focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Calculated End Date</label>
              <input
                type="text"
                disabled
                value={`${endDateFormatted} (${selectedPkg?.durationDays || 5}d)`}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-sm text-slate-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max Capacity (Seats)</label>
              <input
                type="number"
                value={totalSeats}
                onChange={(e) => setTotalSeats(Number(e.target.value))}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 focus:bg-white focus:ring-1 focus:ring-amber-500"
              />
            </div>
          </div>

          {/* Guide vs Driver vs Dual-Role Assignment */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5 text-emerald-600" /> Lead Expedition Guide *
                  </span>
                  <span className="text-[10px] font-mono text-emerald-700">Guide Only / Dual</span>
                </label>
                <select
                  value={leadGuideId}
                  onChange={(e) => setLeadGuideId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-900 focus:ring-1 focus:ring-amber-500"
                >
                  {guides.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} {getStaffCapacityInfo(g.role).shortTag} ({g.rating} ⭐)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-sky-600" /> Assigned Fleet Driver
                  </span>
                  <span className="text-[10px] font-mono text-sky-700">Driver Only / Dual</span>
                </label>
                <select
                  value={assignedDriverId}
                  onChange={(e) => setAssignedDriverId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-900 focus:ring-1 focus:ring-amber-500"
                >
                  <option value="">— Separate Driver Unassigned —</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} {getStaffCapacityInfo(d.role).shortTag}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {leadGuide && isDualGuideDriver(leadGuide.role) && assignedDriverId !== leadGuide.id && (
              <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-between gap-2 text-xs">
                <span className="text-[11px] text-purple-900">
                  <strong>{leadGuide.name}</strong> holds a <strong>Dual-Capacity (Driver &amp; Guide)</strong> license.
                </span>
                <button
                  type="button"
                  onClick={() => setAssignedDriverId(leadGuide.id)}
                  className="px-3 py-1 rounded-lg bg-purple-700 hover:bg-purple-800 text-white text-[10px] font-bold transition cursor-pointer shrink-0"
                >
                  Assign as Both Guide &amp; Driver
                </button>
              </div>
            )}

            {isSameDualPerson && leadGuide && (
              <div className="p-2.5 rounded-xl bg-purple-100/80 border border-purple-300 text-[11px] text-purple-950 font-semibold flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-purple-700 shrink-0" />
                <span>
                  Dual-Capacity Assignment: <strong>{leadGuide.name}</strong> will operate as both Lead Tour Guide and 4WD Fleet Driver on this departure.
                </span>
              </div>
            )}
          </div>

          {/* Pricing Tiers */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider font-mono text-amber-800">
              Ticket Class Pricing Configuration (USD)
            </h4>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-slate-600 mb-1 font-semibold">VIP Class ($)</label>
                <input
                  type="number"
                  value={vipPrice}
                  onChange={(e) => setVipPrice(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-mono font-bold text-amber-800"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 mb-1 font-semibold">Standard ($)</label>
                <input
                  type="number"
                  value={stdPrice}
                  onChange={(e) => setStdPrice(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-mono font-bold text-slate-900"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 mb-1 font-semibold">Group Pass ($)</label>
                <input
                  type="number"
                  value={grpPrice}
                  onChange={(e) => setGrpPrice(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-mono font-bold text-slate-700"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Logistics & Permitting Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Armed scouts required from Debark, Toyota Land Cruiser convoys allocated..."
              className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-full bg-brand-500 hover:bg-brand-600 text-slate-950 text-xs font-black uppercase tracking-widest shadow-sm hover:shadow transition cursor-pointer"
            >
              Publish Tour Schedule
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
