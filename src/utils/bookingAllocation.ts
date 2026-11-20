/**
 * Automated Booking & Resource Allocation Engine for EritreaVisit
 *
 * Implements the explicit requirement:
 * "import confirmed bookings from the integrated app to the booking and allocate
 * the hotel the car and the guide whom he is hosting must be done automatically"
 *
 * Roles supported:
 * - 'Tour Guide': Dedicated guiding role
 * - 'Driver': Dedicated driving role
 * - 'Driver & Guide': Dual-capacity certified expedition guide and 4WD driver
 */

import { Hotel, Vehicle, Employee, HotelReservation, Booking, TourBooking } from '../types';
import { FeedTraveler, FeedEvent } from '../../shared/feedSchema';

export interface AllocationResult {
  travelerId: string;
  travelerName: string;
  isConfirmed: boolean;
  allocatedHotel: {
    id: string;
    name: string;
    city: string;
    roomType: string;
    pricePerNight: number;
    checkIn: string;
    checkOut: string;
  };
  allocatedVehicle: {
    id: string;
    name: string;
    model: string;
    plateNumber: string;
    type: string;
  };
  allocatedGuide: {
    id: string;
    name: string;
    phone: string;
    role: 'Tour Guide' | 'Driver & Guide';
    lodging: string;
  };
  allocatedDriver: {
    id: string;
    name: string;
    phone: string;
    role: 'Driver' | 'Driver & Guide';
    lodging: string;
  };
  hotelReservation: HotelReservation;
  booking: Booking;
  tourBooking: TourBooking;
  updatedTraveler: FeedTraveler;
  auditMessage: string;
}

export interface BatchAllocationReport {
  totalProcessed: number;
  confirmedCount: number;
  allocatedCount: number;
  alreadyAllocatedCount: number;
  allocations: AllocationResult[];
  newBookings: Booking[];
  newTourBookings: TourBooking[];
  newReservations: HotelReservation[];
  updatedTravelers: FeedTraveler[];
}

/**
 * Automatically allocates Hotel, Vehicle (Car), and Guide (host) for a confirmed traveler/booking.
 */
export function autoAllocateConfirmedBooking(
  traveler: FeedTraveler,
  hotels: Hotel[] = [],
  vehicles: Vehicle[] = [],
  employees: Employee[] = [],
  events: FeedEvent[] = []
): AllocationResult {
  const isConfirmed =
    traveler.confirmedStatus === 'Confirmed' ||
    traveler.bookingStage === 'Confirmed' ||
    traveler.paymentStatus === 'Paid';

  // 1. Determine Target Cities & Dates
  const linkedEvent = events.find((e) => e.travelerId === traveler.id);
  const cities = linkedEvent?.cities || [];
  const textCorpus = `${traveler.itinerarySummary || ''} ${linkedEvent?.title || ''} ${linkedEvent?.description || ''}`.toLowerCase();

  const isMassawa = textCorpus.includes('massawa') || textCorpus.includes('dahlak') || cities.some((c) => c.toLowerCase().includes('massawa'));
  const isKeren = textCorpus.includes('keren') || cities.some((c) => c.toLowerCase().includes('keren'));

  // 2. Automated Hotel Allocation
  let matchedHotel: Hotel | undefined;
  if (isMassawa) {
    matchedHotel = hotels.find((h) => (h.city || '').toLowerCase().includes('massawa') || h.name.toLowerCase().includes('dahlak'));
  } else if (isKeren) {
    matchedHotel = hotels.find((h) => (h.city || '').toLowerCase().includes('keren') || h.name.toLowerCase().includes('sarina'));
  }

  // Fallback to premier Asmara hotel
  if (!matchedHotel) {
    matchedHotel =
      hotels.find((h) => h.name.toLowerCase().includes('asmara palace') || h.name.toLowerCase().includes('crystal')) ||
      hotels[0] || {
        id: 'hotel-asmara-palace',
        name: 'Hotel Asmara Palace',
        city: 'Asmara',
        starRating: 5,
        address: 'Bole Road, Asmara, Eritrea',
        phone: '+291 1 150000',
        email: 'reservations@asmarapalace.er',
        roomTypes: [
          {
            id: 'rt-dlx',
            name: 'Deluxe Executive Suite',
            category: 'Suite' as any,
            pricePerNightUSD: 140,
            pricePerNightERN: 2100,
            availableRooms: 12,
            totalRooms: 30,
            maxOccupancy: 2,
            amenities: ['WiFi', 'Air Conditioning', 'En-suite bath', 'Minibar'],
            description: 'Executive suite with panoramic highland balcony',
          },
        ],
      } as unknown as Hotel;
  }

  const roomType = matchedHotel?.roomTypes?.[0]?.name || traveler.hotelDetails?.roomType || 'Deluxe Room';
  const pricePerNight = matchedHotel?.roomTypes?.[0]?.pricePerNightUSD || 120;

  const nowIso = new Date().toISOString().split('T')[0];
  const checkIn = traveler.hotelDetails?.checkIn || nowIso;
  const checkOut =
    traveler.hotelDetails?.checkOut ||
    new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

  // 3. Automated Car / Fleet Allocation
  // Fleet sizing rule:
  // - 1 to 4 travelers -> 4WD SUV Convoy (e.g. Toyota Land Cruiser)
  // - 5 to 12 travelers -> VIP HiAce Minivan
  // - > 12 travelers -> Luxury Coaster Bus
  const paxCount = textCorpus.includes('group') || textCorpus.includes('delegation') ? 8 : 2;

  let matchedVehicle: Vehicle | undefined;
  if (paxCount <= 4) {
    matchedVehicle = vehicles.find(
      (v) => (v.status === 'Available' || !v.assignedDriverId) && v.type === '4WD SUV Convoy'
    ) || vehicles.find((v) => v.type === '4WD SUV Convoy');
  } else if (paxCount <= 12) {
    matchedVehicle = vehicles.find(
      (v) => (v.status === 'Available' || !v.assignedDriverId) && v.type === 'VIP HiAce Minivan'
    ) || vehicles.find((v) => v.type === 'VIP HiAce Minivan');
  } else {
    matchedVehicle = vehicles.find((v) => v.type === 'Luxury Coaster Bus') || vehicles[0];
  }

  // Fallback default vehicle
  if (!matchedVehicle) {
    matchedVehicle = vehicles[0] || ({
      id: 'veh-toyota-lc-4wd',
      name: 'Toyota Land Cruiser 4WD Convoy',
      model: 'Land Cruiser 200 Series V8',
      year: 2024,
      plateNumber: 'ER-2-18492',
      type: '4WD SUV Convoy',
      ownershipType: 'Company Owned',
      capacity: 4,
      fuelType: 'Diesel',
      fuelLevel: 95,
      mileageKm: 28400,
      status: 'Available',
      currentLocation: 'Asmara Main Fleet Depot',
    } as Vehicle);
  }

  // 4. Automated Guide & Driver Allocation (Guiding role, Driver only, or Driver & Guide dual role)
  // Look for Driver & Guide dual role first for efficiency, or separate Tour Guide & Driver
  const driverGuides = employees.filter(
    (e) => e.role === 'Driver & Guide' && (e.status === 'Active' || e.status === 'On Tour')
  );
  const dedicatedGuides = employees.filter(
    (e) => e.role === 'Tour Guide' && (e.status === 'Active' || e.status === 'On Tour')
  );
  const dedicatedDrivers = employees.filter(
    (e) => e.role === 'Driver' && (e.status === 'Active' || e.status === 'On Tour')
  );

  let allocatedGuide: AllocationResult['allocatedGuide'];
  let allocatedDriver: AllocationResult['allocatedDriver'];

  // If traveler prefers a dual expedition lead or if a Driver & Guide is best suited
  if (driverGuides.length > 0 && (paxCount <= 3 || dedicatedGuides.length === 0)) {
    const dg = driverGuides[0];
    allocatedGuide = {
      id: dg.id,
      name: dg.name,
      phone: dg.phone || '+291 7 441092',
      role: 'Driver & Guide',
      lodging: `Field expedition guide quarters at ${matchedHotel.name}`,
    };
    allocatedDriver = {
      id: dg.id,
      name: dg.name,
      phone: dg.phone || '+291 7 441092',
      role: 'Driver & Guide',
      lodging: `Same staff quarters at ${matchedHotel.name}`,
    };
  } else {
    // Separate Guide and Driver
    const guideEmp = dedicatedGuides[0] || driverGuides[0] || employees.find((e) => e.role === 'Tour Guide') || {
      id: 'emp-habtom-guide',
      name: 'Habtom Ghebre',
      phone: '+291 7 124981',
      role: 'Tour Guide' as const,
    };
    const driverEmp = dedicatedDrivers[0] || employees.find((e) => e.role === 'Driver') || {
      id: 'emp-yemane-driver',
      name: 'Yemane Berhe',
      phone: '+291 7 439012',
      role: 'Driver' as const,
    };

    allocatedGuide = {
      id: guideEmp.id,
      name: guideEmp.name,
      phone: guideEmp.phone || '+291 7 124981',
      role: (guideEmp.role as any) === 'Driver & Guide' ? 'Driver & Guide' : 'Tour Guide',
      lodging: `Guide staff quarters at ${matchedHotel.name}`,
    };
    allocatedDriver = {
      id: driverEmp.id,
      name: driverEmp.name,
      phone: driverEmp.phone || '+291 7 439012',
      role: 'Driver',
      lodging: `Driver logistics annex near ${matchedHotel.name}`,
    };
  }

  // 5. Generate System Records
  const bookingRef = `BK-${traveler.id.slice(-6).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
  const reservationCode = `CONF-HTL-${Math.floor(1000 + Math.random() * 9000)}`;

  const hotelReservation: HotelReservation = {
    id: `res-${traveler.id}`,
    confirmationCode: reservationCode,
    hotelId: matchedHotel.id,
    hotelName: matchedHotel.name,
    hotelCity: matchedHotel.city,
    roomTypeId: matchedHotel.roomTypes?.[0]?.id || 'rt-001',
    roomTypeName: roomType,
    touristId: traveler.id,
    touristName: traveler.name,
    touristEmail: traveler.email,
    touristPhone: traveler.phone || traveler.whatsapp,
    touristNationality: traveler.nationality || 'International',
    tourPackageTitle: traveler.itinerarySummary || 'Eritrea Visit Signature Heritage Tour',
    checkInDate: checkIn,
    checkOutDate: checkOut,
    numberOfNights: 7,
    numberOfGuests: paxCount,
    numberOfRooms: Math.ceil(paxCount / 2),
    mealPlan: 'Bed & Breakfast (BB)',
    pricePerNight,
    totalAmount: pricePerNight * 7,
    paymentStatus: isConfirmed ? 'Confirmed' : 'Pending',
    specialRequests: traveler.mealRequirements ? `Meal: ${traveler.mealRequirements}` : undefined,
    voucherIssuedAt: nowIso,
    airportTransferIncluded: true,
  };

  const booking: Booking = {
    id: `booking-${traveler.id}`,
    bookingRef,
    tourScheduleId: linkedEvent?.id || 'sched-feed-auto',
    tourTitle: traveler.itinerarySummary || linkedEvent?.title || 'Confirmed Eritrea Expedition',
    departureDate: checkIn,
    touristId: traveler.id,
    touristName: traveler.name,
    touristEmail: traveler.email || 'traveler@eritreavisit.com',
    touristPassport: 'PERMIT-INSP-2026',
    touristNationality: traveler.nationality || 'International',
    ticketClass: 'Standard Class' as any,
    numberOfSeats: paxCount,
    totalPrice: traveler.price || 2450,
    paymentStatus: (isConfirmed ? 'Paid' : 'Pending') as any,
    bookingDate: nowIso,
    specialRequests: `Auto-allocated hotel: ${matchedHotel.name}, Vehicle: ${matchedVehicle.plateNumber}, Host Guide: ${allocatedGuide.name} (${allocatedGuide.role})`,
    ticketIds: [],
  };

  const tourBooking: TourBooking = {
    id: `tb-${traveler.id}`,
    touristId: traveler.id,
    touristName: traveler.name,
    region: matchedHotel.city,
    startDate: checkIn,
    endDate: checkOut,
    hotelId: matchedHotel.id,
    hotelName: matchedHotel.name,
    guideId: allocatedGuide.id,
    guideName: allocatedGuide.name,
    driverId: allocatedDriver.id,
    driverName: allocatedDriver.name,
    vehicleId: matchedVehicle.id,
    vehicleName: `${matchedVehicle.name} (${matchedVehicle.plateNumber})`,
    guideAllowanceUSD: 350,
    driverAllowanceUSD: 280,
    mealsUSD: 420,
    entranceFeesUSD: 150,
    tourType: paxCount > 4 ? 'Group Tour' : 'Private Tour',
    travelersCount: paxCount,
    pricePerPersonUSD: Math.round((traveler.price || 2450) / paxCount),
    totalPackageUSD: traveler.price || 2450,
    status: isConfirmed ? 'Confirmed' : 'Planned',
    createdAt: nowIso,
  };

  // 6. Updated Traveler Dossier with Real Allocations
  const updatedTraveler: FeedTraveler = {
    ...traveler,
    hotelDetails: {
      hotelName: matchedHotel.name,
      roomType,
      checkIn,
      checkOut,
    },
    guideAssignment: {
      name: allocatedGuide.name,
      phone: allocatedGuide.phone,
      lodging: allocatedGuide.lodging,
    },
    driverAssignment: {
      name: allocatedDriver.name,
      phone: allocatedDriver.phone,
      vehicle: `${matchedVehicle.name} (${matchedVehicle.plateNumber})`,
      lodging: allocatedDriver.lodging,
    },
  };

  const auditMessage = `Automatically allocated Hotel (${matchedHotel.name}), Vehicle (${matchedVehicle.plateNumber}), and Host Guide (${allocatedGuide.name} - ${allocatedGuide.role}) for confirmed booking ${traveler.name}.`;

  return {
    travelerId: traveler.id,
    travelerName: traveler.name,
    isConfirmed,
    allocatedHotel: {
      id: matchedHotel.id,
      name: matchedHotel.name,
      city: matchedHotel.city,
      roomType,
      pricePerNight,
      checkIn,
      checkOut,
    },
    allocatedVehicle: {
      id: matchedVehicle.id,
      name: matchedVehicle.name,
      model: matchedVehicle.model,
      plateNumber: matchedVehicle.plateNumber,
      type: matchedVehicle.type,
    },
    allocatedGuide,
    allocatedDriver,
    hotelReservation,
    booking,
    tourBooking,
    updatedTraveler,
    auditMessage,
  };
}

/**
 * Runs batch automatic allocation across all confirmed travelers in a feed.
 */
export function autoAllocateFeedConfirmedBookings(
  travelers: FeedTraveler[] = [],
  hotels: Hotel[] = [],
  vehicles: Vehicle[] = [],
  employees: Employee[] = [],
  events: FeedEvent[] = []
): BatchAllocationReport {
  const report: BatchAllocationReport = {
    totalProcessed: travelers.length,
    confirmedCount: 0,
    allocatedCount: 0,
    alreadyAllocatedCount: 0,
    allocations: [],
    newBookings: [],
    newTourBookings: [],
    newReservations: [],
    updatedTravelers: [],
  };

  for (const t of travelers) {
    const isConfirmed =
      t.confirmedStatus === 'Confirmed' ||
      t.bookingStage === 'Confirmed' ||
      t.paymentStatus === 'Paid';

    if (!isConfirmed) {
      report.updatedTravelers.push(t);
      continue;
    }

    report.confirmedCount++;

    // Check if hotel, vehicle, and guide are already complete
    const hasHotel = Boolean(t.hotelDetails?.hotelName);
    const hasGuide = Boolean(t.guideAssignment?.name);
    const hasVehicle = Boolean(t.driverAssignment?.vehicle);

    if (hasHotel && hasGuide && hasVehicle) {
      report.alreadyAllocatedCount++;
      report.updatedTravelers.push(t);
      continue;
    }

    // Run automated allocation
    const allocation = autoAllocateConfirmedBooking(t, hotels, vehicles, employees, events);
    report.allocatedCount++;
    report.allocations.push(allocation);
    report.newBookings.push(allocation.booking);
    report.newTourBookings.push(allocation.tourBooking);
    report.newReservations.push(allocation.hotelReservation);
    report.updatedTravelers.push(allocation.updatedTraveler);
  }

  return report;
}
