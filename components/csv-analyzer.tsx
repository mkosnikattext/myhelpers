"use client";

import Link from "next/link";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpDown,
  FileSpreadsheet,
  Search,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type DataRow = {
  id: string;
  title: string;
  summaryBullets: string;
  titleUsage: number;
  rowNumber: number;
};

type ColumnKey = "id" | "title" | "summaryBullets" | "titleUsage";
type SortState = { key: ColumnKey; direction: "asc" | "desc" };
type Filters = Record<ColumnKey, string>;

type DocumentWithModelContext = Document & {
  modelContext?: {
    registerTool: (tool: {
      name: string;
      title: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute: () => Promise<object>;
    }, options?: { signal?: AbortSignal }) => void | Promise<void>;
  };
};

const EMPTY_FILTERS: Filters = { id: "", title: "", summaryBullets: "", titleUsage: "" };

const SAMPLE_CSV = `id,title,summary_bullets
TLMMM0O29K,Access Unlocking,"Customer requests access to Text | Support team to assist and migrate | Chat transferred to support team"
TLMMM0O31A,Billing question,"Customer asks about an invoice | Billing details explained"
TLMMM0O34B,Access Unlocking,"Customer cannot open the account | Verification needed | Support team to assist"
TLMMM0O38D,Plan upgrade,"Customer asks about plan differences | Pricing shared"
TLMMM0O42E,Access Unlocking,"Customer requests access to Text | Account ownership confirmed"`;

const COLUMNS: { key: ColumnKey; label: string; placeholder: string; width: string }[] = [
  { key: "id", label: "ID", placeholder: "Filter IDs", width: "w-[180px]" },
  { key: "title", label: "Title", placeholder: "Filter titles", width: "w-[260px]" },
  { key: "summaryBullets", label: "Summary bullets", placeholder: "Filter summaries", width: "min-w-[460px]" },
  { key: "titleUsage", label: "Title usage", placeholder: "Filter count", width: "w-[150px]" },
];

function parseCsv(text: string): { headers: string[]; records: string[][] } {
  const clean = text.replace(/^\uFEFF/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const candidates = [",", ";", "\t"];
  const delimiter = candidates.reduce((best, current) => {
    const count = (firstLine.match(new RegExp(current === "\t" ? "\\t" : `\\${current}`, "g")) ?? []).length;
    const bestCount = (firstLine.match(new RegExp(best === "\t" ? "\\t" : `\\${best}`, "g")) ?? []).length;
    return count > bestCount ? current : best;
  }, ",");

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i];
    const next = clean[i + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return { headers: rows[0] ?? [], records: rows.slice(1) };
}

function normalizeHeader(value: string) {
  return value.toLowerCase().trim().replace(/[\s_-]+/g, "");
}

function toRows(text: string): DataRow[] {
  const parsed = parseCsv(text);
  const normalized = parsed.headers.map(normalizeHeader);
  const idIndex = normalized.findIndex((header) => header === "id");
  const titleIndex = normalized.findIndex((header) => header === "title");
  const summaryIndex = normalized.findIndex((header) => ["summarybullets", "summary"].includes(header));

  if (idIndex < 0 || titleIndex < 0 || summaryIndex < 0) {
    throw new Error("The CSV needs id, title, and summary_bullets columns.");
  }

  const baseRows = parsed.records
    .map((values, index) => ({
      id: values[idIndex]?.trim() ?? "",
      title: values[titleIndex]?.trim() ?? "",
      summaryBullets: values.slice(summaryIndex).join(",").trim(),
      titleUsage: 0,
      rowNumber: index + 2,
    }))
    .filter((item) => item.id || item.title || item.summaryBullets);

  const counts = new Map<string, number>();
  for (const item of baseRows) {
    const key = item.title.toLocaleLowerCase().trim();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return baseRows.map((item) => ({
    ...item,
    titleUsage: counts.get(item.title.toLocaleLowerCase().trim()) ?? 0,
  }));
}

function SortIcon({ active, direction }: { active: boolean; direction: "asc" | "desc" }) {
  if (!active) return <ArrowUpDown aria-hidden="true" />;
  return direction === "asc" ? <ArrowUp aria-hidden="true" /> : <ArrowDown aria-hidden="true" />;
}

export function CsvAnalyzer() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<DataRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortState>({ key: "titleUsage", direction: "desc" });

  const loadText = (text: string, name: string) => {
    try {
      const nextRows = toRows(text);
      if (!nextRows.length) throw new Error("The CSV does not contain any data rows.");
      setRows(nextRows);
      setFileName(name);
      setFilters(EMPTY_FILTERS);
      setSort({ key: "titleUsage", direction: "desc" });
      setError("");
    } catch (reason) {
      setRows([]);
      setFileName("");
      setError(reason instanceof Error ? reason.message : "Could not read this CSV file.");
    }
  };

  useEffect(() => {
    const context = (document as DocumentWithModelContext).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: "load_sample_chat_summary_data",
      title: "Load sample chat summary data",
      description: "Load the built-in CSV sample into the visible chat summary analyzer.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute() {
        loadText(SAMPLE_CSV, "sample-chat-summaries.csv");
        return { loaded: true, rows: 5 };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, []);

  const loadFile = async (file?: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv") {
      setError("Choose a CSV file.");
      return;
    }
    loadText(await file.text(), file.name);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void loadFile(event.dataTransfer.files[0]);
  };

  const visibleRows = useMemo(() => {
    const filtered = rows.filter((row) =>
      COLUMNS.every(({ key }) => {
        const query = filters[key].toLocaleLowerCase().trim();
        if (!query) return true;
        return String(row[key]).toLocaleLowerCase().includes(query);
      }),
    );

    return [...filtered].sort((a, b) => {
      const left = a[sort.key];
      const right = b[sort.key];
      const comparison = typeof left === "number"
        ? left - Number(right)
        : String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });
      return sort.direction === "asc" ? comparison : -comparison;
    });
  }, [filters, rows, sort]);

  const uniqueTitles = useMemo(
    () => new Set(rows.map((row) => row.title.toLocaleLowerCase().trim())).size,
    [rows],
  );
  const repeatedRows = useMemo(() => rows.filter((row) => row.titleUsage > 1).length, [rows]);

  const changeSort = (key: ColumnKey) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  const clearData = () => {
    setRows([]);
    setFileName("");
    setError("");
    setFilters(EMPTY_FILTERS);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="analyzer-shell">
        <div className="analyzer-titlebar">
          <div>
            <Link href="/" className="back-link"><ArrowLeft aria-hidden="true" /> All helpers</Link>
            <h1>Chat summary analyzer</h1>
            <p>Upload a CSV to inspect summaries and find repeated titles.</p>
          </div>
          {rows.length > 0 && (
            <Button variant="outline" onClick={() => inputRef.current?.click()}>
              <Upload aria-hidden="true" /> Replace CSV
            </Button>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(event) => void loadFile(event.target.files?.[0])}
        />

        {rows.length === 0 ? (
          <section
            className={`drop-zone ${dragging ? "drop-zone--active" : ""}`}
            onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
            onDrop={onDrop}
            aria-labelledby="upload-title"
          >
            <span className="drop-zone__icon"><FileSpreadsheet aria-hidden="true" /></span>
            <h2 id="upload-title">Drop your CSV here</h2>
            <p>Required columns: <code>id</code>, <code>title</code>, and <code>summary_bullets</code>.</p>
            <div className="drop-zone__actions">
              <Button size="lg" onClick={() => inputRef.current?.click()}><Upload aria-hidden="true" /> Choose CSV</Button>
              <Button size="lg" variant="outline" onClick={() => loadText(SAMPLE_CSV, "sample-chat-summaries.csv")}>Use sample data</Button>
            </div>
            <small>Your file is processed in this browser and is not uploaded.</small>
          </section>
        ) : (
          <>
            <section className="stats-grid" aria-label="File summary">
              <article><span>Rows</span><strong>{rows.length.toLocaleString()}</strong></article>
              <article><span>Unique titles</span><strong>{uniqueTitles.toLocaleString()}</strong></article>
              <article><span>Rows with repeated titles</span><strong>{repeatedRows.toLocaleString()}</strong></article>
              <article className="file-stat"><span>Current file</span><strong title={fileName}>{fileName}</strong></article>
            </section>

            <section className="data-panel" aria-labelledby="table-title">
              <div className="data-panel__header">
                <div>
                  <h2 id="table-title">CSV data</h2>
                  <p>{visibleRows.length.toLocaleString()} of {rows.length.toLocaleString()} rows</p>
                </div>
                <div className="data-panel__actions">
                  {Object.values(filters).some(Boolean) && (
                    <Button variant="ghost" onClick={() => setFilters(EMPTY_FILTERS)}><X aria-hidden="true" /> Clear filters</Button>
                  )}
                  <Button variant="ghost" onClick={clearData}>Remove file</Button>
                </div>
              </div>

              <div className="table-frame">
                <Table>
                  <TableHeader>
                    <TableRow className="column-labels">
                      {COLUMNS.map((column) => (
                        <TableHead key={column.key} className={column.width}>
                          <button type="button" className="sort-button" onClick={() => changeSort(column.key)}>
                            {column.label}
                            <SortIcon active={sort.key === column.key} direction={sort.direction} />
                          </button>
                        </TableHead>
                      ))}
                    </TableRow>
                    <TableRow className="filter-row">
                      {COLUMNS.map((column) => (
                        <TableHead key={column.key} className={column.width}>
                          <label className="filter-control">
                            <Search aria-hidden="true" />
                            <span className="sr-only">{column.placeholder}</span>
                            <Input
                              value={filters[column.key]}
                              onChange={(event) => setFilters((current) => ({ ...current, [column.key]: event.target.value }))}
                              placeholder={column.placeholder}
                              inputMode={column.key === "titleUsage" ? "numeric" : "text"}
                            />
                          </label>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleRows.map((row) => (
                      <TableRow key={`${row.rowNumber}-${row.id}`}>
                        <TableCell className="font-mono text-[13px] text-muted-foreground">{row.id || "—"}</TableCell>
                        <TableCell className="font-medium">{row.title || "—"}</TableCell>
                        <TableCell className="summary-cell">
                          <div>{row.summaryBullets || "—"}</div>
                        </TableCell>
                        <TableCell>
                          <span className={`usage-badge ${row.titleUsage > 1 ? "usage-badge--repeat" : ""}`}>
                            {row.titleUsage}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                    {visibleRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="empty-table">No rows match these filters.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </section>
          </>
        )}

        {error && <div role="alert" className="error-banner">{error}</div>}
      </main>
    </div>
  );
}
