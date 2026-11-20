import React, { useState, useMemo } from 'react';
import {
  FileText,
  Search,
  Filter,
  ExternalLink,
  Eye,
  FileWarning,
  Paperclip,
  Calendar,
  User,
  Briefcase,
  Building,
  Plane,
  ShieldCheck,
  Receipt,
  CheckCircle2,
  X,
} from 'lucide-react';
import {
  Ticket,
  HotelReservation,
  HotelLetterDoc,
  RentalLetterDoc,
  VisaOnArrivalDoc,
  RegionalPermitDoc,
  FinancialInvoice,
  ExpenseReceipt,
  Booking,
  TourBooking,
  TouristProfile,
  Hotel,
} from '../../types';
import { HotelVoucherModal } from '../hotels/HotelVoucherModal';

export type IndexedDocumentType =
  | 'Ticket'
  | 'Hotel Voucher'
  | 'Hotel Letter'
  | 'Rental Letter'
  | 'Visa on Arrival (VoA)'
  | 'Regional Travel Permit'
  | 'Invoice'
  | 'Receipt';

export interface IndexedDocumentItem {
  id: string;
  docType: IndexedDocumentType;
  referenceCode: string;
  title: string;
  date: string;
  travelerName: string;
  travelerId?: string;
  bookingRef: string;
  originatingModule: 'ticketing' | 'hotels' | 'transport' | 'documents' | 'finance';
  moduleLabel: string;
  status: string;
  hasBinaryAttachment: boolean;
  binaryAttachmentUrl?: string;
  rawRecord: any;
}

interface CentralDocumentIndexPanelProps {
  tickets?: Ticket[];
  reservations?: HotelReservation[];
  hotelLetters?: HotelLetterDoc[];
  rentalLetters?: RentalLetterDoc[];
  visaDocs?: VisaOnArrivalDoc[];
  permits?: RegionalPermitDoc[];
  invoices?: FinancialInvoice[];
  receipts?: ExpenseReceipt[];
  bookings?: Booking[];
  tourBookings?: TourBooking[];
  tourists?: TouristProfile[];
  hotels?: Hotel[];
  onOpenVoaPreview?: (doc: VisaOnArrivalDoc) => void;
  onOpenPermitPreview?: (permit: RegionalPermitDoc) => void;
  onNavigateToModule?: (moduleTab: string) => void;
}

export const CentralDocumentIndexPanel: React.FC<CentralDocumentIndexPanelProps> = ({
  tickets = [],
  reservations = [],
  hotelLetters = [],
  rentalLetters = [],
  visaDocs = [],
  permits = [],
  invoices = [],
  receipts = [],
  bookings = [],
  tourBookings = [],
  hotels = [],
  onOpenVoaPreview,
  onOpenPermitPreview,
  onNavigateToModule,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [travelerFilter, setTravelerFilter] = useState<string>('all');
  const [bookingFilter, setBookingFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  const [activeVoucherModal, setActiveVoucherModal] = useState<HotelReservation | null>(null);
  const [inspectingRecord, setInspectingRecord] = useState<IndexedDocumentItem | null>(null);

  const indexedDocs = useMemo<IndexedDocumentItem[]>(() => {
    const list: IndexedDocumentItem[] = [];

    // 1. Flight Tickets
    tickets.forEach((t) => {
      const linkedBooking = bookings.find(
        (b) => b.id === t.bookingId || b.pnr === t.pnr
      );
      list.push({
        id: `idx-tkt-${t.id}`,
        docType: 'Ticket',
        referenceCode: t.ticketNumber || t.pnr || t.id,
        title: `${t.airline} Flight ${t.flightNumber} (${t.origin} → ${t.destination})`,
        date: (t.issuedAt || t.departureTime || '').slice(0, 10),
        travelerName: t.passengerName || linkedBooking?.touristName || 'Passenger',
        travelerId: linkedBooking?.touristId,
        bookingRef: t.pnr || linkedBooking?.pnr || t.bookingId || 'Direct Issue',
        originatingModule: 'ticketing',
        moduleLabel: 'Flights & Ticketing Desk',
        status: t.status || 'Issued',
        hasBinaryAttachment: false,
        rawRecord: t,
      });
    });

    // 2. Hotel Vouchers (Reservations)
    reservations.forEach((r) => {
      list.push({
        id: `idx-res-${r.id}`,
        docType: 'Hotel Voucher',
        referenceCode: r.confirmationCode || r.id,
        title: `${r.hotelName} — ${r.roomTypeName} (${r.numberOfNights}n)`,
        date: r.voucherIssuedAt || r.checkInDate || '',
        travelerName: r.touristName || 'Hotel Guest',
        travelerId: r.touristId,
        bookingRef: r.tourPackageTitle || r.confirmationCode || 'Hotel Booking',
        originatingModule: 'hotels',
        moduleLabel: 'Hotels & Lodging',
        status: r.paymentStatus || 'Confirmed',
        hasBinaryAttachment: false,
        rawRecord: r,
      });
    });

    // 3. Official Tigrinya Hotel Letters
    hotelLetters.forEach((l) => {
      const guestNames = (l.guests || []).map((g) => g.name).join(', ');
      list.push({
        id: `idx-hltr-${l.id}`,
        docType: 'Hotel Letter',
        referenceCode: l.refNumber || l.id,
        title: `${l.hotelName} (${l.subjectTigrinya})`,
        date: l.date || '',
        travelerName: guestNames || 'Tour Group Manifest',
        bookingRef: l.tourPackageTitle || l.refNumber || 'Group Lodging',
        originatingModule: 'hotels',
        moduleLabel: 'Hotels & Lodging',
        status: l.status || 'Dispatched',
        hasBinaryAttachment: false,
        rawRecord: l,
      });
    });

    // 4. Vehicle / Boat Rental Requisition Letters
    rentalLetters.forEach((rl) => {
      list.push({
        id: `idx-rltr-${rl.id}`,
        docType: 'Rental Letter',
        referenceCode: rl.refNumber || rl.id,
        title: `${rl.rentalCompanyName} (${rl.subjectTigrinya})`,
        date: rl.date || '',
        travelerName: rl.driverOrCoordinatorName || 'Fleet Operations',
        bookingRef: rl.tourPackageTitle || rl.refNumber || 'Fleet Charter',
        originatingModule: 'transport',
        moduleLabel: 'Transport Fleet & Charters',
        status: rl.status || 'Dispatched',
        hasBinaryAttachment: false,
        rawRecord: rl,
      });
    });

    // 5. Visa on Arrival (VoA) Letters
    visaDocs.forEach((v) => {
      list.push({
        id: `idx-voa-${v.id}`,
        docType: 'Visa on Arrival (VoA)',
        referenceCode: v.referenceNumber || v.docNumber || v.id,
        title: `VoA Sponsorship — ${v.entryPort}`,
        date: v.letterDate || v.generatedAt || v.arrivalDate || '',
        travelerName: v.touristName || 'Sponsored Traveler',
        travelerId: v.touristId,
        bookingRef: v.tourPackageTitle || v.tourScheduleId || v.docNumber,
        originatingModule: 'documents',
        moduleLabel: 'Consular VoA & Permits',
        status: v.issuanceStatus || 'Approved',
        hasBinaryAttachment: false,
        rawRecord: v,
      });
    });

    // 6. Regional Travel Permits
    permits.forEach((p) => {
      list.push({
        id: `idx-pmt-${p.id}`,
        docType: 'Regional Travel Permit',
        referenceCode: p.referenceNumber || p.permitNumber || p.id,
        title: `Regional Permit — ${p.zoneName}`,
        date: p.letterDate || p.issuedAt || p.validFrom || '',
        travelerName: (p.touristNames || []).join(', ') || 'Permit Manifest',
        bookingRef: p.tourPackageTitle || p.tourScheduleId || p.permitNumber,
        originatingModule: 'documents',
        moduleLabel: 'Consular VoA & Permits',
        status: p.status || 'Active',
        hasBinaryAttachment: false,
        rawRecord: p,
      });
    });

    // 7. Financial Invoices
    invoices.forEach((inv) => {
      list.push({
        id: `idx-inv-${inv.id}`,
        docType: 'Invoice',
        referenceCode: inv.invoiceNumber || inv.id,
        title: `${inv.serviceType} Invoice ($${inv.totalUSD.toLocaleString()} USD)`,
        date: inv.issueDate || '',
        travelerName: inv.clientName || 'Client',
        bookingRef: inv.bookingReference || inv.invoiceNumber || 'Direct Invoice',
        originatingModule: 'finance',
        moduleLabel: 'Finance & Accounting',
        status: inv.status || 'Issued',
        hasBinaryAttachment: false,
        rawRecord: inv,
      });
    });

    // 8. Expense Receipts
    receipts.forEach((rec) => {
      const hasFile = Boolean(
        rec.receiptUrl &&
          (rec.receiptUrl.startsWith('data:') || rec.receiptUrl.startsWith('http'))
      );
      list.push({
        id: `idx-rec-${rec.id}`,
        docType: 'Receipt',
        referenceCode: rec.receiptNumber || rec.id,
        title: `${rec.vendorName} — ${rec.category} ($${rec.amountUSD.toLocaleString()} USD)`,
        date: rec.date || '',
        travelerName: rec.submittedBy || rec.vendorName || 'Vendor',
        bookingRef: rec.linkedTransactionId || rec.receiptNumber || 'Expense Voucher',
        originatingModule: 'finance',
        moduleLabel: 'Finance & Accounting',
        status: rec.verificationStatus || 'Verified',
        hasBinaryAttachment: hasFile,
        binaryAttachmentUrl: hasFile ? rec.receiptUrl : undefined,
        rawRecord: rec,
      });
    });

    return list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [
    tickets,
    reservations,
    hotelLetters,
    rentalLetters,
    visaDocs,
    permits,
    invoices,
    receipts,
    bookings,
  ]);

  const distinctTravelers = useMemo(() => {
    const s = new Set<string>();
    indexedDocs.forEach((d) => {
      if (d.travelerName) s.add(d.travelerName);
    });
    return Array.from(s).sort();
  }, [indexedDocs]);

  const distinctBookings = useMemo(() => {
    const s = new Set<string>();
    indexedDocs.forEach((d) => {
      if (d.bookingRef) s.add(d.bookingRef);
    });
    tourBookings.forEach((tb) => {
      if (tb.packageTitle) s.add(tb.packageTitle);
    });
    return Array.from(s).sort();
  }, [indexedDocs, tourBookings]);

  const filteredDocs = useMemo(() => {
    return indexedDocs.filter((d) => {
      if (selectedType !== 'all' && d.docType !== selectedType) return false;
      if (travelerFilter !== 'all' && d.travelerName !== travelerFilter) return false;
      if (bookingFilter !== 'all' && d.bookingRef !== bookingFilter) return false;
      if (dateFrom && d.date && d.date < dateFrom) return false;
      if (dateTo && d.date && d.date > dateTo) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          d.referenceCode.toLowerCase().includes(q) ||
          d.title.toLowerCase().includes(q) ||
          d.travelerName.toLowerCase().includes(q) ||
          d.bookingRef.toLowerCase().includes(q) ||
          d.moduleLabel.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [
    indexedDocs,
    selectedType,
    travelerFilter,
    bookingFilter,
    dateFrom,
    dateTo,
    searchQuery,
  ]);

  const docTypes: IndexedDocumentType[] = [
    'Ticket',
    'Hotel Voucher',
    'Hotel Letter',
    'Rental Letter',
    'Visa on Arrival (VoA)',
    'Regional Travel Permit',
    'Invoice',
    'Receipt',
  ];

  return (
    <div className="space-y-6">
      {/* Summary KPI Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {docTypes.map((dt) => {
          const count = indexedDocs.filter((d) => d.docType === dt).length;
          const isActive = selectedType === dt;
          return (
            <button
              key={dt}
              type="button"
              onClick={() => setSelectedType(isActive ? 'all' : dt)}
              className={`p-3.5 rounded-2xl border text-left transition cursor-pointer ${
                isActive
                  ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                  : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span
                className={`text-[10px] font-mono uppercase font-bold block truncate ${
                  isActive ? 'text-amber-300' : 'text-slate-500'
                }`}
              >
                {dt}
              </span>
              <span className="text-xl font-mono font-bold mt-1 block">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Filter Bar */}
      <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-serif italic font-bold text-slate-900">
              Central Operational Documents Workspace ({filteredDocs.length} Indexed Records)
            </h3>
            <p className="text-xs text-slate-500">
              Unified index across Tickets, Hotel Vouchers, Tigrinya Letters, VoA Sponsorships, Regional Permits, Invoices, and Receipts.
              Records without binary attachments are explicitly labeled as Structured System Records.
            </p>
          </div>
          {selectedType !== 'all' ||
          travelerFilter !== 'all' ||
          bookingFilter !== 'all' ||
          dateFrom ||
          dateTo ||
          searchQuery ? (
            <button
              type="button"
              onClick={() => {
                setSelectedType('all');
                setTravelerFilter('all');
                setBookingFilter('all');
                setDateFrom('');
                setDateTo('');
                setSearchQuery('');
              }}
              className="px-3.5 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer self-start"
            >
              Reset Filters
            </button>
          ) : null}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ref, traveler, booking..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-medium text-slate-900"
            />
          </div>

          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-semibold text-slate-800"
          >
            <option value="all">All Document Types ({indexedDocs.length})</option>
            {docTypes.map((dt) => (
              <option key={dt} value={dt}>
                {dt}
              </option>
            ))}
          </select>

          <select
            value={travelerFilter}
            onChange={(e) => setTravelerFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-semibold text-slate-800"
          >
            <option value="all">All Travelers / Clients</option>
            {distinctTravelers.map((tr) => (
              <option key={tr} value={tr}>
                {tr}
              </option>
            ))}
          </select>

          <select
            value={bookingFilter}
            onChange={(e) => setBookingFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-semibold text-slate-800"
          >
            <option value="all">All Linked Bookings / Tours</option>
            {distinctBookings.map((bk) => (
              <option key={bk} value={bk}>
                {bk}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              title="From Date"
              className="w-1/2 px-2 py-2 rounded-xl bg-slate-50 border border-slate-200 font-mono text-[11px]"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              title="To Date"
              className="w-1/2 px-2 py-2 rounded-xl bg-slate-50 border border-slate-200 font-mono text-[11px]"
            />
          </div>
        </div>

        {/* Documents Index Table */}
        {filteredDocs.length === 0 ? (
          <div className="p-10 text-center rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
            <FileText className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-sm font-serif italic font-bold text-slate-700">
              No Matching Document Records Found
            </p>
            <p className="text-xs text-slate-500">
              Try clearing active filters or generate a document in the respective operational desk.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white font-mono text-[11px]">
                  <th className="py-3 px-3.5">Type &amp; Reference</th>
                  <th className="py-3 px-3.5">Document Title</th>
                  <th className="py-3 px-3.5">Traveler / Party</th>
                  <th className="py-3 px-3.5">Linked Booking / Tour</th>
                  <th className="py-3 px-3.5">Originating Module</th>
                  <th className="py-3 px-3.5">Date</th>
                  <th className="py-3 px-3.5">File / Storage Availability</th>
                  <th className="py-3 px-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredDocs.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-3.5">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 font-bold text-[10px] text-slate-800 block w-fit">
                        {item.docType}
                      </span>
                      <span className="font-mono font-bold text-blue-900 text-[11px] mt-1 block">
                        {item.referenceCode}
                      </span>
                    </td>

                    <td className="py-3 px-3.5 font-semibold text-slate-900 max-w-xs">
                      <div className="truncate">{item.title}</div>
                      <span className="text-[10px] font-mono text-emerald-700">
                        Status: {item.status}
                      </span>
                    </td>

                    <td className="py-3 px-3.5 font-medium text-slate-800">
                      {item.travelerName}
                    </td>

                    <td className="py-3 px-3.5">
                      <button
                        type="button"
                        onClick={() => setBookingFilter(item.bookingRef)}
                        className="font-mono text-[11px] font-semibold text-amber-900 bg-amber-50 hover:bg-amber-100 px-2 py-0.5 rounded border border-amber-200 cursor-pointer"
                        title="Filter all documents for this booking"
                      >
                        {item.bookingRef}
                      </button>
                    </td>

                    <td className="py-3 px-3.5">
                      <span className="text-[11px] text-slate-600 font-medium">
                        {item.moduleLabel}
                      </span>
                    </td>

                    <td className="py-3 px-3.5 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                      {item.date || '—'}
                    </td>

                    <td className="py-3 px-3.5">
                      {item.hasBinaryAttachment ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-bold">
                          <Paperclip className="w-3 h-3" /> Attached File Available
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-[10px] font-medium"
                          title="This record is stored as structured operational metadata; no binary scan/PDF was uploaded."
                        >
                          <FileWarning className="w-3 h-3 text-amber-600" /> Structured Record (No Binary File)
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-3.5 text-right whitespace-nowrap space-x-1.5">
                      {item.docType === 'Visa on Arrival (VoA)' && onOpenVoaPreview && (
                        <button
                          type="button"
                          onClick={() => onOpenVoaPreview(item.rawRecord)}
                          className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] cursor-pointer inline-flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3" /> Open VoA Preview
                        </button>
                      )}

                      {item.docType === 'Regional Travel Permit' && onOpenPermitPreview && (
                        <button
                          type="button"
                          onClick={() => onOpenPermitPreview(item.rawRecord)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-[10px] cursor-pointer inline-flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3" /> Open Permit Preview
                        </button>
                      )}

                      {item.docType === 'Hotel Voucher' && (
                        <button
                          type="button"
                          onClick={() => setActiveVoucherModal(item.rawRecord)}
                          className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] cursor-pointer inline-flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3" /> Open Voucher
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setInspectingRecord(item)}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-[10px] cursor-pointer inline-flex items-center gap-1"
                      >
                        Inspect Record
                      </button>

                      {onNavigateToModule && (
                        <button
                          type="button"
                          onClick={() => onNavigateToModule(item.originatingModule)}
                          className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-[10px] cursor-pointer inline-flex items-center gap-1"
                          title={`Open ${item.moduleLabel}`}
                        >
                          <ExternalLink className="w-3 h-3" /> Module
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Hotel Voucher Modal */}
      {activeVoucherModal && (
        <HotelVoucherModal
          reservation={activeVoucherModal}
          hotel={hotels.find((h) => h.id === activeVoucherModal.hotelId)}
          onClose={() => setActiveVoucherModal(null)}
        />
      )}

      {/* Structured Record Inspector Modal */}
      {inspectingRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-xs">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono uppercase text-amber-300 block">
                  {inspectingRecord.docType} · {inspectingRecord.moduleLabel}
                </span>
                <h4 className="font-serif italic font-bold text-sm">
                  {inspectingRecord.referenceCode} — {inspectingRecord.title}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setInspectingRecord(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <span className="text-[10px] font-mono text-slate-400 uppercase block">
                    Traveler / Party
                  </span>
                  <span className="font-bold text-slate-900">{inspectingRecord.travelerName}</span>
                </div>
                <div>
                  <span className="text-[10px] font-mono text-slate-400 uppercase block">
                    Linked Booking / Reference
                  </span>
                  <span className="font-mono font-bold text-blue-900">
                    {inspectingRecord.bookingRef}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-mono text-slate-400 uppercase block">
                    Document Date
                  </span>
                  <span className="font-mono text-slate-800">{inspectingRecord.date || '—'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-mono text-slate-400 uppercase block">
                    Binary Attachment Status
                  </span>
                  <span className="font-semibold text-slate-800">
                    {inspectingRecord.hasBinaryAttachment
                      ? 'Uploaded Binary Attachment Present'
                      : 'No Binary File Uploaded (Structured Database Record)'}
                  </span>
                </div>
              </div>

              {inspectingRecord.hasBinaryAttachment && inspectingRecord.binaryAttachmentUrl && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2">
                  <span className="font-bold text-emerald-900 block">Attached Scan / Image</span>
                  <img
                    src={inspectingRecord.binaryAttachmentUrl}
                    alt={inspectingRecord.referenceCode}
                    className="max-h-64 rounded-lg border border-emerald-200 object-contain mx-auto"
                  />
                </div>
              )}

              <div>
                <span className="text-[10px] font-mono uppercase text-slate-400 font-bold block mb-1">
                  Structured Record Fields
                </span>
                <pre className="p-3 rounded-xl bg-slate-900 text-slate-100 font-mono text-[11px] overflow-x-auto">
                  {JSON.stringify(inspectingRecord.rawRecord, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
