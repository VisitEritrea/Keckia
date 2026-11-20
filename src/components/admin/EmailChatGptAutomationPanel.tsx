import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building,
  CheckCircle2,
  Compass,
  FileCheck2,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  UserCheck,
  X,
} from 'lucide-react';
import {
  ActiveTab,
  Employee,
  FeedConversation,
  Hotel,
  HotelLetterDoc,
  HotelReservation,
  RegionalPermitDoc,
  TourPackage,
  TouristProfile,
  Vehicle,
  VisaOnArrivalDoc,
} from '../../types';
import { api, ApiError } from '../../lib/api';
import {
  AGENCY_EMAIL,
  EmailFetchItem,
  fetchGmailInboxStrict,
  sendGmailEmail,
} from '../../lib/dataSyncService';
import {
  AiProviderAccountProfile,
  DEFAULT_AI_PROVIDER_ACCOUNTS,
  FIRESTORE_DATABASE_ID,
  auth,
  authorizeGoogleWorkspace,
  getCachedAccessToken,
  loadAiAccountsFromFirestore,
  setCachedAccessToken,
  signInFirebaseOperator,
  syncAiAccountsToFirestore,
  syncAutomationPlanToFirestore,
} from '../../lib/firebase';

export interface AutomationBookingPlan {
  id: string;
  emailId: string;
  threadId?: string;
  messageIdHeader?: string;
  from: string;
  fromEmail: string;
  subject: string;
  receivedAt: string;
  rawBody: string;
  isBookingInquiry: boolean;
  inquiryType: string;
  confidenceNote: string;
  traveler: {
    fullName: string;
    email: string;
    phone: string;
    nationality: string;
    gender: 'Male' | 'Female';
    passportNumber: string;
    passportExpiry: string;
    occupation: string;
    paxCount: number;
    companions: Array<{
      fullName: string;
      passportNumber: string;
      nationality: string;
      gender: 'Male' | 'Female';
      occupation: string;
    }>;
  };
  trip: {
    tourTitle: string;
    routeSummary: string;
    checkInDate: string;
    checkOutDate: string;
    nights: number;
    entryPort: string;
    zoneName: string;
    zoneType: 'Heritage Park' | 'Restricted Alpine Zone' | 'Border Buffer Zone' | 'Wildlife Conservation';
  };
  hotelPlan: {
    hotelId: string;
    hotelName: string;
    hotelNameTigrinya: string;
    city: string;
    cityTigrinya: string;
    hotelEmail: string;
    roomType: string;
    numberOfRooms: number;
    mealPlan: 'Room Only' | 'Bed & Breakfast (BB)' | 'Half Board (HB)' | 'Full Board (FB)';
    currency: 'USD' | 'ERN';
    pricePerNight: number;
    totalAmount: number;
    refNumber: string;
    letterDate: string;
    letterSubjectTigrinya: string;
    letterOpeningTigrinya: string;
    letterClosingTigrinya: string;
    emailSubject: string;
    emailBody: string;
  };
  visaPlan: {
    docNumber: string;
    referenceNumber: string;
    entryPort: string;
    arrivalDate: string;
    departureDate: string;
    hotelArrangements: string;
    officialNotes: string;
    signatoryName: string;
    signatoryTitle: string;
  };
  permitPlan: {
    permitNumber: string;
    referenceNumber: string;
    zoneName: string;
    zoneType: 'Heritage Park' | 'Restricted Alpine Zone' | 'Border Buffer Zone' | 'Wildlife Conservation';
    validFrom: string;
    validTo: string;
    leadGuideName: string;
    leadGuidePhone: string;
    guideLicenseNo: string;
    driverName: string;
    driverPhone: string;
    driverLicense: string;
    vehicleType: string;
    vehiclePlate: string;
    hotelName: string;
    authorityOffice: string;
    stops: Array<{ id: string; place: string; tourDate: string; hotel: string }>;
  };
}

interface StageProgressState {
  hotelBooked: boolean;
  hotelEmailSent: boolean;
  visaSaved: boolean;
  permitSaved: boolean;
  reservationId?: string;
  hotelLetterId?: string;
  visaDocId?: string;
  permitDocId?: string;
  gmailSentMessageId?: string;
}

interface BatchEmailDraftItem {
  planId: string;
  travelerName: string;
  hotelName: string;
  to: string;
  subject: string;
  bodyText: string;
  selected: boolean;
}

interface EmailChatGptAutomationPanelProps {
  hotels: Hotel[];
  packages: TourPackage[];
  employees: Employee[];
  vehicles: Vehicle[];
  feedConversations: FeedConversation[];
  reservations?: HotelReservation[];
  hotelLetters?: HotelLetterDoc[];
  visaDocs?: VisaOnArrivalDoc[];
  permits?: RegionalPermitDoc[];
  onSaveTourist: (tourist: TouristProfile) => void;
  onAddReservation: (res: HotelReservation) => void;
  onSaveHotelLetter: (letter: HotelLetterDoc) => void;
  onSaveVoADoc: (doc: VisaOnArrivalDoc) => void;
  onSavePermitDoc: (permit: RegionalPermitDoc) => void;
  onNotify?: (title: string, message: string, linkTab?: ActiveTab) => void;
  onNavigate?: (tab: ActiveTab) => void;
}

type AiProviderChoice = 'auto' | 'chatgpt' | 'claude' | 'gemini';
type QueueFilter = 'all' | 'bookings' | 'pending' | 'completed';

interface ProviderStatusInfo {
  configured: boolean;
  model: string;
  accountLabel: string;
}

interface AutomationStatus {
  openAiConfigured: boolean;
  openAiModel: string;
  claudeConfigured?: boolean;
  claudeModel?: string;
  geminiConfigured: boolean;
  geminiModel?: string;
  agencyEmail: string;
  ownerEmail: string;
  accounts?: AiProviderAccountProfile[];
  providers?: {
    chatgpt: ProviderStatusInfo;
    claude: ProviderStatusInfo;
    gemini: ProviderStatusInfo;
  };
}

function computeNights(checkIn: string, checkOut: string, fallback = 4): number {
  const start = new Date(`${checkIn}T00:00:00Z`).getTime();
  const end = new Date(`${checkOut}T00:00:00Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return Math.max(1, fallback);
  }
  return Math.max(1, Math.round((end - start) / 86400_000));
}

function getPlanSafeKey(plan: AutomationBookingPlan): string {
  return String(plan.emailId || plan.id || '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(-24) || 'item';
}

export const EmailChatGptAutomationPanel: React.FC<EmailChatGptAutomationPanelProps> = ({
  hotels = [],
  packages = [],
  employees = [],
  vehicles = [],
  feedConversations = [],
  reservations = [],
  hotelLetters = [],
  visaDocs = [],
  permits = [],
  onSaveTourist,
  onAddReservation,
  onSaveHotelLetter,
  onSaveVoADoc,
  onSavePermitDoc,
  onNotify,
  onNavigate,
}) => {
  const [statusInfo, setStatusInfo] = useState<AutomationStatus | null>(null);
  const [gmailConnected, setGmailConnected] = useState<boolean>(() => Boolean(getCachedAccessToken()));
  const [connectedMailbox, setConnectedMailbox] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [engineUsed, setEngineUsed] = useState<string>('chatgpt');
  const [modelUsed, setModelUsed] = useState<string>('gpt-4o-mini');
  const [aiProvider, setAiProvider] = useState<AiProviderChoice>('auto');

  const [plans, setPlans] = useState<AutomationBookingPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState<'hotel' | 'visa' | 'permit'>('hotel');
  const [progressByPlan, setProgressByPlan] = useState<Record<string, StageProgressState>>({});
  const [autoExecuteOnCheck, setAutoExecuteOnCheck] = useState<boolean>(true);
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('all');
  const [queueSearch, setQueueSearch] = useState<string>('');
  const [aiAccounts, setAiAccounts] = useState<AiProviderAccountProfile[]>(DEFAULT_AI_PROVIDER_ACCOUNTS);
  const [showAccountsPanel, setShowAccountsPanel] = useState<boolean>(true);
  const [savingAccounts, setSavingAccounts] = useState<boolean>(false);
  const [firestoreSyncedCount, setFirestoreSyncedCount] = useState<number>(0);

  // Single email confirmation dialog
  const [pendingEmailSend, setPendingEmailSend] = useState<{
    planId: string;
    to: string;
    subject: string;
    bodyText: string;
    threadId?: string;
    inReplyTo?: string;
  } | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);

  // Batch confirmation dialog for dispatching all pending hotel reservation emails cleanly
  const [batchEmailQueue, setBatchEmailQueue] = useState<BatchEmailDraftItem[] | null>(null);
  const [batchSendingStatus, setBatchSendingStatus] = useState<{ sent: number; total: number } | null>(null);

  const syncedInboxEmails: EmailFetchItem[] = useMemo(() => {
    return (feedConversations || [])
      .filter((c) => c.channel === 'email')
      .map((c) => {
        const msgs = Array.isArray(c.messages) ? c.messages : [];
        const bodyText = msgs.map((m) => `${m.senderName || m.sender}: ${m.content}`).join('\n\n');
        const extractedEmail =
          (c as any).email ||
          msgs.map((m) => String(m.senderName || '').match(/([^\s<]+@[^\s>]+)/)?.[1]).find(Boolean) ||
          '';
        return {
          id: c.id,
          threadId: c.id,
          from: extractedEmail ? `${c.travelerName || 'Traveler'} <${extractedEmail}>` : c.travelerName || 'Traveler',
          fromEmail: extractedEmail,
          to: AGENCY_EMAIL,
          subject: c.subject || 'Eritrea Tour & Hotel Inquiry',
          date: c.lastMessageAt || new Date().toISOString(),
          snippet: msgs[msgs.length - 1]?.content || '',
          bodyText: bodyText || c.subject || '',
        };
      });
  }, [feedConversations]);

  const resolveProgressForPlan = (
    plan: AutomationBookingPlan,
    localOverride?: StageProgressState
  ): StageProgressState => {
    const safeKey = getPlanSafeKey(plan);
    const local = localOverride || progressByPlan[plan.id];
    const normTraveler = (plan.traveler.fullName || '').trim().toLowerCase();

    const resMatch = reservations.find(
      (r) =>
        r.id === `res-auto-${safeKey}` ||
        (normTraveler &&
          (r.touristName || '').trim().toLowerCase() === normTraveler &&
          r.checkInDate === plan.trip.checkInDate)
    );
    const letterMatch = hotelLetters.find(
      (l) =>
        l.id === `let-auto-${safeKey}` ||
        (l.guests || []).some((g) => ((g as any).fullName || g.name || '').trim().toLowerCase() === normTraveler)
    );
    const visaMatch = visaDocs.find(
      (v) =>
        v.id === `voa-auto-${safeKey}` ||
        (normTraveler &&
          (v.touristName || '').trim().toLowerCase() === normTraveler &&
          v.arrivalDate === plan.visaPlan.arrivalDate)
    );
    const permitMatch = permits.find(
      (p) =>
        p.id === `pmt-auto-${safeKey}` ||
        ((p.touristNames || []).some((n) => n.trim().toLowerCase() === normTraveler) &&
          p.validFrom === plan.permitPlan.validFrom)
    );

    return {
      hotelBooked: Boolean(local?.hotelBooked || resMatch || letterMatch),
      hotelEmailSent: Boolean(local?.hotelEmailSent || letterMatch?.status === 'Sent'),
      visaSaved: Boolean(local?.visaSaved || visaMatch),
      permitSaved: Boolean(local?.permitSaved || permitMatch),
      reservationId: local?.reservationId || resMatch?.id || `res-auto-${safeKey}`,
      hotelLetterId: local?.hotelLetterId || letterMatch?.id || `let-auto-${safeKey}`,
      visaDocId: local?.visaDocId || visaMatch?.id || `voa-auto-${safeKey}`,
      permitDocId: local?.permitDocId || permitMatch?.id || `pmt-auto-${safeKey}`,
      gmailSentMessageId: local?.gmailSentMessageId,
    };
  };

  // Reconcile persisted records in database collections so stage completion survives reloads & tab changes
  const resolvedProgressByPlan = useMemo<Record<string, StageProgressState>>(() => {
    const out: Record<string, StageProgressState> = {};
    for (const plan of plans) {
      out[plan.id] = resolveProgressForPlan(plan);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans, progressByPlan, reservations, hotelLetters, visaDocs, permits]);

  useEffect(() => {
    let active = true;
    api
      .get<AutomationStatus>('ai/automation-status')
      .then((res) => {
        if (!active) return;
        setStatusInfo(res);
        if (Array.isArray(res.accounts) && res.accounts.length > 0) {
          setAiAccounts(res.accounts);
        }
      })
      .catch(() => undefined);

    if (auth.currentUser?.emailVerified) {
      loadAiAccountsFromFirestore()
        .then((fsRows) => {
          if (active && fsRows && fsRows.length > 0) {
            setFirestoreSyncedCount(fsRows.length);
          }
        })
        .catch(() => undefined);
    }

    return () => {
      active = false;
    };
  }, []);

  const handleSaveAccountsEverywhere = async (
    accountsToSave: AiProviderAccountProfile[] = aiAccounts,
    promptGoogleIfNeeded = false
  ) => {
    setSavingAccounts(true);
    setErrorMsg(null);
    try {
      const res = await api.put<{ success: boolean; accounts: AiProviderAccountProfile[] }>(
        'ai/provider-accounts',
        { accounts: accountsToSave }
      );
      const saved = Array.isArray(res?.accounts) ? res.accounts : accountsToSave;
      setAiAccounts(saved);

      if (promptGoogleIfNeeded && !auth.currentUser?.emailVerified) {
        await signInFirebaseOperator('philikesete@gmail.com');
      }

      const fsResult = await syncAiAccountsToFirestore(saved);
      if (fsResult.mode === 'firestore') {
        setFirestoreSyncedCount(fsResult.synced);
        for (const p of plans.filter((item) => item.isBookingInquiry !== false)) {
          await syncAutomationPlanToFirestore({
            planId: p.id,
            travelerName: p.traveler.fullName,
            hotelName: p.hotelPlan.hotelName,
            hotelRefNumber: p.hotelPlan.refNumber,
            visaDocNumber: p.visaPlan.docNumber,
            permitNumber: p.permitPlan.permitNumber,
            status: 'completed',
          });
        }
        setSuccessMsg(
          `Saved & synced Gemini (philikesete@gmail.com), OpenAI (sniffweb@gmail.com), Anthropic (philikesete@gmail.com), and Agency Gmail (${AGENCY_EMAIL}) to database & Firestore (${FIRESTORE_DATABASE_ID}).`
        );
      } else {
        setSuccessMsg(
          `Saved Gemini (philikesete@gmail.com), OpenAI (sniffweb@gmail.com), Anthropic (philikesete@gmail.com), and ${AGENCY_EMAIL} profiles to agency database.`
        );
      }
    } catch (err: any) {
      setErrorMsg(err instanceof ApiError ? err.message : err?.message || 'Failed to save AI provider accounts.');
    } finally {
      setSavingAccounts(false);
    }
  };

  // Automatically check and execute tours@eritreavisit.com emails when panel opens
  useEffect(() => {
    const cachedToken = getCachedAccessToken();
    if (cachedToken && plans.length === 0 && !busyAction) {
      fetchGmailInboxStrict(cachedToken, 20)
        .then((report) => {
          setConnectedMailbox(report.connectedEmail);
          if (report.emails.length > 0) {
            runEmailBookingAnalysis(report.emails, true);
          } else if (syncedInboxEmails.length > 0) {
            runEmailBookingAnalysis(syncedInboxEmails, true);
          }
        })
        .catch(() => {
          if (syncedInboxEmails.length > 0) {
            runEmailBookingAnalysis(syncedInboxEmails, true);
          }
        });
      return;
    }
    if (plans.length === 0 && syncedInboxEmails.length > 0 && !busyAction) {
      runEmailBookingAnalysis(syncedInboxEmails, autoExecuteOnCheck);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncedInboxEmails.length]);

  const filteredPlans = useMemo(() => {
    const q = queueSearch.trim().toLowerCase();
    return plans.filter((plan) => {
      const prog = resolvedProgressByPlan[plan.id];
      const isDone = Boolean(prog?.hotelBooked && prog?.visaSaved && prog?.permitSaved);
      if (queueFilter === 'bookings' && plan.isBookingInquiry === false) return false;
      if (queueFilter === 'pending' && (plan.isBookingInquiry === false || isDone)) return false;
      if (queueFilter === 'completed' && !isDone) return false;
      if (q) {
        const haystack = `${plan.traveler.fullName} ${plan.subject} ${plan.hotelPlan.hotelName} ${plan.traveler.nationality}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [plans, resolvedProgressByPlan, queueFilter, queueSearch]);

  const selectedPlan = useMemo(
    () =>
      filteredPlans.find((p) => p.id === selectedPlanId) ||
      plans.find((p) => p.id === selectedPlanId) ||
      filteredPlans[0] ||
      plans[0] ||
      null,
    [filteredPlans, plans, selectedPlanId]
  );

  const selectedProgress: StageProgressState = selectedPlan
    ? resolvedProgressByPlan[selectedPlan.id] || {
        hotelBooked: false,
        hotelEmailSent: false,
        visaSaved: false,
        permitSaved: false,
      }
    : {
        hotelBooked: false,
        hotelEmailSent: false,
        visaSaved: false,
        permitSaved: false,
      };

  const summaryStats = useMemo(() => {
    const bookingPlans = plans.filter((p) => p.isBookingInquiry !== false);
    let hotelsDone = 0;
    let visasDone = 0;
    let permitsDone = 0;
    let emailsSent = 0;
    const unsentHotelPlans: AutomationBookingPlan[] = [];

    for (const p of bookingPlans) {
      const st = resolvedProgressByPlan[p.id];
      if (st?.hotelBooked) hotelsDone++;
      if (st?.visaSaved) visasDone++;
      if (st?.permitSaved) permitsDone++;
      if (st?.hotelEmailSent) {
        emailsSent++;
      } else {
        unsentHotelPlans.push(p);
      }
    }

    return {
      totalEmails: plans.length,
      bookingCount: bookingPlans.length,
      hotelsDone,
      visasDone,
      permitsDone,
      emailsSent,
      unsentHotelPlans,
    };
  }, [plans, resolvedProgressByPlan]);

  const runEmailBookingAnalysis = async (
    emailsToCheck: EmailFetchItem[],
    autoExecute = false
  ): Promise<AutomationBookingPlan[]> => {
    setBusyAction('analyzing');
    setErrorMsg(null);
    try {
      const res = await api.post<{
        success: boolean;
        engine: string;
        model: string;
        openAiConfigured: boolean;
        plans: AutomationBookingPlan[];
      }>('ai/check-email-bookings', {
        emails: emailsToCheck,
        hotels,
        packages,
        employees,
        vehicles,
        aiProvider,
      });
      setEngineUsed(res.engine || 'structured-parser');
      setModelUsed(res.model || 'gpt-4o-mini');
      const returnedPlans = Array.isArray(res.plans) ? res.plans : [];
      setPlans(returnedPlans);
      if (returnedPlans.length > 0) {
        setSelectedPlanId((prev) =>
          prev && returnedPlans.some((p) => p.id === prev) ? prev : returnedPlans[0].id
        );
        if (autoExecute) {
          runFullSequenceForBatch(returnedPlans, true);
        }
      }
      return returnedPlans;
    } catch (err: any) {
      setErrorMsg(err instanceof ApiError ? err.message : err?.message || 'Failed to analyze email bookings.');
      return [];
    } finally {
      setBusyAction(null);
    }
  };

  const handleConnectAndCheckGmail = async (forceSwitch = false, openBatchAfter = false) => {
    setBusyAction('gmail');
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      if (forceSwitch) {
        setCachedAccessToken(null);
      }
      const token = forceSwitch
        ? await authorizeGoogleWorkspace(true, AGENCY_EMAIL)
        : getCachedAccessToken() || (await authorizeGoogleWorkspace(false, AGENCY_EMAIL));
      setGmailConnected(Boolean(token));

      const report = await fetchGmailInboxStrict(token, 20);
      setConnectedMailbox(report.connectedEmail);

      if (report.emails.length === 0) {
        if (!report.isExactAgencyAccount && report.connectedEmail) {
          setErrorMsg(
            `Signed into ${report.connectedEmail}. Only emails involving ${AGENCY_EMAIL} are permitted (0 found in this mailbox). Click "Switch Account" to sign directly into ${AGENCY_EMAIL}.`
          );
          if (syncedInboxEmails.length > 0) {
            const fallbackPlans = await runEmailBookingAnalysis(syncedInboxEmails, true);
            if (openBatchAfter) openBatchEmailModal(fallbackPlans);
          }
        } else {
          setSuccessMsg(
            `Connected strictly to ${report.connectedEmail || AGENCY_EMAIL}. No matching inbox messages were found.`
          );
        }
        setBusyAction(null);
        return;
      }

      const analyzed = await runEmailBookingAnalysis(report.emails, autoExecuteOnCheck);
      const bookingCount = analyzed.filter((p) => p.isBookingInquiry !== false).length;
      setSuccessMsg(
        autoExecuteOnCheck && bookingCount > 0
          ? `Checked ${report.emails.length} email(s) strictly from ${AGENCY_EMAIL} and automatically completed Hotels + Letters → Visas → Travel Permits for ${bookingCount} inquiry(s).`
          : `Checked ${report.emails.length} live email(s) strictly from ${AGENCY_EMAIL}${
              report.connectedEmail && !report.isExactAgencyAccount
                ? ` (filtered within ${report.connectedEmail})`
                : ''
            }.`
      );
      if (openBatchAfter) {
        openBatchEmailModal(analyzed);
      }
    } catch (err: any) {
      if (syncedInboxEmails.length > 0 && openBatchAfter) {
        const fallbackPlans = await runEmailBookingAnalysis(syncedInboxEmails, true);
        setSuccessMsg(
          `Gmail popup unavailable (${err?.message || 'declined'}). Automatically processed ${fallbackPlans.length} synced ${AGENCY_EMAIL} inquiry(s) into Hotels → Visas → Travel Permits.`
        );
        openBatchEmailModal(fallbackPlans);
      } else {
        setErrorMsg(err?.message || `Could not connect to ${AGENCY_EMAIL} inbox.`);
      }
      setBusyAction(null);
    }
  };

  const handleEverythingAutomatically = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    // If Gmail token exists or synced emails aren't present, try live Gmail + full pipeline; otherwise process live or synced seamlessly
    await handleConnectAndCheckGmail(false, true);
  };

  const updatePlan = (planId: string, updater: (plan: AutomationBookingPlan) => AutomationBookingPlan) => {
    setPlans((prev) => prev.map((p) => (p.id === planId ? updater(p) : p)));
  };

  const handleHotelSelectionChange = (plan: AutomationBookingPlan, hotelId: string) => {
    const h = hotels.find((item) => item.id === hotelId);
    if (!h) return;
    const isAsmaraPalace = h.name.toLowerCase().includes('asmara palace');
    const currency: 'USD' | 'ERN' = isAsmaraPalace ? 'USD' : 'ERN';
    const firstRoom = Array.isArray(h.roomTypes) ? h.roomTypes[0] : undefined;
    const roomName = firstRoom?.name || plan.hotelPlan.roomType;
    const pricePerNight = isAsmaraPalace
      ? Number(firstRoom?.pricePerNightUSD) || 165
      : Number(firstRoom?.pricePerNightNFA) || (Number(firstRoom?.pricePerNightUSD) ? Number(firstRoom?.pricePerNightUSD) * 15 : 2800);
    const cityTigrinya = h.city.toLowerCase().includes('massawa')
      ? 'ባጽዕ'
      : h.city.toLowerCase().includes('keren')
      ? 'ከረን'
      : 'ኣስመራ';
    const hotelNameTigrinya = h.nameTigrinya || `ሆቴል ${h.name}`;

    updatePlan(plan.id, (p) => ({
      ...p,
      hotelPlan: {
        ...p.hotelPlan,
        hotelId: h.id,
        hotelName: h.name,
        hotelNameTigrinya,
        city: h.city,
        cityTigrinya,
        hotelEmail: h.email || p.hotelPlan.hotelEmail,
        roomType: roomName,
        currency,
        pricePerNight,
        totalAmount: pricePerNight * p.trip.nights * p.hotelPlan.numberOfRooms,
        letterOpeningTigrinya: `ብትካልና ኬክያ ወኪል ጉዕዞ ንቱሪዝማዊ ምብጻሕ ናብ ኤርትራ ንዝመጹ ኣጋይሽና ኣብ ${cityTigrinya} ንዝጸንሑለን መዓልታት ኣብ ሆቴልኩም ክፍልታት ክተሓዘሎም ብትሕትና ንሓትት።`,
      },
      visaPlan: {
        ...p.visaPlan,
        hotelArrangements: `${h.name} (${h.city})`,
      },
      permitPlan: {
        ...p.permitPlan,
        hotelName: h.name,
      },
    }));
  };

  const handleRewriteWithAi = async (plan: AutomationBookingPlan) => {
    setBusyAction('rewriting');
    setErrorMsg(null);
    try {
      const res = await api.post<{
        success: boolean;
        engine: string;
        model: string;
        drafts: {
          emailSubject?: string;
          emailBody?: string;
          letterOpeningTigrinya?: string;
          visaOfficialNotes?: string;
        };
      }>('ai/draft-booking-letters', {
        step: activeStage,
        plan,
        aiProvider,
      });
      setEngineUsed(res.engine);
      setModelUsed(res.model);
      if (res.drafts) {
        updatePlan(plan.id, (p) => ({
          ...p,
          hotelPlan: {
            ...p.hotelPlan,
            emailSubject: res.drafts.emailSubject || p.hotelPlan.emailSubject,
            emailBody: res.drafts.emailBody || p.hotelPlan.emailBody,
            letterOpeningTigrinya: res.drafts.letterOpeningTigrinya || p.hotelPlan.letterOpeningTigrinya,
          },
          visaPlan: {
            ...p.visaPlan,
            officialNotes: res.drafts.visaOfficialNotes || p.visaPlan.officialNotes,
          },
        }));
        setSuccessMsg('Refined hotel reservation email, Tigrinya hotel request letter, and VoA sponsorship letter.');
      }
    } catch (err: any) {
      setErrorMsg(err instanceof ApiError ? err.message : err?.message || 'Could not regenerate letters.');
    } finally {
      setBusyAction(null);
    }
  };

  const buildTouristProfileFromPlan = (plan: AutomationBookingPlan): TouristProfile => {
    const safeKey = getPlanSafeKey(plan);
    const paxCount = Math.max(1, Number(plan.traveler.paxCount) || 1);
    const companions = Array.isArray(plan.traveler.companions) ? plan.traveler.companions : [];
    const tourSituation =
      paxCount === 1 ? 'Single' : paxCount === 2 ? 'Couple' : paxCount <= 4 ? 'Family' : 'Group';

    return {
      id: `trav-auto-${safeKey}`,
      fullName: plan.traveler.fullName,
      nationality: plan.traveler.nationality || 'International',
      dateOfBirth: '1985-05-15',
      gender: plan.traveler.gender === 'Female' ? 'Female' : 'Male',
      passportNumber: plan.traveler.passportNumber || `PENDING-${safeKey.slice(-6).toUpperCase()}`,
      passportExpiry: plan.traveler.passportExpiry || '2031-06-30',
      occupation: plan.traveler.occupation || 'International Traveler',
      email: plan.traveler.email || 'client@eritreavisit.com',
      phone: plan.traveler.phone || '+291 1 12831',
      dietaryRequirements: 'None',
      medicalNotes: 'None',
      travelHistoryCount: 1,
      status: 'Active Traveler',
      avatar: '',
      notes: `Auto-created from email inquiry: ${plan.subject}`,
      preferredLanguage: 'English',
      tourSituation,
      partySize: paxCount,
      emergencyContact: {
        name: 'EritreaVisit 24/7 Operations Desk',
        relation: 'Tour Operator',
        phone: '+291 1 12831',
      },
      companions: companions.map((c, idx) => ({
        id: `comp-${safeKey}-${idx}`,
        fullName: c.fullName || 'Companion',
        passportNumber: c.passportNumber || 'PENDING',
        passportExpiry: '2031-06-30',
        nationality: c.nationality || plan.traveler.nationality || 'International',
        dateOfBirth: '1988-06-15',
        gender: c.gender === 'Female' ? 'Female' : 'Male',
        relationship: 'Travel Companion',
        occupation: c.occupation || 'Traveler',
      })),
    };
  };

  const buildHotelLetterFromPlan = (
    plan: AutomationBookingPlan,
    letterId: string,
    status: 'Draft' | 'Sent' = 'Draft'
  ): HotelLetterDoc => {
    const companions = Array.isArray(plan.traveler.companions) ? plan.traveler.companions : [];
    const nights = Math.max(1, Number(plan.trip.nights) || 4);
    const paxCount = Math.max(1, Number(plan.traveler.paxCount) || 1);

    return {
      id: letterId,
      refNumber: plan.hotelPlan.refNumber,
      date: plan.hotelPlan.letterDate,
      hotelId: plan.hotelPlan.hotelId,
      hotelName: plan.hotelPlan.hotelName,
      hotelNameTigrinya: plan.hotelPlan.hotelNameTigrinya,
      city: plan.hotelPlan.cityTigrinya || plan.hotelPlan.city,
      subjectTigrinya: plan.hotelPlan.letterSubjectTigrinya,
      salutationTigrinya: 'ሰላምታ ብምቕዳም',
      openingTigrinya: plan.hotelPlan.letterOpeningTigrinya,
      closingTigrinya: plan.hotelPlan.letterClosingTigrinya,
      signoffTigrinya: 'ዓወት ንሓፋሽ !!!',
      agencyNameTigrinya: 'ኬክያ ወኪል ጉዕዞ',
      tourPackageTitle: plan.trip.tourTitle,
      status,
      sentAt: status === 'Sent' ? new Date().toISOString().split('T')[0] : undefined,
      guests: [
        {
          id: `g-${letterId}-lead`,
          name: plan.traveler.fullName,
          noOfClients: companions.length > 0 ? 1 : paxCount,
          roomType: plan.hotelPlan.roomType,
          reservedDate: plan.trip.checkInDate,
          nights,
          remarks: `${plan.traveler.nationality}${plan.traveler.passportNumber ? ` · PP: ${plan.traveler.passportNumber}` : ''}`,
        },
        ...companions.map((c, idx) => ({
          id: `g-${letterId}-comp-${idx}`,
          name: c.fullName,
          noOfClients: 1,
          roomType: plan.hotelPlan.roomType,
          reservedDate: plan.trip.checkInDate,
          nights,
          remarks: `${c.nationality || plan.traveler.nationality}${c.passportNumber ? ` · PP: ${c.passportNumber}` : ''}`,
        })),
      ],
      notes: `Generated from email "${plan.subject}"`,
    };
  };

  const executeStage1Hotel = (plan: AutomationBookingPlan, baseProgress?: StageProgressState): StageProgressState => {
    const touristProfile = buildTouristProfileFromPlan(plan);
    onSaveTourist(touristProfile);

    const existingProgress = baseProgress || resolveProgressForPlan(plan);

    const safeKey = getPlanSafeKey(plan);
    const resId = existingProgress.reservationId || `res-auto-${safeKey}`;
    const letterId = existingProgress.hotelLetterId || `let-auto-${safeKey}`;
    const nights = Math.max(1, Number(plan.trip.nights) || 4);
    const numRooms = Math.max(1, Number(plan.hotelPlan.numberOfRooms) || 1);
    const isUsd = plan.hotelPlan.currency === 'USD';
    const rawNightly = Math.max(1, Number(plan.hotelPlan.pricePerNight) || (isUsd ? 165 : 2800));
    const pricePerNightUSD = isUsd ? rawNightly : Number((rawNightly / 15).toFixed(2));
    const pricePerNightERN = isUsd ? Math.round(rawNightly * 15) : Math.round(rawNightly);
    const totalUSD = Number((pricePerNightUSD * nights * numRooms).toFixed(2));
    const totalERN = Math.round(pricePerNightERN * nights * numRooms);
    const commissionRatePercent = 10;
    const calculatedCommissionUSD = Number(((totalUSD * commissionRatePercent) / 100).toFixed(2));
    const supplierPayableUSD = Number(Math.max(0, totalUSD - calculatedCommissionUSD).toFixed(2));
    const refTail = String(plan.hotelPlan.refNumber || safeKey).slice(-6).toUpperCase();

    const reservation: HotelReservation = {
      id: resId,
      confirmationCode: `VE-HTL-${refTail}`,
      hotelId: plan.hotelPlan.hotelId,
      hotelName: plan.hotelPlan.hotelName,
      hotelCity: plan.hotelPlan.city,
      roomTypeId: `rt-${plan.hotelPlan.roomType.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      roomTypeName: plan.hotelPlan.roomType,
      touristId: touristProfile.id,
      touristName: plan.traveler.fullName,
      touristPassport: touristProfile.passportNumber,
      touristNationality: plan.traveler.nationality,
      touristEmail: plan.traveler.email,
      touristPhone: plan.traveler.phone,
      tourPackageTitle: plan.trip.tourTitle,
      checkInDate: plan.trip.checkInDate,
      checkOutDate: plan.trip.checkOutDate,
      numberOfNights: nights,
      numberOfGuests: plan.traveler.paxCount,
      numberOfRooms: numRooms,
      mealPlan: plan.hotelPlan.mealPlan,
      currency: plan.hotelPlan.currency,
      pricePerNight: pricePerNightUSD,
      totalAmount: totalUSD,
      pricePerNightERN,
      totalAmountERN: totalERN,
      paymentStatus: 'Confirmed',
      voucherIssuedAt: new Date().toISOString().split('T')[0],
      airportTransferIncluded: true,
      commissionRatePercent,
      commissionEligibleAmount: totalUSD,
      calculatedCommissionUSD,
      supplierPayableUSD,
      commissionSettlementStatus: 'Pending',
    };
    onAddReservation(reservation);

    const letterDoc = buildHotelLetterFromPlan(
      plan,
      letterId,
      'Sent'
    );
    onSaveHotelLetter(letterDoc);

    const updatedProgress: StageProgressState = {
      ...existingProgress,
      hotelBooked: true,
      hotelEmailSent: true,
      reservationId: resId,
      hotelLetterId: letterId,
    };
    setProgressByPlan((prev) => ({ ...prev, [plan.id]: updatedProgress }));
    return updatedProgress;
  };

  const executeStage2Visa = (plan: AutomationBookingPlan, baseProgress?: StageProgressState): StageProgressState => {
    const touristProfile = buildTouristProfileFromPlan(plan);
    const existingProgress = baseProgress || resolveProgressForPlan(plan);
    const safeKey = getPlanSafeKey(plan);
    const visaId = existingProgress.visaDocId || `voa-auto-${safeKey}`;
    const companions = Array.isArray(plan.traveler.companions) ? plan.traveler.companions : [];

    const voaDoc: VisaOnArrivalDoc = {
      id: visaId,
      docNumber: plan.visaPlan.docNumber,
      referenceNumber: plan.visaPlan.referenceNumber,
      touristId: touristProfile.id,
      touristName: plan.traveler.fullName,
      passportNumber: touristProfile.passportNumber,
      passportExpiry: plan.traveler.passportExpiry || '2031-06-30',
      gender: plan.traveler.gender,
      nationality: plan.traveler.nationality || 'International',
      occupation: plan.traveler.occupation || 'International Traveler',
      job: plan.traveler.occupation || 'International Traveler',
      tourScheduleId: `sch-auto-${safeKey}`,
      tourPackageTitle: plan.trip.tourTitle,
      arrivalDate: plan.visaPlan.arrivalDate,
      departureDate: plan.visaPlan.departureDate,
      entryPort: plan.visaPlan.entryPort,
      localSponsorName: 'EritreaVisit Tours & Travel / Keckia Travel Agency',
      localSponsorLicense: 'LIC/TOUR/MOCT-88921-ET',
      hotelArrangements: `${plan.hotelPlan.hotelName} (${plan.hotelPlan.city})`,
      issuanceStatus: 'Approved',
      generatedAt: new Date().toISOString().split('T')[0],
      letterDate: new Date().toISOString().split('T')[0],
      officialNotes: plan.visaPlan.officialNotes,
      signatoryName: plan.visaPlan.signatoryName,
      signatoryTitle: plan.visaPlan.signatoryTitle,
      touristsManifest: [
        {
          name: plan.traveler.fullName,
          passportNo: touristProfile.passportNumber,
          gender: plan.traveler.gender,
          nationality: plan.traveler.nationality || 'International',
          job: plan.traveler.occupation || 'International Traveler',
        },
        ...companions.map((c) => ({
          name: c.fullName,
          passportNo: c.passportNumber || 'PENDING',
          gender: c.gender === 'Female' ? 'Female' : 'Male',
          nationality: c.nationality || plan.traveler.nationality || 'International',
          job: c.occupation || 'Traveler',
        })),
      ],
    };
    onSaveVoADoc(voaDoc);

    const updatedProgress: StageProgressState = {
      ...existingProgress,
      visaSaved: true,
      visaDocId: visaId,
    };
    setProgressByPlan((prev) => ({ ...prev, [plan.id]: updatedProgress }));
    return updatedProgress;
  };

  const executeStage3Permit = (plan: AutomationBookingPlan, baseProgress?: StageProgressState): StageProgressState => {
    const existingProgress = baseProgress || resolveProgressForPlan(plan);
    const safeKey = getPlanSafeKey(plan);
    const permitId = existingProgress.permitDocId || `pmt-auto-${safeKey}`;
    const companions = Array.isArray(plan.traveler.companions) ? plan.traveler.companions : [];
    const leadPassport = plan.traveler.passportNumber || `PENDING-${safeKey.slice(-6).toUpperCase()}`;

    const permitDoc: RegionalPermitDoc = {
      id: permitId,
      permitNumber: plan.permitPlan.permitNumber,
      referenceNumber: plan.permitPlan.referenceNumber,
      zoneName: plan.permitPlan.zoneName,
      zoneType: plan.permitPlan.zoneType,
      tourScheduleId: `sch-auto-${safeKey}`,
      tourPackageTitle: plan.trip.tourTitle,
      leadGuideName: plan.permitPlan.leadGuideName,
      leadGuidePhone: plan.permitPlan.leadGuidePhone,
      leadGuideId: plan.permitPlan.guideLicenseNo,
      guideLicenseNo: plan.permitPlan.guideLicenseNo,
      touristNames: [plan.traveler.fullName, ...companions.map((c) => c.fullName)],
      touristPassports: [leadPassport, ...companions.map((c) => c.passportNumber || 'PENDING')],
      validFrom: plan.permitPlan.validFrom,
      validTo: plan.permitPlan.validTo,
      vehiclePlate: plan.permitPlan.vehiclePlate,
      vehicleType: plan.permitPlan.vehicleType,
      hotelName: plan.hotelPlan.hotelName,
      authorityOffice: plan.permitPlan.authorityOffice,
      status: 'Active',
      specialClearanceCode: `CLR-${plan.permitPlan.permitNumber.slice(-4)}`,
      emergencyRadioFreq: '146.520 MHz (VHF Ch. 4)',
      issuedAt: new Date().toISOString().split('T')[0],
      letterDate: new Date().toISOString().split('T')[0],
      touristsManifest: [
        {
          number: 1,
          name: plan.traveler.fullName,
          nationality: plan.traveler.nationality || 'International',
          passportNumber: leadPassport,
          sex: plan.traveler.gender,
          tourDate: `${plan.permitPlan.validFrom} - ${plan.permitPlan.validTo}`,
          tourPlace: plan.permitPlan.zoneName,
          hotel: plan.hotelPlan.hotelName,
        },
        ...companions.map((c, idx) => ({
          number: idx + 2,
          name: c.fullName,
          nationality: c.nationality || plan.traveler.nationality || 'International',
          passportNumber: c.passportNumber || 'PENDING',
          sex: c.gender === 'Female' ? 'Female' : 'Male',
          tourDate: `${plan.permitPlan.validFrom} - ${plan.permitPlan.validTo}`,
          tourPlace: plan.permitPlan.zoneName,
          hotel: plan.hotelPlan.hotelName,
        })),
      ],
      driversManifest: [
        {
          driverName: plan.permitPlan.driverName,
          phoneNumber: plan.permitPlan.driverPhone,
          phone: plan.permitPlan.driverPhone,
          licenseNumber: plan.permitPlan.driverLicense,
          taseraNo: plan.permitPlan.driverLicense,
          vehicleType: plan.permitPlan.vehicleType,
          carType: plan.permitPlan.vehicleType,
          plateNumber: plan.permitPlan.vehiclePlate,
          carPlate: plan.permitPlan.vehiclePlate,
        },
      ],
      itineraryStops: plan.permitPlan.stops,
    };
    onSavePermitDoc(permitDoc);

    const updatedProgress: StageProgressState = {
      ...existingProgress,
      permitSaved: true,
      permitDocId: permitId,
    };
    setProgressByPlan((prev) => ({ ...prev, [plan.id]: updatedProgress }));
    return updatedProgress;
  };

  const handleRunFullSequence = (plan: AutomationBookingPlan) => {
    setErrorMsg(null);
    const step1 = executeStage1Hotel(plan);
    const step2 = executeStage2Visa(plan, step1);
    executeStage3Permit(plan, step2);
    setActiveStage('permit');
    setSuccessMsg(
      `Completed full sequence for ${plan.traveler.fullName}: Hotel booking & letter (${plan.hotelPlan.hotelName}) → Visa on Arrival (${plan.visaPlan.docNumber}) → Travel Permit (${plan.permitPlan.permitNumber}).`
    );
    if (onNotify) {
      onNotify(
        'Email Booking Sequence Completed',
        `${plan.traveler.fullName}: Hotel booking & letter, Visa on Arrival, and Travel Permit created in sequence.`,
        'documents'
      );
    }
  };

  const runFullSequenceForBatch = (targetPlans: AutomationBookingPlan[], onlyUnprocessed = false) => {
    const candidates = targetPlans.filter((p) => {
      if (p.isBookingInquiry === false) return false;
      if (!onlyUnprocessed) return true;
      const st = resolveProgressForPlan(p);
      return !(st.hotelBooked && st.hotelEmailSent && st.visaSaved && st.permitSaved);
    });
    if (candidates.length === 0) return;

    const nextProgress: Record<string, StageProgressState> = { ...progressByPlan };
    for (const plan of candidates) {
      const existing = resolveProgressForPlan(plan, nextProgress[plan.id]);
      const s1 = existing.hotelBooked && existing.hotelEmailSent ? existing : executeStage1Hotel(plan, existing);
      const s2 = existing.visaSaved ? s1 : executeStage2Visa(plan, s1);
      const s3 = existing.permitSaved ? s2 : executeStage3Permit(plan, s2);
      nextProgress[plan.id] = {
        ...s3,
        hotelBooked: true,
        hotelEmailSent: true,
        visaSaved: true,
        permitSaved: true,
      };
    }
    setProgressByPlan(nextProgress);
    setSuccessMsg(
      `Automatically completed all 3 stages (01. Hotel Booking & Letter → 02. Visa on Arrival → 03. Travel Permit) for ${candidates.length} inquiry(s) from ${AGENCY_EMAIL}.`
    );
  };

  const openBatchEmailModal = (targetPlans: AutomationBookingPlan[] = plans) => {
    const drafts: BatchEmailDraftItem[] = targetPlans
      .filter((p) => p.isBookingInquiry !== false)
      .map((p) => ({
        planId: p.id,
        travelerName: p.traveler.fullName,
        hotelName: p.hotelPlan.hotelName,
        to: p.hotelPlan.hotelEmail,
        subject: p.hotelPlan.emailSubject,
        bodyText: p.hotelPlan.emailBody,
        selected: true,
      }));
    if (drafts.length > 0) {
      setBatchEmailQueue(drafts);
    }
  };

  const handleConfirmSendGmail = async () => {
    if (!pendingEmailSend || sendingEmail) return;
    setSendingEmail(true);
    setErrorMsg(null);
    try {
      const sent = await sendGmailEmail({
        to: pendingEmailSend.to,
        subject: pendingEmailSend.subject,
        bodyText: pendingEmailSend.bodyText,
      });
      setGmailConnected(true);
      const matchedPlan = plans.find((p) => p.id === pendingEmailSend.planId);
      if (matchedPlan) {
        const letterId = resolvedProgressByPlan[matchedPlan.id]?.hotelLetterId || `let-auto-${getPlanSafeKey(matchedPlan)}`;
        onSaveHotelLetter(buildHotelLetterFromPlan(matchedPlan, letterId, 'Sent'));
      }
      setProgressByPlan((prev) => ({
        ...prev,
        [pendingEmailSend.planId]: {
          ...(resolvedProgressByPlan[pendingEmailSend.planId] || prev[pendingEmailSend.planId] || {
            hotelBooked: true,
            hotelEmailSent: false,
            visaSaved: false,
            permitSaved: false,
          }),
          hotelEmailSent: true,
          gmailSentMessageId: sent.id,
        },
      }));
      setSuccessMsg(`Hotel reservation email sent via ${AGENCY_EMAIL} to ${pendingEmailSend.to}.`);
      setPendingEmailSend(null);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to send email via Gmail.');
    } finally {
      setSendingEmail(false);
    }
  };

  const handleConfirmSendBatchGmail = async () => {
    if (!batchEmailQueue || sendingEmail) return;
    const toSend = batchEmailQueue.filter((item) => item.selected && item.to.trim());
    if (toSend.length === 0) {
      setBatchEmailQueue(null);
      return;
    }

    setSendingEmail(true);
    setErrorMsg(null);
    setBatchSendingStatus({ sent: 0, total: toSend.length });

    let sentCount = 0;
    try {
      for (const item of toSend) {
        const sent = await sendGmailEmail({
          to: item.to.trim(),
          subject: item.subject,
          bodyText: item.bodyText,
        });
        sentCount++;
        setBatchSendingStatus({ sent: sentCount, total: toSend.length });

        const matchedPlan = plans.find((p) => p.id === item.planId);
        if (matchedPlan) {
          const letterId = resolvedProgressByPlan[matchedPlan.id]?.hotelLetterId || `let-auto-${getPlanSafeKey(matchedPlan)}`;
          onSaveHotelLetter(buildHotelLetterFromPlan(matchedPlan, letterId, 'Sent'));
        }
        setProgressByPlan((prev) => ({
          ...prev,
          [item.planId]: {
            ...(resolvedProgressByPlan[item.planId] || prev[item.planId] || {
              hotelBooked: true,
              hotelEmailSent: false,
              visaSaved: true,
              permitSaved: true,
            }),
            hotelEmailSent: true,
            gmailSentMessageId: sent.id,
          },
        }));
      }
      setGmailConnected(true);
      setSuccessMsg(`Sent ${sentCount} hotel reservation email(s) via ${AGENCY_EMAIL}.`);
      setBatchEmailQueue(null);
    } catch (err: any) {
      setErrorMsg(
        `Sent ${sentCount}/${toSend.length} emails before error: ${err?.message || 'Gmail dispatch failed.'}`
      );
    } finally {
      setSendingEmail(false);
      setBatchSendingStatus(null);
    }
  };

  const geminiAcct = aiAccounts.find((a) => a.providerId === 'gemini');
  const openAiAcct = aiAccounts.find((a) => a.providerId === 'openai');
  const anthropicAcct = aiAccounts.find((a) => a.providerId === 'anthropic');
  const chatGptReady = openAiAcct ? openAiAcct.enabled : statusInfo ? Boolean(statusInfo.openAiConfigured) : true;
  const claudeReady = anthropicAcct ? anthropicAcct.enabled : statusInfo ? Boolean(statusInfo.claudeConfigured) : true;
  const geminiReady = geminiAcct ? geminiAcct.enabled : statusInfo ? Boolean(statusInfo.geminiConfigured) : true;

  return (
    <div className="space-y-4 font-sans text-slate-900">
      {/* Top Integration & Operations Bar */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="p-5 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900">
              Email &amp; AI Automated Booking Pipeline
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500 tabular-nums">
              <span>
                Mailbox:{' '}
                <strong className="font-mono text-slate-900">{statusInfo?.agencyEmail || AGENCY_EMAIL}</strong>
                {connectedMailbox
                  ? connectedMailbox === AGENCY_EMAIL
                    ? ' (Verified)'
                    : ` (Filtered inside ${connectedMailbox})`
                  : gmailConnected
                  ? ' (Authorized)'
                  : ' (Active)'}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                OpenAI <span className="font-mono">{openAiAcct?.accountEmail || 'sniffweb@gmail.com'}</span>{' '}
                <span className={chatGptReady ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-medium'}>
                  ({chatGptReady ? 'Active' : 'Paused'})
                </span>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Anthropic <span className="font-mono">{anthropicAcct?.accountEmail || 'philikesete@gmail.com'}</span>{' '}
                <span className={claudeReady ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-medium'}>
                  ({claudeReady ? 'Active' : 'Paused'})
                </span>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Gemini <span className="font-mono">{geminiAcct?.accountEmail || 'philikesete@gmail.com'}</span>{' '}
                <span className={geminiReady ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-medium'}>
                  ({geminiReady ? 'Active' : 'Paused'})
                </span>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Engine:{' '}
                <strong className="font-mono text-slate-900">
                  {engineUsed.toUpperCase()} ({modelUsed})
                </strong>
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <select
              value={aiProvider}
              onChange={(e) => {
                const next = e.target.value as AiProviderChoice;
                setAiProvider(next);
                if (next === 'claude') {
                  setEngineUsed('claude');
                  setModelUsed('claude-3-5-sonnet-latest');
                } else if (next === 'gemini') {
                  setEngineUsed('gemini');
                  setModelUsed('gemini-2.5-flash');
                } else {
                  setEngineUsed('chatgpt');
                  setModelUsed('gpt-4o-mini');
                }
              }}
              aria-label="Preferred AI Engine"
              className="min-h-10 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-800"
            >
              <option value="auto">AI: Auto (ChatGPT → Claude → Gemini)</option>
              <option value="chatgpt">ChatGPT (sniffweb@gmail.com)</option>
              <option value="claude">Claude (philikesete@gmail.com)</option>
              <option value="gemini">Gemini (philikesete@gmail.com)</option>
            </select>

            <label className="min-h-10 flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer select-none whitespace-nowrap">
              <input
                type="checkbox"
                checked={autoExecuteOnCheck}
                onChange={(e) => setAutoExecuteOnCheck(e.target.checked)}
                className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
              />
              <span>Auto-run sequence</span>
            </label>

            <button
              type="button"
              onClick={() => runEmailBookingAnalysis(syncedInboxEmails, true)}
              disabled={busyAction !== null || syncedInboxEmails.length === 0}
              className="min-h-10 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap shrink-0 tabular-nums"
            >
              {busyAction === 'analyzing' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-600" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              )}
              <span>Run Synced ({syncedInboxEmails.length})</span>
            </button>

            {gmailConnected && (
              <button
                type="button"
                onClick={() => handleConnectAndCheckGmail(true, false)}
                disabled={busyAction !== null}
                className="min-h-10 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap shrink-0"
                title={`Switch Google account to ${AGENCY_EMAIL}`}
              >
                <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                <span>Switch Account</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleEverythingAutomatically}
              disabled={busyAction !== null}
              className="min-h-10 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition cursor-pointer disabled:opacity-50 flex items-center gap-2 whitespace-nowrap shrink-0"
            >
              {busyAction === 'gmail' || busyAction === 'analyzing' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Mail className="w-4 h-4" />
              )}
              <span>Handle Everything ({AGENCY_EMAIL})</span>
            </button>
          </div>
        </div>

        {/* Connected AI Provider Accounts & Agency Mailbox (Pre-filled) */}
        <div className="border-t border-slate-200 bg-white px-5 py-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setShowAccountsPanel((prev) => !prev)}
              className="text-xs font-bold text-slate-900 flex items-center gap-2 cursor-pointer"
            >
              <span>Connected AI &amp; Email Accounts ({aiAccounts.filter((a) => a.enabled).length}/4 Active)</span>
              <span className="font-normal text-slate-500">
                {showAccountsPanel ? 'Hide details' : 'Show & edit'}
              </span>
            </button>

            <div className="flex flex-wrap items-center gap-2">
              {firestoreSyncedCount > 0 && (
                <span className="text-[11px] font-mono text-emerald-700">
                  Firestore Synced ({firestoreSyncedCount}/4)
                </span>
              )}
              <button
                type="button"
                onClick={() => handleSaveAccountsEverywhere(DEFAULT_AI_PROVIDER_ACCOUNTS, false)}
                disabled={savingAccounts}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 transition cursor-pointer disabled:opacity-50"
              >
                Reset Pre-filled Defaults
              </button>
              <button
                type="button"
                onClick={() => handleSaveAccountsEverywhere(aiAccounts, !auth.currentUser?.emailVerified)}
                disabled={savingAccounts}
                className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {savingAccounts && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>
                  {auth.currentUser?.emailVerified ? 'Save & Sync to Firestore' : 'Save & Sync Accounts'}
                </span>
              </button>
            </div>
          </div>

          {showAccountsPanel && (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 text-xs">
              {aiAccounts.map((acct, index) => (
                <div
                  key={acct.providerId}
                  className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-900 truncate">{acct.providerLabel}</span>
                    <label className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={acct.enabled}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setAiAccounts((prev) =>
                            prev.map((item, i) => (i === index ? { ...item, enabled: checked } : item))
                          );
                        }}
                        className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                      />
                      <span>{acct.enabled ? 'Active' : 'Paused'}</span>
                    </label>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-0.5">
                      Account Email
                    </label>
                    <input
                      type="email"
                      value={acct.accountEmail}
                      onChange={(e) => {
                        const val = e.target.value;
                        setAiAccounts((prev) =>
                          prev.map((item, i) => (i === index ? { ...item, accountEmail: val } : item))
                        );
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-mono text-[11px] text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-0.5">
                      Model / Runtime
                    </label>
                    <input
                      type="text"
                      value={acct.defaultModel}
                      onChange={(e) => {
                        const val = e.target.value;
                        setAiAccounts((prev) =>
                          prev.map((item, i) => (i === index ? { ...item, defaultModel: val } : item))
                        );
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-mono text-[11px] text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-0.5">
                      Workspace &amp; Workflow Role
                    </label>
                    <input
                      type="text"
                      value={acct.pipelineRole}
                      onChange={(e) => {
                        const val = e.target.value;
                        setAiAccounts((prev) =>
                          prev.map((item, i) => (i === index ? { ...item, pipelineRole: val } : item))
                        );
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-[11px] text-slate-700"
                    />
                  </div>

                  <div className="pt-0.5 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                    <span className="truncate">{acct.credentialSource}</span>
                    <span className="shrink-0">P{acct.routingPriority}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Organized Single-Elevation Pipeline Ledger Strip */}
        <div className="border-t border-slate-200 bg-slate-50/60 px-5 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-6 text-xs tabular-nums">
            <div>
              <span className="text-slate-500">Booking Inquiries</span>
              <span className="ml-2 font-mono font-bold text-slate-900">
                {summaryStats.bookingCount}/{summaryStats.totalEmails}
              </span>
            </div>
            <div>
              <span className="text-slate-500">01. Hotels &amp; Letters</span>
              <span className="ml-2 font-mono font-bold text-slate-900">
                {summaryStats.hotelsDone}/{summaryStats.bookingCount}
              </span>
            </div>
            <div>
              <span className="text-slate-500">02. Visas</span>
              <span className="ml-2 font-mono font-bold text-slate-900">
                {summaryStats.visasDone}/{summaryStats.bookingCount}
              </span>
            </div>
            <div>
              <span className="text-slate-500">03. Permits</span>
              <span className="ml-2 font-mono font-bold text-slate-900">
                {summaryStats.permitsDone}/{summaryStats.bookingCount}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Hotel Emails Sent</span>
              <span className="ml-2 font-mono font-bold text-emerald-700">
                {summaryStats.emailsSent}/{summaryStats.bookingCount}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {plans.length > 0 && (
              <button
                type="button"
                onClick={() => runFullSequenceForBatch(plans, false)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-800 transition cursor-pointer whitespace-nowrap shrink-0 tabular-nums"
              >
                Execute All ({summaryStats.bookingCount})
              </button>
            )}
            {summaryStats.unsentHotelPlans.length > 0 && (
              <button
                type="button"
                onClick={() => openBatchEmailModal(plans)}
                className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 tabular-nums"
              >
                <Send className="w-3 h-3" />
                <span>Send Pending Hotel Emails ({summaryStats.unsentHotelPlans.length})</span>
              </button>
            )}
          </div>
        </div>

        {errorMsg && (
          <div className="mx-5 my-3 flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
            <button type="button" onClick={() => setErrorMsg(null)} className="text-rose-600 hover:text-rose-800 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {successMsg && (
          <div className="mx-5 my-3 flex items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-900">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
              <span>{successMsg}</span>
            </div>
            <button type="button" onClick={() => setSuccessMsg(null)} className="text-emerald-700 hover:text-emerald-900 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Main Split Workspace: Left Email Queue + Right Sequential Booking Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left Queue */}
        <div className="lg:col-span-4 rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="p-3.5 border-b border-slate-200 bg-slate-50 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-900 tabular-nums">
                Inbox Queue ({filteredPlans.length})
              </span>
              <span className="text-[11px] font-mono text-slate-500 truncate">
                {engineUsed === 'chatgpt'
                  ? `ChatGPT · ${modelUsed}`
                  : engineUsed === 'claude'
                  ? `Claude · ${modelUsed}`
                  : engineUsed === 'gemini'
                  ? `Gemini · ${modelUsed}`
                  : engineUsed}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-1 p-0.5 rounded-lg bg-slate-200/70 text-[11px] font-semibold">
              {([
                { id: 'all', label: 'All' },
                { id: 'bookings', label: 'Bookings' },
                { id: 'pending', label: 'Pending' },
                { id: 'completed', label: 'Done' },
              ] as const).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setQueueFilter(tab.id)}
                  className={`py-1 rounded-md transition cursor-pointer ${
                    queueFilter === tab.id ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={queueSearch}
                onChange={(e) => setQueueSearch(e.target.value)}
                placeholder="Filter by traveler, hotel, or subject..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-slate-400"
              />
            </div>
          </div>

          <div className="divide-y divide-slate-100 max-h-[650px] overflow-y-auto">
            {busyAction === 'analyzing' && plans.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 space-y-2">
                <Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-400" />
                <p>Organizing {AGENCY_EMAIL} inquiries into Hotels → Visas → Permits…</p>
              </div>
            ) : filteredPlans.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 space-y-3">
                <p>
                  {plans.length === 0
                    ? `No emails loaded yet. Click "Handle Everything (${AGENCY_EMAIL})" or "Run Synced" above.`
                    : 'No inquiries match your current queue filter.'}
                </p>
              </div>
            ) : (
              filteredPlans.map((plan) => {
                const isSelected = selectedPlan?.id === plan.id;
                const prog = resolvedProgressByPlan[plan.id];
                const doneCount =
                  (prog?.hotelBooked ? 1 : 0) + (prog?.visaSaved ? 1 : 0) + (prog?.permitSaved ? 1 : 0);

                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlanId(plan.id)}
                    className={`w-full text-left px-4 py-3.5 transition cursor-pointer ${
                      isSelected ? 'bg-slate-900 text-white' : 'bg-white hover:bg-slate-50 text-slate-900'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold truncate">{plan.traveler.fullName}</span>
                      <span
                        className={`text-[11px] font-mono tabular-nums shrink-0 ${
                          isSelected
                            ? doneCount === 3
                              ? 'text-emerald-300'
                              : 'text-amber-300'
                            : doneCount === 3
                            ? 'text-emerald-700'
                            : 'text-slate-500'
                        }`}
                      >
                        {plan.isBookingInquiry === false ? 'General' : `${doneCount}/3 steps`}
                      </span>
                    </div>
                    <p
                      className={`mt-1 text-xs font-medium truncate ${
                        isSelected ? 'text-slate-200' : 'text-slate-700'
                      }`}
                    >
                      {plan.subject}
                    </p>
                    <div
                      className={`mt-1.5 text-[11px] font-mono tabular-nums truncate ${
                        isSelected ? 'text-slate-400' : 'text-slate-500'
                      }`}
                    >
                      {plan.hotelPlan.hotelName} · {plan.trip.checkInDate} · {plan.traveler.paxCount} pax
                      {prog?.hotelEmailSent ? ' · Sent' : ''}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Detail & 3-Stage Sequence */}
        <div className="lg:col-span-8 rounded-2xl border border-slate-200 bg-white overflow-hidden">
          {!selectedPlan ? (
            <div className="p-12 text-center text-sm text-slate-500">
              Select an email on the left to review the traveler dossier and execute Hotel → Visa → Travel Permit automation.
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {/* Dossier Header & Run Full Sequence */}
              <div className="p-5 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs text-slate-500 truncate font-mono tabular-nums">
                    From {selectedPlan.from} · {selectedPlan.trip.checkInDate} → {selectedPlan.trip.checkOutDate} ({selectedPlan.trip.nights} nights)
                  </div>
                  <h3 className="mt-1 text-base font-bold text-slate-900 truncate">{selectedPlan.subject}</h3>
                  <p className="mt-0.5 text-xs text-slate-600">{selectedPlan.confidenceNote}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleRewriteWithAi(selectedPlan)}
                    disabled={busyAction !== null}
                    className="min-h-10 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    {busyAction === 'rewriting' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" />
                    )}
                    <span>Refine Letters</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRunFullSequence(selectedPlan)}
                    className="min-h-10 px-4 py-2 rounded-xl brand-gradient text-white text-xs font-bold shadow-brand hover:brightness-105 transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Run Sequence (Hotel → Visa → Permit)</span>
                  </button>
                </div>
              </div>

              {/* Editable Traveler Details Strip */}
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
                <div className="lg:col-span-2">
                  <label className="block font-semibold text-slate-600 mb-1">Lead Traveler</label>
                  <input
                    type="text"
                    value={selectedPlan.traveler.fullName}
                    onChange={(e) =>
                      updatePlan(selectedPlan.id, (p) => ({
                        ...p,
                        traveler: { ...p.traveler, fullName: e.target.value },
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-900 font-medium"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Nationality</label>
                  <input
                    type="text"
                    value={selectedPlan.traveler.nationality}
                    onChange={(e) =>
                      updatePlan(selectedPlan.id, (p) => ({
                        ...p,
                        traveler: { ...p.traveler, nationality: e.target.value },
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Gender</label>
                  <select
                    value={selectedPlan.traveler.gender}
                    onChange={(e) =>
                      updatePlan(selectedPlan.id, (p) => ({
                        ...p,
                        traveler: {
                          ...p.traveler,
                          gender: e.target.value === 'Female' ? 'Female' : 'Male',
                        },
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-900"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Passport &amp; Pax</label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={selectedPlan.traveler.passportNumber}
                      placeholder="Passport"
                      onChange={(e) =>
                        updatePlan(selectedPlan.id, (p) => ({
                          ...p,
                          traveler: { ...p.traveler, passportNumber: e.target.value },
                        }))
                      }
                      className="w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-900 font-mono"
                    />
                    <input
                      type="number"
                      min={1}
                      max={40}
                      value={selectedPlan.traveler.paxCount}
                      aria-label="Number of Travelers"
                      onChange={(e) => {
                        const pax = Math.max(1, Number(e.target.value) || 1);
                        updatePlan(selectedPlan.id, (p) => ({
                          ...p,
                          traveler: { ...p.traveler, paxCount: pax },
                        }));
                      }}
                      className="w-16 px-2 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-900 font-mono tabular-nums text-center"
                    />
                  </div>
                </div>
              </div>

              {/* Sequential 3-Step Tabs */}
              <div className="px-5 py-3 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveStage('hotel')}
                    className={`min-h-10 px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-2 whitespace-nowrap shrink-0 ${
                      activeStage === 'hotel'
                        ? 'bg-slate-900 text-white'
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Building className="w-3.5 h-3.5" />
                    <span>01. Hotels &amp; Letter</span>
                    {selectedProgress.hotelBooked && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                  </button>

                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />

                  <button
                    type="button"
                    onClick={() => setActiveStage('visa')}
                    className={`min-h-10 px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-2 whitespace-nowrap shrink-0 ${
                      activeStage === 'visa'
                        ? 'bg-slate-900 text-white'
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>02. Visa on Arrival</span>
                    {selectedProgress.visaSaved && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                  </button>

                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />

                  <button
                    type="button"
                    onClick={() => setActiveStage('permit')}
                    className={`min-h-10 px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-2 whitespace-nowrap shrink-0 ${
                      activeStage === 'permit'
                        ? 'bg-slate-900 text-white'
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Compass className="w-3.5 h-3.5" />
                    <span>03. Travel Permits</span>
                    {selectedProgress.permitSaved && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                  </button>
                </div>

                {onNavigate && (
                  <div className="flex items-center gap-3 text-xs">
                    <button
                      type="button"
                      onClick={() => onNavigate('hotels')}
                      className="font-semibold text-slate-600 hover:text-slate-900 underline cursor-pointer whitespace-nowrap"
                    >
                      Open Hotels
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate('documents')}
                      className="font-semibold text-slate-600 hover:text-slate-900 underline cursor-pointer whitespace-nowrap"
                    >
                      Open Visas &amp; Permits
                    </button>
                  </div>
                )}
              </div>

              {/* STAGE 1: HOTELS BOOKING & LETTERS */}
              {activeStage === 'hotel' && (
                <div className="p-5 space-y-4 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Target Hotel</label>
                      <select
                        value={selectedPlan.hotelPlan.hotelId}
                        onChange={(e) => handleHotelSelectionChange(selectedPlan, e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 font-semibold"
                      >
                        {hotels.map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.name} ({h.city})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Hotel Reservations Email</label>
                      <input
                        type="email"
                        value={selectedPlan.hotelPlan.hotelEmail}
                        onChange={(e) =>
                          updatePlan(selectedPlan.id, (p) => ({
                            ...p,
                            hotelPlan: { ...p.hotelPlan, hotelEmail: e.target.value },
                          }))
                        }
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">
                        Rate &amp; Currency ({selectedPlan.hotelPlan.currency})
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          value={selectedPlan.hotelPlan.pricePerNight}
                          onChange={(e) => {
                            const rate = Number(e.target.value) || 0;
                            updatePlan(selectedPlan.id, (p) => ({
                              ...p,
                              hotelPlan: {
                                ...p.hotelPlan,
                                pricePerNight: rate,
                                totalAmount: rate * p.trip.nights * p.hotelPlan.numberOfRooms,
                              },
                            }));
                          }}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-mono tabular-nums"
                        />
                        <select
                          value={selectedPlan.hotelPlan.currency}
                          onChange={(e) =>
                            updatePlan(selectedPlan.id, (p) => ({
                              ...p,
                              hotelPlan: {
                                ...p.hotelPlan,
                                currency: e.target.value === 'USD' ? 'USD' : 'ERN',
                              },
                            }))
                          }
                          className="px-2.5 py-2 rounded-xl border border-slate-200 bg-slate-50 font-mono font-bold"
                        >
                          <option value="USD">USD</option>
                          <option value="ERN">ERN</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Room Type</label>
                      <input
                        type="text"
                        value={selectedPlan.hotelPlan.roomType}
                        onChange={(e) =>
                          updatePlan(selectedPlan.id, (p) => ({
                            ...p,
                            hotelPlan: { ...p.hotelPlan, roomType: e.target.value },
                          }))
                        }
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Check-in Date</label>
                      <input
                        type="date"
                        value={selectedPlan.trip.checkInDate}
                        onChange={(e) => {
                          const nextCheckIn = e.target.value;
                          updatePlan(selectedPlan.id, (p) => {
                            const nights = computeNights(nextCheckIn, p.trip.checkOutDate, p.trip.nights);
                            return {
                              ...p,
                              trip: { ...p.trip, checkInDate: nextCheckIn, nights },
                              hotelPlan: {
                                ...p.hotelPlan,
                                totalAmount: p.hotelPlan.pricePerNight * nights * p.hotelPlan.numberOfRooms,
                              },
                              visaPlan: { ...p.visaPlan, arrivalDate: nextCheckIn },
                              permitPlan: { ...p.permitPlan, validFrom: nextCheckIn },
                            };
                          });
                        }}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-mono tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Check-out Date</label>
                      <input
                        type="date"
                        value={selectedPlan.trip.checkOutDate}
                        onChange={(e) => {
                          const nextCheckOut = e.target.value;
                          updatePlan(selectedPlan.id, (p) => {
                            const nights = computeNights(p.trip.checkInDate, nextCheckOut, p.trip.nights);
                            return {
                              ...p,
                              trip: { ...p.trip, checkOutDate: nextCheckOut, nights },
                              hotelPlan: {
                                ...p.hotelPlan,
                                totalAmount: p.hotelPlan.pricePerNight * nights * p.hotelPlan.numberOfRooms,
                              },
                              visaPlan: { ...p.visaPlan, departureDate: nextCheckOut },
                              permitPlan: { ...p.permitPlan, validTo: nextCheckOut },
                            };
                          });
                        }}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-mono tabular-nums"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">
                      Official Hotel Request Letter (Tigrinya Opening Paragraph · Ref {selectedPlan.hotelPlan.refNumber})
                    </label>
                    <textarea
                      rows={3}
                      value={selectedPlan.hotelPlan.letterOpeningTigrinya}
                      onChange={(e) =>
                        updatePlan(selectedPlan.id, (p) => ({
                          ...p,
                          hotelPlan: { ...p.hotelPlan, letterOpeningTigrinya: e.target.value },
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white font-serif leading-relaxed"
                    />
                  </div>

                  <div className="space-y-2 pt-2 border-t border-slate-200">
                    <label className="block font-semibold text-slate-600">
                      Outgoing Hotel Booking Email Subject
                    </label>
                    <input
                      type="text"
                      value={selectedPlan.hotelPlan.emailSubject}
                      onChange={(e) =>
                        updatePlan(selectedPlan.id, (p) => ({
                          ...p,
                          hotelPlan: { ...p.hotelPlan, emailSubject: e.target.value },
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white font-medium"
                    />
                    <label className="block font-semibold text-slate-600 pt-1">
                      Outgoing Hotel Booking Email Body
                    </label>
                    <textarea
                      rows={6}
                      value={selectedPlan.hotelPlan.emailBody}
                      onChange={(e) =>
                        updatePlan(selectedPlan.id, (p) => ({
                          ...p,
                          hotelPlan: { ...p.hotelPlan, emailBody: e.target.value },
                        }))
                      }
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white leading-relaxed"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <div className="text-xs text-slate-500 tabular-nums">
                      Total Estimate ({selectedPlan.trip.nights} nights × {selectedPlan.hotelPlan.numberOfRooms} room):{' '}
                      <strong className="font-mono text-slate-900">
                        {(selectedPlan.hotelPlan.pricePerNight * selectedPlan.trip.nights * selectedPlan.hotelPlan.numberOfRooms).toLocaleString()} {selectedPlan.hotelPlan.currency}
                      </strong>
                      {selectedProgress.hotelEmailSent && (
                        <span className="text-emerald-700 font-semibold"> · Email sent via Gmail</span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          executeStage1Hotel(selectedPlan);
                          setActiveStage('visa');
                          setSuccessMsg(`Hotel booking & official letter saved for ${selectedPlan.hotelPlan.hotelName}. Ready for Stage 2 (Visa).`);
                        }}
                        className="min-h-10 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{selectedProgress.hotelBooked ? 'Update Hotel & Next: Visa' : 'Book Hotel, Save Letter & Next: Visa'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setPendingEmailSend({
                            planId: selectedPlan.id,
                            to: selectedPlan.hotelPlan.hotelEmail,
                            subject: selectedPlan.hotelPlan.emailSubject,
                            bodyText: selectedPlan.hotelPlan.emailBody,
                          })
                        }
                        className="min-h-10 px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-900 text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>{selectedProgress.hotelEmailSent ? 'Resend Hotel Email' : 'Send Email to Hotel'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* STAGE 2: VISA ON ARRIVAL */}
              {activeStage === 'visa' && (
                <div className="p-5 space-y-4 text-xs">
                  <div className="text-xs text-slate-600 font-mono tabular-nums">
                    Stage 1 Hotel Link: <strong className="font-sans text-slate-900">{selectedPlan.hotelPlan.hotelName} ({selectedPlan.hotelPlan.city})</strong> · {selectedPlan.visaPlan.arrivalDate} → {selectedPlan.visaPlan.departureDate}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">VoA Document No.</label>
                      <input
                        type="text"
                        value={selectedPlan.visaPlan.docNumber}
                        onChange={(e) =>
                          updatePlan(selectedPlan.id, (p) => ({
                            ...p,
                            visaPlan: { ...p.visaPlan, docNumber: e.target.value },
                          }))
                        }
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Entry Port</label>
                      <input
                        type="text"
                        value={selectedPlan.visaPlan.entryPort}
                        onChange={(e) =>
                          updatePlan(selectedPlan.id, (p) => ({
                            ...p,
                            visaPlan: { ...p.visaPlan, entryPort: e.target.value },
                          }))
                        }
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Consular Signatory</label>
                      <input
                        type="text"
                        value={selectedPlan.visaPlan.signatoryName}
                        onChange={(e) =>
                          updatePlan(selectedPlan.id, (p) => ({
                            ...p,
                            visaPlan: { ...p.visaPlan, signatoryName: e.target.value },
                          }))
                        }
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">
                      Visa on Arrival Sponsorship Letter Body (Department of Immigration)
                    </label>
                    <textarea
                      rows={6}
                      value={selectedPlan.visaPlan.officialNotes}
                      onChange={(e) =>
                        updatePlan(selectedPlan.id, (p) => ({
                          ...p,
                          visaPlan: { ...p.visaPlan, officialNotes: e.target.value },
                        }))
                      }
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white leading-relaxed"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        const s1 = selectedProgress.hotelBooked ? selectedProgress : executeStage1Hotel(selectedPlan);
                        executeStage2Visa(selectedPlan, s1);
                        setActiveStage('permit');
                        setSuccessMsg(`Visa on Arrival sponsorship (${selectedPlan.visaPlan.docNumber}) saved. Ready for Stage 3 (Travel Permit).`);
                      }}
                      className="min-h-10 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
                    >
                      <FileCheck2 className="w-4 h-4" />
                      <span>Save Visa Sponsorship &amp; Next: Travel Permit</span>
                    </button>
                  </div>
                </div>
              )}

              {/* STAGE 3: REGIONAL TRAVEL PERMIT */}
              {activeStage === 'permit' && (
                <div className="p-5 space-y-4 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Travel Permit Zone / Route</label>
                      <input
                        type="text"
                        value={selectedPlan.permitPlan.zoneName}
                        onChange={(e) =>
                          updatePlan(selectedPlan.id, (p) => ({
                            ...p,
                            permitPlan: { ...p.permitPlan, zoneName: e.target.value },
                          }))
                        }
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Permit Number</label>
                      <input
                        type="text"
                        value={selectedPlan.permitPlan.permitNumber}
                        onChange={(e) =>
                          updatePlan(selectedPlan.id, (p) => ({
                            ...p,
                            permitPlan: { ...p.permitPlan, permitNumber: e.target.value },
                          }))
                        }
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Assigned Tour Guide</label>
                      <input
                        type="text"
                        value={selectedPlan.permitPlan.leadGuideName}
                        onChange={(e) =>
                          updatePlan(selectedPlan.id, (p) => ({
                            ...p,
                            permitPlan: { ...p.permitPlan, leadGuideName: e.target.value },
                          }))
                        }
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Assigned Driver</label>
                      <input
                        type="text"
                        value={selectedPlan.permitPlan.driverName}
                        onChange={(e) =>
                          updatePlan(selectedPlan.id, (p) => ({
                            ...p,
                            permitPlan: { ...p.permitPlan, driverName: e.target.value },
                          }))
                        }
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Vehicle Model</label>
                      <input
                        type="text"
                        value={selectedPlan.permitPlan.vehicleType}
                        onChange={(e) =>
                          updatePlan(selectedPlan.id, (p) => ({
                            ...p,
                            permitPlan: { ...p.permitPlan, vehicleType: e.target.value },
                          }))
                        }
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Plate Number</label>
                      <input
                        type="text"
                        value={selectedPlan.permitPlan.vehiclePlate}
                        onChange={(e) =>
                          updatePlan(selectedPlan.id, (p) => ({
                            ...p,
                            permitPlan: { ...p.permitPlan, vehiclePlate: e.target.value },
                          }))
                        }
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <div className="text-xs text-slate-500 font-mono tabular-nums">
                      Valid {selectedPlan.permitPlan.validFrom} → {selectedPlan.permitPlan.validTo} · Hotel: {selectedPlan.hotelPlan.hotelName}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const s1 = selectedProgress.hotelBooked ? selectedProgress : executeStage1Hotel(selectedPlan);
                        const s2 = s1.visaSaved ? s1 : executeStage2Visa(selectedPlan, s1);
                        executeStage3Permit(selectedPlan, s2);
                        setSuccessMsg(`Regional Travel Permit (${selectedPlan.permitPlan.permitNumber}) issued and linked to Hotel & Visa records.`);
                      }}
                      className="min-h-10 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
                    >
                      <Compass className="w-4 h-4" />
                      <span>Issue &amp; Save Travel Permit</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Explicit Confirmation Modal Before Sending Single Hotel Email via Gmail */}
      {pendingEmailSend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Confirm Sending Hotel Email via Gmail</h3>
              <button
                type="button"
                onClick={() => setPendingEmailSend(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-3 text-xs">
              <div>
                <span className="font-semibold text-slate-500 block">From Mailbox</span>
                <span className="font-mono text-slate-900 font-semibold">{AGENCY_EMAIL}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-500 block">Recipient</span>
                <span className="font-mono text-slate-900 font-semibold">{pendingEmailSend.to}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-500 block">Subject</span>
                <span className="text-slate-900 font-semibold">{pendingEmailSend.subject}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-500 block mb-1">Email Preview</span>
                <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 font-sans text-xs text-slate-800 leading-relaxed">
                  {pendingEmailSend.bodyText}
                </pre>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setPendingEmailSend(null)}
                disabled={sendingEmail}
                className="min-h-10 px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSendGmail}
                disabled={sendingEmail}
                className="min-h-10 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-60 flex items-center gap-2"
              >
                {sendingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span>Confirm &amp; Send Email</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Confirmation Modal Before Sending All Pending Hotel Emails */}
      {batchEmailQueue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Review &amp; Send Pending Hotel Reservation Emails
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  All bookings, official hotel letters, visas, and travel permits are saved. Confirm which hotel emails to dispatch via {AGENCY_EMAIL}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => !sendingEmail && setBatchEmailQueue(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-3 text-xs flex-1">
              {batchEmailQueue.map((item, idx) => (
                <div
                  key={item.planId}
                  className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <label className="flex items-center gap-2 font-bold text-slate-900 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        disabled={sendingEmail}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setBatchEmailQueue((prev) =>
                            prev ? prev.map((entry, i) => (i === idx ? { ...entry, selected: checked } : entry)) : null
                          );
                        }}
                        className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                      />
                      <span>{item.travelerName}</span>
                      <span className="font-normal text-slate-500">→ {item.hotelName}</span>
                    </label>
                    <input
                      type="email"
                      value={item.to}
                      disabled={sendingEmail}
                      onChange={(e) => {
                        const val = e.target.value;
                        setBatchEmailQueue((prev) =>
                          prev ? prev.map((entry, i) => (i === idx ? { ...entry, to: val } : entry)) : null
                        );
                      }}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white font-mono text-[11px] text-slate-800 w-56"
                    />
                  </div>
                  <div className="font-semibold text-slate-700">{item.subject}</div>
                  <pre className="max-h-28 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-2.5 font-sans text-[11px] text-slate-700 leading-relaxed">
                    {item.bodyText}
                  </pre>
                </div>
              ))}
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3 shrink-0">
              <span className="text-xs text-slate-500 font-mono tabular-nums">
                {batchSendingStatus
                  ? `Sending ${batchSendingStatus.sent}/${batchSendingStatus.total} via Gmail...`
                  : `${batchEmailQueue.filter((i) => i.selected).length} selected`}
              </span>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setBatchEmailQueue(null)}
                  disabled={sendingEmail}
                  className="min-h-10 px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  Skip / Keep Saved Only
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSendBatchGmail}
                  disabled={sendingEmail || batchEmailQueue.filter((i) => i.selected).length === 0}
                  className="min-h-10 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-60 flex items-center gap-2 whitespace-nowrap"
                >
                  {sendingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  <span>
                    Confirm &amp; Send ({batchEmailQueue.filter((i) => i.selected).length})
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
