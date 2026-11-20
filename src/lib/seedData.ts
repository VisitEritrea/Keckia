import {
  mockDepartments,
  mockEmployees,
  mockPackages,
  mockActivities,
  mockSchedules,
  mockTourists,
  mockWebsiteEnquiries,
  mockBookings,
  mockTickets,
  mockTicketingClients,
  mockVisaDocs,
  mockPermits,
  mockNotifications,
  mockVehicles,
  mockHotels,
  mockHotelReservations,
  mockHotelLetters,
  mockRentalLetters,
  mockMessageChannels,
  mockMessages,
  mockFinancialTransactions,
  mockFinancialInvoices,
  mockExpenseReceipts,
  mockTourBookings,
  mockExpeditions,
  mockOutwardRentals,
} from '../mockData.ts';
import { SAMPLE_FICTIONAL_FEED_V1 } from '../../shared/feedSchema.ts';

const FEED_SUMMARY_COUNTS = {
  sources: (SAMPLE_FICTIONAL_FEED_V1.sources ?? []).length,
  events: (SAMPLE_FICTIONAL_FEED_V1.events ?? []).length,
  travelers: (SAMPLE_FICTIONAL_FEED_V1.travelers ?? []).length,
  conversations: (SAMPLE_FICTIONAL_FEED_V1.conversations ?? []).length,
  drafts: (SAMPLE_FICTIONAL_FEED_V1.drafts ?? []).length,
  conflicts: (SAMPLE_FICTIONAL_FEED_V1.conflicts ?? []).length,
  tasks: (SAMPLE_FICTIONAL_FEED_V1.tasks ?? []).length,
};

const SEEDED_DAILY_FEEDS = [
  {
    id: 'feed_2026-10-31T07-55-00Z_v1',
    importedAt: '2026-10-31T07:55:00.000Z',
    importedBy: 'admin',
    feed: SAMPLE_FICTIONAL_FEED_V1,
    summary: FEED_SUMMARY_COUNTS,
  },
];

export const DEMO_SAMPLE_COLLECTIONS: Record<string, any[]> = {
  departments: mockDepartments,
  employees: mockEmployees,
  packages: mockPackages,
  activities: mockActivities,
  schedules: mockSchedules,
  tourists: mockTourists,
  websiteEnquiries: mockWebsiteEnquiries,
  bookings: mockBookings,
  tickets: mockTickets,
  ticketingClients: mockTicketingClients,
  visaDocs: mockVisaDocs,
  permits: mockPermits,
  notifications: mockNotifications,
  vehicles: mockVehicles,
  hotels: mockHotels,
  reservations: mockHotelReservations,
  hotelLetters: mockHotelLetters,
  rentalLetters: mockRentalLetters,
  channels: mockMessageChannels,
  messages: mockMessages,
  financialTransactions: mockFinancialTransactions,
  financialInvoices: mockFinancialInvoices,
  receipts: mockExpenseReceipts,
  tourBookings: mockTourBookings,
  expeditions: mockExpeditions,
  vehicleOutwardRentals: mockOutwardRentals,
  feedSources: SAMPLE_FICTIONAL_FEED_V1.sources ?? [],
  feedEvents: SAMPLE_FICTIONAL_FEED_V1.events ?? [],
  feedTravelers: SAMPLE_FICTIONAL_FEED_V1.travelers ?? [],
  feedConversations: SAMPLE_FICTIONAL_FEED_V1.conversations ?? [],
  feedDrafts: SAMPLE_FICTIONAL_FEED_V1.drafts ?? [],
  feedConflicts: SAMPLE_FICTIONAL_FEED_V1.conflicts ?? [],
  feedTasks: SAMPLE_FICTIONAL_FEED_V1.tasks ?? [],
  dailyFeeds: SEEDED_DAILY_FEEDS,
};

/**
 * The starter dataset, pre-populated with the customized EritreaVisit Feed V1 dataset
 * and ERN/USD/EUR/GBP/CHF multi-currency operational records.
 */
export const STARTER_COLLECTIONS: Record<string, any[]> = {
  ...DEMO_SAMPLE_COLLECTIONS,
  touristActivities: [],
};

/**
 * The ids the starter dataset occupies, per collection. Clearing sends this so
 * the server removes the sample records and nothing else — anything the agency
 * has entered itself keeps its place.
 */
export const STARTER_IDS: Record<string, string[]> = Object.fromEntries(
  Object.entries(DEMO_SAMPLE_COLLECTIONS).map(([collection, rows]) => [
    collection,
    rows.map((row) => row?.id).filter((id): id is string => Boolean(id)),
  ]),
);

/** How many records the starter dataset holds in total. */
export const STARTER_RECORD_COUNT = Object.values(STARTER_IDS).reduce(
  (total, ids) => total + ids.length,
  0,
);

/**
 * How many sample records are still present in a loaded workspace, so the
 * clear-data screen can tell the CEO exactly what it is about to remove.
 */
export function countSampleRecords(collections: Record<string, any[]>): number {
  return Object.entries(STARTER_IDS).reduce((total, [collection, ids]) => {
    const present = new Set((collections[collection] ?? []).map((row) => row?.id));
    return total + ids.filter((id) => present.has(id)).length;
  }, 0);
}
