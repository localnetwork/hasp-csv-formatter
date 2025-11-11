import React, { useState, useRef } from "react";
import {
  Upload,
  Download,
  FileText,
  CheckCircle,
  AlertCircle,
  XCircle,
  CloudUpload,
  Eye,
  X,
  Trash2,
  Plus,
} from "lucide-react";

/**
 * CSVToJSONConverter.jsx
 *
 * - Sections-only model (default section "main", removable).
 * - You can add/rename/remove sections and assign CSV columns to sections.
 * - title and content are treated as base fields and are excluded from sectioned `data`.
 * - Converted JSON entries: { title, content, data: { sectionA: {...}, sectionB: {...} } }
 * - Preview flattens all sections into columns using sectionName_columnName prefix to avoid collisions.
 *
 * Notes:
 * - Tailwind CSS and lucide-react are required.
 */

export default function CSVToJSONConverter() {
  const [file, setFile] = useState(null);
  const [detectedHeaders, setDetectedHeaders] = useState([]); // exact headers as detected
  const [jsonData, setJsonData] = useState([]);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [isProcessing, setIsProcessing] = useState(false);
  const [activePreview, setActivePreview] = useState("table"); // "table" | "json"
  const [modalContent, setModalContent] = useState(null);
  const fileInputRef = useRef(null);

  // Sections state: id (unique), name, removable
  // Default section is "main" and is removable by user per request.
  const [sections, setSections] = useState([
    { id: "main", name: "main", removable: true },
  ]);
  // columnMap maps headerLower -> sectionId (if missing -> goes to first section)
  const [columnMap, setColumnMap] = useState({});

  const reset = () => {
    setFile(null);
    setDetectedHeaders([]);
    setJsonData([]);
    setStatus({ type: "", message: "" });
    setActivePreview("table");
    setSections([{ id: "main", name: "main", removable: true }]);
    setColumnMap({});
  };

  // Simple CSV parser for a single line that handles quoted fields and doubled quotes.
  const parseCSVLine = (line) => {
    const result = [];
    let cur = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        result.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    result.push(cur);
    return result.map((v) => v.trim());
  };

  // Read small slice and extract header line
  const extractHeadersFromFile = async (uploadedFile) => {
    try {
      const chunk = uploadedFile.slice(0, 16 * 1024);
      const text = await chunk.text();
      const rawLines = text.replace(/\r\n/g, "\n").split("\n");
      const firstLine = rawLines.find((l) => l.trim().length > 0) || "";
      if (!firstLine) {
        setDetectedHeaders([]);
        return;
      }
      const headers = parseCSVLine(firstLine).map((h, i) =>
        h ? h : `column_${i + 1}`
      );
      setDetectedHeaders(headers);
      // Reset columnMap for new file
      setColumnMap({});
      // ensure at least one section exists
      setSections((prev) => {
        if (!prev || prev.length === 0)
          return [{ id: "main", name: "main", removable: true }];
        return prev;
      });
    } catch (err) {
      console.error("Header extraction error:", err);
      setDetectedHeaders([]);
    }
  };

  const handleFileSelection = async (uploadedFile) => {
    if (!uploadedFile) return;
    const isCSV =
      uploadedFile.type === "text/csv" ||
      uploadedFile.name.toLowerCase().endsWith(".csv");
    if (!isCSV) {
      setStatus({ type: "error", message: "Please upload a valid CSV file." });
      return;
    }
    setFile(uploadedFile);
    setStatus({ type: "", message: "" });
    await extractHeadersFromFile(uploadedFile);
  };

  const handleFileUpload = (e) => {
    const uploadedFile = e.target.files?.[0];
    handleFileSelection(uploadedFile);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const uploadedFile = e.dataTransfer?.files?.[0];
    handleFileSelection(uploadedFile);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // Sections management
  const addSection = (name) => {
    if (!name || !name.trim()) return;
    const normalized = name.trim();
    const id =
      normalized.toLowerCase().replace(/\s+/g, "_") +
      "_" +
      Date.now().toString(36);
    setSections((prev) => [...prev, { id, name: normalized, removable: true }]);
  };

  const renameSection = (id, newName) => {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, name: newName } : s))
    );
  };

  const removeSection = (id) => {
    console.log("id", id);
    setSections((prev) => {
      // compute next sections list
      const next = prev.filter((s) => s.id !== id);
      let nextSections = next;
      // if removal would leave no sections, create a fallback default
      // if (nextSections.length === 0) {
      //   nextSections = [
      //     { id: "section_default", name: "section", removable: true },
      //   ];
      // }
      const fallbackId = nextSections?.[0]?.id;
      // reassign any columns mapped to this section back to fallback
      setColumnMap((prevMap) => {
        const nextMap = { ...prevMap };
        Object.keys(nextMap).forEach((col) => {
          if (nextMap[col] === id) nextMap[col] = fallbackId;
        });
        return nextMap;
      });
      return nextSections;
    });
  };

  const setColumnAssignment = (header, sectionId) => {
    const key = String(header).toLowerCase();
    setColumnMap((prev) => {
      const next = { ...prev };
      if (!sectionId) {
        delete next[key];
      } else {
        next[key] = sectionId;
      }
      return next;
    });
  };

  const processCSV = async () => {
    if (!file) {
      setStatus({ type: "error", message: "Please select a file first." });
      return;
    }

    setIsProcessing(true);
    setStatus({ type: "", message: "" });

    try {
      const text = await file.text();
      const rawLines = text.replace(/\r\n/g, "\n").split("\n");
      const lines = rawLines.filter((l) => l.trim().length > 0);

      if (lines.length < 1) {
        setStatus({
          type: "error",
          message: "CSV file is empty or malformed.",
        });
        setIsProcessing(false);
        return;
      }

      const headers = parseCSVLine(lines[0]).map((h, i) =>
        h ? h : `column_${i + 1}`
      );

      const transformed = [];

      // fallback default section id is first section in list
      const defaultSectionId = sections[0]?.id ?? "section_default";

      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        while (values.length < headers.length) values.push("");
        if (values.length > headers.length) values.length = headers.length;

        const row = {};
        headers.forEach((header, index) => {
          row[header] = values[index] ?? "";
        });

        // build a sectioned data object, initialize sections by name
        const sectionsData = {};
        sections.forEach((s) => {
          sectionsData[s.name] = {};
        });

        // for each header, decide which section it belongs to
        // IMPORTANT: exclude 'title' and 'content' from being placed into sectionsData
        headers.forEach((header) => {
          const headerLower = String(header).toLowerCase();

          // Skip base fields
          if (headerLower === "title" || headerLower === "content") {
            return;
          }

          const targetSectionId = columnMap[headerLower] ?? defaultSectionId;
          const targetSection =
            sections.find((s) => s.id === targetSectionId) || sections[0];
          const sectionName = targetSection.name;
          sectionsData[sectionName][headerLower] = row[header] ?? "";
        });

        const jsonEntry = {
          title: row.title ?? "",
          content: row.content ?? "",
          data: sectionsData,
        };

        transformed.push(jsonEntry);
      }

      setJsonData(transformed);
      setStatus({
        type: "success",
        message: `Converted ${transformed.length} row${
          transformed.length !== 1 ? "s" : ""
        }.`,
      });
    } catch (error) {
      console.error("CSV processing error:", error);
      setStatus({ type: "error", message: "Error processing CSV file." });
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadJSON = () => {
    const timestamp = new Date().toISOString().replace(/[:.-]/g, "");
    if (jsonData.length === 0) {
      setStatus({ type: "error", message: "No data to download." });
      return;
    }
    const blob = new Blob([JSON.stringify(jsonData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `exported-data-${timestamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatus({ type: "success", message: "JSON download started." });
  };

  const csvEscape = (value) => {
    if (value === null || value === undefined) return '""';
    const str = String(value);
    const escaped = str.replace(/"/g, '""');
    return `"${escaped}"`;
  };

  const downloadCSV = () => {
    const timestamp = new Date().toISOString().replace(/[:.-]/g, "");
    if (jsonData.length === 0) {
      setStatus({ type: "error", message: "No data to download." });
      return;
    }

    if (sections.length === 0) {
      setStatus({ type: "error", message: "No sections defined." });
      setModalContent({
        title: "Export Error",
        content:
          "Cannot export CSV because no sections are defined. Please add at least one section before exporting.",
      });
      return;
    }

    const baseHeaders = [
      "content",
      "title",
      "route_url",
      "published_at",
      "data",
      "status",
      "sites",
      "locale",
      "taxonomy_terms",
      "created_at",
    ];
    const headersLower = baseHeaders.map((h) => String(h).toLowerCase());
    const csvRows = [headersLower.join(",")];

    jsonData.forEach((item) => {
      const dataJsonString = JSON.stringify(item.data);
      const routeTitle = (item.title || "")
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-");
      const published_at = new Date().toISOString();
      const created_at = new Date().toISOString();

      const row = [
        csvEscape(item.content ?? ""),
        csvEscape(item.title ?? ""),
        csvEscape(`/${item.content}/${routeTitle}`),
        csvEscape(published_at),
        csvEscape(dataJsonString),
        csvEscape("1"),
        csvEscape(""),
        csvEscape("en"),
        csvEscape(""),
        csvEscape(created_at),
      ];

      csvRows.push(row.join(","));
    });

    const csvContent = csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `exported-data-${timestamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatus({ type: "success", message: "CSV download started." });
  };

  // Build preview rows (first up to 10), flatten sections for table preview
  const previewRows = jsonData.slice(0, 10).map((entry) => {
    const base = {
      title: entry.title ?? "",
      content: entry.content ?? "",
      data: JSON.stringify(entry.data),
    };
    // Flatten sections: all sections use prefix sectionName_col to avoid collisions.
    Object.keys(entry.data || {}).forEach((sectionName) => {
      const sectionObj = entry.data[sectionName] || {};
      Object.keys(sectionObj).forEach((col) => {
        const key = `${sectionName}_${col}`;
        base[key] = sectionObj[col];
      });
    });

    return base;
  });

  // Union of all keys across previewRows to ensure dynamic keys appear as columns
  const columns = Array.from(
    new Set(previewRows.flatMap((r) => Object.keys(r)))
  );

  const truncate = (s, n = 140) => {
    const str = String(s ?? "");
    if (str.length <= n) return str;
    return str.slice(0, n) + "…";
  };

  // helpers for UI
  const [newSectionName, setNewSectionName] = useState("");

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-sky-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-4 p-6 border-b border-slate-100">
            <div className="flex items-center justify-center w-14 h-14 rounded-lg bg-gradient-to-tr from-indigo-600 to-purple-600 text-white shadow-md">
              <FileText className="w-7 h-7" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-semibold text-slate-800">
                HASP CSV Formatter
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Create sections and map CSV columns into them. Preview the
                result and export JSON/CSV.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  if (fileInputRef.current) fileInputRef.current.click();
                }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg shadow-sm hover:bg-indigo-700 transition"
              >
                <Upload className="w-4 h-4" />
                Select file
              </button>
              <button
                onClick={reset}
                className="inline-flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition"
                title="Clear"
              >
                <XCircle className="w-4 h-4" />
                Clear
              </button>
            </div>
          </div>

          <div className="p-6 flex ">
            {/* Left: Upload + Detected headers + Sections & assignment */}
            <div className="w-[350px] px-[15px] space-y-4">
              <label className="block text-sm font-medium text-slate-700">
                Upload CSV
              </label>

              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                className="relative rounded-lg border-2 border-dashed border-slate-200 bg-white p-4 flex flex-col items-center justify-center text-center hover:border-indigo-300 transition cursor-pointer"
                onClick={() =>
                  fileInputRef.current && fileInputRef.current.click()
                }
                aria-label="Drop CSV file here or click to select"
              >
                <CloudUpload className="w-8 h-8 text-indigo-500 mb-2" />
                <div className="text-sm text-slate-600">
                  {file ? (
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-800">
                        {file.name}
                      </span>
                      <span className="text-xs text-slate-400">
                        {(file.size / 1024).toFixed(1)} KB
                      </span>
                    </div>
                  ) : (
                    <div>
                      Drag & drop a CSV file here, or click to browse
                      <div className="text-xs text-slate-400 mt-2">
                        Accepted: .csv
                      </div>
                    </div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={processCSV}
                  disabled={!file || isProcessing}
                  className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-white transition ${
                    !file || isProcessing
                      ? "bg-slate-300 cursor-not-allowed"
                      : "bg-indigo-600 hover:bg-indigo-700"
                  }`}
                >
                  {isProcessing ? "Processing..." : "Convert"}
                </button>

                <button
                  onClick={() =>
                    fileInputRef.current && fileInputRef.current.click()
                  }
                  className="px-4 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200"
                >
                  Replace
                </button>
              </div>

              <div className="mt-2 flex gap-2">
                <button
                  onClick={downloadJSON}
                  disabled={jsonData.length === 0}
                  className={`flex-1 inline-flex items-center gap-2 px-3 py-2 rounded-lg transition ${
                    jsonData.length === 0
                      ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                      : "bg-emerald-600 text-white hover:bg-emerald-700"
                  }`}
                >
                  <Download className="w-4 h-4" />
                  Download JSON
                </button>

                <button
                  onClick={downloadCSV}
                  disabled={jsonData.length === 0}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg transition ${
                    jsonData.length === 0
                      ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                      : "bg-sky-600 text-white hover:bg-sky-700"
                  }`}
                >
                  <Download className="w-4 h-4" />
                  Export CSV
                </button>
              </div>

              {/* Detected headers */}
              {file && (
                <div className="mt-4 bg-slate-50 p-3 rounded-md border border-slate-100 text-sm">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium text-slate-700">
                      Detected CSV columns
                    </div>
                    <div className="text-xs text-slate-400">
                      columns: {detectedHeaders.length}
                    </div>
                  </div>

                  {detectedHeaders.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {detectedHeaders.map((h, i) => (
                        <span
                          key={i}
                          className="px-2 py-1 rounded text-xs bg-white border text-slate-600"
                        >
                          {h}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500">
                      Could not detect columns from the CSV header.
                    </div>
                  )}
                </div>
              )}

              {/* Sections editor */}
              <div className="mt-4 bg-white p-3 rounded-md border border-slate-100 text-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium text-slate-700">Sections</div>
                  <div className="text-xs text-slate-400">
                    {sections.length}
                  </div>
                </div>

                <div className="space-y-2">
                  {sections.map((s) => (
                    <div key={s.id} className="flex items-center gap-2">
                      <input
                        value={s.name}
                        onChange={(e) => renameSection(s.id, e.target.value)}
                        className="flex-1 px-2 py-1 border rounded text-sm text-gray-600"
                      />
                      {s.removable && (
                        <button
                          onClick={() => removeSection(s.id)}
                          className="px-2 py-1 text-xs rounded bg-rose-100 text-rose-700 hover:bg-rose-200"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}

                  <div className="flex gap-2 mt-2">
                    <input
                      value={newSectionName}
                      onChange={(e) => setNewSectionName(e.target.value)}
                      placeholder="New section name"
                      className="flex-1 px-2 py-1 border rounded text-sm"
                    />
                    <button
                      onClick={() => {
                        if (!newSectionName.trim()) return;
                        addSection(newSectionName.trim());
                        setNewSectionName("");
                      }}
                      className="px-2 py-1 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-700"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Assignment UI */}
              {file && detectedHeaders.length > 0 && (
                <div className="mt-4 bg-white p-3 rounded-md border border-slate-100 text-sm">
                  <div className="font-medium text-slate-700 mb-2">
                    Assign columns to sections
                  </div>
                  <div className="text-xs text-slate-500 mb-2">
                    Select which section each detected column should go into.
                  </div>
                  <div className="space-y-2 max-h-48 overflow-auto pr-2">
                    {detectedHeaders?.map((header) => {
                      const key = header.toLowerCase();
                      const assigned = columnMap[key] ?? sections?.[0]?.id;
                      return (
                        <div key={header} className="flex items-center gap-2">
                          <div className="flex-1 text-xs text-slate-700">
                            {header}
                          </div>
                          <select
                            value={assigned}
                            onChange={(e) =>
                              setColumnAssignment(header, e.target.value)
                            }
                            className="text-xs px-2 py-1 border rounded bg-white text-gray-600"
                          >
                            {sections.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Preview area (spans 3 cols on large screens) */}
            <div className="w-[calc(100%-350px)] lg:col-span-3 bg-white rounded-lg p-4 border border-slate-50 shadow-sm min-h-[240px]">
              {/* Status */}
              {status.message && (
                <div
                  className={`mb-4 p-3 rounded-md flex items-center gap-3 ${
                    status.type === "success"
                      ? "bg-emerald-50 text-emerald-800 border border-emerald-100"
                      : "bg-rose-50 text-rose-800 border border-rose-100"
                  }`}
                >
                  {status.type === "success" ? (
                    <CheckCircle className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-rose-600" />
                  )}
                  <div className="text-sm">{status.message}</div>
                </div>
              )}

              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-800">
                    Preview
                  </h3>
                  <div className="text-xs text-slate-500">
                    Showing up to first 10 rows
                  </div>
                </div>

                <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-lg">
                  <button
                    onClick={() => setActivePreview("table")}
                    className={`px-3 py-1 rounded-md text-sm ${
                      activePreview === "table"
                        ? "bg-white shadow text-slate-800"
                        : "text-slate-500"
                    }`}
                  >
                    Table
                  </button>
                  <button
                    onClick={() => setActivePreview("json")}
                    className={`px-3 py-1 rounded-md text-sm ${
                      activePreview === "json"
                        ? "bg-white shadow text-slate-800"
                        : "text-slate-500"
                    }`}
                  >
                    JSON
                  </button>
                </div>
              </div>

              <div className="h-[520px] overflow-auto rounded-md border border-slate-100">
                {jsonData.length === 0 ? (
                  <div className="w-full h-full flex items-center justify-center text-slate-400">
                    <div className="text-center">
                      <FileText className="w-12 h-12 mx-auto mb-2" />
                      No preview available — upload a CSV and click Convert.
                    </div>
                  </div>
                ) : activePreview === "table" ? (
                  <table className="min-w-full table-auto text-sm">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr>
                        {columns.map((h) => (
                          <th
                            key={h}
                            className="text-left px-3 py-2 text-xs text-slate-500 align-top"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, idx) => (
                        <tr
                          key={idx}
                          className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}
                        >
                          {columns.map((k) => {
                            const val = row[k] ?? "";
                            return (
                              <td
                                key={k}
                                className="px-3 py-2 align-top text-slate-700 break-words max-w-[20rem]"
                              >
                                <div className="text-xs whitespace-pre-wrap">
                                  {truncate(val)}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <pre className="p-4 text-xs text-slate-800 bg-white overflow-auto">
                    {JSON.stringify(jsonData.slice(0, 50), null, 2)}
                    {jsonData.length > 50 && "\n... and more"}
                  </pre>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-100 text-sm text-slate-500 flex items-center justify-between">
            <div>Processed with care • CSV → JSON</div>
            <div>
              <span className="mr-4">{jsonData.length} entries</span>
              <span>dio-digitas • {new Date().getFullYear()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Modal for viewing long cell content */}
      {modalContent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-lg max-w-3xl w-full shadow-lg">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="text-sm font-medium text-slate-700">
                {modalContent.title}
              </div>
              <button
                onClick={() => setModalContent(null)}
                className="p-1 rounded hover:bg-slate-100"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 overflow-auto text-xs text-slate-800">
              <pre className="whitespace-pre-wrap">{modalContent.content}</pre>
            </div>
            <div className="p-3 border-t flex justify-end">
              <button
                onClick={() => setModalContent(null)}
                className="px-3 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
