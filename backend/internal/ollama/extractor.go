package ollama

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/samudera/fish-coldstorage/internal/model"
)

// ExtractFromReceipt sends a receipt image and extracts structured data in one call (vision fallback).
func (c *Client) ExtractFromReceipt(ctx context.Context, imageBytes []byte) (*model.Intent, error) {
	raw, err := c.ChatWithImageBytes(ctx, SystemPromptReceipt,
		"Baca dokumen ini dan ekstrak semua datanya.", imageBytes)
	if err != nil {
		return nil, fmt.Errorf("model inference: %w", err)
	}
	return parseIntent(raw)
}

// ExtractFromOCRText structures pre-extracted OCR text into an Intent (text-only, faster).
func (c *Client) ExtractFromOCRText(ctx context.Context, ocrText string) (*model.Intent, error) {
	return c.ExtractFromOCRTextWithHint(ctx, ocrText, "")
}

// ExtractFromOCRTextWithHint is like ExtractFromOCRText but prepends a focused
// directive when the caller knows the receipt type in advance.
func (c *Client) ExtractFromOCRTextWithHint(ctx context.Context, ocrText, hint string) (*model.Intent, error) {
	prefix := hintPrefix(hint)
	// For sortir, drop the HEADER section so the physical form title "TIMBANGAN IKAN BASAH"
	// doesn't override the hint — only the table section matters.
	if hint == "timbangan_sortir" {
		if idx := strings.Index(ocrText, "=== TABEL"); idx != -1 {
			ocrText = ocrText[idx:]
		}
	}
	userMsg := prefix + "Berikut teks OCR dari dokumen. Strukturkan ke JSON sesuai format:\n\n" + ocrText
	raw, err := c.Chat(ctx, buildReceiptTextPrompt(), userMsg)
	if err != nil {
		return nil, fmt.Errorf("model inference: %w", err)
	}
	return parseIntent(raw)
}

func hintPrefix(hint string) string {
	hints := map[string]string{
		"timbangan_ikan_basah": "FOKUS: Ini adalah TIMBANGAN IKAN BASAH. Gunakan HANYA format JENIS 1.\n\n",
		"timbangan_sortir":     "FOKUS: Ini adalah TIMBANGAN SORTIR — gunakan HANYA format JENIS 1b (type=timbangan_sortir). Teks fisik 'TIMBANGAN IKAN BASAH' pada header adalah nama form umum — ABAIKAN untuk penentuan jenis. Lihat bagian === TABEL SORTIR === pada teks OCR.\n\n",
		"bon_penjualan":        "FOKUS: Ini adalah BON PENJUALAN. Gunakan HANYA format JENIS 3.\n\n",
		"bon_pengeluaran":      "FOKUS: Ini adalah BON PENGELUARAN. Gunakan HANYA format JENIS 2.\n\n",
		"beli_ikan":            "FOKUS: Ini adalah BON PEMBELIAN IKAN (beli_ikan). Gunakan HANYA format JENIS 4.\n\n",
		"beli_item":            "FOKUS: Ini adalah BON PEMBELIAN ITEM (beli_item). Gunakan format JENIS 2 (bon_pengeluaran).\n\n",
		"bayar_jasa":           "FOKUS: Ini adalah BON BAYAR JASA (bayar_jasa). Gunakan format JENIS 2 (bon_pengeluaran).\n\n",
	}
	if s, ok := hints[hint]; ok {
		return s
	}
	return ""
}

func buildReceiptTextPrompt() string {
	return SystemPromptReceiptText + `

ATURAN ANGKA INDONESIA:
- Titik (.) = pemisah ribuan BUKAN desimal. "23.000" = 23000. "22.500" = 22500.
- Tanda plus (+) = pemisah batch berat. "1349+180+378" = tiga batch: [1349,180,378]
- Harga ikan: 10000–100000 IDR/kg
- Tanggal: "21 MEI 2026" = "2026-05-21"

JENIS 1 - TIMBANGAN IKAN BASAH (ikan mentah masuk):
Input: === TABEL IKAN (KODE | HARGA | BATCH | TOTAL) ===
Setiap baris = satu jenis ikan RAW masuk dari kapal.
Input berformat: KODE | HARGA | BATCH | TOTAL
Setiap baris = satu kolom ikan. Kolom BATCH berisi angka dipisah +. Kolom TOTAL = total berat ikan tersebut.
WAJIB ekstrak SEMUA baris ikan, jangan lewati satu pun.
PENTING: Nilai TOTAL di kolom ke-4 adalah total_weight untuk ikan tersebut, BUKAN bagian dari weight_batches.

{"type":"timbangan_ikan_basah","timbangan":{"date":"YYYY-MM-DD","vessel_name":"...","transports":"...","fish_columns":[{"fish_code":"BH","price_per_kg":23000,"weight_batches":[1349,180,378,97,94,101],"total_weight":2199},{"fish_code":"BDR PC","price_per_kg":18000,"weight_batches":[240,190,87],"total_weight":517},{"fish_code":"SRR H","price_per_kg":21000,"weight_batches":[48,28],"total_weight":76}],"total_weight":6808,"notes":"Total=6808, Dari gudang: 6764, selisih: 44","raw_text":"..."},"confidence":0.9}

JENIS 1b - TIMBANGAN SORTIR (ikan disortir menjadi grade):
Input: === TABEL SORTIR (KODE | KATEGORI | GRADE | TOTAL) ===
Format setiap baris: KODE | KATEGORI | GRADE | TOTAL
Setiap baris = satu kolom hasil sortir.
Fields: source_fish_code (kode ikan sumber, e.g. BDR, SLM, SLM HIS), category (SF/PC/SP), grade (ukuran: 300-500, 1UP, 2UP, dll), total_weight.
ATURAN sorted_fish_code:
- Kategori SF = segar/fresh, DIHAPUS dari kode: BDR+SF+300-500 → "BDR 300-500"
- Kategori PC atau SP = DIPERTAHANKAN: BDR+PC+300-500 → "BDR PC 300-500"
- Jika grade kosong: sorted_fish_code = source saja, e.g. "SLM HIS"
GT di footer = total_weight keseluruhan.
{"type":"timbangan_sortir","sortir":{"date":"2026-05-22","vessel_name":"KM. Mitra Bahari","transports":"-","columns":[{"source_fish_code":"BDR","category":"SF","grade":"300-500","sorted_fish_code":"BDR 300-500","total_weight":1775},{"source_fish_code":"BDR","category":"SF","grade":"500-900","sorted_fish_code":"BDR 500-900","total_weight":725},{"source_fish_code":"CKL","category":"SF","grade":"1UP","sorted_fish_code":"CKL 1UP","total_weight":0},{"source_fish_code":"BDR","category":"SF","grade":"200-300","sorted_fish_code":"BDR 200-300","total_weight":50},{"source_fish_code":"SLM","category":"SF","grade":"1UP","sorted_fish_code":"SLM 1UP","total_weight":175},{"source_fish_code":"SLM","category":"SF","grade":"500-900","sorted_fish_code":"SLM 500-900","total_weight":150},{"source_fish_code":"SLM HIS","category":"SF","grade":"","sorted_fish_code":"SLM HIS","total_weight":50},{"source_fish_code":"SLM","category":"SF","grade":"3UP","sorted_fish_code":"SLM 3UP","total_weight":77},{"source_fish_code":"SLM","category":"SF","grade":"2UP","sorted_fish_code":"SLM 2UP","total_weight":100},{"source_fish_code":"BDR","category":"PC","grade":"300-500","sorted_fish_code":"BDR PC 300-500","total_weight":100},{"source_fish_code":"BDR","category":"PC","grade":"500-900","sorted_fish_code":"BDR PC 500-900","total_weight":150},{"source_fish_code":"CKL","category":"PC","grade":"1UP","sorted_fish_code":"CKL PC 1UP","total_weight":125}],"total_weight":3477,"notes":"GT=3477","raw_text":"..."},"confidence":0.9}

JENIS 2 - BON PENGELUARAN / BON BAYAR JASA / BON BELI ITEM:
Input berformat baris OCR bebas. Form fisik: Banyaknya(qty) | Nama Barang | @ (harga satuan) | Jumlah Harga.
Kolom tersebar di beberapa baris OCR — susun ulang secara logis.
ATURAN PARSING:
- "tgl" = date. OCR sering pisah digit: "tg1 6 - MAY 20 %." = 16-MAY-2026 = "2026-05-16". Tahun "20 %." / "20 2b." = 2026.
- "Kepada" = vendor_name.
- Banyaknya (qty) + satuan: "2 BAL"=qty 2 unit bal, "20 AL"=qty 2 unit bal (OCR salah baca "2 BAL"), "13-654"=13654, "13.659"=13659.
- Nama Barang: gabung baris yang berdekatan jika terpotong OCR ("TISSUG"=Tissue, "MiT"=abaikan jika dari bon lain).
- @ (harga satuan): angka setelah nama barang. "29.00"/"28.0m"/"28.on" dalam konteks harga ribuan = 28000.
- Jumlah harga per baris: "56.00"/"56.0W"/"56.0m" = 56000 (OCR hilangkan trailing zeros — jika angka < 1000 tapi konteks harga = kalikan 1000).
- "Jumlah: Rp." = total_amount. Gunakan nilai terbesar yang masuk akal.
- Jika ada dua bon di foto, ambil HANYA bon utama (lebih besar/depan). Abaikan angka dari bon background.
Contoh 1 — bayar jasa: OCR "tgl 20-MAY / 13-654 / JASA MUAT IKAN PT.ASSA / MITRA BAHARI / 60 / 819.0W / Jumlah Rp. 819.000"
{"type":"bon_pengeluaran","receipt":{"receipt_type":"bon_pengeluaran","receipt_no":null,"date":"2026-05-20","vendor_name":"Mitra Bahari","items":[{"fish_code":null,"item_name":"Jasa muat ikan PT.ASSA Mitra Bahari","quantity":13654,"unit":"pcs","unit_price":60,"total_price":819000}],"total_amount":819000,"notes":null,"raw_text":"..."},"confidence":0.9}
Contoh 2 — beli item: OCR "tg1 6 - MAY 20 %. / Kepada SOA / 20 AL / TISSUG / 29.00 / 56.00 / Jumlah Rp. 56.00"
{"type":"bon_pengeluaran","receipt":{"receipt_type":"bon_pengeluaran","receipt_no":null,"date":"2026-05-16","vendor_name":"SOA","items":[{"fish_code":null,"item_name":"Tissue","quantity":2,"unit":"bal","unit_price":28000,"total_price":56000}],"total_amount":56000,"notes":null,"raw_text":"..."},"confidence":0.9}

JENIS 3 - BON PENJUALAN / BON KONTAN:
Input berformat baris OCR bebas (bukan KODE|HARGA|BATCH|TOTAL).
Cari: "BON/KONTAN No." = receipt_no, "tgl" = date, "Kepada" = vendor_name, "Jumlah: Rp." = total_amount.
Tabel transaksi: kolom Banyaknya(qty) | NAMA BARANG(nama ikan) | @ (harga satuan) | Jumlah Harga(total baris).
PENTING - kode ikan: nama barang bisa mengandung varian ukuran (contoh: "SSK 2UP PC", "SSK 3 4P PC").
  Normalisasi fish_code dengan menghapus varian ukuran (2UP, 3, 4P, dsb): "SSK 2UP PC" → fish_code="SSK PC", item_name="SSK 2UP PC".
  Varian ukuran biasanya berupa angka/huruf kecil di tengah nama kode ikan.
OCR bisa salah baca angka: "20.96" bisa berarti "2026", "1. 8 fs. 000" bisa berarti "1.875.000", gunakan konteks untuk koreksi.
{"type":"bon_penjualan","receipt":{"receipt_type":"bon_penjualan","receipt_no":"0005","date":"2026-05-21","vendor_name":"SKB","items":[{"fish_code":"SSK PC","item_name":"SSK 2UP PC","quantity":75,"unit":"kg","unit_price":25000,"total_price":1875000},{"fish_code":"SSK PC","item_name":"SSK 3 4P PC","quantity":225,"unit":"kg","unit_price":25000,"total_price":5625000}],"total_amount":7500000,"notes":null,"raw_text":"..."},"confidence":0.9}

JENIS 4 - BON PEMBELIAN IKAN (beli_ikan / HPP):
Form fisik: header berisi nama tangkahan/supplier, tanggal, no. BON/FAKTUR, nama pembeli.
Tabel: Banyaknya(qty kg) | NAMA BARANG(kode ikan) | @ (harga/kg) | Jumlah Harga.
Footer: baris berat total (contoh "6.764 kg"), "Jumlah Rp." = grand total.
ATURAN:
- Setiap baris tabel = satu ikan. Banyaknya = quantity_kg.
- NAMA BARANG = fish_code. Normalisasi OCR: "BODTEK PC"→"BDR PC", "SSL"/"SSK ber"→"SSK", "Srr Ksr"→"SRR K", "Srr His"→"SRR H", "Srr His PC"→"SRR H PC", "Slire Cong"/"Sire Cong"/"3.209 line cong"→"SLM CONG", "Cincare"/"Cincau"→"CKL", "She ber"/"SSk ber"→"SSK K". Teks "lem. M.B" bukan baris ikan — abaikan.
- Angka Indonesia: titik = pemisah ribuan. "2.186"=2186, "50.278.000"=50278000, "22,500"=22500.
- vendor_name: nama tangkahan di header (contoh "Tangkahan Assa SBR").
- receipt_no: nomor BON/FAKTUR (contoh "0168").
- EKSTRAK SEMUA baris ikan, jangan lewati satu pun.
{"type":"beli_ikan","beli_ikan":{"date":"2026-05-21","receipt_no":"0168","vendor_name":"Tangkahan Assa SBR","vessel_name":null,"total_weight_kg":6764,"items":[{"fish_code":"BH","quantity_kg":2186,"price_per_kg":23000,"total_amount":50278000},{"fish_code":"BDR PC","quantity_kg":513,"price_per_kg":18000,"total_amount":9234000},{"fish_code":"SSK","quantity_kg":44,"price_per_kg":28500,"total_amount":1254000},{"fish_code":"SRR K","quantity_kg":18,"price_per_kg":27000,"total_amount":486000},{"fish_code":"SSK K","quantity_kg":499,"price_per_kg":30500,"total_amount":15219500},{"fish_code":"SRR H","quantity_kg":75,"price_per_kg":21000,"total_amount":1575000},{"fish_code":"SLM CONG","quantity_kg":3209,"price_per_kg":22500,"total_amount":72202500},{"fish_code":"SSK PC","quantity_kg":40,"price_per_kg":20000,"total_amount":800000},{"fish_code":"SRR H PC","quantity_kg":11,"price_per_kg":18000,"total_amount":198000},{"fish_code":"TUNA","quantity_kg":160,"price_per_kg":30000,"total_amount":4800000},{"fish_code":"CKL","quantity_kg":9,"price_per_kg":10000,"total_amount":90000}],"grand_total":156137000},"confidence":0.9}

Kembalikan HANYA JSON valid, tanpa markdown.`
}

// ExtractFromText parses a free-text Bahasa Indonesia message.
func (c *Client) ExtractFromText(ctx context.Context, text string) (*model.Intent, error) {
	raw, err := c.Chat(ctx, SystemPromptChat, text)
	if err != nil {
		return nil, fmt.Errorf("model inference: %w", err)
	}

	return parseIntent(raw)
}

func parseIntent(raw string) (*model.Intent, error) {
	// strip markdown fences if model ignores instructions
	raw = strings.TrimSpace(raw)
	raw = strings.TrimPrefix(raw, "```json")
	raw = strings.TrimPrefix(raw, "```")
	raw = strings.TrimSuffix(raw, "```")
	raw = strings.TrimSpace(raw)

	var loose looseIntent
	if err := json.Unmarshal([]byte(raw), &loose); err != nil {
		return &model.Intent{
			Type:      model.IntentUnknown,
			ReplyText: "Maaf, gagal memproses. Coba kirim ulang.",
		}, fmt.Errorf("json parse error (%w) — raw: %s", err, raw)
	}

	intent := &model.Intent{
		Type:       loose.Type,
		StockOp:    loose.StockOp,
		ReplyText:  loose.ReplyText,
		Confidence: loose.Confidence,
	}

	// timbangan form
	if loose.Type == model.IntentTimbangan && loose.Timbangan != nil {
		intent.Timbangan = &loose.Timbangan.TimbanganData
		if intent.Confidence == 0 && loose.Timbangan.Confidence > 0 {
			intent.Confidence = loose.Timbangan.Confidence
		}
	}

	// sortir form
	if loose.Type == model.IntentSortir && loose.Sortir != nil {
		intent.Sortir = &loose.Sortir.SortirData
		if intent.Confidence == 0 && loose.Sortir.Confidence > 0 {
			intent.Confidence = loose.Sortir.Confidence
		}
	}

	// beli_ikan form
	if loose.Type == model.IntentBeliIkan && loose.BeliIkan != nil {
		intent.BeliIkan = &loose.BeliIkan.BeliIkanData
		if intent.Confidence == 0 && loose.BeliIkan.Confidence > 0 {
			intent.Confidence = loose.BeliIkan.Confidence
		}
	}

	// bon receipts — also normalize any stray subtype Qwen might return
	if loose.Receipt != nil {
		intent.Receipt = &loose.Receipt.ReceiptData
		if intent.Confidence == 0 && loose.Receipt.Confidence > 0 {
			intent.Confidence = loose.Receipt.Confidence
		}
		if intent.Type != model.IntentTimbangan {
			intent.Type = model.IntentReceipt
		}
	}

	return intent, nil
}

// looseIntent decodes the raw model output tolerantly.
type looseIntent struct {
	Type       string                `json:"type"`
	Timbangan  *looseTimbangan       `json:"timbangan,omitempty"`
	Sortir     *looseSortir          `json:"sortir,omitempty"`
	Receipt    *looseReceipt         `json:"receipt,omitempty"`
	BeliIkan   *looseBeliIkan        `json:"beli_ikan,omitempty"`
	StockOp    *model.StockOperation `json:"stock_op,omitempty"`
	ReplyText  string                `json:"reply_text,omitempty"`
	Confidence float64               `json:"confidence,omitempty"`
}

type looseBeliIkan struct {
	model.BeliIkanData
	Confidence float64 `json:"confidence,omitempty"`
}

// looseTimbangan allows confidence inside the timbangan object (Qwen quirk).
type looseTimbangan struct {
	model.TimbanganData
	Confidence float64 `json:"confidence,omitempty"`
}

// looseSortir allows confidence inside the sortir object.
type looseSortir struct {
	model.SortirData
	Confidence float64 `json:"confidence,omitempty"`
}

// looseReceipt allows confidence inside the receipt object (Qwen quirk).
type looseReceipt struct {
	model.ReceiptData
	Confidence float64 `json:"confidence,omitempty"`
}
