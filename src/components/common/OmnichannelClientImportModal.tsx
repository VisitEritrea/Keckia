import React, { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  Calendar,
  CheckCircle2,
  CheckSquare,
  FileInput,
  Loader2,
  Lock,
  Mail,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Square,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  OmnichannelExtractedClient,
  connectAndAnalyzeOmnichannelClients,
} from '../../lib/omnichannelClientImport';
import {
  ClientCategory,
  Conversation,
  CrmPipelineStage,
  Employee,
  FeedCalendarEvent,
  TourPackage,
  canActAsDriver,
  canActAsGuide,
  getStaffCapacityInfo,
  isDualGuideDriver,
} from '../../types';

interface OmnichannelClientImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin: boolean;
  conversations?: Conversation[];
  calendarEvents?: FeedCalendarEvent[];
  employees?: Employee[];
  packages?: TourPackage[];
  focusConversation?: Conversation | null;
  /** Optional label for the calling form (e.g., "Tourist Registration Form", "CRM Lead Form", "Ticketing Client Form") */
  targetFormLabel?: string;
  /** Called when the user clicks "Auto-Fill into Form" on a specific client */
  onInsertIntoForm?: (client: OmnichannelExtractedClient) => void;
  /** Called when the user clicks "Auto-Insert Selected into System" or "Direct Insert" */
  onBatchInsertClients?: (clients: OmnichannelExtractedClient[]) => void;
}

const CRM_STAGES: CrmPipelineStage[] = [
  'New Lead',
  'Contacted',
  'Quotation Sent',
  'Negotiation',
  'Booked',
  'Completed',
];

const CLIENT_CATEGORIES: ClientCategory[] = [
  'Individual',
  'VIP Traveler',
  'Corporate',
  'Diplomatic / Embassy',
  'NGO / UN Agency',
  'Group',
  'Diaspora',
];

const TOURIST_STATUSES: Array<'VIP' | 'Active Traveler' | 'Inquiry' | 'Flagged'> = [
  'VIP',
  'Active Traveler',
  'Inquiry',
  'Flagged',
];

export const OmnichannelClientImportModal: React.FC<OmnichannelClientImportModalProps> = ({
  isOpen,
  onClose,
  isAdmin,
  conversations = [],
  calendarEvents = [],
  employees = [],
  packages = [],
  focusConversation = null,
  targetFormLabel,
  onInsertIntoForm,
  onBatchInsertClients,
}) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [clients, setClients] = useState<OmnichannelExtractedClient[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [aiPowered, setAiPowered] = useState(true);
  const [channelsStats, setChannelsStats] = useState({
    emailCount: 0,
    calendarCount: 0,
    whatsAppCount: 0,
    liveGoogleConnected: false,
    officialWhatsAppNumber: '+2917190374',
  });
  const [customTranscript, setCustomTranscript] = useState('');
  const [showCustomPaste, setShowCustomPaste] = useState(false);
  const [channelFilter, setChannelFilter] = useState<'ALL' | 'Email' | 'Calendar' | 'WhatsApp'>('ALL');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const guideOptions = useMemo(() => employees.filter((e) => canActAsGuide(e)), [employees]);
  const driverOptions = useMemo(() => employees.filter((e) => canActAsDriver(e)), [employees]);
  const agentOptions = useMemo(
    () =>
      employees.filter(
        (e) =>
          e.role === 'Agent' ||
          e.role === 'Operations Manager' ||
          e.role === 'CEO' ||
          e.role === 'Admin'
      ),
    [employees]
  );

  const runAnalysis = async (requestLiveGoogleAuth = false) => {
    if (!isAdmin) return;
    setIsAnalyzing(true);
    setStatusMessage(null);
    try {
      const result = await connectAndAnalyzeOmnichannelClients({
        requestLiveGoogleAuth,
        conversations,
        calendarEvents,
        employees,
        packages,
        customWhatsAppTranscript: customTranscript,
        focusConversation,
      });
      setClients(result.clients);
      setSelectedIds(result.clients.map((c) => c.id));
      setAiPowered(result.aiPowered);
      setChannelsStats(result.channelsConnected);
      if (requestLiveGoogleAuth && result.channelsConnected.liveGoogleConnected) {
        setStatusMessage(
          `Connected live Google Workspace (Gmail & Calendar) + WhatsApp (${result.channelsConnected.officialWhatsAppNumber}). Extracted & categorized ${result.clients.length} client(s).`
        );
      }
    } catch (err: any) {
      setStatusMessage(err?.message || 'Could not complete omnichannel client analysis.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  useEffect(() => {
    if (isOpen && isAdmin) {
      runAnalysis(false);
    }
  }, [isOpen, isAdmin, focusConversation?.id]);

  if (!isOpen) return null;

  if (!isAdmin) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-red-200 shadow-2xl text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-red-100 text-red-700 flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Administrator Exclusive Access</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Other than the Administrator (CEO), no staff member can view client emails or access the connection between Google Calendar, WhatsApp, and Email.
          </p>
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const updateClientField = <K extends keyof OmnichannelExtractedClient>(
    id: string,
    field: K,
    value: OmnichannelExtractedClient[K]
  ) => {
    setClients((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const updated = { ...c, [field]: value };
        // Keep guide/driver IDs & dual-role note in sync when guide or driver changes
        if (field === 'assignedGuideName') {
          const matchedGuide = guideOptions.find((g) => (g.fullName || g.name) === value);
          updated.assignedGuideId = matchedGuide?.id;
        }
        if (field === 'assignedDriverName') {
          const matchedDriver = driverOptions.find((d) => (d.fullName || d.name) === value);
          updated.assignedDriverId = matchedDriver?.id;
        }
        if (field === 'assignedGuideName' || field === 'assignedDriverName') {
          const samePerson =
            updated.assignedGuideName &&
            updated.assignedDriverName &&
            updated.assignedGuideName === updated.assignedDriverName;
          const emp = employees.find((e) => (e.fullName || e.name) === updated.assignedGuideName);
          if (samePerson && emp && isDualGuideDriver(emp)) {
            updated.assignedFieldRoleNote =
              'Dual Capacity: Guide & Driver (Single Base Pay — No Duplicate Payroll)';
          } else {
            const gInfo = getStaffCapacityInfo(
              employees.find((e) => (e.fullName || e.name) === updated.assignedGuideName)
            );
            const dInfo = getStaffCapacityInfo(
              employees.find((e) => (e.fullName || e.name) === updated.assignedDriverName)
            );
            updated.assignedFieldRoleNote = `Guide: ${gInfo.shortTag} | Driver: ${dInfo.shortTag}`;
          }
        }
        return updated;
      })
    );
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const filteredClients = clients.filter((c) =>
    channelFilter === 'ALL' ? true : c.channels.includes(channelFilter)
  );

  const selectedClients = clients.filter((c) => selectedIds.includes(c.id));

  const handleBatchInsert = () => {
    if (selectedClients.length === 0) return;
    if (onBatchInsertClients) {
      onBatchInsertClients(selectedClients);
    } else if (onInsertIntoForm && selectedClients[0]) {
      onInsertIntoForm(selectedClients[0]);
    }
    onClose();
  };

  const handleSingleInsertIntoForm = (client: OmnichannelExtractedClient) => {
    if (onInsertIntoForm) {
      onInsertIntoForm(client);
      onClose();
    } else if (onBatchInsertClients) {
      onBatchInsertClients([client]);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Top Header */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950 text-white px-6 py-4 flex flex-wrap items-center justify-between gap-4 border-b border-slate-800">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300 shadow-inner">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold tracking-tight">
                  Omnichannel AI Client Importer, Categorizer & Staff Assigner
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-400/30 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  {aiPowered ? 'Gemini Conversation Judgment' : 'Conversation Rules Engine'}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  Admin-Only Channel Bridge
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Connected to <strong className="text-white">Gmail</strong> (tours@eritreavisit.com),{' '}
                <strong className="text-white">Google Calendar</strong>, and{' '}
                <strong className="text-white">WhatsApp ({channelsStats.officialWhatsAppNumber})</strong> — categorizes clients by conversation context, assigns Sales Agent / Guide / Driver, and inserts into forms & database automatically.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => runAnalysis(true)}
              disabled={isAnalyzing}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              {isAnalyzing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              {channelsStats.liveGoogleConnected
                ? 'Re-Sync Live Gmail, Calendar & WhatsApp'
                : 'Connect Live Google (Gmail & Calendar) + WhatsApp'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Channel Connection Strip & Filter Bar */}
        <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setChannelFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                channelFilter === 'ALL'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              All Channels ({clients.length})
            </button>
            <button
              type="button"
              onClick={() => setChannelFilter('Email')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                channelFilter === 'Email'
                  ? 'bg-sky-700 text-white shadow-xs'
                  : 'bg-white text-sky-800 border border-sky-200 hover:bg-sky-50'
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              Email Threads ({channelsStats.emailCount})
            </button>
            <button
              type="button"
              onClick={() => setChannelFilter('Calendar')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                channelFilter === 'Calendar'
                  ? 'bg-indigo-700 text-white shadow-xs'
                  : 'bg-white text-indigo-800 border border-indigo-200 hover:bg-indigo-50'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              Google Calendar ({channelsStats.calendarCount})
            </button>
            <button
              type="button"
              onClick={() => setChannelFilter('WhatsApp')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                channelFilter === 'WhatsApp'
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'bg-white text-emerald-800 border border-emerald-200 hover:bg-emerald-50'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              WhatsApp {channelsStats.officialWhatsAppNumber} ({channelsStats.whatsAppCount})
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCustomPaste((prev) => !prev)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              {showCustomPaste ? 'Hide Conversation Paste Box' : '+ Paste WhatsApp / Email Thread to Analyze'}
            </button>
          </div>
        </div>

        {/* Optional Paste Box for Live WhatsApp / Email Text */}
        {showCustomPaste && (
          <div className="px-6 py-3.5 bg-amber-50/70 border-b border-amber-200 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-amber-950">
                Paste Raw WhatsApp Export or Email Thread (AI will extract client, judge stage/category, and assign staff):
              </label>
              <button
                type="button"
                onClick={() => runAnalysis(false)}
                disabled={isAnalyzing || !customTranscript.trim()}
                className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
              >
                Analyze Pasted Conversation
              </button>
            </div>
            <textarea
              rows={3}
              value={customTranscript}
              onChange={(e) => setCustomTranscript(e.target.value)}
              placeholder="Example: [12/05/2025, 10:15] +39 340 882 1940: Ciao EritreaVisit! I am Elena Conti from Milan (Female, Passport YA8831209). We are 4 travelers looking to book the Asmara Art Deco & Massawa Red Sea Discovery from 2025-06-10 to 2025-06-17. We already paid the deposit..."
              className="w-full rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        )}

        {statusMessage && (
          <div className="px-6 py-2.5 bg-indigo-50 border-b border-indigo-200 text-xs font-medium text-indigo-900 flex items-center justify-between">
            <span>{statusMessage}</span>
            <button
              type="button"
              onClick={() => setStatusMessage(null)}
              className="text-indigo-600 hover:text-indigo-900 font-bold"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-100/70">
          {isAnalyzing ? (
            <div className="py-16 flex flex-col items-center justify-center text-center space-y-3">
              <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
              <div className="text-sm font-bold text-slate-900">
                Scanning Email, Google Calendar & WhatsApp Conversations...
              </div>
              <p className="text-xs text-slate-500 max-w-md">
                Evaluating conversation history, determining CRM pipeline stage & client tier, enforcing strict Male/Female gender, and matching Tour Guides & Drivers...
              </p>
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="py-12 text-center bg-white rounded-2xl border border-slate-200 p-8 space-y-3">
              <p className="text-sm font-bold text-slate-700">No clients matched the current channel filter.</p>
              <button
                type="button"
                onClick={() => setChannelFilter('ALL')}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold"
              >
                Show All Extracted Clients
              </button>
            </div>
          ) : (
            filteredClients.map((client) => {
              const isSelected = selectedIds.includes(client.id);
              return (
                <div
                  key={client.id}
                  className={`bg-white rounded-2xl border transition-all shadow-xs overflow-hidden ${
                    isSelected ? 'border-indigo-400 ring-1 ring-indigo-400/40' : 'border-slate-200'
                  }`}
                >
                  {/* Card Header */}
                  <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => toggleSelect(client.id)}
                        className="text-indigo-600 hover:text-indigo-800 cursor-pointer"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-5 h-5" />
                        ) : (
                          <Square className="w-5 h-5 text-slate-400" />
                        )}
                      </button>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-slate-900">{client.fullName}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              client.gender === 'Female'
                                ? 'bg-pink-100 text-pink-800 border border-pink-200'
                                : 'bg-blue-100 text-blue-800 border border-blue-200'
                            }`}
                          >
                            {client.gender}
                          </span>
                          {client.channels.map((ch) => (
                            <span
                              key={ch}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                                ch === 'Email'
                                  ? 'bg-sky-100 text-sky-800 border border-sky-200'
                                  : ch === 'Calendar'
                                  ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                                  : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              }`}
                            >
                              {ch === 'Email' && <Mail className="w-3 h-3" />}
                              {ch === 'Calendar' && <Calendar className="w-3 h-3" />}
                              {ch === 'WhatsApp' && <MessageSquare className="w-3 h-3" />}
                              {ch}
                            </span>
                          ))}
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                            Stage: {client.crmStage}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-900 border border-purple-200">
                            {client.clientCategory} · {client.touristStatus}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {client.email} · {client.phone} · {client.nationality} ({client.partySize} pax)
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {onInsertIntoForm && (
                        <button
                          type="button"
                          onClick={() => handleSingleInsertIntoForm(client)}
                          className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                        >
                          <FileInput className="w-3.5 h-3.5" />
                          Auto-Fill into {targetFormLabel || 'Form'}
                        </button>
                      )}
                      {onBatchInsertClients && (
                        <button
                          type="button"
                          onClick={() => {
                            onBatchInsertClients([client]);
                            onClose();
                          }}
                          className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          Direct Insert & Assign
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Card Body: AI Judgment + Editable Categorization & Assignment Grid */}
                  <div className="p-5 space-y-4">
                    {/* Conversation Summary & AI Judgment Banner */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 bg-indigo-50/60 rounded-xl p-3.5 border border-indigo-100">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                          Conversation Context ({client.channels.join(' + ')})
                        </span>
                        <p className="text-xs text-slate-800 mt-1 leading-relaxed">
                          {client.conversationSummary}
                        </p>
                      </div>
                      <div className="border-t lg:border-t-0 lg:border-l border-indigo-200/70 pt-2 lg:pt-0 lg:pl-3.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          AI Categorization & Assignment Judgment
                        </span>
                        <p className="text-xs text-indigo-950 font-medium mt-1 leading-relaxed">
                          {client.aiJudgmentReason}
                        </p>
                      </div>
                    </div>

                    {/* Editable Fields Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                          Client Full Name
                        </label>
                        <input
                          type="text"
                          value={client.fullName}
                          onChange={(e) => updateClientField(client.id, 'fullName', e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-900"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                          Gender (Strict Male / Female)
                        </label>
                        <select
                          value={client.gender}
                          onChange={(e) =>
                            updateClientField(
                              client.id,
                              'gender',
                              e.target.value === 'Female' ? 'Female' : 'Male'
                            )
                          }
                          className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-900 bg-white"
                        >
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                          CRM Pipeline Stage
                        </label>
                        <select
                          value={client.crmStage}
                          onChange={(e) =>
                            updateClientField(client.id, 'crmStage', e.target.value as CrmPipelineStage)
                          }
                          className="w-full rounded-lg border border-amber-300 bg-amber-50/50 px-2.5 py-1.5 text-xs font-bold text-slate-900"
                        >
                          {CRM_STAGES.map((st) => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                          Client Category & Tier
                        </label>
                        <div className="flex gap-1.5">
                          <select
                            value={client.clientCategory}
                            onChange={(e) =>
                              updateClientField(
                                client.id,
                                'clientCategory',
                                e.target.value as ClientCategory
                              )
                            }
                            className="w-3/5 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-900 bg-white"
                          >
                            {CLIENT_CATEGORIES.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                          </select>
                          <select
                            value={client.touristStatus}
                            onChange={(e) =>
                              updateClientField(
                                client.id,
                                'touristStatus',
                                e.target.value as 'VIP' | 'Active Traveler' | 'Inquiry' | 'Flagged'
                              )
                            }
                            className="w-2/5 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-900 bg-white"
                          >
                            {TOURIST_STATUSES.map((ts) => (
                              <option key={ts} value={ts}>
                                {ts}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                          Interested Service / Package
                        </label>
                        <input
                          type="text"
                          value={client.tourTitle}
                          onChange={(e) => updateClientField(client.id, 'tourTitle', e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-900"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                          Assigned Sales Agent
                        </label>
                        <select
                          value={client.assignedAgent}
                          onChange={(e) => updateClientField(client.id, 'assignedAgent', e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-900 bg-white"
                        >
                          {agentOptions.map((ag) => {
                            const name = ag.fullName || ag.name;
                            return (
                              <option key={ag.id} value={name}>
                                {name} ({ag.role})
                              </option>
                            );
                          })}
                          {!agentOptions.some(
                            (ag) => (ag.fullName || ag.name) === client.assignedAgent
                          ) && <option value={client.assignedAgent}>{client.assignedAgent}</option>}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold uppercase text-emerald-700 mb-1">
                          Assigned Tour Guide
                        </label>
                        <select
                          value={client.assignedGuideName}
                          onChange={(e) =>
                            updateClientField(client.id, 'assignedGuideName', e.target.value)
                          }
                          className="w-full rounded-lg border border-emerald-300 bg-emerald-50/40 px-2.5 py-1.5 text-xs font-semibold text-slate-900"
                        >
                          {guideOptions.map((g) => {
                            const name = g.fullName || g.name;
                            const cap = getStaffCapacityInfo(g);
                            return (
                              <option key={g.id} value={name}>
                                {name} {cap.shortTag}
                              </option>
                            );
                          })}
                          {!guideOptions.some(
                            (g) => (g.fullName || g.name) === client.assignedGuideName
                          ) && (
                            <option value={client.assignedGuideName}>{client.assignedGuideName}</option>
                          )}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold uppercase text-sky-700 mb-1">
                          Assigned Fleet Driver
                        </label>
                        <select
                          value={client.assignedDriverName}
                          onChange={(e) =>
                            updateClientField(client.id, 'assignedDriverName', e.target.value)
                          }
                          className="w-full rounded-lg border border-sky-300 bg-sky-50/40 px-2.5 py-1.5 text-xs font-semibold text-slate-900"
                        >
                          {driverOptions.map((d) => {
                            const name = d.fullName || d.name;
                            const cap = getStaffCapacityInfo(d);
                            return (
                              <option key={d.id} value={name}>
                                {name} {cap.shortTag}
                              </option>
                            );
                          })}
                          {!driverOptions.some(
                            (d) => (d.fullName || d.name) === client.assignedDriverName
                          ) && (
                            <option value={client.assignedDriverName}>
                              {client.assignedDriverName}
                            </option>
                          )}
                        </select>
                      </div>
                    </div>

                    {/* Field Capacity Distinction & Financial Strip */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-[11px] text-slate-600">
                      <div className="flex items-center gap-2">
                        <UserCheck className="w-3.5 h-3.5 text-purple-700" />
                        <span className="font-semibold text-slate-800">Field Role Distinction:</span>
                        <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-900 border border-purple-200 font-medium">
                          {client.assignedFieldRoleNote}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 font-medium">
                        <span>
                          Travel: <strong>{client.expectedTravelDate}</strong> →{' '}
                          <strong>{client.expectedReturnDate}</strong>
                        </span>
                        <span>
                          Est. Quote:{' '}
                          <strong className="text-emerald-700">
                            {client.quotationCurrency} {client.quotationValue.toLocaleString()}
                          </strong>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="bg-white px-6 py-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-600">
            Selected <strong className="text-slate-900">{selectedClients.length}</strong> of{' '}
            <strong className="text-slate-900">{clients.length}</strong> categorized client(s). Gender is strictly validated as{' '}
            <span className="font-bold text-slate-800">Male / Female</span>.
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100 cursor-pointer"
            >
              Cancel
            </button>
            {onBatchInsertClients && (
              <button
                type="button"
                onClick={handleBatchInsert}
                disabled={selectedClients.length === 0 || isAnalyzing}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 shadow-md cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                Auto-Categorize, Assign & Insert Selected ({selectedClients.length}) into System
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
