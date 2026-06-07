export interface BoundingBox {
  ymin: number; // 0 to 100
  xmin: number; // 0 to 100
  ymax: number; // 0 to 100
  xmax: number; // 0 to 100
  fieldName: string;
}

export interface InvoiceField<T> {
  value: T | null;
  isValid: boolean;
  box: BoundingBox | null;
  warningMessage?: string;
  fieldNameChinese: string;
}

export interface InvoiceItem {
  name: string;
  qty: number;
  price: number;
  amount: number;
}

export interface ParsedInvoice {
  id: string; // Unique local identifier
  fileName: string;
  fileSize: string;
  imagePreview: string; // Base64 data-uri for rendering on the canvas
  invoiceNumber: InvoiceField<string>;
  invoiceDate: InvoiceField<string>;
  sellerName: InvoiceField<string>;
  sellerUbn: InvoiceField<string>;
  buyerUbn: InvoiceField<string>;
  subtotal: InvoiceField<number>;
  tax: InvoiceField<number>;
  totalAmount: InvoiceField<number>;
  items: InvoiceItem[];
  overallStatus: 'normal' | 'has_issues';
  overallIssues: string[];
  parsedAt: string;
}
