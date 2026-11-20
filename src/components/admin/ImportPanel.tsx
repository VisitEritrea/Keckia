import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Database,
  Download,
  FileSpreadsheet,
  RefreshCw,
  ShieldAlert,
  Upload,
} from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useWorkspace } from '../../lib/workspace';
import {
  coerceCell,
  exportTemplate,
  isSupportedImportFile,
  readSpreadsheet,
  type SheetTable,
} from '../../lib/spreadsheet';
import { CATALOG_GROUPS, COLLECTION_CATALOG, type CollectionInfo } from '../../lib/collectionCatalog';
import { Badge, Banner, Button, Card, EmptyState, Field, Select } from '../ui/Kit';

type Step = 'choose' | 'upload' | 'map' | 'review' | 'done';

/** Keckia ERP Cloud synonym dictionary so Keckia exports map cleanly on first try */
const KECKIA_SYNONYMS: Record<string, string[]> = {
  fullName: ['clientname', 'travelername', 'passengername', 'leadname', 'guestname', 'customername'],
  passportNumber: ['passportno', 'passport', 'traveldocno', 'documentnumber'],
  nationality: ['country', 'citizenship'],
  crmStage: ['salesstage', 'pipelinestage', 'leadstage', 'stage'],
  leadSource: ['source', 'channel', 'origin'],
  interestedService: ['service', 'servicetype', 'product'],
  quotationValue: ['quoteamount', 'quotedvalue', 'dealvalue', 'packagevalue'],
  nextFollowUpDate: ['followup', 'followupdate', 'nextactiondate'],
  defaultCommissionPercent: ['commissionrate', 'partnercommission', 'commpercent'],
  commissionRatePercent: ['commissionrate', 'commpercent', 'agencycommissionrate'],
  calculatedCommissionUSD: ['commissionamount', 'commissionusd', 'agencycommission'],
  supplierPayableUSD: ['netpayable', 'hotelpayable', 'supplieramount'],
  ticketNumber: ['eticket', 'ticketno', 'passnumber'],
  confirmationCode: ['bookingref', 'hotelref', 'voucherref'],
  plateNumber: ['plate', 'registrationno', 'carplate', 'vehicleno'],
};

/** "Full Name", "full_name" and "fullname" should all find `fullName`. */
function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function guessMapping(headers: string[], fields: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const used = new Set<string>();

  for (const field of fields) {
    const target = normalise(field);
    const exact = headers.find((h) => !used.has(h) && normalise(h) === target);
    if (exact) {
      mapping[field] = exact;
      used.add(exact);
      continue;
    }
    const synonyms = KECKIA_SYNONYMS[field] || [];
    const synMatch = headers.find((h) => !used.has(h) && synonyms.includes(normalise(h)));
    if (synMatch) {
      mapping[field] = synMatch;
      used.add(synMatch);
      continue;
    }
    const partial = headers.find(
      (h) => !used.has(h) && (normalise(h).includes(target) || target.includes(normalise(h))),
    );
    if (partial && normalise(partial).length > 2) {
      mapping[field] = partial;
      used.add(partial);
    }
  }
  return mapping;
}

export const ImportPanel: React.FC = () => {
  const { collections, reload, status: workspaceStatus } = useWorkspace();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('choose');
  const [target, setTarget] = useState<CollectionInfo | null>(null);
  const [tables, setTables] = useState<SheetTable[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [idPolicy, setIdPolicy] = useState<'generate' | 'column'>('generate');
  const [idColumn, setIdColumn] = useState('');
  const [duplicatePolicy, setDuplicatePolicy] = useState<'skip' | 'update'>('skip');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ written: number; skipped: number; errors: string[] } | null>(null);
  const [serverCounts, setServerCounts] = useState<Record<string, number>>({});
  const [loadingCounts, setLoadingCounts] = useState(false);

  const fetchServerCounts = async () => {
    setLoadingCounts(true);
    try {
      const res = await api.get<{ collections: { name: string; count: number }[] }>('admin/collections');
      const map: Record<string, number> = {};
      (res.collections || []).forEach((c) => {
        map[c.name] = c.count;
      });
      setServerCounts(map);
    } catch {
      // fallback to workspace in-memory counts
    } finally {
      setLoadingCounts(false);
    }
  };

  useEffect(() => {
    fetchServerCounts();
  }, []);

  const table = tables[sheetIndex];

  const existingRecordsForTarget = useMemo(() => {
    if (!target) return [] as any[];
    return (collections[target.key] as any[]) || [];
  }, [collections, target]);

  /** The rows exactly as they will be stored, plus duplicate detection against existing workspace records. */
  const prepared = useMemo(() => {
    if (!table || !target) {
      return {
        rows: [] as any[],
        problems: [] as string[],
        duplicates: [] as { rowIndex: number; reason: string; existingId: string }[],
      };
    }

    const problems: string[] = [];
    const duplicates: { rowIndex: number; reason: string; existingId: string }[] = [];
    const seen = new Set<string>();
    const stamp = Date.now();

    const rows = table.rows.map((source, index) => {
      const row: Record<string, any> = {};

      for (const [field, header] of Object.entries(mapping)) {
        if (!header) continue;
        const value = coerceCell(source[header] ?? '');
        if (value !== '') row[field] = value;
      }

      // Normalize gender strictly to 'Male' | 'Female' if present
      if (row.gender !== undefined) {
        const g = String(row.gender).trim().toLowerCase();
        row.gender = g.startsWith('f') ? 'Female' : 'Male';
      }

      let id =
        idPolicy === 'column' && idColumn
          ? String(source[idColumn] ?? '').trim()
          : String(row.id ?? '').trim();

      // Check for duplicate in existing target collection (by ID, passportNumber, ticketNumber, confirmationCode, refNumber, email, or fullName)
      let matchedExisting: any = null;
      let matchReason = '';

      if (id) {
        matchedExisting = existingRecordsForTarget.find((e) => String(e.id) === id);
        if (matchedExisting) matchReason = `ID "${id}"`;
      }
      if (!matchedExisting && row.passportNumber) {
        const pp = String(row.passportNumber).trim().toUpperCase();
        matchedExisting = existingRecordsForTarget.find(
          (e) => e.passportNumber && String(e.passportNumber).trim().toUpperCase() === pp,
        );
        if (matchedExisting) matchReason = `Passport "${row.passportNumber}"`;
      }
      if (!matchedExisting && row.ticketNumber) {
        const tkt = String(row.ticketNumber).trim().toUpperCase();
        matchedExisting = existingRecordsForTarget.find(
          (e) => e.ticketNumber && String(e.ticketNumber).trim().toUpperCase() === tkt,
        );
        if (matchedExisting) matchReason = `Ticket "${row.ticketNumber}"`;
      }
      if (!matchedExisting && row.confirmationCode) {
        const conf = String(row.confirmationCode).trim().toUpperCase();
        matchedExisting = existingRecordsForTarget.find(
          (e) => e.confirmationCode && String(e.confirmationCode).trim().toUpperCase() === conf,
        );
        if (matchedExisting) matchReason = `Confirmation "${row.confirmationCode}"`;
      }
      if (!matchedExisting && row.refNumber) {
        const ref = String(row.refNumber).trim().toUpperCase();
        matchedExisting = existingRecordsForTarget.find(
          (e) => e.refNumber && String(e.refNumber).trim().toUpperCase() === ref,
        );
        if (matchedExisting) matchReason = `Ref "${row.refNumber}"`;
      }
      if (!matchedExisting && row.email && row.fullName) {
        const em = String(row.email).trim().toLowerCase();
        matchedExisting = existingRecordsForTarget.find(
          (e) => e.email && String(e.email).trim().toLowerCase() === em,
        );
        if (matchedExisting) matchReason = `Email "${row.email}"`;
      }

      if (matchedExisting) {
        duplicates.push({
          rowIndex: index + 2,
          reason: matchReason,
          existingId: matchedExisting.id,
        });
        if (duplicatePolicy === 'update') {
          id = matchedExisting.id;
        }
      }

      if (!id) id = `${target.idPrefix}-imp-${stamp}-${index + 1}`;

      if (seen.has(id)) {
        problems.push(
          `Row ${index + 2}: the id "${id}" appears more than once in this file — the later row would overwrite the earlier one.`,
        );
      }
      seen.add(id);
      row.id = id;
      row._isDuplicateMatch = Boolean(matchedExisting);

      for (const field of target.required) {
        if (row[field] === undefined || row[field] === '') {
          problems.push(`Row ${index + 2}: "${field}" is empty, and it is required.`);
        }
      }
      return row;
    });

    return { rows, problems: problems.slice(0, 25), duplicates };
  }, [table, target, mapping, idPolicy, idColumn, existingRecordsForTarget, duplicatePolicy]);

  const validRows = useMemo(() => {
    if (!target) return [];
    return prepared.rows
      .filter((row) => {
        if (duplicatePolicy === 'skip' && row._isDuplicateMatch) return false;
        return target.required.every((field) => row[field] !== undefined && row[field] !== '');
      })
      .map((row) => {
        const clean = { ...row };
        delete clean._isDuplicateMatch;
        return clean;
      });
  }, [prepared.rows, target, duplicatePolicy]);

  const reset = () => {
    setStep('choose');
    setTarget(null);
    setTables([]);
    setSheetIndex(0);
    setMapping({});
    setIdPolicy('generate');
    setIdColumn('');
    setDuplicatePolicy('skip');
    setResult(null);
    setError(null);
    fetchServerCounts();
  };

  const handleFile = async (file: File) => {
    setError(null);
    if (!isSupportedImportFile(file)) {
      setError('That file type is not supported. Please use an Excel workbook (.xlsx), a CSV, or a JSON export.');
      return;
    }
    setBusy(true);
    try {
      const parsed = await readSpreadsheet(file);
      if (parsed.length === 0 || parsed.every((t) => t.rows.length === 0)) {
        setError('That file has no rows in it. Check the first row holds your column headings.');
        return;
      }
      setTables(parsed);
      setSheetIndex(0);
      if (target) setMapping(guessMapping(parsed[0].headers, target.fields));
      setStep('map');
    } catch (err: any) {
      setError(`That file could not be read: ${err?.message || 'unknown problem'}.`);
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const response = await api.post<{ written: number; skipped: number; errors: string[] }>('admin/import', {
        collection: target.key,
        rows: validRows,
        source: 'keckia-migration-reconciled',
      });
      setResult(response);
      setStep('done');
      await reload();
      await fetchServerCounts();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The import could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  const totalStoredRecords = useMemo(() => {
    return Object.values(serverCounts).reduce((sum, n) => sum + n, 0);
  }, [serverCounts]);

  if (step === 'done' && result) {
    return (
      <Card>
        <div className="flex flex-col items-center py-6 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
            <CheckCircle2 className="h-7 w-7" />
          </span>
          <h3 className="mt-4 font-display text-xl font-extrabold text-slate-900">
            {result.written} {result.written === 1 ? 'record' : 'records'} imported & reconciled
          </h3>
          <p className="mt-1.5 max-w-md text-sm leading-relaxed text-slate-500">
            They are saved in <span className="font-semibold text-slate-700">{target?.label}</span> and are already visible
            to your team.
            {result.skipped > 0 && ` ${result.skipped} row(s) were skipped.`}
          </p>
          {result.errors?.length > 0 && (
            <div className="mt-4 w-full max-w-lg text-left">
              <Banner tone="warning" title="Some rows could not be written">
                <ul className="mt-1 list-inside list-disc space-y-0.5">
                  {result.errors.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </Banner>
            </div>
          )}
          <div className="mt-6 flex gap-2">
            <Button tone="primary" onClick={reset}>
              Import or reconcile another module
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <Banner tone="danger" title="That did not work" onDismiss={() => setError(null)}>
          {error}
        </Banner>
      )}

      {/* Database & Keckia ERP Migration Diagnostics Banner */}
      <Card
        title="Active Database State & Keckia ERP Migration Readiness"
        description="Live record counts from the active agency database. Empty collections are shown honestly without inserting demonstration data. Migration from Keckia ERP requires field-mapping preview, duplicate detection, and reconciliation below."
        actions={
          <Button icon={RefreshCw} busy={loadingCounts} onClick={fetchServerCounts}>
            Refresh counts
          </Button>
        }
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Workspace Sync State</p>
            <p className="text-sm font-extrabold text-slate-900 mt-0.5 flex items-center gap-1.5">
              <Database className="w-4 h-4 text-emerald-600" />
              {workspaceStatus === 'idle' ? 'Connected & Ready' : workspaceStatus}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Stored Records</p>
            <p className="text-sm font-extrabold text-slate-900 mt-0.5">{totalStoredRecords.toLocaleString()} records</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Duplicate Protection</p>
            <p className="text-sm font-extrabold text-emerald-700 mt-0.5">Passport / Ref / Email Active</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Demo Data Policy</p>
            <p className="text-sm font-extrabold text-slate-800 mt-0.5">No Auto-Seeded Demo Rows</p>
          </div>
        </div>
      </Card>

      {/* Progress */}
      <div className="flex items-center gap-2 text-xs font-semibold">
        {(
          [
            ['choose', '1. Choose target module'],
            ['map', '2. Field-mapping preview'],
            ['review', '3. Duplicate check & reconciliation'],
          ] as const
        ).map(([key, label], index) => {
          const order = ['choose', 'map', 'review'];
          const done = order.indexOf(step) > order.indexOf(key);
          const active = step === key;
          return (
            <React.Fragment key={key}>
              {index > 0 && <span className="h-px flex-1 bg-slate-200" />}
              <span
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 ${
                  active
                    ? 'border-brand-300 bg-brand-50 text-brand-800'
                    : done
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 bg-white text-slate-500'
                }`}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                    active ? 'bg-brand-600 text-white' : done ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {done ? '✓' : index + 1}
                </span>
                {label}
              </span>
            </React.Fragment>
          );
        })}
      </div>

      {/* Step 1 — pick a destination */}
      {step === 'choose' && (
        <Card
          title="Select a Module to Import or Reconcile from Keckia ERP"
          description="Pick where the data should land. Each card displays the live record count currently stored in the database."
        >
          <div className="space-y-6">
            {CATALOG_GROUPS.map((group) => (
              <div key={group}>
                <h4 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-slate-400">{group}</h4>
                <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                  {COLLECTION_CATALOG.filter((entry) => entry.group === group).map((entry) => {
                    const count =
                      serverCounts[entry.key] ?? ((collections[entry.key] as any[])?.length || 0);
                    return (
                      <button
                        key={entry.key}
                        onClick={() => {
                          setTarget(entry);
                          setStep('upload');
                        }}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/40 cursor-pointer"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-bold text-slate-800">{entry.label}</div>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                            {count} {count === 1 ? 'record' : 'records'}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-slate-500">{entry.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Step 2 — the file */}
      {step === 'upload' && target && (
        <Card
          title={`Import & Reconcile ${target.label}`}
          description="Upload an Excel (.xlsx), CSV, or JSON export from Keckia ERP Cloud or another source. Nothing is written until you review the field mapping, duplicate report, and record count reconciliation."
          actions={
            <Button icon={ArrowLeft} onClick={() => setStep('choose')}>
              Back
            </Button>
          }
        >
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file) handleFile(file);
            }}
            className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/60 px-6 py-12 text-center"
          >
            <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-brand-600 shadow-xs">
              <FileSpreadsheet className="h-6 w-6" />
            </span>
            <p className="font-display text-base font-bold text-slate-800">Drop your Keckia ERP or spreadsheet export here</p>
            <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-slate-500">
              Currently stored in {target.label}:{' '}
              <span className="font-bold text-slate-800">{existingRecordsForTarget.length} records</span>.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xlsm,.xls,.csv,.tsv,.txt,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = '';
              }}
            />
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button tone="primary" icon={Upload} busy={busy} onClick={() => fileRef.current?.click()}>
                Choose a file
              </Button>
              <Button icon={Download} onClick={() => exportTemplate(target.key, target.fields)}>
                Download a blank template
              </Button>
            </div>
          </div>

          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            Target fields for {target.label.toLowerCase()}:{' '}
            <span className="font-medium text-slate-700">{target.fields.join(', ')}</span>.
          </p>
        </Card>
      )}

      {/* Step 3 — column mapping */}
      {step === 'map' && target && table && (
        <Card
          title="Field-Mapping Preview & Duplicate Policy"
          description="Verify how source columns map to EritreaVisit Operations Hub fields and choose how duplicate records should be handled."
          actions={
            <Button icon={ArrowLeft} onClick={() => setStep('upload')}>
              Choose another file
            </Button>
          }
        >
          {tables.length > 1 && (
            <Field label="Which sheet?" className="mb-5 max-w-sm">
              <Select
                value={String(sheetIndex)}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setSheetIndex(next);
                  setMapping(guessMapping(tables[next].headers, target.fields));
                }}
              >
                {tables.map((t, index) => (
                  <option key={t.name} value={index}>
                    {t.name} — {t.rows.length} rows
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {target.fields
              .filter((field) => field !== 'id')
              .map((field) => (
                <Field
                  key={field}
                  label={
                    <span className="flex items-center gap-2">
                      {field}
                      {target.required.includes(field) && <Badge tone="bad">required</Badge>}
                    </span>
                  }
                >
                  <Select
                    value={mapping[field] ?? ''}
                    onChange={(e) => setMapping({ ...mapping, [field]: e.target.value })}
                  >
                    <option value="">— skip this field —</option>
                    {table.headers.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </Select>
                </Field>
              ))}
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
              <h4 className="text-sm font-bold text-slate-800">Record ID Policy</h4>
              <div className="mt-3 space-y-2">
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <input
                    type="radio"
                    checked={idPolicy === 'generate'}
                    onChange={() => setIdPolicy('generate')}
                    className="mt-1 h-4 w-4 accent-brand-600"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-slate-800">Generate new IDs</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      Assign clean EritreaVisit IDs (`{target.idPrefix}-...`) to imported rows.
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <input
                    type="radio"
                    checked={idPolicy === 'column'}
                    onChange={() => setIdPolicy('column')}
                    className="mt-1 h-4 w-4 accent-brand-600"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-slate-800">Preserve source ID column</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      Use a reference column from the file as the primary ID.
                    </span>
                  </span>
                </label>
              </div>
              {idPolicy === 'column' && (
                <Field label="Reference column" className="mt-3">
                  <Select value={idColumn} onChange={(e) => setIdColumn(e.target.value)}>
                    <option value="">— choose a column —</option>
                    {table.headers.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
              <h4 className="text-sm font-bold text-slate-800">Duplicate Detection Policy</h4>
              <p className="mt-1 text-xs text-slate-500">
                Matches are checked against existing Passport Numbers, Ticket/PNR Numbers, Confirmation Codes, Reference Numbers, and Emails.
              </p>
              <div className="mt-3 space-y-2">
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <input
                    type="radio"
                    checked={duplicatePolicy === 'skip'}
                    onChange={() => setDuplicatePolicy('skip')}
                    className="mt-1 h-4 w-4 accent-brand-600"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-slate-800">Skip duplicate records (Recommended)</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      Prevent duplicate customers or bookings when a match already exists in {target.label}.
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <input
                    type="radio"
                    checked={duplicatePolicy === 'update'}
                    onChange={() => setDuplicatePolicy('update')}
                    className="mt-1 h-4 w-4 accent-brand-600"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-slate-800">Update existing matching records</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      Merge incoming fields into the existing record ID without creating a second copy.
                    </span>
                  </span>
                </label>
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <Button tone="primary" icon={ArrowRight} onClick={() => setStep('review')}>
              Run Duplicate Detection & Reconciliation ({table.rows.length} rows)
            </Button>
          </div>
        </Card>
      )}

      {/* Step 4 — review & reconciliation */}
      {step === 'review' && target && table && (
        <Card
          title="Migration Reconciliation & Duplicate Detection Report"
          description="Verify record counts, field mappings, and duplicate matches before committing to the database."
          actions={
            <Button icon={ArrowLeft} onClick={() => setStep('map')}>
              Back to column mapping
            </Button>
          }
        >
          {/* Reconciliation KPI Matrix */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] font-bold uppercase text-slate-400">Existing in DB</p>
              <p className="text-lg font-extrabold text-slate-900 mt-0.5">{existingRecordsForTarget.length}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] font-bold uppercase text-slate-400">Source File Rows</p>
              <p className="text-lg font-extrabold text-slate-900 mt-0.5">{prepared.rows.length}</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-[11px] font-bold uppercase text-amber-700">Duplicates Detected</p>
              <p className="text-lg font-extrabold text-amber-900 mt-0.5">{prepared.duplicates.length}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-[11px] font-bold uppercase text-emerald-700">Ready to Write</p>
              <p className="text-lg font-extrabold text-emerald-900 mt-0.5">{validRows.length}</p>
            </div>
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3">
              <p className="text-[11px] font-bold uppercase text-indigo-700">Expected Post-Import</p>
              <p className="text-lg font-extrabold text-indigo-900 mt-0.5">
                {duplicatePolicy === 'skip'
                  ? existingRecordsForTarget.length + validRows.length
                  : existingRecordsForTarget.length +
                    Math.max(0, validRows.length - prepared.duplicates.length)}
              </p>
            </div>
          </div>

          {prepared.duplicates.length > 0 && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/80 p-4">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                <ShieldAlert className="w-4 h-4 text-amber-600" />
                {prepared.duplicates.length} duplicate record(s) matched existing entries in {target.label} (Policy:{' '}
                {duplicatePolicy === 'skip' ? 'Skipping duplicates' : 'Updating existing IDs'})
              </div>
              <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-amber-800">
                {prepared.duplicates.slice(0, 10).map((d) => (
                  <li key={`${d.rowIndex}-${d.existingId}`}>
                    Spreadsheet Row {d.rowIndex} matched existing record <code>{d.existingId}</code> via {d.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {prepared.problems.length > 0 && (
            <Banner tone="warning" title="Validation warnings" className="mb-4">
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                {prepared.problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </Banner>
          )}

          {validRows.length === 0 ? (
            <EmptyState
              icon={FileSpreadsheet}
              title="No new or valid rows to write"
              description={
                prepared.duplicates.length > 0 && duplicatePolicy === 'skip'
                  ? `All ${prepared.duplicates.length} row(s) already exist in ${target.label} and were skipped to prevent duplicates.`
                  : `Every row needs ${target.required.join(' and ')}. Go back and check the column matching.`
              }
            />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    {Object.keys(validRows[0]).slice(0, 8).map((key) => (
                      <th
                        key={key}
                        className="whitespace-nowrap px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-500"
                      >
                        {key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {validRows.slice(0, 8).map((row, index) => (
                    <tr key={index} className="bg-white">
                      {Object.keys(validRows[0]).slice(0, 8).map((key) => (
                        <td key={key} className="max-w-56 truncate px-4 py-2.5 text-slate-700">
                          {Array.isArray(row[key]) ? row[key].join(', ') : String(row[key] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {validRows.length > 8 && (
                <div className="border-t border-slate-100 bg-slate-50 px-4 py-2.5 text-xs text-slate-500">
                  Showing the first 8 of {validRows.length} rows ready for import.
                </div>
              )}
            </div>
          )}

          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <Button onClick={reset}>Start again</Button>
            <Button tone="primary" icon={Upload} busy={busy} disabled={validRows.length === 0} onClick={runImport}>
              Commit & Reconcile {validRows.length} {validRows.length === 1 ? 'record' : 'records'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
};
