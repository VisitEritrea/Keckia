import React from 'react';
import {
  X,
  User,
  Plane,
  Building,
  DollarSign,
  Compass,
  Truck,
  Heart,
  Utensils,
  MapPin,
  Calendar,
  ShieldCheck,
  Phone,
  Mail,
  HelpCircle,
} from 'lucide-react';
import { FeedTraveler, FeedEvent } from '../../types';

interface TravelerDossierModalProps {
  traveler: FeedTraveler | null;
  linkedEvents?: FeedEvent[];
  onClose: () => void;
}

export const TravelerDossierModal: React.FC<TravelerDossierModalProps> = ({
  traveler,
  linkedEvents = [],
  onClose,
}) => {
  if (!traveler) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col font-sans text-slate-900 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 bg-slate-50/50 flex items-start justify-between">
          <div className="flex items-center gap-4">
            <img
              src={
                traveler.avatar ||
                'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'
              }
              alt={traveler.name}
              className="w-14 h-14 rounded-2xl object-cover ring-2 ring-white shadow-xs"
            />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-serif font-bold text-slate-950">{traveler.name}</h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-900 text-white font-bold">
                  {traveler.bookingStage || 'Recorded'}
                </span>
                {traveler.confirmedStatus ? (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-200">
                    {traveler.confirmedStatus}
                  </span>
                ) : (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                    Status: Unspecified
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500 font-mono mt-0.5 flex items-center gap-2">
                <span>{traveler.nationality || 'Nationality Unknown'}</span>
                <span>·</span>
                <span>ID: {traveler.id}</span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition cursor-pointer"
            aria-label="Close dossier"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs text-slate-700 bg-white">
          {/* Quick Contact & Channel bar */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3 font-mono text-[11px]">
            <span className="flex items-center gap-1.5 text-slate-800">
              <Mail className="w-3.5 h-3.5 text-slate-400" />
              {traveler.email ? traveler.email : <span className="text-slate-400 italic">Email Unknown</span>}
            </span>
            <span className="flex items-center gap-1.5 text-slate-800">
              <Phone className="w-3.5 h-3.5 text-slate-400" />
              {traveler.phone ? traveler.phone : <span className="text-slate-400 italic">Phone Unknown</span>}
            </span>
            {traveler.whatsapp ? (
              <span className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                WhatsApp: {traveler.whatsapp}
              </span>
            ) : (
              <span className="text-slate-400 italic text-[10px]">No WhatsApp recorded</span>
            )}
          </div>

          {/* 1. Itinerary & Interests */}
          <div className="space-y-2">
            <h3 className="font-serif font-bold text-slate-950 text-sm flex items-center gap-1.5">
              <Compass className="w-4 h-4 text-brand-600" /> Itinerary & Route
            </h3>
            <p className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 leading-relaxed text-slate-800 font-medium">
              {traveler.itinerarySummary || (
                <span className="text-slate-400 italic font-normal">
                  No itinerary summary provided in loaded record.
                </span>
              )}
            </p>
            {traveler.interests && traveler.interests.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {traveler.interests.map((interest, i) => (
                  <span
                    key={i}
                    className="text-[10px] font-medium px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1"
                  >
                    <Heart className="w-2.5 h-2.5 text-rose-500" /> {interest}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 2. Flight Operations & Airport Timings */}
          <div className="space-y-2">
            <h3 className="font-serif font-bold text-slate-950 text-sm flex items-center gap-1.5">
              <Plane className="w-4 h-4 text-blue-600" /> Flight Operations & Airport Timings
            </h3>
            {traveler.flightDetails ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-1">
                  <div className="text-[10px] font-mono uppercase font-bold text-emerald-900">
                    Arrival Leg (Inbound)
                  </div>
                  <div className="text-sm font-bold text-slate-900 font-mono">
                    {traveler.flightDetails.arrivalFlight || <span className="text-slate-500 font-normal">Flight not specified</span>}
                  </div>
                  <div className="text-xs text-slate-600">
                    Airport: {traveler.flightDetails.arrivalAirport || 'ASM'} · Time:{' '}
                    {traveler.flightDetails.arrivalTime || 'Unknown'}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-rose-50/70 border border-rose-200 space-y-1">
                  <div className="text-[10px] font-mono uppercase font-bold text-rose-900">
                    Departure Leg (Outbound)
                  </div>
                  <div className="text-sm font-bold text-slate-900 font-mono">
                    {traveler.flightDetails.departureFlight || <span className="text-slate-500 font-normal">Flight not specified</span>}
                  </div>
                  <div className="text-xs text-slate-600">
                    Airport: {traveler.flightDetails.departureAirport || 'ASM'} · Time:{' '}
                    {traveler.flightDetails.departureTime || 'Unknown'}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 text-xs flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-slate-400 shrink-0" />
                <span>Flight details: Unknown / Not provided in loaded feed.</span>
              </div>
            )}
          </div>

          {/* 3. Lodging & Dietary Requirements */}
          <div className="space-y-2">
            <h3 className="font-serif font-bold text-slate-950 text-sm flex items-center gap-1.5">
              <Building className="w-4 h-4 text-purple-600" /> Lodging & Dietary Requirements
            </h3>
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Reserved Accommodations:</span>
                <span className="font-bold text-slate-900">
                  {traveler.hotelDetails?.hotelName || <span className="text-slate-400 font-normal italic">Unknown / Unassigned</span>}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Room Category:</span>
                <span className="font-mono text-slate-800">
                  {traveler.hotelDetails?.roomType || <span className="text-slate-400 italic">Not specified</span>}
                </span>
              </div>
              {traveler.mealRequirements ? (
                <div className="pt-2 border-t border-slate-200 flex items-start gap-2">
                  <Utensils className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-900">Meal Plan / Dietary: </span>
                    <span className="text-slate-700">{traveler.mealRequirements}</span>
                  </div>
                </div>
              ) : (
                <div className="pt-1.5 text-[11px] text-slate-400 italic">
                  Dietary requirements: None recorded
                </div>
              )}
            </div>
          </div>

          {/* 4. Visa & Consular Clearances */}
          <div className="space-y-2">
            <h3 className="font-serif font-bold text-slate-950 text-sm flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" /> Visa & Consular Clearances
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] font-mono uppercase text-slate-400 block">Visa Status</span>
                <span className="text-xs font-bold text-slate-800 block mt-1">
                  {traveler.visaStatus || 'Unknown'}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] font-mono uppercase text-slate-400 block">Payment</span>
                <span className="text-xs font-bold text-emerald-700 block mt-1">
                  {traveler.paymentStatus || 'Unknown'}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] font-mono uppercase text-slate-400 block">Fee Collected</span>
                <span className="text-xs font-bold text-slate-900 block mt-1 font-mono">
                  {traveler.amountPaid !== undefined ? `$${traveler.amountPaid}` : 'Unknown'}
                </span>
              </div>
            </div>
          </div>

          {/* 5. Guide & Driver Field Logistics */}
          <div className="space-y-2">
            <h3 className="font-serif font-bold text-slate-950 text-sm flex items-center gap-1.5">
              <Truck className="w-4 h-4 text-slate-800" /> Field Logistics: Guide & Driver Assignments
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <div className="text-[10px] font-mono uppercase font-bold text-slate-500">
                  Lead Tour Guide
                </div>
                <div className="font-bold text-slate-900 text-xs">
                  {traveler.guideAssignment?.name || <span className="text-slate-400 font-normal italic">Unassigned guide</span>}
                </div>
                <div className="text-[11px] text-slate-500 font-mono">
                  Phone: {traveler.guideAssignment?.phone || <span className="text-slate-400 italic">None</span>}
                </div>
                <div className="text-[11px] text-slate-600 pt-1">
                  Lodging: {traveler.guideAssignment?.lodging || <span className="text-slate-400 italic">Not recorded</span>}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <div className="text-[10px] font-mono uppercase font-bold text-slate-500">
                  Assigned Driver & Vehicle
                </div>
                <div className="font-bold text-slate-900 text-xs">
                  {traveler.driverAssignment?.name || <span className="text-slate-400 font-normal italic">Unassigned driver</span>}
                </div>
                <div className="text-[11px] text-slate-500 font-mono">
                  Vehicle: {traveler.driverAssignment?.vehicle || <span className="text-slate-400 italic">None</span>}
                </div>
                <div className="text-[11px] text-slate-600 pt-1">
                  Driver Lodging: {traveler.driverAssignment?.lodging || <span className="text-slate-400 italic">Not recorded</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          {traveler.notes && (
            <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 text-xs text-amber-950">
              <span className="font-bold block mb-0.5">Special Care & Field Notes:</span>
              {traveler.notes}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <span className="text-[11px] font-mono text-slate-500">
            Dossier synchronized with Operations Hub
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition cursor-pointer"
          >
            Close Dossier
          </button>
        </div>
      </div>
    </div>
  );
};
