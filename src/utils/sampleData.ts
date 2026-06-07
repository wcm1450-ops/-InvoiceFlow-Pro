import { ParsedInvoice } from "../types";
import { generateInvoiceSvgDataUrl } from "./svgGenerator";

const sampleInvoice1_base: Omit<ParsedInvoice, "imagePreview"> = {
  id: "sample-1",
  fileName: "electronic_invoice_sample_issues.png",
  fileSize: "145 KB",
  invoiceNumber: {
    value: "AC-88776655",
    isValid: true,
    box: { ymin: 17.5, xmin: 21.0, ymax: 23.5, xmax: 79.0, fieldName: "invoiceNumber" },
    fieldNameChinese: "發票號碼"
  },
  invoiceDate: {
    value: "", // Missing issue
    isValid: false,
    box: { ymin: 25.0, xmin: 6.0, ymax: 29.0, xmax: 42.0, fieldName: "invoiceDate" },
    warningMessage: "「發票日期」核對缺失，無法解析交易有效期間！",
    fieldNameChinese: "發票日期"
  },
  sellerName: {
    value: "星環智能科技有限公司",
    isValid: true,
    box: { ymin: 31.0, xmin: 6.0, ymax: 34.0, xmax: 60.0, fieldName: "sellerName" },
    fieldNameChinese: "營業人"
  },
  sellerUbn: {
    value: "12345678", // Invalid VAT checksum issue
    isValid: false,
    box: { ymin: 35.0, xmin: 6.0, ymax: 39.5, xmax: 46.0, fieldName: "sellerUbn" },
    warningMessage: "賣方統一編號 (12345678) 統編檢核不通過：統編校驗碼錯誤",
    fieldNameChinese: "賣方統一編號"
  },
  buyerUbn: {
    value: "54374352", // Valid Buyer VAT
    isValid: true,
    box: { ymin: 38.5, xmin: 6.0, ymax: 43.0, xmax: 46.0, fieldName: "buyerUbn" },
    fieldNameChinese: "買方統一編號 (可選)"
  },
  subtotal: {
    value: 1000,
    isValid: false, // Math discrepancy
    box: { ymin: 73.5, xmin: 52.0, ymax: 77.5, xmax: 92.0, fieldName: "subtotal" },
    warningMessage: "金額對接不符：銷售額小計 (1000) + 稅額 (50) = 1050，而發票總計顯示為 1100！",
    fieldNameChinese: "銷售額小計"
  },
  tax: {
    value: 50,
    isValid: false, // Math discrepancy
    box: { ymin: 76.5, xmin: 52.0, ymax: 80.5, xmax: 92.0, fieldName: "tax" },
    warningMessage: "金額對接不符：銷售額小計 (1000) + 稅額 (50) = 1050，而發票總計顯示為 1100！",
    fieldNameChinese: "發票稅額"
  },
  totalAmount: {
    value: 1100, // Discrepancy (1000 + 50 !== 1100)
    isValid: false,
    box: { ymin: 80.5, xmin: 52.0, ymax: 85.5, xmax: 92.0, fieldName: "totalAmount" },
    warningMessage: "金額對接不符：銷售額小計 (1000) + 稅額 (50) = 1050，而發票總計顯示為 1100！",
    fieldNameChinese: "總計金額"
  },
  items: [
    { name: "超高速企業級 AI 硬碟 SSD 1TB", qty: 1, price: 1000, amount: 1000 }
  ],
  overallStatus: "has_issues" as const,
  overallIssues: [
    "「發票日期」欄位缺失！",
    "賣方統編 (12345678) 檢核不通過：統一編號檢核碼錯誤！",
    "金額對接不符：銷售額小計 (1000) + 稅額 (50) = 1050，而總計標示為 1100"
  ],
  parsedAt: "2026-06-07 11:30"
};

const sampleInvoice2_base: Omit<ParsedInvoice, "imagePreview"> = {
  id: "sample-2",
  fileName: "trip_lunch_invoice_valid.png",
  fileSize: "89 KB",
  invoiceNumber: {
    value: "AA-12345678",
    isValid: true,
    box: { ymin: 17.5, xmin: 21.0, ymax: 23.5, xmax: 79.0, fieldName: "invoiceNumber" },
    fieldNameChinese: "發票號碼"
  },
  invoiceDate: {
    value: "2026-06-05",
    isValid: true,
    box: { ymin: 25.0, xmin: 6.0, ymax: 29.0, xmax: 42.0, fieldName: "invoiceDate" },
    fieldNameChinese: "發票日期"
  },
  sellerName: {
    value: "星環智能科技有限公司",
    isValid: true,
    box: { ymin: 31.0, xmin: 6.0, ymax: 34.0, xmax: 60.0, fieldName: "sellerName" },
    fieldNameChinese: "營業人"
  },
  sellerUbn: {
    value: "54374352", // Valid UBN
    isValid: true,
    box: { ymin: 35.0, xmin: 6.0, ymax: 39.5, xmax: 46.0, fieldName: "sellerUbn" },
    fieldNameChinese: "賣方統一編號"
  },
  buyerUbn: {
    value: "54374352", // Valid
    isValid: true,
    box: { ymin: 38.5, xmin: 6.0, ymax: 43.0, xmax: 46.0, fieldName: "buyerUbn" },
    fieldNameChinese: "買方統一編號 (可選)"
  },
  subtotal: {
    value: 800,
    isValid: true,
    box: { ymin: 73.5, xmin: 52.0, ymax: 77.5, xmax: 92.0, fieldName: "subtotal" },
    fieldNameChinese: "銷售額小計"
  },
  tax: {
    value: 40,
    isValid: true,
    box: { ymin: 76.5, xmin: 52.0, ymax: 80.5, xmax: 92.0, fieldName: "tax" },
    fieldNameChinese: "發票稅額"
  },
  totalAmount: {
    value: 840, // 800 + 40 === 840
    isValid: true,
    box: { ymin: 80.5, xmin: 52.0, ymax: 85.5, xmax: 92.0, fieldName: "totalAmount" },
    fieldNameChinese: "總計金額"
  },
  items: [
    { name: "商務午餐精緻套餐", qty: 2, price: 350, amount: 700 },
    { name: "進口手工莊園咖啡", qty: 2, price: 50, amount: 100 }
  ],
  overallStatus: "normal" as const,
  overallIssues: [],
  parsedAt: "2026-06-07 11:35"
};

export const sampleInvoices: ParsedInvoice[] = [
  {
    ...sampleInvoice1_base,
    imagePreview: generateInvoiceSvgDataUrl(sampleInvoice1_base)
  },
  {
    ...sampleInvoice2_base,
    imagePreview: generateInvoiceSvgDataUrl(sampleInvoice2_base)
  }
];
