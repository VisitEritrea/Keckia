import { api } from './api';
import { authorizeGoogleWorkspace, getCachedAccessToken } from './firebase';
import {
  ACTIVE_WHATSAPP_INQUIRIES,
  OFFICIAL_WHATSAPP_NUMBER,
  fetchGmailInboxData,
  fetchGoogleCalendarData,
  parseWhatsAppChatExport,
} from './dataSyncService';
import type {
  Booking,
  ClientCategory,
  Conversation,
  CrmPipelineStage,
  Employee,
  FeedCalendarEvent,
  PaymentStatus,
  TicketingClient,
  TourPackage,
  TouristProfile,
  WebsiteEnquiry,
} from '../types';

export interface OmnichannelExtractedClient {
  id: string;
  channels: Array<'Email' | 'Calendar' | 'WhatsApp'>;
  fullName: string;
  gender: 'Male' | 'Female';
  email: string;
  phone: string;
  nationality: string;
  country: string;
  passportNumber?: string;
  passportExpiry?: string;
  occupation?: string;
  companyOrOrg?: string;
  touristStatus: 'VIP' | 'Active Traveler' | 'Inquiry' | 'Flagged';
  clientCategory: ClientCategory;
  crmStage: CrmPipelineStage;
  operationalBookingStatus: 'Unbooked' | 'Planned' | 'Confirmed' | 'In Progress' | 'Completed';
  paymentStatus: PaymentStatus;
  leadSource: string;
  interestedService: string;
  tourTitle: string;
  expectedTravelDate: string;
  expectedReturnDate: string;
  partySize: number;
  quotationValue: number;
  quotationCurrency: 'USD' | 'EUR' | 'ERN';
  nextFollowUpDate: string;
  assignedAgent: string;
  assignedGuideId?: string;
  assignedGuideName: string;
  assignedDriverId?: string;
  assignedDriverName: string;
  assignedFieldRoleNote: string;
  dietaryRequirements?: string;
  medicalNotes?: string;
  conversationSummary: string;
  aiJudgmentReason: string;
}

export interface OmnichannelAnalysisResult {
  ok: boolean;
  aiPowered: boolean;
  channelsConnected: {
    emailCount: number;
    calendarCount: number;
    whatsAppCount: number;
    liveGoogleConnected: boolean;
    officialWhatsAppNumber: string;
  };
  clients: OmnichannelExtractedClient[];
}

export interface AnalyzeOmnichannelOptions {
  requestLiveGoogleAuth?: boolean;
  conversations?: Conversation[];
  calendarEvents?: FeedCalendarEvent[];
  employees?: Employee[];
  packages?: TourPackage[];
  customWhatsAppTranscript?: string;
  focusConversation?: Conversation | null;
}

function mapCrmStageToEnquiryStatus(stage: CrmPipelineStage): WebsiteEnquiry['status'] {
  switch (stage) {
    case 'New Lead':
      return 'New';
    case 'Contacted':
      return 'Contacted';
    case 'Quotation Sent':
    case 'Negotiation':
      return 'Quoted';
    case 'Booked':
      return 'Converted';
    case 'Completed':
      return 'Closed';
    default:
      return 'New';
  }
}

export async function connectAndAnalyzeOmnichannelClients(
  options: AnalyzeOmnichannelOptions = {}
): Promise<OmnichannelAnalysisResult> {
  let token = getCachedAccessToken();
  let liveGoogleConnected = Boolean(token);

  if (options.requestLiveGoogleAuth) {
    try {
      token = await authorizeGoogleWorkspace();
      liveGoogleConnected = Boolean(token);
    } catch (err) {
      console.warn('Google OAuth popup skipped or closed; continuing with stored & connected feeds:', err);
    }
  }

  let liveEmails: any[] = [];
  let liveCalendarEvents: FeedCalendarEvent[] = [];

  if (token) {
    try {
      const [calRes, gmailRes] = await Promise.allSettled([
        fetchGoogleCalendarData(token),
        fetchGmailInboxData(token),
      ]);
      if (calRes.status === 'fulfilled' && Array.isArray(calRes.value)) {
        liveCalendarEvents = calRes.value;
      }
      if (gmailRes.status === 'fulfilled' && Array.isArray(gmailRes.value)) {
        liveEmails = gmailRes.value;
      }
    } catch (err) {
      console.warn('Live Google fetch warning:', err);
    }
  }

  const storedConversations = options.focusConversation
    ? [options.focusConversation]
    : options.conversations || [];

  const storedEmails = storedConversations
    .filter((c) => c.channel === 'Email')
    .map((c) => ({
      id: c.id,
      senderName: c.clientName,
      senderEmail: c.clientHandle,
      subject: c.subject || 'Tour & Travel Inquiry',
      snippet: c.messages.map((m) => `${m.senderName}: ${m.text}`).join(' | ') || c.lastMessagePreview,
      receivedAt: c.lastTimestamp,
    }));

  const storedWhatsApp = storedConversations
    .filter((c) => c.channel === 'WhatsApp')
    .map((c) => ({
      id: c.id,
      senderName: c.clientName,
      phone: c.clientHandle,
      subject: c.subject || 'WhatsApp Tour Inquiry',
      message: c.messages.map((m) => `${m.senderName}: ${m.text}`).join(' | ') || c.lastMessagePreview,
      timestamp: c.lastTimestamp,
    }));

  const customWhatsAppParsed = options.customWhatsAppTranscript?.trim()
    ? parseWhatsAppChatExport(options.customWhatsAppTranscript).map((c) => ({
        id: c.id,
        senderName: c.senderName,
        phone: c.senderPhone,
        subject: c.topic || 'WhatsApp Imported Chat',
        message: c.message,
        timestamp: c.timestamp,
      }))
    : [];

  const mergedEmails = [...liveEmails, ...storedEmails];
  const mergedCalendarEvents = [
    ...liveCalendarEvents,
    ...(options.focusConversation ? [] : options.calendarEvents || []),
  ];
  const mergedWhatsApp = options.focusConversation
    ? storedWhatsApp
    : [
        ...storedWhatsApp,
        ...customWhatsAppParsed,
        ...ACTIVE_WHATSAPP_INQUIRIES.map((w) => ({
          id: w.id,
          senderName: w.senderName,
          phone: w.senderPhone,
          subject: w.topic || 'WhatsApp Direct Inquiry',
          message: w.message,
          timestamp: w.timestamp,
        })),
      ];

  const response = await api.post< {
    ok: boolean;
    aiPowered: boolean;
    channelsConnected: {
      emailCount: number;
      calendarCount: number;
      whatsAppCount: number;
    };
    clients: OmnichannelExtractedClient[];
  }>('/ai/analyze-omnichannel-clients', {
    emails: mergedEmails,
    calendarEvents: mergedCalendarEvents,
    whatsAppMessages: mergedWhatsApp,
    conversations: storedConversations,
    employees: options.employees || [],
    packages: options.packages || [],
  });

  // Ensure strict Male | Female gender constraint and valid fields on every returned client
  const sanitizedClients: OmnichannelExtractedClient[] = (response.clients || []).map((c, idx) => ({
    ...c,
    id: c.id || `OMNI-CLIENT-${Date.now()}-${idx + 1}`,
    gender: c.gender === 'Female' ? 'Female' : 'Male',
    channels: Array.isArray(c.channels) && c.channels.length > 0 ? c.channels : ['Email'],
    partySize: Math.max(1, Number(c.partySize) || 1),
    quotationValue: Math.max(0, Number(c.quotationValue) || 1450),
    quotationCurrency: c.quotationCurrency || 'USD',
  }));

  return {
    ok: true,
    aiPowered: Boolean(response.aiPowered),
    channelsConnected: {
      emailCount: response.channelsConnected?.emailCount ?? mergedEmails.length,
      calendarCount: response.channelsConnected?.calendarCount ?? mergedCalendarEvents.length,
      whatsAppCount: response.channelsConnected?.whatsAppCount ?? mergedWhatsApp.length,
      liveGoogleConnected,
      officialWhatsAppNumber: OFFICIAL_WHATSAPP_NUMBER,
    },
    clients: sanitizedClients,
  };
}

export function toWebsiteEnquiry(client: OmnichannelExtractedClient): WebsiteEnquiry {
  const nowIso = new Date().toISOString();
  const stage: CrmPipelineStage = client.crmStage || 'New Lead';
  return {
    id: `ENQ-OMNI-${Date.now().toString().slice(-5)}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
    fullName: client.fullName,
    email: client.email,
    phone: client.phone || null,
    country: client.country || client.nationality || 'International',
    tourId: null,
    tourTitle: client.tourTitle || null,
    preferredDate: client.expectedTravelDate || null,
    partySize: client.partySize || 1,
    message: client.conversationSummary,
    source: client.leadSource || `Omnichannel (${client.channels.join(' + ')})`,
    status: mapCrmStageToEnquiryStatus(stage),
    stage,
    crmStage: stage,
    leadSource: client.leadSource || `Omnichannel (${client.channels.join(' + ')})`,
    interestedService: client.interestedService || 'Guided Tour Package',
    expectedTravelDate: client.expectedTravelDate || '',
    expectedReturnDate: client.expectedReturnDate || '',
    assignedAgent: client.assignedAgent || 'Amanuel Tesfay',
    quotationValue: client.quotationValue || 0,
    quotationCurrency: client.quotationCurrency || 'USD',
    nextFollowUpDate: client.nextFollowUpDate || new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0],
    notes: `[AI Judgment (${client.channels.join(' + ')})]: ${client.aiJudgmentReason}\nAssigned Guide: ${client.assignedGuideName || 'Unassigned'} | Assigned Driver: ${client.assignedDriverName || 'Unassigned'} (${client.assignedFieldRoleNote || 'Standard Field Assignment'})`,
    operationalBookingStatus: client.operationalBookingStatus || (stage === 'Booked' ? 'Confirmed' : 'Unbooked'),
    paymentStatus: client.paymentStatus || 'Unpaid',
    receivedAt: nowIso,
    assignedTo: client.assignedAgent || null,
  };
}

export function toTouristProfile(client: OmnichannelExtractedClient): TouristProfile {
  return {
    id: `TR-OMNI-${Date.now().toString().slice(-5)}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
    fullName: client.fullName,
    email: client.email,
    phone: client.phone || '+291-7-000000',
    passportNumber: client.passportNumber || 'PENDING-VERIFICATION',
    passportExpiry: client.passportExpiry || '2029-12-31',
    nationality: client.nationality || client.country || 'International',
    dateOfBirth: '1986-05-15',
    gender: client.gender === 'Female' ? 'Female' : 'Male',
    status: client.touristStatus || 'Inquiry',
    avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(client.fullName)}&background=0F172A&color=F59E0B&bold=true`,
    occupation: client.occupation || (client.companyOrOrg ? `${client.clientCategory} (${client.companyOrOrg})` : client.clientCategory),
    dietaryRequirements: client.dietaryRequirements || 'None Declared',
    medicalNotes: client.medicalNotes || 'Cleared for standard altitude',
    partySize: client.partySize || 1,
    tourSituation: client.partySize >= 5 ? 'Group' : client.partySize === 2 ? 'Couple' : 'Single',
    assignedGuideId: client.assignedGuideId,
    assignedGuideName: client.assignedGuideName,
    assignedDriverId: client.assignedDriverId,
    assignedDriverName: client.assignedDriverName,
    notes: `[Auto-Imported via ${client.channels.join(' + ')}] ${client.conversationSummary}\n\n[AI Categorization & Staff Assignment]: ${client.aiJudgmentReason} | Sales Agent: ${client.assignedAgent} | Guide: ${client.assignedGuideName} | Driver: ${client.assignedDriverName} (${client.assignedFieldRoleNote})`,
  };
}

export function toTicketingClient(client: OmnichannelExtractedClient): TicketingClient {
  const nowIso = new Date().toISOString();
  return {
    id: `CL-OMNI-${Date.now().toString().slice(-5)}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
    clientCode: `EV-CL-${Math.floor(1000 + Math.random() * 9000)}`,
    fullName: client.fullName,
    category: client.clientCategory || 'Individual',
    companyOrOrg: client.companyOrOrg || (client.clientCategory !== 'Individual' ? client.clientCategory : undefined),
    email: client.email,
    phone: client.phone || '+291-7-000000',
    passportNumber: client.passportNumber || 'PENDING-VERIFICATION',
    passportExpiry: client.passportExpiry || '2029-12-31',
    passportIssueCountry: client.country || client.nationality || 'International',
    dateOfBirth: '1986-05-15',
    gender: client.gender === 'Female' ? 'Female' : 'Male',
    nationality: client.nationality || 'International',
    residentialCity: 'Asmara / International',
    residentialCountry: client.country || client.nationality || 'International',
    preferredSeating: client.touristStatus === 'VIP' ? 'Extra Legroom' : 'Window',
    mealPreference: client.dietaryRequirements || 'Standard',
    vipStatus: client.touristStatus === 'VIP' || client.clientCategory === 'VIP Traveler' || client.clientCategory === 'Diplomatic / Embassy',
    occupation: client.occupation || client.interestedService,
    notes: `[Auto-Categorized from ${client.channels.join(' + ')}]: ${client.conversationSummary}\nAI Judgment: ${client.aiJudgmentReason} | Assigned Agent: ${client.assignedAgent}`,
    avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(client.fullName)}&background=0F172A&color=D97706&bold=true`,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export function toBookingFromOmnichannelClient(
  client: OmnichannelExtractedClient,
  touristId: string
): Booking {
  const todayStr = new Date().toISOString().split('T')[0];
  return {
    id: `BK-OMNI-${Date.now().toString().slice(-5)}-${Math.random().toString(36).slice(2, 4).toUpperCase()}`,
    bookingRef: `EV-BK-${Math.floor(10000 + Math.random() * 89999)}`,
    tourScheduleId: 'SCH-OMNI-AUTO',
    tourTitle: client.tourTitle || client.interestedService || 'Eritrea Discovery Expedition',
    departureDate: client.expectedTravelDate || todayStr,
    travelDate: client.expectedTravelDate || todayStr,
    createdAt: new Date().toISOString(),
    touristId,
    touristName: client.fullName,
    touristEmail: client.email,
    touristPassport: client.passportNumber || 'PENDING',
    touristNationality: client.nationality || 'International',
    ticketClass: client.touristStatus === 'VIP' ? 'VIP' : client.partySize >= 4 ? 'Group' : 'Standard',
    numberOfSeats: Math.max(1, client.partySize || 1),
    totalPrice: client.quotationValue || 1450,
    totalAmountUSD: client.quotationValue || 1450,
    amountUSD: client.quotationValue || 1450,
    amountPaidUSD:
      client.paymentStatus === 'Paid'
        ? client.quotationValue || 1450
        : client.paymentStatus === 'Deposit Paid'
        ? Math.round((client.quotationValue || 1450) * 0.35)
        : 0,
    paymentStatus: client.paymentStatus || 'Unpaid',
    bookingDate: todayStr,
    specialRequests: `Assigned Guide: ${client.assignedGuideName} | Driver: ${client.assignedDriverName} (${client.assignedFieldRoleNote}). Imported from ${client.channels.join(' + ')}.`,
    ticketIds: [],
  };
}
