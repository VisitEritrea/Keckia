import React, { useState, useEffect } from 'react';
import {
  UploadCloud,
  FileCheck2,
  AlertTriangle,
  CheckCircle2,
  Download,
  Database,
  Layers,
  Clock,
  ExternalLink,
  ShieldAlert,
  Sparkles,
  Info,
  Calendar,
  Users,
  MessageSquare,
  RefreshCw,
  Mail,
  Smartphone,
} from 'lucide-react';
import { api } from '../../lib/api';
import {
  validateFeedSchemaV1,
  downloadSampleFeedJson,
  SAMPLE_FICTIONAL_FEED_V1,
  ValidationResult,
} from '../../utils/feedParser';

interface DailyReviewFeedPanelProps {
  onFeedIngested?: () => void;
  onOpenDataSync?: () => void;
}

export const DailyReviewFeedPanel: React.FC<DailyReviewFeedPanelProps> = ({
  onFeedIngested,
  onOpenDataSync,
}) => {
  const [jsonText, setJsonText] = useState('');
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Database connectivity state
  const [dbStatus, setDbStatus] = useState<{
    connected?: boolean;
    configured?: boolean;
    isPersistent?: boolean;
    isTemporary?: boolean;
    driver?: string;
    message?: string;
  } | null>(null);
  const [lastReviewDate, setLastReviewDate] = useState<string | null>(null);
  const [feedHistory, setFeedHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Check database health & fetch feed history on mount
  useEffect(() => {
    checkDbHealth();
    fetchFeedHistory();
  }, []);

  const checkDbHealth = async () => {
    try {
      const res = await api.get<{ database?: any }>('/health');
      if (res?.database) {
        setDbStatus(res.database);
      } else {
        setDbStatus({ connected: false, isPersistent: false, isTemporary: true, driver: 'Unavailable' });
      }
    } catch {
      setDbStatus({ connected: false, isPersistent: false, isTemporary: true, driver: 'Unavailable' });
    }
  };

  const fetchFeedHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const res = await api.get<{ history: any[] }>('/admin/feed/history');
      if (res?.history) {
        setFeedHistory(res.history);
        if (res.history.length > 0) {
          setLastReviewDate(res.history[0].importedAt || res.history[0].createdAt);
        }
      }
    } catch (err) {
      console.warn('Could not fetch feed history', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Handle file drop / upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = String(event.target?.result || '');
      setJsonText(content);
      handleValidate(content);
    };
    reader.readAsText(file);
  };

  // Perform validation on JSON string
  const handleValidate = (textToValidate?: string) => {
    const raw = textToValidate !== undefined ? textToValidate : jsonText;
    setSubmitError(null);
    setSubmitSuccess(null);

    if (!raw.trim()) {
      setValidationResult({
        valid: false,
        errors: ['The JSON feed textarea is empty.'],
        warnings: [],
        counts: { sources: 0, events: 0, travelers: 0, conversations: 0, drafts: 0, conflicts: 0, tasks: 0 },
      });
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      const result = validateFeedSchemaV1(parsed);
      setValidationResult(result);
    } catch (err: any) {
      setValidationResult({
        valid: false,
        errors: [`Invalid JSON Syntax: ${err?.message || 'Check commas, brackets and quotes.'}`],
        warnings: [],
        counts: { sources: 0, events: 0, travelers: 0, conversations: 0, drafts: 0, conflicts: 0, tasks: 0 },
      });
    }
  };

  // Commit to authenticated server database
  const handleCommitFeed = async () => {
    if (!validationResult || !validationResult.valid || !validationResult.feed) {
      handleValidate();
      return;
    }

    if (!dbStatus?.isPersistent || dbStatus?.isTemporary) {
      setSubmitError(
        'Durable server database is not connected. Storage is currently running on TEMPORARY in-memory PGlite. Ingestion commit refused to prevent false persistence claims.'
      );
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      const res = await api.post<{ ok: boolean; feedId: string; counts: any; warnings: string[] }>(
        '/admin/feed/import',
        validationResult.feed
      );

      if (res?.ok) {
        setSubmitSuccess(
          `Feed successfully ingested! Durable ID: ${res.feedId}. Upserted ${res.counts.events} events, ${res.counts.travelers} travelers, ${res.counts.conversations} conversations, ${res.counts.drafts} drafts.`
        );
        fetchFeedHistory();
        if (onFeedIngested) onFeedIngested();
      } else {
        setSubmitError('Feed ingestion failed on the server.');
      }
    } catch (err: any) {
      setSubmitError(err?.message || 'Server error while importing daily feed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12 font-sans text-slate-900">
      {/* 1. Header & Live Synchronization Disclaimer */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500 font-bold">
              Owner / Administrator Control Desk
            </span>
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-mono font-bold border border-slate-200">
              Feed Schema Version 1
            </span>
          </div>
          <h2 className="text-2xl font-serif font-bold text-slate-950 italic mt-1">
            Daily Operational Review & Feed Ingestion
          </h2>
          <p className="text-xs text-slate-600 mt-1 max-w-2xl">
            Idempotent batch upsert for external Google Calendar events, flight arrivals/departures, traveler dossiers, multichannel conversations, and conflict flags.
          </p>
        </div>

        {/* Database Persistence Status Badge */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div
            className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-bold flex items-center gap-1.5 ${
              dbStatus?.isPersistent
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : dbStatus?.isTemporary
                ? 'bg-amber-50 text-amber-800 border-amber-300'
                : 'bg-rose-50 text-rose-800 border-rose-300'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>
              {dbStatus?.isPersistent
                ? `Durable Server Database: Connected (${dbStatus.driver || 'Cloud SQL'})`
                : dbStatus?.isTemporary
                ? 'TEMPORARY (PGlite In-Memory) — Commit Refused'
                : 'Durable DB: Unavailable'}
            </span>
          </div>

          <button
            onClick={downloadSampleFeedJson}
            className="px-3.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition flex items-center gap-1.5 border border-slate-200 cursor-pointer shadow-2xs"
            title="Download clearly marked fictional sample JSON"
          >
            <Download className="w-3.5 h-3.5 text-brand-600" /> Download Sample Feed JSON
          </button>
        </div>
      </div>

      {/* 2. Admin Integration Status & Synchronization Policy */}
      <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500 font-bold">
                Integration Architecture
              </span>
              <span className="px-2 py-0.5 rounded-full bg-slate-900 text-white text-[10px] font-mono font-bold">
                Authoritative Master
              </span>
            </div>
            <h3 className="text-base font-serif font-bold text-slate-950 mt-0.5">
              Operations Integration Status
            </h3>
          </div>

          <a
            href="https://eritreavisit-companion-oct31.sniffweb.chatgpt.site/"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-800 text-xs font-semibold flex items-center gap-1.5 transition border border-slate-200 shadow-2xs shrink-0"
          >
            <span>Companion Workspace ↗</span>
            <span className="text-[10px] font-mono text-slate-500">(Design Demo)</span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
          </a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-1">
            <span className="text-[10px] font-mono uppercase font-bold text-slate-500 block">
              Scheduled Review Times
            </span>
            <div className="text-sm font-bold text-slate-900 font-mono flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-brand-500" />
              <span>07:00 & 22:00 EAT</span>
            </div>
            <span className="text-[11px] text-slate-500 block">
              Africa/Asmara timezone (UTC+3)
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-1">
            <span className="text-[10px] font-mono uppercase font-bold text-slate-500 block">
              Actual Latest Import
            </span>
            <div className="text-sm font-bold text-slate-900 font-mono flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-brand-600" />
              <span>
                {lastReviewDate ? new Date(lastReviewDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }) : 'No review imported'}
              </span>
            </div>
            <span className="text-[11px] text-slate-500 block">
              {lastReviewDate ? 'Durable database commit verified' : 'Awaiting first daily feed payload'}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-1">
            <span className="text-[10px] font-mono uppercase font-bold text-slate-500 block">
              Source Coverage Scope
            </span>
            <div className="text-xs font-semibold text-slate-800 space-y-0.5">
              <div>• Google Calendar movements (GCal Master)</div>
              <div>• Flight PNR / Port ticketing arrivals</div>
              <div>• Hotel lodging & management letters</div>
            </div>
            <span className="text-[10px] font-mono text-slate-500 block pt-1">
              Coverage window: Snapshot (No fake live sync)
            </span>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-white border border-slate-200 text-[11px] text-slate-600 flex items-start gap-2">
          <Info className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-bold text-slate-900">Authoritative Record Policy: </span>
            This Google Agency application is authoritative for all operational records, Cloud SQL persistence, and client dossiers. Client records are never transmitted or exposed to external demo workspaces.
          </div>
        </div>
      </div>

      {/* 3. Live Channel Ingestion: Google Calendar, Gmail, WhatsApp */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase tracking-widest text-brand-600 font-bold">
                Live Data Feeds
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold">
                OAuth & Webhook Ready
              </span>
            </div>
            <h3 className="text-base font-serif font-bold text-slate-950 mt-0.5">
              Live Channels: Google Calendar, Gmail & WhatsApp
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Pull live operational events and incoming client inquiries directly from your connected accounts.
            </p>
          </div>

          {onOpenDataSync && (
            <button
              onClick={onOpenDataSync}
              className="px-4 py-2 rounded-xl brand-gradient text-white text-xs font-bold transition shadow-brand hover:brightness-105 flex items-center gap-2 cursor-pointer shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Fetch Data from All Channels</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-orange-600" /> Google Calendar
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                Connected
              </span>
            </div>
            <p className="text-xs font-mono text-slate-700 font-medium mt-1">tours@eritreavisit.com</p>
            <p className="text-[11px] text-slate-500 mt-1">
              Pulls scheduled group tours, arrivals/departures, and VIP charter bookings into the Operations Timeline.
            </p>
          </div>

          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Mail className="w-4 h-4 text-blue-600" /> Agency Email
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                Connected
              </span>
            </div>
            <p className="text-xs font-mono text-slate-700 font-medium mt-1">tours@eritreavisit.com</p>
            <p className="text-[11px] text-slate-500 mt-1">
              Reads traveler booking requests and generates secretary response drafts in the Unified Inbox.
            </p>
          </div>

          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-emerald-600" /> Official WhatsApp
              </span>
              <a
                href="https://wa.me/2917190374"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] font-semibold text-emerald-700 hover:underline flex items-center gap-1"
              >
                Open WA ↗
              </a>
            </div>
            <p className="text-xs font-mono text-slate-700 font-medium mt-1">+2917190374</p>
            <p className="text-[11px] text-slate-500 mt-1">
              Asmara operations line: imports chat inquiries, visa on arrival questions, and urgent action tasks.
            </p>
          </div>
        </div>
      </div>

      {/* 4. Ingestion Workspace: Dropzone, Textarea & Validation Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Input Form (7 cols) */}
        <div className="lg:col-span-7 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold font-serif text-slate-900">
              Feed JSON Ingestion Payload
            </h3>
            <label className="text-xs text-brand-600 hover:text-brand-800 font-semibold cursor-pointer flex items-center gap-1">
              <UploadCloud className="w-3.5 h-3.5" /> Upload .json file
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          <div className="relative">
            <textarea
              rows={12}
              value={jsonText}
              onChange={(e) => {
                setJsonText(e.target.value);
                setValidationResult(null);
              }}
              placeholder={`{\n  "generatedAt": "2026-10-31T08:00:00.000Z",\n  "timezone": "Africa/Asmara",\n  "sources": [...],\n  "events": [...],\n  "travelers": [...],\n  "conversations": [...],\n  "drafts": [...],\n  "conflicts": [...]\n}`}
              className="w-full p-3.5 rounded-xl bg-slate-950 text-slate-100 font-mono text-xs border border-slate-800 focus:outline-hidden focus:ring-1 focus:ring-amber-400 placeholder:text-slate-600 leading-relaxed"
            />
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              onClick={() => handleValidate()}
              className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition cursor-pointer border border-slate-300"
            >
              Validate Feed Preview
            </button>

            <button
              disabled={isSubmitting || !validationResult?.valid}
              onClick={handleCommitFeed}
              className={`px-5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-xs ${
                validationResult?.valid
                  ? 'bg-slate-900 hover:bg-slate-800 text-white'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <FileCheck2 className="w-4 h-4 text-emerald-400" />
              {isSubmitting ? 'Upserting to Database...' : 'Commit & Save to Database'}
            </button>
          </div>

          {/* Feedback messages */}
          {submitSuccess && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="leading-snug">{submitSuccess}</div>
            </div>
          )}

          {submitError && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="leading-snug">{submitError}</div>
            </div>
          )}
        </div>

        {/* Right Column: Validation Preview & Metric Breakdown (5 cols) */}
        <div className="lg:col-span-5 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between space-y-4">
          <div>
            <h3 className="text-sm font-bold font-serif text-slate-900 border-b border-slate-100 pb-2">
              Schema Validation Preview
            </h3>

            {!validationResult ? (
              <div className="py-12 text-center text-xs text-slate-400 italic">
                Enter or upload JSON and click "Validate Feed Preview" to inspect schema conformity.
              </div>
            ) : validationResult.valid ? (
              <div className="mt-3 space-y-4 text-xs">
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Valid Feed Schema v1</span>
                </div>

                {/* Counts breakdown */}
                <div className="grid grid-cols-2 gap-2 text-slate-700">
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-mono text-slate-500 uppercase block">Events</span>
                    <span className="text-base font-bold text-slate-900 font-mono">
                      {validationResult.counts.events}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-mono text-slate-500 uppercase block">Travelers</span>
                    <span className="text-base font-bold text-slate-900 font-mono">
                      {validationResult.counts.travelers}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-mono text-slate-500 uppercase block">Sources</span>
                    <span className="text-base font-bold text-slate-900 font-mono">
                      {validationResult.counts.sources}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-mono text-slate-500 uppercase block">Conflicts</span>
                    <span className="text-base font-bold text-amber-700 font-mono">
                      {validationResult.counts.conflicts}
                    </span>
                  </div>
                </div>

                {/* Warnings if any */}
                {validationResult.warnings.length > 0 && (
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 space-y-1">
                    <span className="font-bold flex items-center gap-1 text-[11px]">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Ingestion Warnings (Non-fatal):
                    </span>
                    <ul className="list-disc list-inside text-[11px] space-y-0.5">
                      {validationResult.warnings.slice(0, 4).map((w, i) => (
                        <li key={i} className="truncate">{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-3 space-y-3 text-xs">
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 font-semibold flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>Validation Refused</span>
                </div>
                <div className="space-y-1.5 text-rose-700">
                  {validationResult.errors.map((err, i) => (
                    <div key={i} className="p-2 rounded bg-rose-50/50 border border-rose-200 font-mono text-[11px]">
                      {err}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-500 font-mono flex items-center justify-between">
            <span>Deduplication: calendarId + eventId</span>
            <span>Safety: Suggestions are drafts</span>
          </div>
        </div>
      </div>

      {/* 4. Past Feed Import Audit History */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold font-serif text-slate-900">
            Durable Feed Audit Log & Review History
          </h3>
          <button
            onClick={fetchFeedHistory}
            className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
        </div>

        {isLoadingHistory ? (
          <div className="py-8 text-center text-xs text-slate-400">Loading audit history...</div>
        ) : feedHistory.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400 italic">
            No previous daily review feeds stored yet. Import your first feed above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-mono uppercase text-slate-500 font-bold">
                <tr>
                  <th className="py-2.5 px-3">Review Timestamp</th>
                  <th className="py-2.5 px-3">Actor</th>
                  <th className="py-2.5 px-3">Events</th>
                  <th className="py-2.5 px-3">Travelers</th>
                  <th className="py-2.5 px-3">Conflicts</th>
                  <th className="py-2.5 px-3">Feed ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {feedHistory.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-mono">
                      {new Date(item.importedAt || item.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2 px-3 font-medium text-slate-900">
                      {item.importedBy || item.createdBy || 'admin'}
                    </td>
                    <td className="py-2 px-3 font-mono font-bold text-slate-900">
                      {item.summary?.eventsCount ?? '-'}
                    </td>
                    <td className="py-2 px-3 font-mono">{item.summary?.travelersCount ?? '-'}</td>
                    <td className="py-2 px-3 font-mono text-amber-700">
                      {item.summary?.conflictsCount ?? 0}
                    </td>
                    <td className="py-2 px-3 font-mono text-[10px] text-slate-400 truncate max-w-[140px]">
                      {item.id}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
