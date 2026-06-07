import { ParsedInvoice, InvoiceField } from "../types";

// Taiwan Unified Business Number (統編) checksum validation
export function validateTaiwanUBN(ubn: string): { isValid: boolean; reason?: string } {
  const cleanUbn = ubn.replace(/\D/g, "");
  if (cleanUbn.length !== 8) {
    return { isValid: false, reason: "統一編號格式必須為 8 位數字" };
  }

  const weights = [1, 2, 1, 2, 1, 2, 4, 1];
  let sum = 0;

  for (let i = 0; i < 8; i++) {
    const prod = parseInt(cleanUbn[i], 10) * weights[i];
    const tens = Math.floor(prod / 10);
    const units = prod % 10;
    sum += tens + units;
  }

  if (sum % 5 === 0) {
    return { isValid: true };
  }

  if (cleanUbn[6] === "7" && (sum + 1) % 5 === 0) {
    return { isValid: true };
  }

  return { isValid: false, reason: "統一編號檢核碼錯誤" };
}

/**
 * Re-validates an entire invoice object following Taiwan VAT, accounting math, and syntax rules.
 * This function returns updated fields, issues lists, and flags.
 */
export function revalidateInvoice(invoice: ParsedInvoice): ParsedInvoice {
  const issues: string[] = [];

  // 1. Invoice Number
  const numValue = (invoice.invoiceNumber.value || "").trim().toUpperCase();
  let isNumValid = true;
  let numWarning = "";
  if (!numValue) {
    isNumValid = false;
    numWarning = "「發票號碼」缺失或無法讀取！";
    issues.push(numWarning);
  } else {
    const matched = numValue.match(/^[A-Z]{2}-?\d{8}$/) || numValue.match(/^\d{8}$/);
    if (!matched) {
      isNumValid = false;
      numWarning = "「發票號碼」格式錯誤 (應為 2 碼英文 + 8 碼數字，例如 AB-12345678)";
      issues.push(numWarning);
    }
  }

  const updatedNum: InvoiceField<string> = {
    ...invoice.invoiceNumber,
    value: numValue,
    isValid: isNumValid,
    warningMessage: numWarning || undefined
  };

  // 2. Invoice Date
  const dateValue = (invoice.invoiceDate.value || "").trim();
  let isDateValid = true;
  let dateWarning = "";
  if (!dateValue) {
    isDateValid = false;
    dateWarning = "「發票日期」缺失！";
    issues.push(dateWarning);
  } else {
    const timestamp = Date.parse(dateValue);
    if (isNaN(timestamp)) {
      isDateValid = false;
      dateWarning = `「發票日期」格式異常 (${dateValue})，必須符合 YYYY-MM-DD`;
      issues.push(dateWarning);
    }
  }

  const updatedDate: InvoiceField<string> = {
    ...invoice.invoiceDate,
    value: dateValue,
    isValid: isDateValid,
    warningMessage: dateWarning || undefined
  };

  // 3. Seller VAT
  const sellerValue = (invoice.sellerUbn.value || "").trim();
  let isSellerValid = true;
  let sellerWarning = "";
  if (!sellerValue) {
    isSellerValid = false;
    sellerWarning = "「賣方統一編號」缺失！";
    issues.push(sellerWarning);
  } else {
    const check = validateTaiwanUBN(sellerValue);
    if (!check.isValid) {
      isSellerValid = false;
      sellerWarning = `賣方統編 (${sellerValue}) 檢核不通過：${check.reason}`;
      issues.push(sellerWarning);
    }
  }

  const updatedSeller: InvoiceField<string> = {
    ...invoice.sellerUbn,
    value: sellerValue,
    isValid: isSellerValid,
    warningMessage: sellerWarning || undefined
  };

  // 3a. Seller Name (營業人)
  const sellerNameValue = (invoice.sellerName?.value || "").trim();
  let isSellerNameValid = true;
  let sellerNameWarning = "";
  if (!sellerNameValue) {
    isSellerNameValid = false;
    sellerNameWarning = "「營業人」名稱缺失！";
    issues.push(sellerNameWarning);
  }

  const updatedSellerName: InvoiceField<string> = {
    ...invoice.sellerName,
    value: sellerNameValue || null,
    isValid: isSellerNameValid,
    warningMessage: sellerNameWarning || undefined,
    fieldNameChinese: "營業人"
  };

  // 4. Buyer VAT (Optional, only validate if filled)
  const buyerValue = (invoice.buyerUbn.value || "").trim();
  let isBuyerValid = true;
  let buyerWarning = "";
  if (buyerValue) {
    const check = validateTaiwanUBN(buyerValue);
    if (!check.isValid) {
      isBuyerValid = false;
      buyerWarning = `買方統編 (${buyerValue}) 檢核不通過：${check.reason}`;
      issues.push(buyerWarning);
    }
  }

  const updatedBuyer: InvoiceField<string> = {
    ...invoice.buyerUbn,
    value: buyerValue || null,
    isValid: isBuyerValid,
    warningMessage: buyerWarning || undefined
  };

  // 5. Mathematical consistency
  const subVal = invoice.subtotal.value !== null ? Number(invoice.subtotal.value) : null;
  const taxVal = invoice.tax.value !== null ? Number(invoice.tax.value) : null;
  const totVal = invoice.totalAmount.value !== null ? Number(invoice.totalAmount.value) : null;

  let isSubtotalValid = true;
  let subtotalWarning = "";
  let isTaxValid = true;
  let taxWarning = "";
  let isTotalValid = true;
  let totalWarning = "";

  if (subVal === null) {
    isSubtotalValid = false;
    subtotalWarning = "「銷售額小計」缺失！";
    issues.push(subtotalWarning);
  }
  if (taxVal === null) {
    isTaxValid = false;
    taxWarning = "「發票稅額」為空！";
  }
  if (totVal === null) {
    isTotalValid = false;
    totalWarning = "「總計金額」缺失！";
    issues.push(totalWarning);
  }

  if (subVal !== null && totVal !== null) {
    const expectedTax = taxVal !== null ? taxVal : 0;
    if (subVal + expectedTax !== totVal) {
      isSubtotalValid = false;
      isTaxValid = false;
      isTotalValid = false;
      const mathError = `金額不一致：銷售額 (${subVal}) + 稅額 (${expectedTax}) ≠ 總額 (${totVal})，相差 ${Math.abs(subVal + expectedTax - totVal)} 元`;
      subtotalWarning = mathError;
      taxWarning = mathError;
      totalWarning = mathError;
      issues.push(mathError);
    }
  }

  const updatedSubtotal: InvoiceField<number> = {
    ...invoice.subtotal,
    value: subVal,
    isValid: isSubtotalValid,
    warningMessage: subtotalWarning || undefined
  };

  const updatedTax: InvoiceField<number> = {
    ...invoice.tax,
    value: taxVal,
    isValid: isTaxValid,
    warningMessage: taxWarning || undefined
  };

  const updatedTotal: InvoiceField<number> = {
    ...invoice.totalAmount,
    value: totVal,
    isValid: isTotalValid,
    warningMessage: totalWarning || undefined
  };

  return {
    ...invoice,
    invoiceNumber: updatedNum,
    invoiceDate: updatedDate,
    sellerName: updatedSellerName,
    sellerUbn: updatedSeller,
    buyerUbn: updatedBuyer,
    subtotal: updatedSubtotal,
    tax: updatedTax,
    totalAmount: updatedTotal,
    overallStatus: issues.length > 0 ? "has_issues" : "normal",
    overallIssues: issues
  };
}
