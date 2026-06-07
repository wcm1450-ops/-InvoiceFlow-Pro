import { ParsedInvoice } from "../types";

/**
 * Generates a beautiful SVG data URL of a Taiwanese Electronic Invoice (電子發票) OR Traditional Invoice.
 * This SVG functions as the visual invoice representation. In a live system, this would be the actual
 * uploaded png/jpeg, but this dynamic renderer lets the user see changes update in real-time as they fix fields!
 */
export function generateInvoiceSvgDataUrl(invoice: Omit<ParsedInvoice, "imagePreview"> & { imagePreview?: string }): string {
  const number = invoice.invoiceNumber.value || "【缺失】";
  const date = invoice.invoiceDate.value || "【缺失】";
  const seller = invoice.sellerUbn.value || "【缺失】";
  const sellerNameValue = invoice.sellerName?.value || "【缺失】";
  const buyer = invoice.buyerUbn.value || "【無 / 缺失】";
  const subtotal = invoice.subtotal.value !== null ? String(invoice.subtotal.value) : "【缺失】";
  const tax = invoice.tax.value !== null ? String(invoice.tax.value) : "0";
  const total = invoice.totalAmount.value !== null ? String(invoice.totalAmount.value) : "【缺失】";

  // Check if there are warnings to render visual indicators inside the document itself (to simulate a real misprinted or problematic invoice)
  const isNumberIssue = !invoice.invoiceNumber.isValid;
  const isDateIssue = !invoice.invoiceDate.isValid;
  const isSellerIssue = !invoice.sellerUbn.isValid;
  const isSellerNameIssue = invoice.sellerName ? !invoice.sellerName.isValid : false;
  const isBuyerIssue = invoice.buyerUbn.value ? !invoice.buyerUbn.isValid : false;
  const isMathConflict = (Number(subtotal) || 0) + (Number(tax) || 0) !== (Number(total) || 0);

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 650" width="100%" height="100%">
  <!-- Paper background -->
  <rect width="400" height="650" fill="#fafafa" rx="12" />
  <rect x="5" y="5" width="390" height="640" rx="10" fill="#ffffff" stroke="#e2e8f0" stroke-width="2" />
  
  <!-- Content borders & decorative receipt header -->
  <line x1="20" y1="45" x2="380" y2="45" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="2,2" />
  <circle cx="200" cy="18" r="4" fill="#64748b" />
  <ellipse cx="200" cy="18" rx="20" ry="2" fill="none" stroke="#94a3b8" />
  <text x="200" y="38" font-size="8" fill="#94a3b8" font-family="'Courier New', monospace" text-anchor="middle">OFFICIAL TRANSACTION RECEIPT</text>
  
  <!-- Taiwan Electronic Invoice Header -->
  <text x="200" y="80" font-size="20" font-weight="900" font-family="sans-serif" fill="#1e293b" text-anchor="middle">電子發票證明聯</text>
  <text x="200" y="105" font-size="13" font-weight="700" font-family="sans-serif" fill="#475569" text-anchor="middle">${date.substring(0, 4)}年03-04月期</text>
  
  <!-- Invoice Number with highlighted issue frame if invalid -->
  <rect x="90" y="120" width="220" height="30" rx="4" fill="${isNumberIssue ? "#fff1f2" : "#f8fafc"}" stroke="${isNumberIssue ? "#f43f5e" : "#ccd6e0"}" stroke-width="${isNumberIssue ? "1.5" : "1"}" />
  <text x="200" y="141" font-size="16" font-weight="bold" font-family="monospace" fill="${isNumberIssue ? "#e11d48" : "#0f172a"}" text-anchor="middle">${number}</text>
  
  <!-- Basic Invoice Metadata Info -->
  <g transform="translate(30, 180)" font-family="sans-serif" font-size="11" fill="#334155">
    <!-- Date -->
    <text x="0" y="0" font-weight="bold">發票日期：</text>
    <rect x="55" y="-12" width="100" height="15" rx="3" fill="${isDateIssue ? "#fff1f2" : "transparent"}" />
    <text x="60" y="0" font-weight="${isDateIssue ? "bold" : "normal"}" fill="${isDateIssue ? "#e11d48" : "#334155"}">${date}</text>
    
    <!-- Random check codes fake -->
    <text x="180" y="0" font-weight="bold">隨機碼：</text>
    <text x="230" y="0">8955</text>
    
    <!-- Form type/Tax zone -->
    <text x="0" y="22" font-weight="bold">格式別：</text>
    <text x="55" y="22">25 (收銀機機製發票)</text>
    
    <text x="180" y="22" font-weight="bold">課稅別：</text>
    <text x="230" y="22">應稅</text>
  </g>
  
  <!-- Buyer and Seller info -->
  <line x1="20" y1="225" x2="380" y2="225" stroke="#cbd5e1" stroke-width="1.5" />
  <g transform="translate(30, 248)" font-family="sans-serif" font-size="11" fill="#334155">
    <!-- Seller VAT -->
    <text x="0" y="0" font-weight="bold" fill="#475569">賣方統一編號：</text>
    <rect x="85" y="-11" width="90" height="15" rx="3" fill="${isSellerIssue ? "#fff1f2" : "transparent"}" />
    <text x="90" y="0" font-weight="bold" fill="${isSellerIssue ? "#e11d48" : "#0f172a"}">${seller}</text>
    <rect x="175" y="-11" width="185" height="15" rx="3" fill="${isSellerNameIssue ? "#fff1f2" : "transparent"}" />
    <text x="180" y="0" font-size="9" font-weight="${isSellerNameIssue ? "bold" : "normal"}" fill="${isSellerNameIssue ? "#e11d48" : "#94a3b8"}">(${sellerNameValue})</text>
    
    <!-- Buyer VAT -->
    <text x="0" y="22" font-weight="bold" fill="#475569">買方統一編號：</text>
    <rect x="85" y="11" width="90" height="15" rx="3" fill="${isBuyerIssue ? "#fff1f2" : "transparent"}" />
    <text x="90" y="22" font-weight="bold" fill="${isBuyerIssue ? "#e11d48" : "#0f172a"}">${buyer}</text>
    <text x="180" y="22" font-size="9" fill="#94a3b8">(點數或企業報銷)</text>
  </g>
  
  <!-- Line Items Header -->
  <line x1="20" y1="290" x2="380" y2="290" stroke="#0f172a" stroke-width="1.5" />
  <g transform="translate(20, 310)" font-family="sans-serif" font-size="11" font-weight="bold" fill="#0f172a">
    <text x="10" y="0">品名與規格</text>
    <text x="210" y="0" text-anchor="end">數量</text>
    <text x="270" y="0" text-anchor="end">單價</text>
    <text x="350" y="0" text-anchor="end">金額</text>
  </g>
  <line x1="20" y1="316" x2="380" y2="316" stroke="#475569" stroke-width="1" />
  
  <!-- Item lists rendering recursively -->
  <g id="items-list" transform="translate(20, 335)" font-family="sans-serif" font-size="11" fill="#334155">
    ${invoice.items.map((item, index) => `
      <g transform="translate(0, ${index * 22})">
        <text x="10" y="0" font-weight="bold" fill="#1e293b">${item.name.substring(0, 20)}</text>
        <text x="210" y="0" text-anchor="end">${item.qty}</text>
        <text x="270" y="0" text-anchor="end">${item.price}</text>
        <text x="350" y="0" text-anchor="end" font-weight="bold">${item.amount}</text>
      </g>
    `).join("")}
    
    ${invoice.items.length === 0 ? `
      <text x="180" y="10" text-anchor="middle" fill="#94a3b8" font-style="italic">（無品名明細記錄）</text>
    ` : ""}
  </g>
  
  <!-- Summary blocks -->
  <g transform="translate(20, 480)" font-family="sans-serif" font-size="12" fill="#334155">
    <line x1="150" y1="0" x2="360" y2="0" stroke="#94a3b8" stroke-width="1" stroke-dasharray="2,2" />
    
    <!-- Subtotal -->
    <g transform="translate(190, 20)">
      <text x="0" y="0">銷售額小計：</text>
      <rect x="75" y="-12" width="90" height="16" rx="3" fill="${isMathConflict ? "#fff1f2" : "transparent"}" />
      <text x="160" y="0" text-anchor="end" font-weight="${isMathConflict ? "bold" : "normal"}" fill="${isMathConflict ? "#e11d48" : "#334155"}">$${subtotal}</text>
    </g>
    
    <!-- Tax -->
    <g transform="translate(190, 40)">
      <text x="0" y="0">稅額 (5%)：</text>
      <rect x="75" y="-12" width="90" height="16" rx="3" fill="${isMathConflict ? "#fff1f2" : "transparent"}" />
      <text x="160" y="0" text-anchor="end" font-weight="${isMathConflict ? "bold" : "normal"}" fill="${isMathConflict ? "#e11d48" : "#334155"}">$${tax}</text>
    </g>
    
    <!-- Total Amount -->
    <g transform="translate(190, 65)">
      <text x="0" y="0" font-weight="bold" fill="#0f172a" font-size="13">總計金額：</text>
      <rect x="75" y="-13" width="90" height="18" rx="3" fill="${isMathConflict ? "#fff1f2" : "transparent"}" />
      <text x="160" y="0" text-anchor="end" font-size="14" font-weight="900" fill="${isMathConflict ? "#e11d48" : "#0f172a"}">$${total}</text>
    </g>
  </g>
  
  <!-- Bottom QR Codes mock -->
  <g transform="translate(60, 560)">
    <!-- QR Left -->
    <rect x="40" y="0" width="60" height="60" stroke="#475569" stroke-width="1" fill="none" />
    <rect x="45" y="5" width="12" height="12" fill="#1e293b" />
    <rect x="83" y="5" width="12" height="12" fill="#1e293b" />
    <rect x="45" y="43" width="12" height="12" fill="#1e293b" />
    <!-- Random mock codes inside qr -->
    <rect x="62" y="16" width="6" height="6" fill="#1e293b" />
    <rect x="74" y="24" width="8" height="8" fill="#1e293b" />
    <rect x="54" y="32" width="10" height="6" fill="#1e293b" />
    <rect x="76" y="40" width="10" height="10" fill="#1e293b" />
    
    <!-- QR Right -->
    <rect x="180" y="0" width="60" height="60" stroke="#475569" stroke-width="1" fill="none" />
    <rect x="185" y="5" width="12" height="12" fill="#1e293b" />
    <rect x="223" y="5" width="12" height="12" fill="#1e293b" />
    <rect x="185" y="43" width="12" height="12" fill="#1e293b" />
    <!-- Random mock codes inside qr -->
    <rect x="202" y="14" width="8" height="6" fill="#1e293b" />
    <rect x="210" y="24" width="6" height="12" fill="#1e293b" />
    <rect x="200" y="36" width="12" height="6" fill="#1e293b" />
    <rect x="216" y="44" width="8" height="8" fill="#1e293b" />
  </g>
  
  <!-- Watermark / Brand footer -->
  <text x="200" y="635" font-size="9" fill="#94a3b8" font-family="sans-serif" text-anchor="middle">AI Smart Invoice Verification Shield</text>
</svg>
`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
