import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

// Set up JSON parsing with a 10MB limit for base64 images
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// Helper to validate Taiwan Unified Business Number (統編 / VAT Number)
// Weights: 1, 2, 1, 2, 1, 2, 4, 1
function validateTaiwanUBN(ubn: string): { isValid: boolean; reason?: string } {
  const cleanUbn = ubn.replace(/\D/g, "");
  if (cleanUbn.length !== 8) {
    return { isValid: false, reason: "統一編號格式必須為 8 位數字" };
  }

  const weights = [1, 2, 1, 2, 1, 2, 4, 1];
  let sum = 0;

  for (let i = 0; i < 8; i++) {
    const prod = parseInt(cleanUbn[i], 10) * weights[i];
    // Sum the tens and units digits
    const tens = Math.floor(prod / 10);
    const units = prod % 10;
    sum += tens + units;
  }

  // Check if sum is divisible by 5
  if (sum % 5 === 0) {
    return { isValid: true };
  }

  // Special case: if the 7th digit is 7, the sum + 1 being divisible by 5 is also valid
  if (cleanUbn[6] === "7" && (sum + 1) % 5 === 0) {
    return { isValid: true };
  }

  return { isValid: false, reason: "統一編號檢核碼錯誤，此統編無效" };
}

// Lazy initialization of Gemini API client
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key || key === "MY_GEMINI_API_KEY") {
      throw new Error("GEMINI_API_KEY is not set or has placeholder value. Please configure it in the Secrets panel.");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// API endpoint for Invoice OCR with high-quality parsing and coordinate mapping
app.post("/api/ocr", async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: "請提供發票影像的 Base64 數據" });
    }

    // Set fallback mimeType if not provided
    const cleanMimeType = mimeType || "image/jpeg";
    const dataPart = {
      inlineData: {
        mimeType: cleanMimeType,
        data: imageBase64,
      },
    };

    const ai = getGeminiClient();

    // Define structural schema to enforce structured JSON output with fields and image box coordinates.
    // The coordinate space is 0 to 100 on both X and Y.
    const promptText = `
你是一位專業的發票與收據 OCR 分析專家。你的任務是辨識發票中的所有內容，並輸出極為精準的繁體中文結構化 JSON 檔案。
注意，除了讀取文字 value，你還必須精準估算或定位該欄位在圖像中的標準化邊界框（Bounding Box），坐標範圍為 0 到 100（百分比值，0 為最頂/最左，100 為最底/最右）。
邊界框格式為：{ "ymin": 數字, "xmin": 數字, "ymax": 數字, "xmax": 數字 }。

請分析並提取以下發票欄位：
1. invoiceNumber (發票號碼): 例如 "AB-12345678" 或 "12345678"。
2. invoiceDate (發票日期): 格式為 YYYY-MM-DD，若發票為民國年份（如民 115 年 6 月 7 日）應轉換為西元。
3. buyerUbn (買方統一編號 / 統編): 8 位數字。若無應為 null。
4. sellerUbn (賣方統一編號 / 統編): 8 位數字。若無應為 null。
5. sellerName (營業人名稱 / 銷售方名稱 / 營業人): 銷售者的繁體中文名稱（例如「星環智能科技有限公司」）。若無應為 null。
6. subtotal (銷售額/不含稅小計): 整數。
7. tax (稅額): 整數。
8. totalAmount (總金額/應付金額): 整數。
9. items (商品明細列表): 每個商品包含 name (品名), qty (數量，整數或浮點數), price (單價，整數或浮點數), amount (小計金額)。

特別規則（重要）：
- 如果發票中【缺少】或【模糊無法辨識】某個主要欄位（發票號碼、日期、賣方統編、營業人名稱、銷售額、稅額、總金額），你必須將該欄位的 value 設為 null / 空值，並且給予該欄位合理的「預估可能位置（box）」或是提示它的位置。
- 如果某個欄位內容不完全，你必須回報出來，並在 JSON 裡將該欄位標記。
- 所有的座標 box {ymin, xmin, ymax, xmax} 必須為 0 到 100 之間的實數（百分比），請精準對齊，不要傳回 null，若沒找到，請預估它應該出現在什麼板塊區域位置（例如發票號碼一般在最上方，銷售額和總金額在下方、買賣方統編通常在特定標題旁），這樣我們才能正確圈選並用箭頭指出位置。

請直接依照以下 JSON 格式回傳，不可有任何 markdown 程式碼區塊（不要包裹 \`\`\`json）：
{
  "invoiceNumber": { "value": "發票號碼字串或null", "box": { "ymin": y1, "xmin": x1, "ymax": y2, "xmax": x2 } },
  "invoiceDate": { "value": "YYYY-MM-DD格式或null", "box": { "ymin": y1, "xmin": x1, "ymax": y2, "xmax": x2 } },
  "buyerUbn": { "value": "買方統編字串或null", "box": { "ymin": y1, "xmin": x1, "ymax": y2, "xmax": x2 } },
  "sellerUbn": { "value": "賣方統編字串或null", "box": { "ymin": y1, "xmin": x1, "ymax": y2, "xmax": x2 } },
  "sellerName": { "value": "營業人名稱字串或null", "box": { "ymin": y1, "xmin": x1, "ymax": y2, "xmax": x2 } },
  "subtotal": { "value": 銷售額整數或null, "box": { "ymin": y1, "xmin": x1, "ymax": y2, "xmax": x2 } },
  "tax": { "value": 稅額整數或null, "box": { "ymin": y1, "xmin": x1, "ymax": y2, "xmax": x2 } },
  "totalAmount": { "value": 總金額整數或null, "box": { "ymin": y1, "xmin": x1, "ymax": y2, "xmax": x2 } },
  "items": [
    { "name": "品名", "qty": 數量, "price": 單價, "amount": 小計 }
  ]
}
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        dataPart,
        { text: promptText }
      ],
      config: {
        responseMimeType: "application/json",
        temperature: 0.1, // Low temp for precise facts
      }
    });

    const resultText = response.text || "{}";
    let ocrOutput;
    try {
      ocrOutput = JSON.parse(resultText);
    } catch (parseErr) {
      console.error("Gemini output parsing failed. Raw response:", resultText);
      // Clean up markdown markers if any got past the instruction
      const cleanedText = resultText
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();
      ocrOutput = JSON.parse(cleanedText);
    }

    // Now, perform rich data validations (雙向與公式驗證 / Cross-checking)
    const overallIssues: string[] = [];

    // 1. Invoice Number format validation (Must match XX-XXXXXXXX or similar)
    const invNumObj = ocrOutput.invoiceNumber || { value: null, box: null };
    let isInvNumValid = true;
    let invNumWarning = "";
    if (!invNumObj.value) {
      isInvNumValid = false;
      invNumWarning = "「發票號碼」缺失或無法讀取！";
      overallIssues.push(invNumWarning);
    } else {
      const formattedNum = String(invNumObj.value).toUpperCase().replace(/\s/g, "");
      const matched = formattedNum.match(/^[A-Z]{2}-?\d{8}$/) || formattedNum.match(/^\d{8}$/);
      if (!matched) {
        isInvNumValid = false;
        invNumWarning = "「發票號碼」格式不符合標準 (應為 2 碼英文 + 8 碼數字，例如 AB-12345678)";
        overallIssues.push(invNumWarning);
      }
    }

    // 2. Invoice Date validation
    const dateObj = ocrOutput.invoiceDate || { value: null, box: null };
    let isDateValid = true;
    let dateWarning = "";
    if (!dateObj.value) {
      isDateValid = false;
      dateWarning = "「發票日期」缺失！";
      overallIssues.push(dateWarning);
    } else {
      const parsedDate = Date.parse(dateObj.value);
      if (isNaN(parsedDate)) {
        isDateValid = false;
        dateWarning = `「發票日期」格式異常 (${dateObj.value})，必須符合 YYYY-MM-DD`;
        overallIssues.push(dateWarning);
      }
    }

    // 3. Seller UBN validation
    const sellerUbnObj = ocrOutput.sellerUbn || { value: null, box: null };
    let isSellerUbnValid = true;
    let sellerUbnWarning = "";
    if (!sellerUbnObj.value) {
      isSellerUbnValid = false;
      sellerUbnWarning = "「賣方統一編號」缺失！";
      overallIssues.push(sellerUbnWarning);
    } else {
      const ubnStr = String(sellerUbnObj.value).trim();
      const ubnCheck = validateTaiwanUBN(ubnStr);
      if (!ubnCheck.isValid) {
        isSellerUbnValid = false;
        sellerUbnWarning = `賣方統編 (${ubnStr}) 檢核不通過：${ubnCheck.reason}`;
        overallIssues.push(sellerUbnWarning);
      }
    }

    // 3b. Seller Name validation
    const sellerNameObj = ocrOutput.sellerName || { value: null, box: null };
    let isSellerNameValid = true;
    let sellerNameWarning = "";
    if (!sellerNameObj.value) {
      isSellerNameValid = false;
      sellerNameWarning = "「營業人」名稱缺失！";
      overallIssues.push(sellerNameWarning);
    }

    // 4. Buyer UBN validation (Optional field, but if filled, it should be valid)
    const buyerUbnObj = ocrOutput.buyerUbn || { value: null, box: null };
    let isBuyerUbnValid = true;
    let buyerUbnWarning = "";
    if (buyerUbnObj.value) {
      const ubnStr = String(buyerUbnObj.value).trim();
      const ubnCheck = validateTaiwanUBN(ubnStr);
      if (!ubnCheck.isValid) {
        isBuyerUbnValid = false;
        buyerUbnWarning = `買方統編 (${ubnStr}) 檢核不通過：${ubnCheck.reason}`;
        overallIssues.push(buyerUbnWarning);
      }
    }

    // 5. Mathematical Check: subtotal + tax === totalAmount
    const subtotalObj = ocrOutput.subtotal || { value: null, box: null };
    const taxObj = ocrOutput.tax || { value: null, box: null };
    const totalObj = ocrOutput.totalAmount || { value: null, box: null };

    const subVal = subtotalObj.value !== null ? Number(subtotalObj.value) : null;
    const taxVal = taxObj.value !== null ? Number(taxObj.value) : null;
    const totVal = totalObj.value !== null ? Number(totalObj.value) : null;

    let isSubtotalValid = true;
    let subtotalWarning = "";
    let isTaxValid = true;
    let taxWarning = "";
    let isTotalValid = true;
    let totalWarning = "";

    if (subVal === null) {
      isSubtotalValid = false;
      subtotalWarning = "「銷售額小計」缺失！";
      overallIssues.push(subtotalWarning);
    }
    if (taxVal === null) {
      isTaxValid = false;
      // In Taiwan, some receipts might be tax-exempt (免稅) or include 0 tax.
      // We flag it as warning only if it appears empty or unreadable
      taxWarning = "「稅額」為空或無法判定（若為免稅或特種發票，請人工核實並填入 0）。";
      // We don't block validation if total and subtotal match, but keep it as warning message
    }
    if (totVal === null) {
      isTotalValid = false;
      totalWarning = "「總金額」缺失或無法讀取！";
      overallIssues.push(totalWarning);
    }

    // Amount Cross checking: Subtotal + Tax !== Total
    if (subVal !== null && totVal !== null) {
      const expectedTax = taxVal !== null ? taxVal : 0;
      if (subVal + expectedTax !== totVal) {
        isSubtotalValid = false;
        isTaxValid = false;
        isTotalValid = false;
        const mathWarning = `金額對接不符：不含稅小計 (${subVal}) + 稅額 (${expectedTax}) = ${subVal + expectedTax}，而總金額顯示為 ${totVal}`;
        subtotalWarning = mathWarning;
        taxWarning = mathWarning;
        totalWarning = mathWarning;
        overallIssues.push(mathWarning);
      }
    }

    // Construct clean validation response
    const responseData = {
      invoiceNumber: {
        value: invNumObj.value || null,
        isValid: isInvNumValid,
        box: invNumObj.box ? { ...invNumObj.box, fieldName: "invoiceNumber" } : null,
        warningMessage: invNumWarning || undefined,
        fieldNameChinese: "發票號碼"
      },
      invoiceDate: {
        value: dateObj.value || null,
        isValid: isDateValid,
        box: dateObj.box ? { ...dateObj.box, fieldName: "invoiceDate" } : null,
        warningMessage: dateWarning || undefined,
        fieldNameChinese: "發票日期"
      },
      sellerUbn: {
        value: sellerUbnObj.value || null,
        isValid: isSellerUbnValid,
        box: sellerUbnObj.box ? { ...sellerUbnObj.box, fieldName: "sellerUbn" } : null,
        warningMessage: sellerUbnWarning || undefined,
        fieldNameChinese: "賣方統一編號"
      },
      sellerName: {
        value: sellerNameObj.value || null,
        isValid: isSellerNameValid,
        box: sellerNameObj.box ? { ...sellerNameObj.box, fieldName: "sellerName" } : null,
        warningMessage: sellerNameWarning || undefined,
        fieldNameChinese: "營業人"
      },
      buyerUbn: {
        value: buyerUbnObj.value || null,
        isValid: isBuyerUbnValid,
        box: buyerUbnObj.box ? { ...buyerUbnObj.box, fieldName: "buyerUbn" } : null,
        warningMessage: buyerUbnWarning || undefined,
        fieldNameChinese: "買方統一編號 (可選)"
      },
      subtotal: {
        value: subVal,
        isValid: isSubtotalValid,
        box: subtotalObj.box ? { ...subtotalObj.box, fieldName: "subtotal" } : null,
        warningMessage: subtotalWarning || undefined,
        fieldNameChinese: "銷售額小計"
      },
      tax: {
        value: taxVal,
        isValid: isTaxValid,
        box: taxObj.box ? { ...taxObj.box, fieldName: "tax" } : null,
        warningMessage: taxWarning || undefined,
        fieldNameChinese: "發票稅額"
      },
      totalAmount: {
        value: totVal,
        isValid: isTotalValid,
        box: totalObj.box ? { ...totalObj.box, fieldName: "totalAmount" } : null,
        warningMessage: totalWarning || undefined,
        fieldNameChinese: "總計金額"
      },
      items: ocrOutput.items || [],
      overallStatus: overallIssues.length > 0 ? "has_issues" : "normal",
      overallIssues: overallIssues
    };

    res.json(responseData);
  } catch (err: any) {
    console.error("Error processing OCR:", err);
    res.status(500).json({ error: err.message || "伺服器內部 OCR 處理異常" });
  }
});

// Setup Vite & Static Files routing
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT} in ${process.env.NODE_ENV || "development"} mode`);
  });
}

startServer();
