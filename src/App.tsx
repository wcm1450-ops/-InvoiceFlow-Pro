import React, { useState, useEffect, useMemo } from "react";
import {
  FileSpreadsheet,
  UploadCloud,
  CheckCircle,
  AlertTriangle,
  Trash2,
  Save,
  Search,
  FileText,
  AlertCircle,
  Sparkles,
  X,
  Plus,
  RefreshCw,
  RotateCcw
} from "lucide-react";
import { ParsedInvoice, InvoiceItem, BoundingBox } from "./types";
import { sampleInvoices } from "./utils/sampleData";
import { generateInvoiceSvgDataUrl } from "./utils/svgGenerator";
import { revalidateInvoice, validateTaiwanUBN } from "./utils/validator";
import * as XLSX from "xlsx";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";

export default function App() {
  // State variables
  const [invoices, setInvoices] = useState<ParsedInvoice[]>(sampleInvoices);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>("sample-1");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"all" | "normal" | "issues">("all");
  const [hoveredField, setHoveredField] = useState<string | null>(null);
  
  // OCR processing states
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [ocrError, setOcrError] = useState<string | null>(null);
  
  // Drag and drop states
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // Statistics toggle state
  const [showStats, setShowStats] = useState<boolean>(true);

  // Computed trend data for the last 7 days mapping dynamic invoices
  const trendData = useMemo(() => {
    // Ground base historical entries matching natural daily ERP incoming queues
    const days = [
      { date: "06-01", label: "06-01 (一)", normal: 22, issues: 3 },
      { date: "06-02", label: "06-02 (二)", normal: 18, issues: 2 },
      { date: "06-03", label: "06-03 (三)", normal: 30, issues: 4 },
      { date: "06-04", label: "06-04 (四)", normal: 15, issues: 1 },
      { date: "06-05", label: "06-05 (五)", normal: 26, issues: 3 },
      { date: "06-06", label: "06-06 (六)", normal: 12, issues: 0 },
      { date: "06-07", label: "06-07 (日)", normal: 0,  issues: 0 },
    ];

    // Overlay active and uploaded session list invoices onto stats
    invoices.forEach((inv) => {
      const dateStr = inv.invoiceDate.value || "";
      const status = inv.overallStatus;
      
      // Attempt target date match
      let matchedDay = days.find((d) => dateStr.includes(d.date));
      if (!matchedDay) {
        // Fallback matching parsedAt
        const parsedAtStr = inv.parsedAt || "";
        matchedDay = days.find((d) => parsedAtStr.includes(d.date));
      }
      
      // Fallback matching June 7th (today)
      if (!matchedDay) {
        matchedDay = days[6];
      }

      if (matchedDay) {
        if (status === "normal") {
          matchedDay.normal += 1;
        } else {
          matchedDay.issues += 1;
        }
      }
    });

    return days;
  }, [invoices]);

  // Correction Form state variables (syncs with selected invoice)
  const [formNumber, setFormNumber] = useState<string>("");
  const [formDate, setFormDate] = useState<string>("");
  const [formSeller, setFormSeller] = useState<string>("");
  const [formSellerName, setFormSellerName] = useState<string>("");
  const [formBuyer, setFormBuyer] = useState<string>("");
  const [formSubtotal, setFormSubtotal] = useState<number>(0);
  const [formTax, setFormTax] = useState<number>(0);
  const [formTotal, setFormTotal] = useState<number>(0);
  const [formItems, setFormItems] = useState<InvoiceItem[]>([]);

  // Get currently selected invoice
  const selectedInvoice = invoices.find((inv) => inv.id === selectedInvoiceId);

  // Sync Form when selected invoice changes
  useEffect(() => {
    if (selectedInvoice) {
      setFormNumber(selectedInvoice.invoiceNumber.value || "");
      setFormDate(selectedInvoice.invoiceDate.value || "");
      setFormSeller(selectedInvoice.sellerUbn.value || "");
      setFormSellerName(selectedInvoice.sellerName?.value || "");
      setFormBuyer(selectedInvoice.buyerUbn.value || "");
      setFormSubtotal(selectedInvoice.subtotal.value || 0);
      setFormTax(selectedInvoice.tax.value || 0);
      setFormTotal(selectedInvoice.totalAmount.value || 0);
      setFormItems([...selectedInvoice.items]);
      setOcrError(null);
    }
  }, [selectedInvoiceId, selectedInvoice]);

  // Real-time local verification checks to indicate math consistency directly in Form UI
  const localSumMatches = formSubtotal + formTax === formTotal;
  const localSellerUbnValid = formSeller ? validateTaiwanUBN(formSeller).isValid : false;
  const localBuyerUbnValid = formBuyer ? validateTaiwanUBN(formBuyer).isValid : true; // Optional

  // Compute stats metrics dynamically
  const totalInvoicesCount = invoices.length;
  const normalInvoicesCount = invoices.filter((inv) => inv.overallStatus === "normal").length;
  const issueInvoicesCount = invoices.filter((inv) => inv.overallStatus === "has_issues").length;

  // Search logic
  const filteredInvoices = invoices.filter((inv) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;

    const numMatch = (inv.invoiceNumber.value || "").toLowerCase().includes(query);
    const sellerMatch = (inv.sellerUbn.value || "").includes(query);
    const itemMatch = inv.items.some((item) => item.name.toLowerCase().includes(query));
    
    return numMatch || sellerMatch || itemMatch;
  }).filter((inv) => {
    if (activeTab === "normal") return inv.overallStatus === "normal";
    if (activeTab === "issues") return inv.overallStatus === "has_issues";
    return true;
  });

  // Handle Drag & Drop uploading
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  // Handle traditional input file upload selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  // Convert image to Base64 and run Gemini AI OCR API
  const processFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setOcrError("不支援此檔案格式。請上傳 JPG、PNG 或 WebP 影像圖檔。");
      return;
    }

    setIsUploading(true);
    setOcrError(null);
    setUploadProgress("正在讀取發票影像檔案並編碼...");

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64Data = reader.result as string;
        // Extract raw base64 payload without data:image/png;base64, header prefix
        const base64Parsed = base64Data.split(",")[1];
        
        setUploadProgress("多模態傳輸：正在以 Gemini 3.5 核心辨識發票內容...");

        const response = await fetch("/api/ocr", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            imageBase64: base64Parsed,
            mimeType: file.type,
          }),
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || "系統未能解析發票：後端分析伺服器回傳錯誤");
        }

        setUploadProgress("正在編譯雙向驗證數據結構，進行財稅稽核分析...");
        const ocrResult = await response.json();

        // Unique ID for the newly uploaded invoice
        const newInvoiceId = "usr-" + Date.now();
        const formattedSize = (file.size / 1024).toFixed(0) + " KB";

        const newInvoice: ParsedInvoice = {
          id: newInvoiceId,
          fileName: file.name,
          fileSize: formattedSize,
          imagePreview: base64Data, // Embed actual uploaded file for pixel accurate overlay
          invoiceNumber: ocrResult.invoiceNumber,
          invoiceDate: ocrResult.invoiceDate,
          sellerName: ocrResult.sellerName,
          sellerUbn: ocrResult.sellerUbn,
          buyerUbn: ocrResult.buyerUbn,
          subtotal: ocrResult.subtotal,
          tax: ocrResult.tax,
          totalAmount: ocrResult.totalAmount,
          items: ocrResult.items || [],
          overallStatus: ocrResult.overallStatus,
          overallIssues: ocrResult.overallIssues || [],
          parsedAt: new Date().toLocaleString("zh-TW", { hour12: false }).substring(0, 16)
        };

        setInvoices((prev) => [newInvoice, ...prev]);
        setSelectedInvoiceId(newInvoiceId);
        setIsUploading(false);
        setUploadProgress("");
      } catch (err: any) {
        console.error("OCR API error:", err);
        setOcrError(err.message || "上傳辨識失敗：請確認 API 金鑰已設定，且連線正常後重試。");
        setIsUploading(false);
        setUploadProgress("");
      }
    };

    reader.onerror = () => {
      setOcrError("發票檔案讀取失敗，請重新再試。");
      setIsUploading(false);
    };

    reader.readAsDataURL(file);
  };

  // Perform corrections save & revalidate
  const handleSaveChanges = () => {
    if (!selectedInvoice) return;

    // Compose updated fields based on Form state
    const modifiedInvoice: ParsedInvoice = {
      ...selectedInvoice,
      invoiceNumber: {
        ...selectedInvoice.invoiceNumber,
        value: formNumber || null,
      },
      invoiceDate: {
        ...selectedInvoice.invoiceDate,
        value: formDate || null,
      },
      sellerName: {
        ...selectedInvoice.sellerName,
        value: formSellerName || null,
      },
      sellerUbn: {
        ...selectedInvoice.sellerUbn,
        value: formSeller || null,
      },
      buyerUbn: {
        ...selectedInvoice.buyerUbn,
        value: formBuyer || null,
      },
      subtotal: {
        ...selectedInvoice.subtotal,
        value: formSubtotal ? Number(formSubtotal) : null,
      },
      tax: {
        ...selectedInvoice.tax,
        value: formTax ? Number(formTax) : null,
      },
      totalAmount: {
        ...selectedInvoice.totalAmount,
        value: formTotal ? Number(formTotal) : null,
      },
      items: formItems
    };

    // Re-verify after corrections
    const revalidated = revalidateInvoice(modifiedInvoice);

    // If it was a mock-up sample SVG invoice, redraw the document dynamically to display corrected values
    if (revalidated.id.startsWith("sample-")) {
      revalidated.imagePreview = generateInvoiceSvgDataUrl(revalidated);
    }

    setInvoices((prev) =>
      prev.map((inv) => (inv.id === selectedInvoice.id ? revalidated : inv))
    );

    setOcrError(null);
  };

  // Append new empty item in correction desk
  const handleAddItem = () => {
    const newItem: InvoiceItem = {
      name: "新商品明細",
      qty: 1,
      price: 0,
      amount: 0
    };
    setFormItems((prev) => [...prev, newItem]);
  };

  // Modify item line item fields, automatically recalculating specific amounts
  const handleUpdateItem = (index: number, field: keyof InvoiceItem, value: any) => {
    setFormItems((prev) =>
      prev.map((item, idx) => {
        if (idx === index) {
          const updated = { ...item, [field]: value };
          if (field === "qty" || field === "price") {
            updated.amount = Number(updated.qty || 0) * Number(updated.price || 0);
          }
          return updated;
        }
        return item;
      })
    );
  };

  // Delete line item
  const handleDeleteItem = (index: number) => {
    setFormItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Auto compute Subtotal, Tax, and Total from current items table
  const handleAutoCalcFromItems = () => {
    const sumAmount = formItems.reduce((acc, item) => acc + (item.amount || 0), 0);
    const calculatedTax = Math.round(sumAmount * 0.05);
    const calculatedTotal = sumAmount + calculatedTax;

    setFormSubtotal(sumAmount);
    setFormTax(calculatedTax);
    setFormTotal(calculatedTotal);
  };

  // Delete specific invoice from memory
  const handleDeleteInvoice = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = invoices.filter((inv) => inv.id !== id);
    setInvoices(updated);

    if (selectedInvoiceId === id && updated.length > 0) {
      setSelectedInvoiceId(updated[0].id);
    }
  };

  // Clear all list and load sample templates
  const handleResetToSample = () => {
    setInvoices(sampleInvoices);
    setSelectedInvoiceId("sample-1");
  };

  // Traditional Chinese Ledger Excel compilation & export download
  const handleExportToExcel = () => {
    if (invoices.length === 0) {
      alert("目前無發票紀錄可導出！");
      return;
    }

    const reportRows = invoices.map((inv, idx) => ({
      "序號": idx + 1,
      "發票號碼": inv.invoiceNumber.value || "【缺失】",
      "發票日期": inv.invoiceDate.value || "【缺失】",
      "營業人 (賣方名稱)": inv.sellerName?.value || "【缺失】",
      "賣方統一編號 (統編)": inv.sellerUbn.value || "【缺失】",
      "買方統一編號 (統編)": inv.buyerUbn.value || "【非統編發票】",
      "銷售額小計 (未稅)": inv.subtotal.value !== null ? inv.subtotal.value : 0,
      "營業稅額 (5%)": inv.tax.value !== null ? inv.tax.value : 0,
      "發票總計金額": inv.totalAmount.value !== null ? inv.totalAmount.value : 0,
      "交易品項明細 (概述)": inv.items.map((it) => `${it.name} (數量:${it.qty} / 單價:${it.price})`).join("; "),
      "財務稽核結果": inv.overallStatus === "normal" ? "合規已確認" : "異常需人工查核",
      "異常警告備註項目": inv.overallIssues.join(" | ") || "無異常",
      "辨識處理時間": inv.parsedAt
    }));

    const worksheet = XLSX.utils.json_to_sheet(reportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "AI發票核對明細表");

    // Configure accounting-friendly column widths
    const columnWidths = [
      { wch: 6 },   // 序號
      { wch: 15 },  // 發票號碼
      { wch: 14 },  // 發票日期
      { wch: 25 },  // 營業人 (賣方名稱)
      { wch: 15 },  // 賣方統編
      { wch: 15 },  // 買方統編
      { wch: 14 },  // 未稅小計
      { wch: 12 },  // 稅額
      { wch: 14 },  // 總金額
      { wch: 40 },  // 交易明細
      { wch: 15 },  // 稽核結果
      { wch: 30 },  // 異常備註
      { wch: 18 }   // 處理時間
    ];
    worksheet["!cols"] = columnWidths;

    XLSX.writeFile(workbook, `AI_Invoice_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="h-screen w-full bg-slate-50 flex flex-col font-sans overflow-hidden antialiased">
      {/* Top Navigation Bar in White */}
      <nav className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 z-10 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-sm flex items-center justify-center shrink-0">
            <div className="w-4 h-4 border-2 border-white"></div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold tracking-tight text-slate-800">InvoiceFlow Pro</span>
            <span className="hidden sm:inline bg-indigo-50 text-indigo-700 text-[10px] uppercase font-black px-1.5 py-0.5 rounded">
              AI OCR 智慧發票稽核
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          {/* Header Navigation Tabs matching Active Tabs */}
          <div className="hidden lg:flex gap-4 text-sm font-medium text-slate-500">
            <button
              onClick={() => setActiveTab("all")}
              className={`py-5 transition-all relative cursor-pointer ${
                activeTab === "all" ? "text-indigo-600 border-b-2 border-indigo-600 font-bold" : "hover:text-slate-800"
              }`}
            >
              處理中心
            </button>
            <button
              onClick={() => setActiveTab("normal")}
              className={`py-5 transition-all relative cursor-pointer ${
                activeTab === "normal" ? "text-indigo-600 border-b-2 border-indigo-600 font-bold" : "hover:text-slate-800"
              }`}
            >
              合規帳冊
            </button>
            <button
              onClick={() => setActiveTab("issues")}
              className={`py-5 transition-all relative cursor-pointer ${
                activeTab === "issues" ? "text-indigo-600 border-b-2 border-indigo-600 font-bold" : "hover:text-slate-800"
              }`}
            >
              異常修正
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleResetToSample}
              title="還原為原始範例資料配合圈選展示"
              className="px-3 py-2 text-xs font-semibold text-slate-600 bg-white hover:bg-slate-50 active:bg-slate-100 border border-slate-200 rounded shadow-xs transition-all duration-150 flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">重置範例</span>
            </button>

            <button
              id="btn-export-excel"
              onClick={handleExportToExcel}
              className="bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white px-4 py-2 rounded shadow-xs text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 shrink-0" />
              彙出 Excel (.xlsx)
            </button>
          </div>
        </div>
      </nav>

      {/* Main Workspace Frame */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Side Navigation Pane: Interactive Queue Controls */}
        <aside className="w-80 border-r border-slate-200 bg-white flex flex-col shrink-0">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
              處理佇列 ({filteredInvoices.length})
            </h3>
            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
              系統登帳: {totalInvoicesCount}
            </span>
          </div>

          {/* Drag and Drop Upload Area */}
          <div className="p-4 border-b border-slate-100 bg-slate-50/20">
            <div
              id="drag-upload-zone"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded p-4 text-center transition-all duration-150 relative overflow-hidden ${
                isDragOver
                  ? "border-indigo-500 bg-indigo-50/50 scale-[1.01]"
                  : "border-slate-200 bg-white hover:bg-slate-50/50 hover:border-slate-300"
              }`}
            >
              <input
                type="file"
                id="file-element"
                accept="image/*"
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                disabled={isUploading}
              />
              
              <div className="flex flex-col items-center justify-center">
                <div className="bg-slate-100 p-2.5 rounded-full text-indigo-500 mb-2">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <h4 className="text-[11px] font-bold text-slate-700">
                  拖放發票圖檔，或 <span className="text-indigo-600 underline">點擊本機上傳</span>
                </h4>
                <p className="text-[9px] text-slate-400 mt-1 leading-normal">
                  支援 JPG, PNG, WebP 影像規格
                </p>
              </div>

              {/* Upload Parsing overlay card */}
              {isUploading && (
                <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-xs z-20 flex flex-col items-center justify-center p-3 text-white">
                  <RefreshCw className="w-5 h-5 text-indigo-400 animate-spin mb-1.5" />
                  <h5 className="text-[10px] font-bold tracking-wider">AI OCR 智慧分析中</h5>
                  <p className="text-[8.5px] text-zinc-300 text-center uppercase tracking-normal mt-1 leading-normal truncate max-w-full px-2">
                    {uploadProgress}
                  </p>
                </div>
              )}
            </div>

            {ocrError && (
              <div className="mt-2.5 p-2 bg-red-50 border border-red-100 text-red-700 text-[10.5px] rounded leading-normal flex items-start gap-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-500" />
                <span>{ocrError}</span>
              </div>
            )}
          </div>

          {/* Search Frame */}
          <div className="p-3 border-b border-slate-100 bg-white">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="搜尋發票號碼、金額、統編、品項明細..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs text-slate-700 bg-slate-50 border border-slate-200 py-2 pl-8 pr-7 rounded focus:outline-none focus:border-indigo-500 focus:bg-white transition-all font-sans"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Categorized quick tags selection */}
          <div className="grid grid-cols-3 border-b border-slate-100 text-[11px] font-bold bg-white text-slate-500">
            <button
              onClick={() => setActiveTab("all")}
              className={`py-2.5 text-center border-b-2 transition-all cursor-pointer ${
                activeTab === "all" ? "border-indigo-600 text-indigo-600 bg-indigo-50/10" : "border-transparent hover:text-slate-900"
              }`}
            >
              全部 ({totalInvoicesCount})
            </button>
            <button
              onClick={() => setActiveTab("normal")}
              className={`py-2.5 text-center border-b-2 transition-all cursor-pointer ${
                activeTab === "normal" ? "border-emerald-600 text-emerald-600 bg-emerald-50/15" : "border-transparent hover:text-slate-900"
              }`}
            >
              合規 ({normalInvoicesCount})
            </button>
            <button
              onClick={() => setActiveTab("issues")}
              className={`py-2.5 text-center border-b-2 transition-all cursor-pointer ${
                activeTab === "issues" ? "border-rose-600 text-rose-600 bg-rose-50/15" : "border-transparent hover:text-slate-900"
              }`}
            >
              異常 ({issueInvoicesCount})
            </button>
          </div>

          {/* Scrollable Side files listings with visual status check indicator */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 bg-white">
            {filteredInvoices.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400 mt-4">
                <FileText className="w-8 h-8 text-slate-300 mb-2" />
                <p className="text-xs">未搜尋到符合條件的發票</p>
                <button
                  onClick={() => { setSearchQuery(""); setActiveTab("all"); }}
                  className="text-[10.5px] text-indigo-600 mt-1 underline hover:text-indigo-800"
                >
                  清除重設過濾條件
                </button>
              </div>
            ) : (
              filteredInvoices.map((inv) => {
                const isSelected = inv.id === selectedInvoiceId;
                const hasIssues = inv.overallStatus === "has_issues";

                // Left Queue elements matching Amber/Completed layouts
                return (
                  <div
                    key={inv.id}
                    onClick={() => setSelectedInvoiceId(inv.id)}
                    className={`p-3.5 transition-all cursor-pointer relative ${
                      isSelected
                        ? hasIssues
                          ? "bg-amber-50/70 border-l-4 border-l-amber-500"
                          : "bg-emerald-50/40 border-l-4 border-l-emerald-500"
                        : "border-l-4 border-l-transparent hover:bg-slate-50/50"
                    }`}
                  >
                    <div className="flex justify-between items-start gap-1">
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-bold truncate ${isSelected ? "text-slate-900" : "text-slate-700"}`}>
                          {inv.fileName}
                        </p>
                        <p className="text-xs font-mono text-slate-500 mt-1 tracking-wide">
                          {inv.invoiceNumber.value || "【無法解析號碼】"}
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-2 pl-2 shrink-0">
                        {hasIssues ? (
                          <span className="text-[11px] text-amber-600 font-bold shrink-0 flex items-center gap-1">
                            等待人工核閱
                          </span>
                        ) : (
                          <span className="text-[11px] text-emerald-600 font-bold shrink-0">
                            完成辨識
                          </span>
                        )}
                        <button
                          onClick={(e) => handleDeleteInvoice(inv.id, e)}
                          className="text-slate-300 hover:text-rose-600 p-0.5 transition-colors cursor-pointer"
                          title="刪除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex justify-between items-end text-[10px] text-slate-400 mt-2.5 font-mono">
                      <div>
                        <span>統編: {inv.sellerUbn.value || "【缺失】"}</span>
                        <span className="mx-1">•</span>
                        <span>{inv.invoiceDate.value || "未偵測日期"}</span>
                      </div>
                      <span className="text-xs font-bold text-slate-800">
                        ${inv.totalAmount.value !== null ? inv.totalAmount.value.toLocaleString() : "TWD"}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* Central Workspace area */}
        <main className="flex-1 bg-slate-100 flex flex-col p-6 overflow-y-auto">
          {selectedInvoice ? (
            <div className="max-w-[1200px] w-full mx-auto flex flex-col flex-1">
              
              {/* Header Information Pane */}
              <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0">
                <h2 className="text-lg font-bold text-slate-800">
                  異常修正: {selectedInvoice.fileName.replace(/\.[^/.]+$/, "")}
                </h2>
                
                <div className="flex flex-wrap gap-2">
                  {!formDate && (
                    <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-bold shadow-xs">
                      缺漏項目：發票日期
                  </span>
                  )}
                  {(!localSumMatches || selectedInvoice.overallStatus === "has_issues") && (
                    <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold shadow-xs animate-pulse">
                      辨識錯誤：總計金額不平衡 / 資料有缺
                    </span>
                  )}
                  {selectedInvoice.overallStatus === "normal" && localSumMatches && (
                    <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-bold shadow-xs animate-stretch">
                      審核正常無遺失屬性
                    </span>
                  )}
                </div>
              </div>

              {/* Statistics Dashboard Panel */}
              <div id="stats-dashboard-panel" className="mb-6 bg-white rounded-lg shadow-xs border border-slate-200 overflow-hidden shrink-0">
                <div 
                  onClick={() => setShowStats(!showStats)}
                  className="px-5 py-3.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between cursor-pointer hover:bg-slate-100/50 transition-all select-none"
                >
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded">
                      <Sparkles className="w-4 h-4 text-indigo-500 animate-pulse" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-baseline gap-2">
                        AI 稽核營運數據儀表板
                        <span className="hidden md:inline text-[10px] font-normal text-slate-400 normal-case">(過去 7 天辨識狀態與合規趨勢圖)</span>
                      </h3>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2.5">
                    <span className="hidden sm:inline text-[9.5px] text-slate-400 bg-white border border-slate-200 px-2 py-0.5 rounded font-mono">
                      更新時間：今天 {new Date().toLocaleTimeString("zh-TW", {hour12:false, hour:'2-digit', minute:'2-digit'})}
                    </span>
                    <button className="text-[11px] text-indigo-600 hover:text-indigo-800 font-bold focus:outline-none cursor-pointer">
                      {showStats ? "收合圖表 ▴" : "展開圖表 ▾"}
                    </button>
                  </div>
                </div>

                {showStats && (
                  <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
                    
                    {/* Metrics sidebar */}
                    <div className="flex flex-col gap-4 justify-between">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 bg-indigo-50/40 rounded border border-indigo-100/30">
                          <span className="text-[10px] font-bold text-indigo-500 uppercase block mb-1">
                            總收發稽核量
                          </span>
                          <span className="text-lg font-extrabold text-slate-800 font-mono">
                            {trendData.reduce((sum, item) => sum + item.normal + item.issues, 0)} 
                            <span className="text-xs font-normal text-slate-500 ml-1">張</span>
                          </span>
                        </div>

                        <div className="p-3 bg-emerald-50/40 rounded border border-emerald-100/30">
                          <span className="text-[10px] font-bold text-emerald-600 uppercase block mb-1">
                            辨識完成合規
                          </span>
                          <span className="text-lg font-extrabold text-emerald-700 font-mono">
                            {trendData.reduce((sum, item) => sum + item.normal, 0)}
                            <span className="text-xs font-normal text-slate-500 ml-1">張</span>
                          </span>
                        </div>

                        <div className="p-3 bg-rose-50/40 rounded border border-rose-100/30">
                          <span className="text-[10px] font-bold text-rose-500 uppercase block mb-1">
                            稽核查核異常
                          </span>
                          <span className="text-lg font-extrabold text-rose-700 font-mono">
                            {trendData.reduce((sum, item) => sum + item.issues, 0)}
                            <span className="text-xs font-normal text-slate-500 ml-1">張</span>
                          </span>
                        </div>

                        <div className="p-3 bg-purple-50/40 rounded border border-purple-100/30">
                          <span className="text-[10px] font-bold text-purple-500 uppercase block mb-1">
                            系統合規率
                          </span>
                          <span className="text-lg font-extrabold text-purple-700 font-mono">
                            {(() => {
                              const total = trendData.reduce((sum, item) => sum + item.normal + item.issues, 0);
                              const norm = trendData.reduce((sum, item) => sum + item.normal, 0);
                              return total > 0 ? ((norm / total) * 100).toFixed(1) : "100.0";
                            })()}%
                          </span>
                        </div>
                      </div>

                      <div className="p-3 bg-slate-50 rounded border border-slate-200">
                        <h4 className="text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          實時稅務稽核指引
                        </h4>
                        <p className="text-[10px] text-slate-500 leading-relaxed">
                          系統自動依《加值型及非加值型營業稅法》校驗統一編號並檢查：
                          <span className="font-bold text-slate-700">小計 + 稅額 === 總額</span>。
                          修正右側表單，帳冊圖表將同步連動！
                        </p>
                      </div>
                    </div>

                    {/* Recharts chart block */}
                    <div className="lg:col-span-2 h-44 sm:h-52 relative">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={trendData}
                          margin={{ top: 5, right: 10, left: -25, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient id="colorNormal" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                            </linearGradient>
                            <linearGradient id="colorIssues" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.2} />
                              <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis 
                            dataKey="label" 
                            tickLine={false}
                            axisLine={false}
                            tick={{ fill: '#64748b', fontSize: 10 }}
                          />
                          <YAxis 
                            tickLine={false}
                            axisLine={false}
                            tick={{ fill: '#64748b', fontSize: 10 }}
                          />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: '#ffffff', 
                              border: '1px solid #e2e8f0', 
                              borderRadius: '4px',
                              fontSize: '11px',
                              color: '#1e293b',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                            }} 
                          />
                          <Legend 
                            verticalAlign="top" 
                            align="right"
                            height={28}
                            iconType="circle"
                            iconSize={6}
                            wrapperStyle={{ fontSize: '10.5px', fontWeight: 'bold' }}
                          />
                          <Area
                            name="合規件數 (Normal)"
                            type="monotone"
                            dataKey="normal"
                            stroke="#10b981"
                            strokeWidth={1.8}
                            fillOpacity={1}
                            fill="url(#colorNormal)"
                          />
                          <Area
                            name="異常件數 (Issues)"
                            type="monotone"
                            dataKey="issues"
                            stroke="#f43f5e"
                            strokeWidth={1.8}
                            fillOpacity={1}
                            fill="url(#colorIssues)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>

                  </div>
                )}
              </div>

              {/* Interactive Core Work Grid Panels */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start shrink-0">
                
                {/* 1. Image Canvas (Left Grid Panel) */}
                <div className="bg-slate-300 rounded-lg shadow-inner relative overflow-hidden flex items-center justify-center p-6 border-2 border-white select-none min-h-[460px]">
                  
                  {/* Inside Mock Invoice styled white card overlay */}
                  <div className="w-[280px] sm:w-[320px] bg-white shadow-2xl p-4 sm:p-5 relative flex flex-col rounded-sm min-h-[420px]">
                    <div className="text-center font-mono font-black text-slate-800 text-sm border-b border-slate-150 pb-1.5 mb-2.5">
                      {selectedInvoice.buyerUbn.value ? "電子發票證明聯" : "收銀機發票收據聯"}
                    </div>
                    
                    {/* Embedded preview display */}
                    <div className="relative w-full h-auto overflow-hidden rounded-sm bg-slate-50 border border-slate-100">
                      <img
                        referrerPolicy="no-referrer"
                        src={selectedInvoice.imagePreview}
                        className="w-full h-auto block select-none object-contain"
                        alt="發票原尺寸影像"
                      />

                      {/* SVG Canvas Overlays overlaying highlighted coords */}
                      <svg
                        className="absolute inset-0 w-full h-full pointer-events-none"
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                      >
                        <defs>
                          <marker
                            id="red-arrow-head"
                            viewBox="0 0 10 10"
                            refX="6"
                            refY="5"
                            markerWidth="6"
                            markerHeight="6"
                            orient="auto-start-reverse"
                          >
                            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#f43f5e" />
                          </marker>
                        </defs>

                        {[
                          { key: "invoiceNumber", field: selectedInvoice.invoiceNumber, label: "號碼欄" },
                          { key: "invoiceDate", field: selectedInvoice.invoiceDate, label: "日期欄" },
                          { key: "sellerName", field: selectedInvoice.sellerName, label: "營業人" },
                          { key: "sellerUbn", field: selectedInvoice.sellerUbn, label: "賣方統編" },
                          { key: "buyerUbn", field: selectedInvoice.buyerUbn, label: "買方統編" },
                          { key: "subtotal", field: selectedInvoice.subtotal, label: "未稅小計" },
                          { key: "tax", field: selectedInvoice.tax, label: "發票稅額" },
                          { key: "totalAmount", field: selectedInvoice.totalAmount, label: "總計金額" },
                        ].map(({ key, field }) => {
                          const box: BoundingBox | null = field.box;
                          if (!box) return null;

                          const isInvalid = !field.isValid;
                          const isHovered = hoveredField === key;
                          
                          if (!isInvalid && !isHovered) return null;

                          const { ymin, xmin, ymax, xmax } = box;
                          const width = xmax - xmin;
                          const height = ymax - ymin;
                          
                          const cx = xmin + width / 2;
                          const cy = ymin + height / 2;

                          const arrowStartX = cx < 35 ? cx + 18 : cx - 18;
                          const arrowStartY = cy < 30 ? cy + 12 : cy - 12;

                          const strokeColor = isHovered ? "#4f46e5" : "#f43f5e";
                          const fillColor = isHovered ? "rgba(79, 70, 229, 0.12)" : "rgba(244, 63, 94, 0.16)";

                          // Dynamic arrow connectors mapping highlights directly to Form Hover coordinates
                          return (
                            <g key={key}>
                              <rect
                                x={xmin - 1}
                                y={ymin - 1}
                                width={width + 2}
                                height={height + 2}
                                rx="1.5"
                                fill={fillColor}
                                stroke={strokeColor}
                                strokeWidth="1.2"
                                strokeDasharray={isHovered ? "0" : "1.5,1"}
                                className="transition-all duration-150"
                              />

                              <path
                                d={`M ${arrowStartX} ${arrowStartY} Q ${(arrowStartX + cx) / 2} ${(arrowStartY + cy) / 2 - 3}, ${cx - 1} ${cy - 1}`}
                                stroke={strokeColor}
                                strokeWidth="1.5"
                                fill="none"
                                markerEnd="url(#red-arrow-head)"
                              />

                              <rect
                                x={arrowStartX - (cx < 35 ? 1 : 16)}
                                y={arrowStartY - 4.5}
                                width={17}
                                height={5}
                                rx="1"
                                fill={strokeColor}
                              />
                              <text
                                x={arrowStartX - (cx < 35 ? -7.5 : 7.5)}
                                y={arrowStartY - 1}
                                fill="#ffffff"
                                fontSize="3"
                                fontWeight="black"
                                textAnchor="middle"
                              >
                                {field.fieldNameChinese}
                              </text>
                            </g>
                          );
                        })}
                      </svg>
                    </div>

                    <div className="mt-3 text-center">
                      <span className="text-[10px] text-slate-400 font-mono tracking-tight flex items-center justify-center gap-1 bg-slate-50 py-1 rounded">
                        <Sparkles className="w-3 h-3 text-indigo-500" />
                        游標移至右側帶 ⚠️ 欄位將自動投射圈選箭頭
                      </span>
                    </div>
                  </div>
                </div>

                {/* 2. Data Entry form (Right Grid Panel) */}
                <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 flex flex-col justify-between min-h-[460px]">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 mb-6 border-b pb-2 tracking-wide uppercase">
                      手動補齊資訊
                    </h3>

                    <div className="space-y-4">
                      {/* Seller Name (營業人) */}
                      <div
                        onMouseEnter={() => setHoveredField("sellerName")}
                        onMouseLeave={() => setHoveredField(null)}
                        className="flex flex-col gap-1.5"
                      >
                        <label className="text-xs font-bold text-slate-500 uppercase flex items-center justify-between">
                          <span>營業人名稱 (Seller Name) *</span>
                          {!formSellerName && (
                            <span className="text-red-600 text-[10px] animate-pulse">名稱缺失！</span>
                          )}
                        </label>
                        <input
                          type="text"
                          placeholder="請輸入營業人名稱"
                          className={`border p-2 rounded text-slate-800 text-xs focus:ring-1 focus:ring-indigo-500 outline-none transition-all ${
                            !formSellerName
                              ? "border-2 border-red-200 bg-red-50 text-red-900"
                              : "border-slate-200 bg-slate-50/50 focus:bg-white"
                          }`}
                          value={formSellerName}
                          onChange={(e) => setFormSellerName(e.target.value)}
                        />
                        {!formSellerName && (
                          <p className="text-[10px] text-red-500 font-medium">系統無法偵測營業人名稱，請手動輸入補齊</p>
                        )}
                      </div>

                      {/* Seller VAT (統一編號) */}
                      <div
                        onMouseEnter={() => setHoveredField("sellerUbn")}
                        onMouseLeave={() => setHoveredField(null)}
                        className="flex flex-col gap-1.5"
                      >
                        <label className="text-xs font-bold text-slate-500 uppercase flex items-center justify-between">
                          <span>與國稅局資料庫對齊：統一編號</span>
                          {!localSellerUbnValid && formSeller && (
                            <span className="text-red-500 text-[10px] font-bold">統編校驗碼錯誤!</span>
                          )}
                        </label>
                        <input
                          type="text"
                          maxLength={8}
                          className={`border p-2 rounded text-slate-800 font-mono text-xs focus:ring-1 focus:ring-indigo-500 outline-none transition-all ${
                            !localSellerUbnValid && formSeller
                              ? "border-red-300 bg-red-50"
                              : "border-slate-200 bg-slate-50/50 focus:bg-white"
                          }`}
                          value={formSeller}
                          onChange={(e) => setFormSeller(e.target.value)}
                        />
                      </div>

                      {/* Date Field (發票日期) */}
                      <div
                        onMouseEnter={() => setHoveredField("invoiceDate")}
                        onMouseLeave={() => setHoveredField(null)}
                        className="flex flex-col gap-1.5"
                      >
                        <label className="text-xs font-bold text-red-500 uppercase flex items-center justify-between">
                          <span>發票日期 *</span>
                          {!formDate && <span className="text-red-600 text-[10px] animate-pulse">日期格式不全</span>}
                        </label>
                        <input
                          type="text"
                          placeholder="請輸入日期 YYYY-MM-DD"
                          className={`border p-2 rounded text-slate-800 font-mono text-xs focus:ring-1 focus:ring-indigo-500 outline-none transition-all ${
                            !formDate
                              ? "border-2 border-red-200 bg-red-50 animate-pulse text-red-900"
                              : "border-slate-200 bg-slate-50/50 focus:bg-white"
                          }`}
                          value={formDate}
                          onChange={(e) => setFormDate(e.target.value)}
                        />
                        {!formDate && (
                          <p className="text-[10px] text-red-500 font-medium">系統無法偵測日期，請手動輸入補齊</p>
                        )}
                      </div>

                      {/* Invoice Number (發票號碼) */}
                      <div
                        onMouseEnter={() => setHoveredField("invoiceNumber")}
                        onMouseLeave={() => setHoveredField(null)}
                        className="flex flex-col gap-1.5"
                      >
                        <label className="text-xs font-bold text-slate-500 uppercase">
                          發票號碼 (Invoice Number)
                        </label>
                        <input
                          type="text"
                          className="border border-slate-200 p-2 rounded bg-slate-50/50 text-slate-800 font-mono text-xs focus:ring-1 focus:ring-indigo-500 focus:bg-white focus:outline-none transition-all"
                          value={formNumber}
                          onChange={(e) => setFormNumber(e.target.value)}
                        />
                      </div>

                      {/* Buyer VAT (買方統一編號 / 統編) */}
                      <div
                        onMouseEnter={() => setHoveredField("buyerUbn")}
                        onMouseLeave={() => setHoveredField(null)}
                        className="flex flex-col gap-1.5"
                      >
                        <label className="text-xs font-bold text-slate-500 uppercase flex items-center justify-between">
                          <span>買方統一編號 (統編填寫)</span>
                          {!localBuyerUbnValid && formBuyer && (
                            <span className="text-red-500 text-[10px] font-bold">統編校驗碼錯誤!</span>
                          )}
                        </label>
                        <input
                          type="text"
                          maxLength={8}
                          placeholder="非必填"
                          className={`border p-2 rounded text-slate-800 font-mono text-xs focus:ring-1 focus:ring-indigo-500 outline-none transition-all ${
                            !localBuyerUbnValid && formBuyer
                              ? "border-red-300 bg-red-50"
                              : "border-slate-200 bg-slate-50/50 focus:bg-white"
                          }`}
                          value={formBuyer}
                          onChange={(e) => setFormBuyer(e.target.value)}
                        />
                      </div>

                      {/* Monetary validation inputs panel */}
                      <div className="grid grid-cols-3 gap-2.5 pt-2 border-t border-slate-100">
                        <div
                          onMouseEnter={() => setHoveredField("subtotal")}
                          onMouseLeave={() => setHoveredField(null)}
                          className="flex flex-col gap-1"
                        >
                          <label className="text-[10px] font-bold text-slate-400">銷售額小計 (不含稅)</label>
                          <input
                             type="number"
                             className="border border-slate-200 p-2 rounded bg-slate-50/50 text-slate-800 font-mono text-xs focus:outline-none"
                             value={formSubtotal}
                             onChange={(e) => setFormSubtotal(Math.max(0, Number(e.target.value)))}
                          />
                        </div>

                        <div
                          onMouseEnter={() => setHoveredField("tax")}
                          onMouseLeave={() => setHoveredField(null)}
                          className="flex flex-col gap-1"
                        >
                          <label className="text-[10px] font-bold text-slate-400">發票稅額 (5%)</label>
                          <input
                            type="number"
                            className="border border-slate-200 p-2 rounded bg-slate-50/50 text-slate-800 font-mono text-xs focus:outline-none"
                            value={formTax}
                            onChange={(e) => setFormTax(Math.max(0, Number(e.target.value)))}
                          />
                        </div>

                        <div
                          onMouseEnter={() => setHoveredField("totalAmount")}
                          onMouseLeave={() => setHoveredField(null)}
                          className="flex flex-col gap-1"
                        >
                          <label className="text-[10px] font-bold text-red-500">總計金額 (TWD) *</label>
                          <input
                            type="number"
                            className={`border p-2 rounded text-slate-800 font-mono text-xs focus:outline-none ${
                              !localSumMatches
                                ? "border-2 border-red-200 bg-red-50 font-bold"
                                : "border-slate-200 bg-slate-50/50"
                            }`}
                            value={formTotal}
                            onChange={(e) => setFormTotal(Math.max(0, Number(e.target.value)))}
                          />
                        </div>
                      </div>

                      {/* Math warning helper pane block */}
                      {!localSumMatches && (
                        <div className="flex items-start sm:items-center gap-2 p-2.5 rounded bg-amber-50 border border-amber-200 text-amber-800 text-[10.5px] font-medium leading-normal animate-fadeIn">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
                          <div className="flex-1">
                            <span>小計 {formSubtotal} + 營業稅 {formTax} = {formSubtotal + formTax}，與標示總計 {formTotal} 不平衡。</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setFormTotal(formSubtotal + formTax)}
                            className="underline whitespace-nowrap text-indigo-700 hover:text-indigo-900 font-bold text-[10px] cursor-pointer"
                          >
                            對齊總值
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-8 pt-4 border-t border-slate-100 flex gap-3">
                    <button
                      onClick={handleAutoCalcFromItems}
                      disabled={formItems.length === 0}
                      className="flex-1 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 disabled:opacity-40 text-slate-700 font-bold py-3 text-xs sm:text-sm rounded transition-all cursor-pointer"
                    >
                      品項自動加總
                    </button>
                    <button
                      onClick={handleSaveChanges}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold py-3 text-xs sm:text-sm rounded transition-all shadow-xs cursor-pointer flex items-center justify-center gap-2"
                    >
                      <Save className="w-4 h-4 shrink-0" />
                      驗證並確認儲存
                    </button>
                  </div>
                </div>

              </div>

              {/* Transactions list sub-ledger list element */}
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mt-6 shrink-0">
                <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-2">
                  <h3 className="text-sm font-bold text-slate-800 tracking-wide uppercase flex items-center gap-1">
                    <FileText className="w-4 h-4 text-indigo-500 shrink-0" />
                    發票交易商品明細項目 ({formItems.length})
                  </h3>
                  <button
                    onClick={handleAddItem}
                    className="px-3 py-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200 border border-indigo-100 rounded transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 shrink-0" />
                    新增品項
                  </button>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded bg-slate-50/50">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-100 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                        <th className="p-3 pl-4">商品品名 / 規格</th>
                        <th className="p-3 text-right w-20 sm:w-28">數量</th>
                        <th className="p-3 text-right w-24 sm:w-36">單價</th>
                        <th className="p-3 text-right w-24 sm:w-36">小計金額</th>
                        <th className="p-3 text-center w-16">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                      {formItems.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-6 text-center text-slate-400 italic font-mono text-xs">
                            （此發票尚未解析品項明細，請點擊右上方「新增品項」以便手動增加來匯出完整 Excel 報表）
                          </td>
                        </tr>
                      ) : (
                        formItems.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/30 transition-colors">
                            <td className="p-3 pl-4">
                              <input
                                type="text"
                                value={item.name}
                                onChange={(e) => handleUpdateItem(idx, "name", e.target.value)}
                                className="w-full bg-transparent hover:bg-slate-50 focus:bg-white text-xs border border-transparent focus:border-slate-200 rounded px-2 py-1 font-bold focus:outline-none transition-all"
                              />
                            </td>
                            <td className="p-3 text-right">
                              <input
                                type="number"
                                value={item.qty}
                                onChange={(e) => handleUpdateItem(idx, "qty", Number(e.target.value))}
                                className="w-full bg-transparent hover:bg-slate-50 focus:bg-white text-xs text-right border border-transparent focus:border-slate-200 rounded px-2 py-1 focus:outline-none"
                              />
                            </td>
                            <td className="p-3 text-right">
                              <input
                                type="number"
                                value={item.price}
                                onChange={(e) => handleUpdateItem(idx, "price", Number(e.target.value))}
                                className="w-full bg-transparent hover:bg-slate-50 focus:bg-white text-xs text-right border border-transparent focus:border-slate-200 rounded px-2 py-1 focus:outline-none"
                              />
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-slate-900 pr-4">
                              ${(item.amount || 0).toLocaleString()}
                            </td>
                            <td className="p-3 text-center">
                              <button
                                onClick={() => handleDeleteItem(idx)}
                                className="text-slate-350 hover:text-rose-600 p-1.5 rounded hover:bg-rose-50 transition-all text-center inline-flex items-center cursor-pointer"
                                title="刪除本行品項"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-center items-center bg-white border border-slate-200 border-dashed rounded-lg p-12 text-center max-w-[600px] w-full mx-auto my-12 shadow-sm gap-4 shrink-0">
              <div className="p-4 rounded-full bg-slate-50 border border-slate-100 text-indigo-500">
                <FileText className="w-10 h-10" />
              </div>
              <h3 className="text-base font-bold text-slate-800">未選取任何發票影像檔案</h3>
              <p className="text-xs text-slate-500 max-w-sm leading-normal">
                請在左側佇列清單中選取特定發票紀錄，以便在稽核面板中進行人工核對與微調矯正。
                或您可以直接將全新的發票影像圖檔拖放到左側上傳區域。
              </p>
              <button
                onClick={() => setSelectedInvoiceId("sample-1")}
                className="mt-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-semibold px-4.5 py-2.5 rounded transition-all cursor-pointer"
              >
                載入預設範本發票
              </button>
            </div>
          )}
        </main>
      </div>

      {/* Footer Status Panel */}
      <footer className="h-12 bg-white border-t border-slate-200 flex items-center px-8 text-xs font-medium text-slate-500 shrink-0 select-none">
        <div className="flex-1 flex gap-8">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
            <span>本日已處理: 142 筆</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-500"></div>
            <span>待人工核閱: {issueInvoicesCount} 筆</span>
          </div>
        </div>
        <div className="flex gap-4">
          <span>系統狀態: 運作正常</span>
          <span className="text-slate-300 italic">OCR Engine v4.2.1</span>
        </div>
      </footer>
    </div>
  );
}
