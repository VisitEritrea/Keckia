import React, { useState, useMemo } from 'react';
import {
  KeyRound,
  Plus,
  Calendar,
  User,
  Car,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldAlert,
  FileSpreadsheet,
  Edit3,
  CreditCard,
  Info,
  X,
} from 'lucide-react';
import {
  Vehicle,
  VehicleOutwardRental,
  TourSchedule,
  TourBooking,
  Employee,
  FinancialTransaction,
  canActAsDriver,
  getEmployeeFieldRoleBadge,
} from '../../types';
import { TouristExpedition } from '../packages/AddTouristExpeditionModal';
import { exportToCSV } from '../../utils/exportUtils';
import { useWorkspace } from '../../lib/workspace';

interface OutwardVehicleRentalsPanelProps {
  vehicles: Vehicle[];
  outwardRentals: VehicleOutwardRental[];
  schedules?: TourSchedule[];
  tourBookings?: TourBooking[];
  expeditions?: TouristExpedition[];
  employees?: Employee[];
  canEdit?: boolean;
  onSaveOutwardRental: (rental: VehicleOutwardRental) => void;
  onPostRentalToLedger?: (rental: VehicleOutwardRental) => void;
  onAddFinancialTransaction?: (txn: FinancialTransaction) => void;
}

export function calculateInclusiveCalendarDays(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 1;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 1;
  const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, diffDays);
}

function datesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  if (!startA || !endA || !startB || !endB) return false;
  return startA <= endB && endA >= startB;
}

export const OutwardVehicleRentalsPanel: React.FC<OutwardVehicleRentalsPanelProps> = ({
  vehicles = [],
  outwardRentals = [],
  schedules = [],
  tourBookings = [],
  expeditions = [],
  employees = [],
  canEdit = false,
  onSaveOutwardRental,
  onPostRentalToLedger,
  onAddFinancialTransaction,
}) => {
  const { user } = useWorkspace();
  const isAdmin = user?.role === 'CEO';

  const companyVehicles = useMemo(
    () => vehicles.filter((v) => v.ownershipType === 'Company Owned'),
    [vehicles]
  );

  const eligibleDrivers = useMemo(
    () => employees.filter((e) => canActAsDriver(e) && e.status !== 'On Leave'),
    [employees]
  );

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRental, setEditingRental] = useState<VehicleOutwardRental | null>(null);

  // Payment modal state
  const [paymentRental, setPaymentRental] = useState<VehicleOutwardRental | null>(null);
  const [paymentAddUSD, setPaymentAddUSD] = useState<number>(0);

  // Form states
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPassportOrId, setCustomerPassportOrId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().split('T')[0];
  });
  const [billableDaysOverridden, setBillableDaysOverridden] = useState(false);
  const [customBillableDays, setCustomBillableDays] = useState<number>(3);
  const [billableDaysOverrideReason, setBillableDaysOverrideReason] = useState('');
  const [dailyRateUSD, setDailyRateUSD] = useState<number>(120);
  const [currency, setCurrency] = useState<'USD' | 'ERN'>('ERN');
  const [driverIncluded, setDriverIncluded] = useState<boolean>(true);
  const [driverId, setDriverId] = useState<string>('');
  const [driverDailyFeeUSD, setDriverDailyFeeUSD] = useState<number>(25);
  const [depositUSD, setDepositUSD] = useState<number>(100);
  const [amountPaidUSD, setAmountPaidUSD] = useState<number>(0);
  const [status, setStatus] = useState<VehicleOutwardRental['status']>('Active Outward');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const calculatedDays = useMemo(
    () => calculateInclusiveCalendarDays(startDate, endDate),
    [startDate, endDate]
  );

  const effectiveBillableDays = billableDaysOverridden
    ? Math.max(1, Number(customBillableDays) || 1)
    : calculatedDays;

  const totalChargeUSD = useMemo(() => {
    const vehicleTotal = effectiveBillableDays * (Number(dailyRateUSD) || 0);
    const driverTotal = driverIncluded ? effectiveBillableDays * (Number(driverDailyFeeUSD) || 0) : 0;
    return Number((vehicleTotal + driverTotal).toFixed(2));
  }, [effectiveBillableDays, dailyRateUSD, driverIncluded, driverDailyFeeUSD]);

  const outstandingBalanceUSD = useMemo(
    () => Number(Math.max(0, totalChargeUSD - (Number(amountPaidUSD) || 0)).toFixed(2)),
    [totalChargeUSD, amountPaidUSD]
  );

  // Detect vehicle and driver conflicts across outward rentals, tour schedules, tour bookings, and expeditions
  const schedulingConflicts = useMemo(() => {
    const conflicts: string[] = [];
    if (!vehicleId || !startDate || !endDate) return conflicts;

    const selectedVehicle = companyVehicles.find((v) => v.id === vehicleId);
    const vehicleLabel = selectedVehicle
      ? `${selectedVehicle.name} (${selectedVehicle.plateNumber})`
      : vehicleId;

    // 1. Other active/reserved outward rentals
    outwardRentals.forEach((r) => {
      if (editingRental && r.id === editingRental.id) return;
      if (r.status === 'Cancelled' || r.status === 'Returned') return;
      if (r.vehicleId === vehicleId && datesOverlap(startDate, endDate, r.startDate, r.endDate)) {
        conflicts.push(
          `Vehicle ${vehicleLabel} is already rented out to "${r.customerName}" (${r.contractRef}) from ${r.startDate} to ${r.endDate}.`
        );
      }
      if (
        driverIncluded &&
        driverId &&
        r.driverIncluded &&
        r.driverId === driverId &&
        datesOverlap(startDate, endDate, r.startDate, r.endDate)
      ) {
        conflicts.push(
          `Assigned driver is already booked on outward rental ${r.contractRef} (${r.startDate} to ${r.endDate}).`
        );
      }
    });

    // 2. Tour Schedules
    schedules.forEach((s) => {
      if (s.status === 'Completed') return;
      const matchesVehicle =
        s.vehicleId === vehicleId ||
        (selectedVehicle &&
          s.assignedVehicle &&
          (s.assignedVehicle.includes(selectedVehicle.plateNumber) ||
            s.assignedVehicle.toLowerCase().includes(selectedVehicle.name.toLowerCase())));
      if (matchesVehicle && datesOverlap(startDate, endDate, s.startDate, s.endDate)) {
        conflicts.push(
          `Vehicle ${vehicleLabel} is assigned to Tour Departure "${s.packageTitle}" (${s.startDate} to ${s.endDate}).`
        );
      }
      if (
        driverIncluded &&
        driverId &&
        (s.driverId === driverId || s.guideId === driverId) &&
        datesOverlap(startDate, endDate, s.startDate, s.endDate)
      ) {
        conflicts.push(
          `Assigned driver is deployed on Tour Departure "${s.packageTitle}" (${s.startDate} to ${s.endDate}).`
        );
      }
    });

    // 3. Tour Bookings
    tourBookings.forEach((b) => {
      if (b.status === 'Cancelled' || b.status === 'Completed') return;
      if (b.vehicleId === vehicleId && datesOverlap(startDate, endDate, b.startDate, b.endDate)) {
        conflicts.push(
          `Vehicle ${vehicleLabel} is assigned to Tour Booking "${b.packageTitle}" for ${b.touristName} (${b.startDate} to ${b.endDate}).`
        );
      }
      if (
        driverIncluded &&
        driverId &&
        (b.driverId === driverId || b.guideId === driverId) &&
        datesOverlap(startDate, endDate, b.startDate, b.endDate)
      ) {
        conflicts.push(
          `Assigned driver is deployed on Tour Booking "${b.packageTitle}" (${b.startDate} to ${b.endDate}).`
        );
      }
    });

    // 4. Tourist Expeditions
    expeditions.forEach((ex) => {
      if (ex.status === 'Completed') return;
      if (ex.vehicleId === vehicleId && datesOverlap(startDate, endDate, ex.startDate, ex.endDate)) {
        conflicts.push(
          `Vehicle ${vehicleLabel} is deployed on Expedition "${ex.customTitle}" for ${ex.touristName} (${ex.startDate} to ${ex.endDate}).`
        );
      }
      if (
        driverIncluded &&
        driverId &&
        (ex.driverId === driverId || ex.guideId === driverId) &&
        datesOverlap(startDate, endDate, ex.startDate, ex.endDate)
      ) {
        conflicts.push(
          `Assigned driver is deployed on Expedition "${ex.customTitle}" (${ex.startDate} to ${ex.endDate}).`
        );
      }
    });

    return conflicts;
  }, [
    vehicleId,
    startDate,
    endDate,
    driverIncluded,
    driverId,
    companyVehicles,
    outwardRentals,
    schedules,
    tourBookings,
    expeditions,
    editingRental,
  ]);

  const openCreateModal = () => {
    setEditingRental(null);
    setCustomerName('');
    setCustomerPhone('+291 7 ');
    setCustomerEmail('');
    setCustomerPassportOrId('');
    const firstVeh = companyVehicles[0];
    setVehicleId(firstVeh?.id || '');
    const today = new Date().toISOString().split('T')[0];
    const inTwoDays = new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0];
    setStartDate(today);
    setEndDate(inTwoDays);
    setBillableDaysOverridden(false);
    setCustomBillableDays(3);
    setBillableDaysOverrideReason('');
    setDailyRateUSD(120);
    setCurrency('USD');
    setDriverIncluded(true);
    setDriverId(eligibleDrivers[0]?.id || '');
    setDriverDailyFeeUSD(eligibleDrivers[0]?.perDiemRateUSD || 25);
    setDepositUSD(100);
    setAmountPaidUSD(0);
    setStatus('Active Outward');
    setNotes('');
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (r: VehicleOutwardRental) => {
    setEditingRental(r);
    setCustomerName(r.customerName);
    setCustomerPhone(r.customerPhone);
    setCustomerEmail(r.customerEmail || '');
    setCustomerPassportOrId(r.customerPassportOrId || '');
    setVehicleId(r.vehicleId);
    setStartDate(r.startDate);
    setEndDate(r.endDate);
    setBillableDaysOverridden(Boolean(r.billableDaysOverridden));
    setCustomBillableDays(r.billableDays);
    setBillableDaysOverrideReason(r.billableDaysOverrideReason || '');
    setDailyRateUSD(r.dailyRateUSD);
    setCurrency(r.currency || 'USD');
    setDriverIncluded(r.driverIncluded);
    setDriverId(r.driverId || '');
    setDriverDailyFeeUSD(r.driverDailyFeeUSD ?? 25);
    setDepositUSD(r.depositUSD || 0);
    setAmountPaidUSD(r.amountPaidUSD || 0);
    setStatus(r.status);
    setNotes(r.notes || '');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!customerName.trim()) {
      setFormError('Customer full name is required.');
      return;
    }
    if (!vehicleId) {
      setFormError('Please select a company-owned vehicle to rent out.');
      return;
    }
    if (endDate < startDate) {
      setFormError('Return date cannot be earlier than start date.');
      return;
    }
    if (billableDaysOverridden && !billableDaysOverrideReason.trim()) {
      setFormError('An authorized override reason is required when overriding calculated billable days.');
      return;
    }
    if (status !== 'Cancelled' && status !== 'Returned' && schedulingConflicts.length > 0) {
      setFormError('Cannot save outward rental while vehicle or driver scheduling conflicts exist.');
      return;
    }

    const veh = companyVehicles.find((v) => v.id === vehicleId);
    const drv = eligibleDrivers.find((d) => d.id === driverId);

    const record: VehicleOutwardRental = {
      id: editingRental?.id || `out-rent-${Date.now()}`,
      contractRef:
        editingRental?.contractRef || `EV-ROUT-${Math.floor(1000 + Math.random() * 9000)}`,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      customerEmail: isAdmin ? customerEmail.trim() || undefined : editingRental?.customerEmail,
      customerPassportOrId: customerPassportOrId.trim() || undefined,
      vehicleId,
      vehicleName: veh?.name || editingRental?.vehicleName || 'Company Vehicle',
      vehiclePlateNumber: veh?.plateNumber || editingRental?.vehiclePlateNumber || '',
      startDate,
      endDate,
      calculatedDays,
      billableDays: effectiveBillableDays,
      billableDaysOverridden,
      billableDaysOverrideReason: billableDaysOverridden
        ? billableDaysOverrideReason.trim()
        : undefined,
      overrideAuthorizedBy: billableDaysOverridden
        ? user?.fullName || user?.role || 'Authorized Officer'
        : undefined,
      dailyRateUSD: Number(dailyRateUSD) || 0,
      currency,
      driverIncluded,
      driverId: driverIncluded ? drv?.id : undefined,
      driverName: driverIncluded ? (drv?.fullName || drv?.name) : undefined,
      driverDailyFeeUSD: driverIncluded ? Number(driverDailyFeeUSD) || 0 : 0,
      depositUSD: Number(depositUSD) || 0,
      totalChargeUSD,
      amountPaidUSD: Number(amountPaidUSD) || 0,
      outstandingBalanceUSD,
      paymentStatus:
        Number(amountPaidUSD) >= totalChargeUSD && totalChargeUSD > 0
          ? 'Paid'
          : Number(amountPaidUSD) > 0
          ? 'Partial'
          : 'Pending',
      status,
      ledgerEntryId: editingRental?.ledgerEntryId,
      notes: notes.trim() || undefined,
      createdAt: editingRental?.createdAt || new Date().toISOString().split('T')[0],
    };

    onSaveOutwardRental(record);
    setIsModalOpen(false);
  };

  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentRental || paymentAddUSD <= 0) return;

    const newPaid = Number(((paymentRental.amountPaidUSD || 0) + paymentAddUSD).toFixed(2));
    const newOutstanding = Number(Math.max(0, paymentRental.totalChargeUSD - newPaid).toFixed(2));

    const updated: VehicleOutwardRental = {
      ...paymentRental,
      amountPaidUSD: newPaid,
      outstandingBalanceUSD: newOutstanding,
    };

    onSaveOutwardRental(updated);

    if (onAddFinancialTransaction) {
      onAddFinancialTransaction({
        id: `txn-outrent-pay-${Date.now()}`,
        date: new Date().toISOString().split('T')[0],
        referenceCode: `ROUT-PAY-${paymentRental.contractRef}`,
        category: 'Transport & Fleet',
        type: 'Revenue',
        description: `Outward vehicle rental payment from ${paymentRental.customerName} for ${paymentRental.vehicleName} (${paymentRental.vehiclePlateNumber})`,
        amountUSD: paymentAddUSD,
        amountNFA: paymentAddUSD * 15,
        payerOrPayee: paymentRental.customerName,
        paymentMethod: 'Cash (Nakfa / USD)',
        status: 'Completed',
        receiptNumber: `REC-${paymentRental.contractRef}`,
        recordedBy: user?.fullName || 'Fleet Desk',
      });
    }

    setPaymentRental(null);
  };

  const todayIso = new Date().toISOString().split('T')[0];
  const threeDaysOutIso = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];

  const upcomingOrOverdueReturns = useMemo(() => {
    return outwardRentals.filter(
      (r) =>
        (r.status === 'Active Outward' || r.status === 'Overdue Return') &&
        r.endDate <= threeDaysOutIso
    );
  }, [outwardRentals, threeDaysOutIso]);

  const totalBilledUSD = outwardRentals
    .filter((r) => r.status !== 'Cancelled')
    .reduce((sum, r) => sum + (r.totalChargeUSD || 0), 0);
  const totalCollectedUSD = outwardRentals
    .filter((r) => r.status !== 'Cancelled')
    .reduce((sum, r) => sum + (r.amountPaidUSD || 0), 0);
  const totalOutstandingUSD = outwardRentals
    .filter((r) => r.status !== 'Cancelled')
    .reduce((sum, r) => sum + (r.outstandingBalanceUSD || 0), 0);
  const activeOutwardCount = outwardRentals.filter(
    (r) => r.status === 'Active Outward' || r.status === 'Reserved'
  ).length;

  const filteredRentals = outwardRentals.filter(
    (r) => statusFilter === 'all' || r.status === statusFilter
  );

  const handleExportCSV = () => {
    const headers = [
      'Contract Ref',
      'Customer Name',
      'Customer Phone',
      ...(isAdmin ? ['Customer Email'] : []),
      'Passport / ID',
      'Company Vehicle',
      'Plate Number',
      'Start Date',
      'End Date',
      'Calculated Days',
      'Billable Days',
      'Override Reason',
      'Daily Rate (USD)',
      'Driver Included',
      'Driver Name',
      'Deposit (USD)',
      'Total Charge (USD)',
      'Amount Paid (USD)',
      'Outstanding Balance (USD)',
      'Status',
      'Ledger Entry ID',
    ];
    const rows = filteredRentals.map((r) => [
      r.contractRef,
      r.customerName,
      r.customerPhone,
      ...(isAdmin ? [r.customerEmail || ''] : []),
      r.customerPassportOrId || '',
      r.vehicleName,
      r.vehiclePlateNumber,
      r.startDate,
      r.endDate,
      r.calculatedDays,
      r.billableDays,
      r.billableDaysOverrideReason || 'Standard Inclusive Formula',
      r.dailyRateUSD,
      r.driverIncluded ? 'Yes' : 'Self-Drive',
      r.driverName || 'None',
      r.depositUSD,
      r.totalChargeUSD,
      r.amountPaidUSD,
      r.outstandingBalanceUSD,
      r.status,
      r.ledgerEntryId || 'Unposted',
    ]);
    exportToCSV(
      `EritreaVisit_Outward_Vehicle_Rentals_${new Date().toISOString().split('T')[0]}`,
      headers,
      rows
    );
  };

  return (
    <div className="space-y-6">
      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-mono uppercase font-bold text-slate-400 block">
            Active Outward Contracts
          </span>
          <div className="mt-2 text-2xl font-bold font-mono text-slate-900">
            {activeOutwardCount}{' '}
            <span className="text-xs font-normal text-slate-500">
              / {companyVehicles.length} Owned Units
            </span>
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            Conflict-checked against tour departures
          </span>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-mono uppercase font-bold text-emerald-700 block">
            Outward Rental Revenue (Billed)
          </span>
          <div className="mt-2 text-2xl font-bold font-mono text-emerald-900">
            ${totalBilledUSD.toLocaleString()}{' '}
            <span className="text-xs font-normal text-slate-500">USD</span>
          </div>
          <span className="text-[11px] text-emerald-700 font-mono mt-1 block">
            {(totalBilledUSD * 15).toLocaleString()} ERN
          </span>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-mono uppercase font-bold text-blue-700 block">
            Cash Collected from Customers
          </span>
          <div className="mt-2 text-2xl font-bold font-mono text-blue-900">
            ${totalCollectedUSD.toLocaleString()}{' '}
            <span className="text-xs font-normal text-slate-500">USD</span>
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            Verified customer receipts
          </span>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-mono uppercase font-bold text-rose-700 block">
            Outstanding Customer Balance
          </span>
          <div className="mt-2 text-2xl font-bold font-mono text-rose-700">
            ${totalOutstandingUSD.toLocaleString()}{' '}
            <span className="text-xs font-normal text-slate-500">USD</span>
          </div>
          <span className="text-[11px] text-rose-600 mt-1 block">
            {upcomingOrOverdueReturns.length} upcoming/due return(s)
          </span>
        </div>
      </div>

      {/* Upcoming Returns & Overdue Alert Banner */}
      {upcomingOrOverdueReturns.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-amber-950">
                Upcoming &amp; Due Vehicle Returns ({upcomingOrOverdueReturns.length})
              </h4>
              <div className="flex flex-wrap gap-2 mt-1">
                {upcomingOrOverdueReturns.map((r) => {
                  const isOverdue = r.endDate < todayIso;
                  return (
                    <span
                      key={r.id}
                      className={`px-2.5 py-1 rounded-lg font-mono text-[11px] font-bold border ${
                        isOverdue
                          ? 'bg-rose-100 border-rose-300 text-rose-900'
                          : 'bg-white border-amber-200 text-amber-900'
                      }`}
                    >
                      {r.vehiclePlateNumber} ({r.customerName}) · Return: {r.endDate}
                      {isOverdue ? ' [OVERDUE]' : ''}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Outward Rentals Table Container */}
      <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 font-serif italic flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-emerald-700" />
              “Rent Out” — Company-Owned Vehicle Customer Contracts
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Rent agency-owned 4WDs and buses to external clients with inclusive calendar day billing, authorized overrides, and tour conflict protection.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700"
            >
              <option value="all">All Contracts ({outwardRentals.length})</option>
              <option value="Reserved">Reserved</option>
              <option value="Active Outward">Active Outward</option>
              <option value="Returned">Returned</option>
              <option value="Overdue Return">Overdue Return</option>
              <option value="Cancelled">Cancelled</option>
            </select>

            <button
              type="button"
              onClick={handleExportCSV}
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Export CSV
            </button>

            <button
              type="button"
              onClick={openCreateModal}
              className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Plus className="w-4 h-4" /> Rent Out Company Vehicle
            </button>
          </div>
        </div>

        {filteredRentals.length === 0 ? (
          <div className="p-10 text-center rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
            <Car className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-sm font-serif italic font-bold text-slate-700">
              No Outward Vehicle Rental Contracts Recorded
            </p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Click “Rent Out Company Vehicle” above to rent a company-owned 4WD or bus to an external customer while automatically checking for tour schedule conflicts.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white font-mono text-[11px]">
                  <th className="py-3 px-3.5">Contract / Customer</th>
                  <th className="py-3 px-3.5">Company Vehicle</th>
                  <th className="py-3 px-3.5">Rental Period</th>
                  <th className="py-3 px-3.5 text-center">Billable Days</th>
                  <th className="py-3 px-3.5">Driver</th>
                  <th className="py-3 px-3.5 text-right">Total Charge</th>
                  <th className="py-3 px-3.5 text-right">Paid / Deposit</th>
                  <th className="py-3 px-3.5 text-right">Balance Due</th>
                  <th className="py-3 px-3.5 text-center">Status</th>
                  <th className="py-3 px-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredRentals.map((r) => {
                  const isPosted = Boolean(r.ledgerEntryId);
                  return (
                    <tr key={r.id} className="hover:bg-slate-50 transition">
                      <td className="py-3.5 px-3.5">
                        <span className="font-mono font-bold text-[10px] text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          {r.contractRef}
                        </span>
                        <div className="font-bold text-slate-900 mt-1">{r.customerName}</div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {r.customerPhone}
                          {r.customerPassportOrId ? ` · ID: ${r.customerPassportOrId}` : ''}
                        </div>
                      </td>

                      <td className="py-3.5 px-3.5">
                        <span className="font-bold text-slate-900 block">{r.vehicleName}</span>
                        <span className="font-mono text-[10px] font-bold text-blue-900 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200">
                          {r.vehiclePlateNumber}
                        </span>
                      </td>

                      <td className="py-3.5 px-3.5 font-mono text-[11px]">
                        <div>{r.startDate}</div>
                        <div className="text-slate-400 text-[10px]">to {r.endDate}</div>
                      </td>

                      <td className="py-3.5 px-3.5 text-center">
                        <span className="font-mono font-bold text-slate-900 text-xs">
                          {r.billableDays}d
                        </span>
                        <span className="block text-[10px] text-slate-500 font-mono">
                          @${r.dailyRateUSD}/d
                        </span>
                        {r.billableDaysOverridden && (
                          <span
                            className="inline-block mt-0.5 px-1.5 py-0.2 rounded bg-amber-100 border border-amber-300 text-amber-900 text-[9px] font-bold"
                            title={`Override (${r.calculatedDays}d calc): ${r.billableDaysOverrideReason} — by ${r.overrideAuthorizedBy}`}
                          >
                            Override ({r.calculatedDays}d calc)
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-3.5">
                        {r.driverIncluded ? (
                          <div>
                            <span className="font-semibold text-slate-800 block">
                              {r.driverName || 'Agency Driver'}
                            </span>
                            <span className="text-[10px] text-emerald-700 font-mono">
                              +${r.driverDailyFeeUSD || 0}/day
                            </span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">Self-Drive</span>
                        )}
                      </td>

                      <td className="py-3.5 px-3.5 font-mono text-right font-bold text-slate-900">
                        ${r.totalChargeUSD.toLocaleString()} USD
                        {r.currency === 'ERN' && (
                          <span className="block text-[10px] text-slate-500">
                            {(r.totalChargeUSD * 15).toLocaleString()} ERN
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-3.5 font-mono text-right">
                        <span className="font-bold text-emerald-700 block">
                          ${r.amountPaidUSD.toLocaleString()} USD
                        </span>
                        <span className="text-[10px] text-slate-400">
                          Deposit: ${r.depositUSD || 0}
                        </span>
                      </td>

                      <td className="py-3.5 px-3.5 font-mono text-right font-bold text-rose-700">
                        ${r.outstandingBalanceUSD.toLocaleString()} USD
                      </td>

                      <td className="py-3.5 px-3.5 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold ${
                            r.status === 'Active Outward'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : r.status === 'Returned'
                              ? 'bg-slate-100 text-slate-700 border border-slate-200'
                              : r.status === 'Overdue Return'
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : 'bg-blue-100 text-blue-800 border border-blue-200'
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>

                      <td className="py-3.5 px-3.5 text-right space-x-1.5 whitespace-nowrap">
                        {r.outstandingBalanceUSD > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setPaymentRental(r);
                              setPaymentAddUSD(r.outstandingBalanceUSD);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] transition inline-flex items-center gap-1 cursor-pointer"
                          >
                            <CreditCard className="w-3 h-3" /> Collect
                          </button>
                        )}

                        {isPosted ? (
                          <span
                            className="px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-mono text-[10px] font-bold inline-flex items-center gap-1"
                            title={`Posted to Ledger: ${r.ledgerEntryId}`}
                          >
                            <CheckCircle2 className="w-3 h-3" /> Posted
                          </span>
                        ) : (
                          onPostRentalToLedger && (
                            <button
                              type="button"
                              onClick={() => onPostRentalToLedger(r)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-[10px] transition inline-flex items-center gap-1 cursor-pointer"
                              title="Post rental income once to financial ledger"
                            >
                              Post to Ledger
                            </button>
                          )
                        )}

                        <button
                          type="button"
                          onClick={() => openEditModal(r)}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                          title="Edit Outward Rental"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit Outward Rental Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-400/30 text-emerald-400">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-serif italic font-bold">
                    {editingRental
                      ? `Edit Outward Rental (${editingRental.contractRef})`
                      : 'Rent Out Company-Owned Vehicle'}
                  </h3>
                  <p className="text-xs text-slate-300">
                    External customer rental with automatic tour conflict detection and billable day audit trail
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-5 text-xs text-slate-900 max-h-[80vh] overflow-y-auto">
              {formError && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Scheduling Conflict Detection Banner */}
              {schedulingConflicts.length > 0 && (
                <div className="p-4 rounded-2xl bg-rose-50 border-2 border-rose-300 space-y-1.5">
                  <div className="flex items-center gap-2 text-rose-900 font-bold">
                    <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>Scheduling Conflict Detected ({schedulingConflicts.length})</span>
                  </div>
                  <ul className="list-disc pl-5 space-y-1 text-rose-800 text-[11px]">
                    {schedulingConflicts.map((c, idx) => (
                      <li key={idx}>{c}</li>
                    ))}
                  </ul>
                  <p className="text-[10px] text-rose-700 font-semibold pt-1">
                    Overlapping assignments between outward vehicle rentals and tour departures are blocked. Choose another vehicle, driver, or date range.
                  </p>
                </div>
              )}

              {/* Customer Details */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Customer Full Name *</label>
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="e.g. Tesfay Negash / UNDP Delegation"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-semibold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Customer Phone *</label>
                  <input
                    type="text"
                    required
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="+291 7 123456"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Passport / National ID</label>
                  <input
                    type="text"
                    value={customerPassportOrId}
                    onChange={(e) => setCustomerPassportOrId(e.target.value)}
                    placeholder="ER-ID / Passport No"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-mono"
                  />
                </div>
              </div>

              {/* Vehicle & Contract Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Select Company-Owned Vehicle *
                  </label>
                  <select
                    value={vehicleId}
                    onChange={(e) => setVehicleId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-semibold"
                  >
                    {companyVehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.plateNumber} — {v.name} ({v.model} · {v.status})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Rental Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as VehicleOutwardRental['status'])}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-semibold"
                  >
                    <option value="Reserved">Reserved (Upcoming)</option>
                    <option value="Active Outward">Active Outward (Dispatched)</option>
                    <option value="Returned">Returned &amp; Inspected</option>
                    <option value="Overdue Return">Overdue Return</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>
              </div>

              {/* Dates & Billable Days Formula Box */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="font-bold text-slate-900 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-emerald-700" />
                    Rental Dates &amp; Billable Days Calculation
                  </span>
                  <span className="text-[10px] font-mono bg-white px-2.5 py-1 rounded-full border border-slate-200 text-slate-700 font-semibold flex items-center gap-1">
                    <Info className="w-3 h-3 text-blue-600" />
                    Formula: Inclusive Calendar Days = (End Date − Start Date) + 1
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Start Date *</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Return Date *</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Calculated Inclusive Days
                    </label>
                    <div className="px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 font-mono font-bold text-slate-900">
                      {calculatedDays} Calendar Day(s)
                    </div>
                  </div>
                </div>

                {/* Authorized Override Toggle */}
                <div className="pt-2 border-t border-slate-200 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-amber-900">
                    <input
                      type="checkbox"
                      checked={billableDaysOverridden}
                      onChange={(e) => {
                        setBillableDaysOverridden(e.target.checked);
                        if (e.target.checked) setCustomBillableDays(calculatedDays);
                      }}
                      className="rounded text-amber-600"
                    />
                    <span>Authorized Override of Billable Days (Requires Recorded Reason)</span>
                  </label>

                  {billableDaysOverridden && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
                      <div>
                        <label className="block font-bold text-amber-950 mb-1">
                          Overridden Billable Days *
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="365"
                          value={customBillableDays}
                          onChange={(e) => setCustomBillableDays(Number(e.target.value) || 1)}
                          className="w-full px-3 py-1.5 rounded-lg bg-white border border-amber-300 font-mono font-bold"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block font-bold text-amber-950 mb-1">
                          Mandatory Override Reason (Audit Recorded) *
                        </label>
                        <input
                          type="text"
                          required={billableDaysOverridden}
                          value={billableDaysOverrideReason}
                          onChange={(e) => setBillableDaysOverrideReason(e.target.value)}
                          placeholder="e.g. Late evening pickup after 18:00 waived per contract"
                          className="w-full px-3 py-1.5 rounded-lg bg-white border border-amber-300"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Driver Inclusion & Rates */}
              <div className="p-4 rounded-2xl bg-blue-50/50 border border-blue-200 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 font-bold text-blue-950 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={driverIncluded}
                      onChange={(e) => setDriverIncluded(e.target.checked)}
                      className="rounded text-blue-600"
                    />
                    <span>Include Agency Chauffeur / Driver with Vehicle</span>
                  </label>
                  <span className="text-[10px] font-mono text-blue-800 bg-white px-2 py-0.5 rounded-full border border-blue-200">
                    Driver &amp; Dual-Role Eligible Staff Only
                  </span>
                </div>

                {driverIncluded && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Assigned Driver
                      </label>
                      <select
                        value={driverId}
                        onChange={(e) => {
                          setDriverId(e.target.value);
                          const emp = eligibleDrivers.find((d) => d.id === e.target.value);
                          if (emp?.perDiemRateUSD) setDriverDailyFeeUSD(emp.perDiemRateUSD);
                        }}
                        className="w-full px-3 py-2 rounded-xl bg-white border border-blue-200 font-semibold"
                      >
                        {eligibleDrivers.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.fullName} — {getEmployeeFieldRoleBadge(d)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Driver Daily Fee Charged (USD / Day)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={driverDailyFeeUSD}
                        onChange={(e) => setDriverDailyFeeUSD(Number(e.target.value) || 0)}
                        className="w-full px-3 py-2 rounded-xl bg-white border border-blue-200 font-mono font-bold"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Financial Rates & Payments */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Vehicle Daily Rate (USD)</label>
                  <input
                    type="number"
                    min="1"
                    value={dailyRateUSD}
                    onChange={(e) => setDailyRateUSD(Number(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Billing Currency</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as 'USD' | 'ERN')}
                    className="w-full px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-300 font-mono font-bold text-emerald-950"
                  >
                    <option value="ERN">ERN (Nakfa · Mandatory Car Rental)</option>
                    <option value="USD">USD ($ Equiv.)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Security Deposit (USD)</label>
                  <input
                    type="number"
                    min="0"
                    value={depositUSD}
                    onChange={(e) => setDepositUSD(Number(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Amount Paid Now (USD)</label>
                  <input
                    type="number"
                    min="0"
                    value={amountPaidUSD}
                    onChange={(e) => setAmountPaidUSD(Number(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 font-mono font-bold text-emerald-900"
                  />
                </div>
              </div>

              {/* Summary Footer */}
              <div className="p-4 rounded-2xl bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <span className="text-[10px] font-mono uppercase text-slate-400 block">
                    {effectiveBillableDays} Billable Day(s) × {(dailyRateUSD * 15).toLocaleString()} ERN/d (${dailyRateUSD}/d)
                    {driverIncluded ? ` + ${(driverDailyFeeUSD * 15).toLocaleString()} ERN/d Driver` : ''}
                  </span>
                  <div className="flex items-baseline gap-3 mt-0.5">
                    <span className="text-lg font-mono font-bold text-emerald-400">
                      Total: {(totalChargeUSD * 15).toLocaleString()} ERN (${totalChargeUSD.toLocaleString()} USD)
                    </span>
                    <span className="text-xs font-mono text-rose-300">
                      Balance Due: {(outstandingBalanceUSD * 15).toLocaleString()} ERN (${outstandingBalanceUSD.toLocaleString()} USD)
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black uppercase tracking-wider cursor-pointer flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Save Outward Contract
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Collect Customer Payment Modal */}
      {paymentRental && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-xs">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <h4 className="font-serif italic font-bold text-sm">
                Collect Outward Rental Balance ({paymentRental.contractRef})
              </h4>
              <button
                type="button"
                onClick={() => setPaymentRental(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleRecordPayment} className="p-5 space-y-4">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <div className="font-bold text-slate-900">{paymentRental.customerName}</div>
                <div className="text-slate-500 font-mono">
                  {paymentRental.vehicleName} ({paymentRental.vehiclePlateNumber})
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-200 font-mono">
                  <span>Total: ${paymentRental.totalChargeUSD}</span>
                  <span className="font-bold text-rose-700">
                    Outstanding: ${paymentRental.outstandingBalanceUSD}
                  </span>
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Amount Collected (USD) *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  max={paymentRental.outstandingBalanceUSD}
                  value={paymentAddUSD}
                  onChange={(e) => setPaymentAddUSD(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold text-emerald-800 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPaymentRental(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
                >
                  Record Receipt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
